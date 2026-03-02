/**
 * Live Data Ingestion — USDA NASS + FRED
 *
 * Pulls annual data for all tracked counties and national series,
 * then upserts into D1.  Designed to run on a daily cron trigger.
 *
 * USDA NASS QuickStats API:
 *   - cash_rent  (county + state)  — RENT, CASH, CROPLAND
 *   - land_value (county + state)  — AG LAND, INCL BUILDINGS, VALUE
 *   - corn_yield (county + state)  — CORN, GRAIN, YIELD
 *
 * FRED API:
 *   - treasury_10y (national) — DGS10 (annual avg)
 *   - corn_price   (national) — WPU012202 (PPI Corn)
 */

import type { D1Database } from '@cloudflare/workers-types';

// ── Types ───────────────────────────────────────────────────────────

interface SecretStoreSecret {
  get(): Promise<string>;
}

interface RawEnv {
  DB: D1Database;
  FRED_API_KEY: SecretStoreSecret;
  NASS_API_KEY: SecretStoreSecret;
}

interface ResolvedEnv {
  DB: D1Database;
  FRED_API_KEY: string;
  NASS_API_KEY: string;
}

interface IngestResult {
  source: string;
  inserted: number;
  skipped: number;
  errors: string[];
}

interface NassRecord {
  state_alpha: string;
  county_code: string;
  state_fips_code: string;
  year: string;
  Value: string;
  county_name: string;
}

// ── NASS Series Config ──────────────────────────────────────────────

interface NassSeries {
  seriesKey: string;
  commodity: string;
  statCat: string;
  countyExtra: Record<string, string>;
  stateShortDesc: string;
  countySeriesId: number | null; // null = skip county query
  stateSeriesId: number;
}

const NASS_SERIES: NassSeries[] = [
  {
    seriesKey: 'cash_rent',
    commodity: 'RENT',
    statCat: 'EXPENSE',
    // County level has IRRIGATED/NON-IRRIGATED variants; use NON-IRRIGATED for Midwest
    countyExtra: { prodn_practice_desc: 'NON-IRRIGATED' },
    stateShortDesc: 'RENT, CASH, CROPLAND - EXPENSE, MEASURED IN $ / ACRE',
    countySeriesId: 1,
    stateSeriesId: 2,
  },
  {
    seriesKey: 'land_value',
    commodity: 'AG LAND',
    statCat: 'ASSET VALUE',
    countyExtra: {},
    stateShortDesc: 'AG LAND, INCL BUILDINGS - ASSET VALUE, MEASURED IN $ / ACRE',
    // County-level land values are Census-only (every 5 yrs, total $ not $/acre).
    // Annual $/acre data is state-level only via SURVEY.
    countySeriesId: null,
    stateSeriesId: 4,
  },
  {
    seriesKey: 'corn_yield',
    commodity: 'CORN',
    statCat: 'YIELD',
    countyExtra: {},
    stateShortDesc: 'CORN, GRAIN - YIELD, MEASURED IN BU / ACRE',
    countySeriesId: 5,
    stateSeriesId: 6,
  },
];

const TRACKED_STATES = ['IA', 'IL', 'IN'];

// ── NASS API ────────────────────────────────────────────────────────

const NASS_BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';

