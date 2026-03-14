/**
 * Database query helpers for D1.
 * Replaces SQLAlchemy ORM queries with raw SQL against D1.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { SeriesData, Assumptions } from '../services/metric-engine';
import { filterAnalyticCountyRows, isAnalyticCountyRow } from '../services/county-scope';

export type SeriesLineageLevel = 'county' | 'state' | 'national';
export type SeriesLineage = Record<string, SeriesLineageLevel>;
export interface SeriesLevels {
  county: SeriesData;
  state: SeriesData;
  national: SeriesData;
}

export interface SeriesLevelYears {
  county: Partial<Record<keyof SeriesData, string>>;
  state: Partial<Record<keyof SeriesData, string>>;
  national: Partial<Record<keyof SeriesData, string>>;
}

export interface SeriesSnapshot {
  series: SeriesData;
  lineage: SeriesLineage;
  levels: SeriesLevels;
  levelYears: SeriesLevelYears;
}

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const PRODUCTIVITY_YIELD_KEYS: Array<keyof SeriesData> = ['corn_yield', 'soybean_yield', 'wheat_yield'];
const MAX_PRODUCTIVITY_YIELD_LAG_YEARS = 1;

function createEmptyLevelYears(): SeriesLevelYears {
  return {
    county: {},
    state: {},
    national: {},
  };
}

function isFiniteSeriesNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function applyHistoricProductivityCarryForward(
  levels: SeriesLevels,
  levelYears: SeriesLevelYears,
  asOfYear: string,
  latestPairs: Partial<Record<keyof SeriesData, { year: string; countyValue: number; stateValue: number }>>,
) {
  const asOfNumeric = Number.parseInt(asOfYear, 10);
  if (!Number.isFinite(asOfNumeric)) return;

  for (const key of PRODUCTIVITY_YIELD_KEYS) {
    const pair = latestPairs[key];
    if (!pair) continue;

    const pairYear = Number.parseInt(pair.year, 10);
    if (!Number.isFinite(pairYear) || asOfNumeric < pairYear || (asOfNumeric - pairYear) > MAX_PRODUCTIVITY_YIELD_LAG_YEARS) {
      continue;
    }

    const hasCountyExact = isFiniteSeriesNumber(levels.county[key]);
    const hasStateExact = isFiniteSeriesNumber(levels.state[key]);
    if (hasCountyExact && hasStateExact) {
      levelYears.county[key] = asOfYear;
      levelYears.state[key] = asOfYear;
      continue;
    }

    levels.county[key] = pair.countyValue;
    levels.state[key] = pair.stateValue;
    levelYears.county[key] = pair.year;
    levelYears.state[key] = pair.year;
  }
}

// ── Series Data Loading (hierarchical: county → state → national) ───

export async function loadSeriesForCounty(
  db: D1Database,
  geoKey: string,
  asOf: string,
): Promise<SeriesSnapshot> {
  // Get county state for fallback
  const county = await db
    .prepare('SELECT state FROM geo_county WHERE fips = ?')
    .bind(geoKey)
    .first<{ state: string }>();
  const state = county?.state ?? '';

  // Load county-level data points via JOIN
  const countyRows = await db
    .prepare(`
      SELECT ds.series_key, dp.value
      FROM data_points dp
      JOIN data_series ds ON ds.id = dp.series_id
      WHERE dp.geo_key = ? AND dp.as_of_date = ?
    `)
    .bind(geoKey, asOf)
    .all<{ series_key: string; value: number }>();

  const result: SeriesData = {};
  const lineage: SeriesLineage = {};
  const levels: SeriesLevels = {
    county: {},
    state: {},
    national: {},
  };
  const levelYears = createEmptyLevelYears();
  for (const r of countyRows.results) {
    result[r.series_key] = r.value;
    lineage[r.series_key] = 'county';
    levels.county[r.series_key] = r.value;
    levelYears.county[r.series_key] = asOf;
  }

  // State fallback
  if (state) {
    const stateRows = await db
      .prepare(`
        SELECT ds.series_key, dp.value
        FROM data_points dp
        JOIN data_series ds ON ds.id = dp.series_id
        WHERE dp.geo_key = ? AND dp.as_of_date = ?
      `)
      .bind(state, asOf)
      .all<{ series_key: string; value: number }>();
    for (const r of stateRows.results) {
      levels.state[r.series_key] = r.value;
      levelYears.state[r.series_key] = asOf;
      if (!(r.series_key in result)) {
        result[r.series_key] = r.value;
        lineage[r.series_key] = 'state';
      }
    }
  }

  // National fallback
  const natRows = await db
    .prepare(`
      SELECT ds.series_key, dp.value
      FROM data_points dp
      JOIN data_series ds ON ds.id = dp.series_id
      WHERE dp.geo_key = 'US' AND dp.as_of_date = ?
    `)
    .bind(asOf)
    .all<{ series_key: string; value: number }>();
  for (const r of natRows.results) {
    levels.national[r.series_key] = r.value;
    levelYears.national[r.series_key] = asOf;
    if (!(r.series_key in result)) {
      result[r.series_key] = r.value;
      lineage[r.series_key] = 'national';
    }
  }

  const asOfNumeric = Number.parseInt(asOf, 10);
  if (state && Number.isFinite(asOfNumeric)) {
    const productivityPlaceholders = PRODUCTIVITY_YIELD_KEYS.map(() => '?').join(',');
    const latestProductivityPairsRows = await db
      .prepare(
        `SELECT county.as_of_date, ds.series_key, county.value AS county_value, state.value AS state_value
         FROM data_points county
         JOIN data_series ds ON ds.id = county.series_id
         JOIN data_series ds_state
           ON ds_state.series_key = ds.series_key
          AND ds_state.geo_level = 'state'
         JOIN data_points state
           ON state.series_id = ds_state.id
          AND state.geo_key = ?
          AND state.as_of_date = county.as_of_date
         WHERE county.geo_key = ?
           AND ds.geo_level = 'county'
           AND ds.series_key IN (${productivityPlaceholders})
           AND CAST(county.as_of_date AS INTEGER) BETWEEN ? AND ?
         ORDER BY CAST(county.as_of_date AS INTEGER) DESC`,
      )
      .bind(state, geoKey, ...PRODUCTIVITY_YIELD_KEYS, asOfNumeric - MAX_PRODUCTIVITY_YIELD_LAG_YEARS, asOfNumeric)
      .all<{ as_of_date: string; series_key: keyof SeriesData; county_value: number; state_value: number }>();

    const latestPairs: Partial<Record<keyof SeriesData, { year: string; countyValue: number; stateValue: number }>> = {};
    for (const row of latestProductivityPairsRows.results ?? []) {
      if (latestPairs[row.series_key]) continue;
      if (!isFiniteSeriesNumber(row.county_value) || !isFiniteSeriesNumber(row.state_value)) continue;
      latestPairs[row.series_key] = {
        year: row.as_of_date,
        countyValue: row.county_value,
        stateValue: row.state_value,
      };
    }
    applyHistoricProductivityCarryForward(levels, levelYears, asOf, latestPairs);
  }

  return { series: result, lineage, levels, levelYears };
}

// ── Assumptions Loading ─────────────────────────────────────────────

export async function getAssumptions(
  db: D1Database,
  assumptionSetId?: number,
): Promise<Assumptions | null> {
  let row;
  if (assumptionSetId) {
    row = await db
      .prepare('SELECT params_json FROM assumption_sets WHERE id = ?')
      .bind(assumptionSetId)
      .first<{ params_json: string }>();
  } else {
    row = await db
      .prepare("SELECT params_json FROM assumption_sets WHERE name = 'Default' ORDER BY version DESC LIMIT 1")
      .first<{ params_json: string }>();
  }
  if (!row) return null;
  return parseJsonSafe<Assumptions | null>(row.params_json, null);
}

// ── Access Score Loading ────────────────────────────────────────────

export async function getAccessScore(
  db: D1Database,
  geoKey: string,
  asOf: string,
): Promise<{ score: number; distances: any; density: any } | null> {
  const row = await db
    .prepare('SELECT access_score, distances_json, density_json FROM geo_access_metrics WHERE geo_key = ? AND as_of_date = ?')
    .bind(geoKey, asOf)
    .first<{ access_score: number; distances_json: string; density_json: string }>();
  if (!row) {
    // Try without date filter, get most recent
    const fallback = await db
      .prepare('SELECT access_score, distances_json, density_json FROM geo_access_metrics WHERE geo_key = ? ORDER BY as_of_date DESC LIMIT 1')
      .bind(geoKey)
      .first<{ access_score: number; distances_json: string; density_json: string }>();
    if (!fallback) return null;
    return {
      score: fallback.access_score,
      distances: parseJsonSafe<Record<string, number>>(fallback.distances_json, {}),
      density: parseJsonSafe<Record<string, number>>(fallback.density_json, {}),
    };
  }
  return {
    score: row.access_score,
    distances: parseJsonSafe<Record<string, number>>(row.distances_json, {}),
    density: parseJsonSafe<Record<string, number>>(row.density_json, {}),
  };
}

// ── County Helpers ──────────────────────────────────────────────────

export async function getAllCounties(db: D1Database, state?: string) {
  if (state) {
    const rows = await db
      .prepare('SELECT * FROM geo_county WHERE state = ? ORDER BY name')
      .bind(state)
      .all();
    return {
      ...rows,
      results: filterAnalyticCountyRows((rows.results ?? []) as Array<Record<string, unknown>>),
    };
  }
  const rows = await db.prepare('SELECT * FROM geo_county ORDER BY state, name').all();
  return {
    ...rows,
    results: filterAnalyticCountyRows((rows.results ?? []) as Array<Record<string, unknown>>),
  };
}

export async function getCounty(db: D1Database, fips: string) {
  const county = await db.prepare('SELECT * FROM geo_county WHERE fips = ?').bind(fips).first<any>();
  return county && isAnalyticCountyRow(county) ? county : null;
}

export interface CountySeriesMeta {
  fips: string;
  name: string;
  state: string;
  centroid_lat: number | null;
  centroid_lon: number | null;
}

export interface CountySeriesWindow {
  counties: CountySeriesMeta[];
  years: string[];
  seriesByCountyYear: Map<string, Map<string, SeriesData>>;
  lineageByCountyYear: Map<string, Map<string, SeriesLineage>>;
  levelsByCountyYear: Map<string, Map<string, SeriesLevels>>;
  levelYearsByCountyYear: Map<string, Map<string, SeriesLevelYears>>;
  accessByCounty: Map<string, number | null>;
}

function ensureCountyYearSeries(
  seriesByCountyYear: Map<string, Map<string, SeriesData>>,
  geoKey: string,
  year: string,
): SeriesData {
  let byYear = seriesByCountyYear.get(geoKey);
  if (!byYear) {
    byYear = new Map<string, SeriesData>();
    seriesByCountyYear.set(geoKey, byYear);
  }
  let series = byYear.get(year);
  if (!series) {
    series = {};
    byYear.set(year, series);
  }
  return series;
}

function ensureCountyYearLineage(
  lineageByCountyYear: Map<string, Map<string, SeriesLineage>>,
  geoKey: string,
  year: string,
): SeriesLineage {
  let byYear = lineageByCountyYear.get(geoKey);
  if (!byYear) {
    byYear = new Map<string, SeriesLineage>();
    lineageByCountyYear.set(geoKey, byYear);
  }
  let lineage = byYear.get(year);
  if (!lineage) {
    lineage = {};
    byYear.set(year, lineage);
  }
  return lineage;
}

function ensureCountyYearLevels(
  levelsByCountyYear: Map<string, Map<string, SeriesLevels>>,
  geoKey: string,
  year: string,
): SeriesLevels {
  let byYear = levelsByCountyYear.get(geoKey);
  if (!byYear) {
    byYear = new Map<string, SeriesLevels>();
    levelsByCountyYear.set(geoKey, byYear);
  }
  let levels = byYear.get(year);
  if (!levels) {
    levels = {
      county: {},
      state: {},
      national: {},
    };
    byYear.set(year, levels);
  }
  return levels;
}

function ensureCountyYearLevelYears(
  levelYearsByCountyYear: Map<string, Map<string, SeriesLevelYears>>,
  geoKey: string,
  year: string,
): SeriesLevelYears {
  let byYear = levelYearsByCountyYear.get(geoKey);
  if (!byYear) {
    byYear = new Map<string, SeriesLevelYears>();
    levelYearsByCountyYear.set(geoKey, byYear);
  }
  let levelYears = byYear.get(year);
  if (!levelYears) {
    levelYears = createEmptyLevelYears();
    byYear.set(year, levelYears);
  }
  return levelYears;
}

export async function loadCountySeriesWindow(
  db: D1Database,
  startYear: number,
  endYear: number,
  state?: string,
): Promise<CountySeriesWindow> {
  const countiesResult = await getAllCounties(db, state);
  const counties = (countiesResult.results ?? []) as unknown as CountySeriesMeta[];
  const years: string[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(String(year));
  }

  const seriesByCountyYear = new Map<string, Map<string, SeriesData>>();
  const lineageByCountyYear = new Map<string, Map<string, SeriesLineage>>();
  const levelsByCountyYear = new Map<string, Map<string, SeriesLevels>>();
  const levelYearsByCountyYear = new Map<string, Map<string, SeriesLevelYears>>();
  const accessByCounty = new Map<string, number | null>();

  if (!counties.length) {
    return { counties: [], years, seriesByCountyYear, lineageByCountyYear, levelsByCountyYear, levelYearsByCountyYear, accessByCounty };
  }

  const yearStart = Math.min(startYear, endYear);
  const yearEnd = Math.max(startYear, endYear);
  const stateClause = state ? 'AND gc.state = ?' : '';
  const stateBindings = state ? [state] : [];
  const localRegionalSeriesKeys = [
    'cash_rent',
    'corn_yield',
    'soybean_yield',
    'wheat_yield',
    'land_value',
    'drought_risk_score',
    'drought_risk_rating_code',
    'drought_ag_loss_rate_pct',
  ];
  const localRegionalPlaceholders = localRegionalSeriesKeys.map(() => '?').join(',');

  const countySeries = await db
    .prepare(
      `SELECT gc.fips, dp.as_of_date, ds.series_key, dp.value
       FROM geo_county gc
       JOIN data_points dp ON dp.geo_key = gc.fips
       JOIN data_series ds ON ds.id = dp.series_id
       WHERE ds.series_key IN (${localRegionalPlaceholders})
         AND CAST(dp.as_of_date AS INTEGER) BETWEEN ? AND ?
         ${stateClause}`,
    )
    .bind(...localRegionalSeriesKeys, yearStart, yearEnd, ...stateBindings)
    .all<{ fips: string; as_of_date: string; series_key: string; value: number }>();

  for (const row of countySeries.results ?? []) {
    const series = ensureCountyYearSeries(seriesByCountyYear, row.fips, row.as_of_date);
    const lineage = ensureCountyYearLineage(lineageByCountyYear, row.fips, row.as_of_date);
    const levels = ensureCountyYearLevels(levelsByCountyYear, row.fips, row.as_of_date);
    const levelYears = ensureCountyYearLevelYears(levelYearsByCountyYear, row.fips, row.as_of_date);
    series[row.series_key] = row.value;
    lineage[row.series_key] = 'county';
    levels.county[row.series_key] = row.value;
    levelYears.county[row.series_key] = row.as_of_date;
  }

  const stateSeries = await db
    .prepare(
      `SELECT gc.fips, dp.as_of_date, ds.series_key, dp.value
       FROM geo_county gc
       JOIN data_points dp ON dp.geo_key = gc.state
       JOIN data_series ds ON ds.id = dp.series_id
       WHERE ds.series_key IN (${localRegionalPlaceholders})
         AND CAST(dp.as_of_date AS INTEGER) BETWEEN ? AND ?
         ${stateClause}`,
    )
    .bind(...localRegionalSeriesKeys, yearStart, yearEnd, ...stateBindings)
    .all<{ fips: string; as_of_date: string; series_key: string; value: number }>();

  for (const row of stateSeries.results ?? []) {
    const series = ensureCountyYearSeries(seriesByCountyYear, row.fips, row.as_of_date);
    const lineage = ensureCountyYearLineage(lineageByCountyYear, row.fips, row.as_of_date);
    const levels = ensureCountyYearLevels(levelsByCountyYear, row.fips, row.as_of_date);
    const levelYears = ensureCountyYearLevelYears(levelYearsByCountyYear, row.fips, row.as_of_date);
    levels.state[row.series_key] = row.value;
    levelYears.state[row.series_key] = row.as_of_date;
    if (!(row.series_key in series)) {
      series[row.series_key] = row.value;
      lineage[row.series_key] = 'state';
    }
  }

  const nationalSeries = await db
    .prepare(
      `SELECT dp.as_of_date, ds.series_key, dp.value
       FROM data_points dp
       JOIN data_series ds ON ds.id = dp.series_id
       WHERE dp.geo_key = 'US'
         AND ds.series_key IN (
           'cash_rent',
           'corn_yield',
           'soybean_yield',
           'wheat_yield',
           'land_value',
           'treasury_10y',
           'corn_price',
           'drought_risk_score',
           'drought_ag_loss_rate_pct'
         )
         AND CAST(dp.as_of_date AS INTEGER) BETWEEN ? AND ?
       ORDER BY CAST(dp.as_of_date AS INTEGER) ASC`,
    )
    .bind(yearStart, yearEnd)
    .all<{ as_of_date: string; series_key: string; value: number }>();

  const nationalByYear = new Map<string, SeriesData>();
  for (const row of nationalSeries.results ?? []) {
    const series = nationalByYear.get(row.as_of_date) ?? {};
    series[row.series_key] = row.value;
    nationalByYear.set(row.as_of_date, series);
  }

  for (const county of counties) {
    for (const year of years) {
      const national = nationalByYear.get(year);
      if (!national) continue;
      const series = ensureCountyYearSeries(seriesByCountyYear, county.fips, year);
      const lineage = ensureCountyYearLineage(lineageByCountyYear, county.fips, year);
      const levels = ensureCountyYearLevels(levelsByCountyYear, county.fips, year);
      const levelYears = ensureCountyYearLevelYears(levelYearsByCountyYear, county.fips, year);
      for (const [seriesKey, value] of Object.entries(national)) {
        levels.national[seriesKey] = value;
        levelYears.national[seriesKey] = year;
        if (!(seriesKey in series)) {
          series[seriesKey] = value;
          lineage[seriesKey] = 'national';
        }
      }
    }
  }

  const latestAccess = await db
    .prepare(
      `SELECT gc.fips, gam.access_score
       FROM geo_county gc
       LEFT JOIN geo_access_metrics gam
         ON gam.geo_key = gc.fips
        AND gam.as_of_date = (
          SELECT MAX(g2.as_of_date)
          FROM geo_access_metrics g2
          WHERE g2.geo_key = gc.fips
        )
       WHERE 1 = 1
         ${stateClause}`,
    )
    .bind(...stateBindings)
    .all<{ fips: string; access_score: number | null }>();

  for (const row of latestAccess.results ?? []) {
    accessByCounty.set(row.fips, row.access_score ?? null);
  }

  for (const county of counties) {
    const latestPairs: Partial<Record<keyof SeriesData, { year: string; countyValue: number; stateValue: number }>> = {};
    for (const year of years) {
      const levels = ensureCountyYearLevels(levelsByCountyYear, county.fips, year);
      const levelYears = ensureCountyYearLevelYears(levelYearsByCountyYear, county.fips, year);

      for (const key of PRODUCTIVITY_YIELD_KEYS) {
        const countyValue = levels.county[key];
        const stateValue = levels.state[key];
        if (isFiniteSeriesNumber(countyValue) && isFiniteSeriesNumber(stateValue)) {
          latestPairs[key] = {
            year,
            countyValue,
            stateValue,
          };
        }
      }

      applyHistoricProductivityCarryForward(levels, levelYears, year, latestPairs);
    }
  }

  return {
    counties,
    years,
    seriesByCountyYear,
    lineageByCountyYear,
    levelsByCountyYear,
    levelYearsByCountyYear,
    accessByCounty,
  };
}

// ── Timeseries ──────────────────────────────────────────────────────

export async function getTimeseries(
  db: D1Database,
  geoKey: string,
  startYear: number,
  endYear: number,
): Promise<Record<string, number>[]> {
  const county = await db
    .prepare('SELECT state FROM geo_county WHERE fips = ?')
    .bind(geoKey)
    .first<{ state: string }>();
  const state = county?.state ?? '';

  const geoKeys = state ? [geoKey, state, 'US'] : [geoKey, 'US'];
  const placeholders = geoKeys.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT dp.as_of_date, dp.geo_key, ds.series_key, dp.value
       FROM data_points dp
       JOIN data_series ds ON ds.id = dp.series_id
       WHERE dp.geo_key IN (${placeholders})
         AND CAST(dp.as_of_date AS INTEGER) BETWEEN ? AND ?
       ORDER BY CAST(dp.as_of_date AS INTEGER) ASC`,
    )
    .bind(...geoKeys, startYear, endYear)
    .all<{ as_of_date: string; geo_key: string; series_key: string; value: number }>();

  const scoreGeoPriority = (rowGeoKey: string): number => {
    if (rowGeoKey === geoKey) return 3;
    if (state && rowGeoKey === state) return 2;
    if (rowGeoKey === 'US') return 1;
    return 0;
  };

  const byYear = new Map<number, Map<string, { priority: number; value: number }>>();
  for (const row of rows.results) {
    const year = Number.parseInt(row.as_of_date, 10);
    if (!Number.isFinite(year) || year < startYear || year > endYear) continue;
    const priority = scoreGeoPriority(row.geo_key);
    if (!priority) continue;

    let yearMetrics = byYear.get(year);
    if (!yearMetrics) {
      yearMetrics = new Map<string, { priority: number; value: number }>();
      byYear.set(year, yearMetrics);
    }

    const existing = yearMetrics.get(row.series_key);
    if (!existing || priority >= existing.priority) {
      yearMetrics.set(row.series_key, { priority, value: row.value });
    }
  }

  const years: Record<string, number>[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const metrics = byYear.get(y);
    const row: Record<string, number> = { year: y };
    if (metrics) {
      for (const [seriesKey, entry] of metrics.entries()) {
        row[seriesKey] = entry.value;
      }
    }
    years.push(row);
  }
  return years;
}
