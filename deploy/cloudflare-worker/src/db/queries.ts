/**
 * Database query helpers for D1.
 * Replaces SQLAlchemy ORM queries with raw SQL against D1.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { SeriesData, Assumptions } from '../services/metric-engine';

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
  return JSON.parse(row.params_json);
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
      distances: JSON.parse(fallback.distances_json || '{}'),
      density: JSON.parse(fallback.density_json || '{}'),
    };
  }
  return {
    score: row.access_score,
    distances: JSON.parse(row.distances_json || '{}'),
    density: JSON.parse(row.density_json || '{}'),
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
  const years: Record<string, number>[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const series = await loadSeriesForCounty(db, geoKey, String(y));
    years.push({ year: y, ...series } as any);
  }
  return years;
}