async function fetchNass(
  apiKey: string,
  params: Record<string, string>,
): Promise<NassRecord[]> {
  const qs = new URLSearchParams({ key: apiKey, format: 'JSON', ...params });
  const url = `${NASS_BASE}?${qs}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`NASS API ${resp.status}: ${await resp.text()}`);
  }
  const body = await resp.json() as { data?: NassRecord[] };
  return body.data ?? [];
}

/**
 * Chunk a year range into batches to stay under NASS's 50,000 record limit.
 * 20-year chunks are safe even for county-level data across ~100 counties.
 */
function yearChunks(startYear: number, endYear: number, chunkSize = 20): [number, number][] {
  const chunks: [number, number][] = [];
  for (let y = startYear; y <= endYear; y += chunkSize) {
    chunks.push([y, Math.min(y + chunkSize - 1, endYear)]);
  }
  return chunks;
}

async function ingestNass(env: ResolvedEnv, startYear: number, endYear: number): Promise<IngestResult> {
  const result: IngestResult = { source: 'USDA-NASS', inserted: 0, skipped: 0, errors: [] };
  const chunks = yearChunks(startYear, endYear);

  for (const series of NASS_SERIES) {
    for (const state of TRACKED_STATES) {
      // County-level data (skip if countySeriesId is null, e.g. land_value)
      if (series.countySeriesId !== null) {
        for (const [chunkStart, chunkEnd] of chunks) {
          try {
            const countyData = await fetchNass(env.NASS_API_KEY, {
              source_desc: 'SURVEY',
              commodity_desc: series.commodity,
              statisticcat_desc: series.statCat,
              agg_level_desc: 'COUNTY',
              state_alpha: state,
              year__GE: String(chunkStart),
              year__LE: String(chunkEnd),
              ...series.countyExtra,
            });

            for (const rec of countyData) {
              const val = parseFloat(rec.Value?.replace(/,/g, '') ?? '');
              if (isNaN(val)) continue;
              const fips = `${rec.state_fips_code}${rec.county_code}`;
              const upserted = await upsertDataPoint(
                env.DB,
                series.countySeriesId,
                fips,
                rec.year,
                val,
              );
              if (upserted) result.inserted++;
              else result.skipped++;
            }
          } catch (err: any) {
            result.errors.push(`${series.seriesKey}/${state}/county/${chunkStart}-${chunkEnd}: ${err.message}`);
          }
        }
      }

      // State-level data — single request is fine (only 1 row per year per state)
      try {
        const stateData = await fetchNass(env.NASS_API_KEY, {
          source_desc: 'SURVEY',
          short_desc: series.stateShortDesc,
          agg_level_desc: 'STATE',
          state_alpha: state,
          year__GE: String(startYear),
          year__LE: String(endYear),
        });

        for (const rec of stateData) {
          const val = parseFloat(rec.Value?.replace(/,/g, '') ?? '');
          if (isNaN(val)) continue;
          const upserted = await upsertDataPoint(
            env.DB,
            series.stateSeriesId,
            rec.state_alpha,
            rec.year,
            val,
          );
          if (upserted) result.inserted++;
          else result.skipped++;
        }
      } catch (err: any) {
        result.errors.push(`${series.seriesKey}/${state}/state: ${err.message}`);
      }
    }
  }

  return result;
}

// ── FRED API ────────────────────────────────────────────────────────

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObservation {
  date: string;
  value: string;
}

async function fetchFredAnnualAvg(
  apiKey: string,
  seriesId: string,
  startYear: number,
  endYear: number,
): Promise<{ year: string; value: number }[]> {
  const qs = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    observation_start: `${startYear}-01-01`,
    observation_end: `${endYear}-12-31`,
    frequency: 'a',            // annual average
    aggregation_method: 'avg',
  });
  const resp = await fetch(`${FRED_BASE}?${qs}`);
  if (!resp.ok) {
    throw new Error(`FRED API ${resp.status}: ${await resp.text()}`);
  }
  const body = await resp.json() as { observations?: FredObservation[] };
  const results: { year: string; value: number }[] = [];
  for (const obs of body.observations ?? []) {
    const val = parseFloat(obs.value);
    if (isNaN(val) || obs.value === '.') continue;
    const year = obs.date.slice(0, 4);
    results.push({ year, value: val });
  }
  return results;
}

async function ingestFred(env: ResolvedEnv, startYear: number, endYear: number): Promise<IngestResult> {
  const result: IngestResult = { source: 'FRED', inserted: 0, skipped: 0, errors: [] };

  // 10-Year Treasury (series_id = 7, geo_key = 'US')
  try {
    const treasuryData = await fetchFredAnnualAvg(
      env.FRED_API_KEY,
      'DGS10',
      startYear,
      endYear,
    );
    for (const { year, value } of treasuryData) {
      const upserted = await upsertDataPoint(env.DB, 7, 'US', year, value);
      if (upserted) result.inserted++;
      else result.skipped++;
    }
  } catch (err: any) {
    result.errors.push(`treasury_10y: ${err.message}`);
  }

  // Corn price from NASS (more direct than FRED PPI index)
  try {
    const cornPriceData = await fetchNassCornPrice(env.NASS_API_KEY, startYear, endYear);
    for (const { year, value } of cornPriceData) {
      const upserted = await upsertDataPoint(env.DB, 8, 'US', year, value);
      if (upserted) result.inserted++;
      else result.skipped++;
    }
  } catch (err: any) {
    result.errors.push(`corn_price: ${err.message}`);
  }

  return result;
}

// Corn price from NASS (more direct than FRED PPI index)
async function fetchNassCornPrice(
  apiKey: string,
  startYear: number,
  endYear: number,
): Promise<{ year: string; value: number }[]> {
  const data = await fetchNass(apiKey, {
    source_desc: 'SURVEY',
    commodity_desc: 'CORN',
    short_desc: 'CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU',
    agg_level_desc: 'NATIONAL',
    year__GE: String(startYear),
    year__LE: String(endYear),
  });
  const results: { year: string; value: number }[] = [];
  for (const rec of data) {
    const val = parseFloat(rec.Value?.replace(/,/g, '') ?? '');
    if (!isNaN(val)) results.push({ year: rec.year, value: val });
  }
  return results;
}

// ── Upsert Helper ───────────────────────────────────────────────────

async function upsertDataPoint(
  db: D1Database,
  seriesId: number,
  geoKey: string,
  asOfDate: string,
  value: number,
): Promise<boolean> {
  // Check if exists
  const existing = await db
    .prepare(
      'SELECT id, value FROM data_points WHERE series_id = ? AND geo_key = ? AND as_of_date = ?',
    )
    .bind(seriesId, geoKey, asOfDate)
    .first<{ id: number; value: number }>();

  if (existing) {
    // Only update if value changed
    if (Math.abs(existing.value - value) < 0.001) return false;
    await db
      .prepare('UPDATE data_points SET value = ? WHERE id = ?')
      .bind(value, existing.id)
      .run();
    return true;
  }

  // Insert new
  await db
    .prepare(
      'INSERT INTO data_points (series_id, geo_key, as_of_date, value) VALUES (?, ?, ?, ?)',
    )
    .bind(seriesId, geoKey, asOfDate, value)
    .run();
  return true;
}

// ── Data Freshness Logging ──────────────────────────────────────────

async function logFreshness(
  db: D1Database,
  source: string,
  result: IngestResult,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO data_freshness (source_name, last_updated, record_count, notes)
       VALUES (?, datetime('now'), ?, ?)`,
    )
    .bind(
      source,
      result.inserted,
      JSON.stringify({
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
        timestamp: new Date().toISOString(),
      }),
    )
    .run();
}

