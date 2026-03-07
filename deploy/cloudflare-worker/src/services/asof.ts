import type { D1Database } from '@cloudflare/workers-types';
import { filterAnalyticCountyRows } from './county-scope';

export interface AsOfResolveOptions {
  requestedAsOf?: string | null;
  state?: string | null;
  requiredSeries?: string[];
}

export interface AsOfCoverage {
  year: string;
  counties_total: number;
  counties_complete: number;
  complete_pct: number;
  avg_series_coverage_pct: number;
  series_coverage_pct: Record<string, number>;
}

export interface AsOfMeta {
  requested_as_of: string;
  resolved_as_of: string;
  strategy: 'explicit' | 'latest_best_coverage' | 'latest_fallback';
  required_series: string[];
  counties_total: number;
  counties_complete: number;
  coverage_pct: number;
  series_coverage_pct: Record<string, number>;
  warnings: string[];
}

export interface AsOfResolution {
  asOf: string;
  meta: AsOfMeta;
}

const DEFAULT_REQUIRED_SERIES = [
  'cash_rent',
  'land_value',
  'corn_yield',
  'treasury_10y',
  'corn_price',
] as const;

const HIGH_COVERAGE_THRESHOLD = 0.7;

interface CountyRow {
  fips: string;
  state: string;
  name?: string | null;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeRequestedAsOf(raw?: string | null): string {
  const normalized = (raw ?? 'latest').trim().toLowerCase();
  if (!normalized) return 'latest';
  if (normalized === 'latest') return 'latest';
  if (/^\d{4}$/.test(normalized)) return normalized;
  return 'latest';
}

async function loadCounties(db: D1Database, state?: string | null): Promise<CountyRow[]> {
  const normalized = (state ?? '').trim().toUpperCase();
  if (normalized) {
    const rows = await db
      .prepare('SELECT fips, state, name FROM geo_county WHERE state = ? ORDER BY fips')
      .bind(normalized)
      .all<CountyRow>();
    return filterAnalyticCountyRows(rows.results ?? []);
  }
  const rows = await db
    .prepare('SELECT fips, state, name FROM geo_county ORDER BY fips')
    .all<CountyRow>();
  return filterAnalyticCountyRows(rows.results ?? []);
}

async function listCandidateYears(db: D1Database, requiredSeries: string[]): Promise<string[]> {
  if (!requiredSeries.length) return [];
  const placeholders = requiredSeries.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT DISTINCT dp.as_of_date AS as_of_date
       FROM data_points dp
       JOIN data_series ds ON ds.id = dp.series_id
       WHERE ds.series_key IN (${placeholders})
       ORDER BY CAST(dp.as_of_date AS INTEGER) DESC`,
    )
    .bind(...requiredSeries)
    .all<{ as_of_date: string }>();

  return rows.results
    .map((r) => (r.as_of_date ?? '').trim())
    .filter((y) => /^\d{4}$/.test(y));
}

async function computeCoverage(
  db: D1Database,
  year: string,
  counties: CountyRow[],
  requiredSeries: string[],
): Promise<AsOfCoverage> {
  const countiesTotal = counties.length;
  if (!countiesTotal || !requiredSeries.length) {
    return {
      year,
      counties_total: countiesTotal,
      counties_complete: 0,
      complete_pct: 0,
      avg_series_coverage_pct: 0,
      series_coverage_pct: {},
    };
  }

  const placeholders = requiredSeries.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT ds.series_key AS series_key, dp.geo_key AS geo_key
       FROM data_points dp
       JOIN data_series ds ON ds.id = dp.series_id
       WHERE dp.as_of_date = ?
         AND ds.series_key IN (${placeholders})`,
    )
    .bind(year, ...requiredSeries)
    .all<{ series_key: string; geo_key: string }>();

  const seriesGeo = new Map<string, Set<string>>();
  for (const key of requiredSeries) {
    seriesGeo.set(key, new Set<string>());
  }
  for (const row of rows.results) {
    const set = seriesGeo.get(row.series_key);
    if (set) set.add(row.geo_key);
  }

  const seriesCoveredCounts: Record<string, number> = {};
  for (const key of requiredSeries) {
    seriesCoveredCounts[key] = 0;
  }

  let countiesComplete = 0;
  for (const county of counties) {
    let complete = true;
    for (const key of requiredSeries) {
      const set = seriesGeo.get(key);
      const covered = !!set && (set.has(county.fips) || set.has(county.state) || set.has('US'));
      if (covered) {
        seriesCoveredCounts[key] += 1;
      } else {
        complete = false;
      }
    }
    if (complete) countiesComplete += 1;
  }

