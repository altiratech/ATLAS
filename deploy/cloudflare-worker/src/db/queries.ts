/**
 * Database query helpers for D1.
 * Replaces SQLAlchemy ORM queries with raw SQL against D1.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { SeriesData, Assumptions } from '../services/metric-engine';

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ── Series Data Loading (hierarchical: county → state → national) ───

export async function loadSeriesForCounty(
  db: D1Database,
  geoKey: string,
  asOf: string,
): Promise<SeriesData> {
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
  for (const r of countyRows.results) {
    result[r.series_key] = r.value;
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
      if (!(r.series_key in result)) {
        result[r.series_key] = r.value;
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
    if (!(r.series_key in result)) {
      result[r.series_key] = r.value;
    }
  }

  return result;
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
    return db
      .prepare('SELECT * FROM geo_county WHERE state = ? ORDER BY name')
      .bind(state)
      .all();
  }
  return db.prepare('SELECT * FROM geo_county ORDER BY state, name').all();
}

export async function getCounty(db: D1Database, fips: string) {
  return db.prepare('SELECT * FROM geo_county WHERE fips = ?').bind(fips).first();
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