// ── Main Ingestion Entrypoint ───────────────────────────────────────

export async function runIngestion(
  rawEnv: RawEnv,
  options?: { startYear?: number; endYear?: number },
): Promise<{
  nass: IngestResult;
  fred: IngestResult;
  duration_ms: number;
  year_range: { start: number; end: number };
}> {
  const start = Date.now();
  const currentYear = new Date().getFullYear();
  const startYear = options?.startYear ?? currentYear - 2;
  const endYear = options?.endYear ?? currentYear;

  // Secrets Store bindings require async .get() to resolve the value
  const [fredKey, nassKey] = await Promise.all([
    rawEnv.FRED_API_KEY.get(),
    rawEnv.NASS_API_KEY.get(),
  ]);
  const env: ResolvedEnv = {
    DB: rawEnv.DB,
    FRED_API_KEY: fredKey,
    NASS_API_KEY: nassKey,
  };

  const [nass, fred] = await Promise.all([
    ingestNass(env, startYear, endYear),
    ingestFred(env, startYear, endYear),
  ]);

  // Log freshness
  await Promise.all([
    logFreshness(env.DB, 'USDA-NASS', nass),
    logFreshness(env.DB, 'FRED', fred),
  ]);

  return { nass, fred, duration_ms: Date.now() - start, year_range: { start: startYear, end: endYear } };
}