  const seriesCoveragePct: Record<string, number> = {};
  for (const key of requiredSeries) {
    seriesCoveragePct[key] = clampPct(seriesCoveredCounts[key] / countiesTotal);
  }

  const avgSeriesCoveragePct = clampPct(
    requiredSeries.reduce((sum, key) => sum + seriesCoveragePct[key], 0) / requiredSeries.length,
  );

  return {
    year,
    counties_total: countiesTotal,
    counties_complete: countiesComplete,
    complete_pct: clampPct(countiesComplete / countiesTotal),
    avg_series_coverage_pct: avgSeriesCoveragePct,
    series_coverage_pct: seriesCoveragePct,
  };
}

function buildMeta(
  requestedAsOf: string,
  resolved: AsOfCoverage,
  requiredSeries: string[],
  strategy: AsOfMeta['strategy'],
  warnings: string[],
): AsOfMeta {
  return {
    requested_as_of: requestedAsOf,
    resolved_as_of: resolved.year,
    strategy,
    required_series: requiredSeries,
    counties_total: resolved.counties_total,
    counties_complete: resolved.counties_complete,
    coverage_pct: resolved.complete_pct,
    series_coverage_pct: resolved.series_coverage_pct,
    warnings,
  };
}

function rankCoverage(a: AsOfCoverage, b: AsOfCoverage): number {
  if (a.complete_pct !== b.complete_pct) return b.complete_pct - a.complete_pct;
  if (a.avg_series_coverage_pct !== b.avg_series_coverage_pct) {
    return b.avg_series_coverage_pct - a.avg_series_coverage_pct;
  }
  return Number.parseInt(b.year, 10) - Number.parseInt(a.year, 10);
}

export async function resolveAsOf(
  db: D1Database,
  options: AsOfResolveOptions = {},
): Promise<AsOfResolution> {
  const requiredSeries = (options.requiredSeries && options.requiredSeries.length)
    ? Array.from(new Set(options.requiredSeries))
    : [...DEFAULT_REQUIRED_SERIES];

  const requestedAsOf = normalizeRequestedAsOf(options.requestedAsOf);
  const counties = await loadCounties(db, options.state);
  const candidateYears = await listCandidateYears(db, requiredSeries);

  if (!candidateYears.length) {
    const fallbackYear = new Date().getUTCFullYear().toString();
    const emptyCoverage: AsOfCoverage = {
      year: fallbackYear,
      counties_total: counties.length,
      counties_complete: 0,
      complete_pct: 0,
      avg_series_coverage_pct: 0,
      series_coverage_pct: Object.fromEntries(requiredSeries.map((k) => [k, 0])),
    };
    return {
      asOf: fallbackYear,
      meta: buildMeta(
        requestedAsOf,
        emptyCoverage,
        requiredSeries,
        'latest_fallback',
        ['No data coverage found for required series; using current year fallback.'],
      ),
    };
  }

  if (requestedAsOf !== 'latest') {
    const explicitCoverage = await computeCoverage(db, requestedAsOf, counties, requiredSeries);
    const warnings: string[] = [];
    if (explicitCoverage.counties_total > 0 && explicitCoverage.complete_pct < HIGH_COVERAGE_THRESHOLD) {
      warnings.push(`Coverage for explicit as_of ${requestedAsOf} is low (${Math.round(explicitCoverage.complete_pct * 100)}%).`);
    }
    return {
      asOf: requestedAsOf,
      meta: buildMeta(requestedAsOf, explicitCoverage, requiredSeries, 'explicit', warnings),
    };
  }

  const yearsToEvaluate = candidateYears.slice(0, 20);
  const coverage = await Promise.all(
    yearsToEvaluate.map((year) => computeCoverage(db, year, counties, requiredSeries)),
  );

  const ranked = [...coverage].sort(rankCoverage);
  const bestCoverage = ranked[0];
  const latestYear = yearsToEvaluate[0];
  const latestCoverage = coverage.find((row) => row.year === latestYear) ?? bestCoverage;

  if (bestCoverage.complete_pct >= HIGH_COVERAGE_THRESHOLD) {
    return {
      asOf: bestCoverage.year,
      meta: buildMeta(requestedAsOf, bestCoverage, requiredSeries, 'latest_best_coverage', []),
    };
  }

  const warnings = [
    `No high-coverage year reached ${Math.round(HIGH_COVERAGE_THRESHOLD * 100)}% completeness; falling back to latest available year ${latestCoverage.year}.`,
  ];

  return {
    asOf: latestCoverage.year,
    meta: buildMeta(requestedAsOf, latestCoverage, requiredSeries, 'latest_fallback', warnings),
  };
}
