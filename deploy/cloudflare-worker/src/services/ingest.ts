/**
 * Live Data Ingestion — USDA NASS + FRED + Ag Composite Index
 *
 * Pulls annual fundamentals for tracked states/counties and daily market index data,
 * then upserts into D1. Designed for scheduled runs plus manual backfills.
 */

import type { D1Database } from '@cloudflare/workers-types';

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

export interface BulkDataPointInput {
  seriesKey: string;
  geoLevel: 'county' | 'state' | 'national';
  geoKey: string;
  asOfDate: string;
  value: number;
}

interface NassRecord {
  state_alpha: string;
  county_code: string;
  state_fips_code: string;
  year: string;
  Value: string;
}

interface SeriesDefinition {
  seriesKey: string;
  geoLevel: 'county' | 'state' | 'national';
  frequency: 'annual' | 'daily';
  unit: string;
  sourceName: string;
  sourceUrl: string;
  cadence: string;
}

interface NassSeries {
  seriesKey: string;
  commodity: string;
  statCat: string;
  countyExtra: Record<string, string>;
  stateShortDesc: string;
  countyEnabled: boolean;
}

interface FredObservation {
  date: string;
  value: string;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

export const TRACKED_STATES = [
  'IA', 'IL', 'IN', 'NE', 'KS', 'MN', 'OH', 'WI', 'MO', 'SD',
  'ND', 'TX', 'CA', 'WA', 'OR', 'ID', 'MT', 'CO', 'MI', 'PA',
] as const;

const SERIES_DEFINITIONS: SeriesDefinition[] = [
  { seriesKey: 'cash_rent', geoLevel: 'county', frequency: 'annual', unit: '$/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'cash_rent', geoLevel: 'state', frequency: 'annual', unit: '$/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'land_value', geoLevel: 'state', frequency: 'annual', unit: '$/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'corn_yield', geoLevel: 'county', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'corn_yield', geoLevel: 'state', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'soybean_yield', geoLevel: 'county', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'soybean_yield', geoLevel: 'state', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'wheat_yield', geoLevel: 'county', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'wheat_yield', geoLevel: 'state', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
  { seriesKey: 'treasury_10y', geoLevel: 'national', frequency: 'annual', unit: '%', sourceName: 'FRED', sourceUrl: 'https://fred.stlouisfed.org/', cadence: 'daily' },
  { seriesKey: 'corn_price', geoLevel: 'national', frequency: 'annual', unit: '$/bu', sourceName: 'USDA-NASS', sourceUrl: 'https://quickstats.nass.usda.gov/', cadence: 'annual' },
];

const NASS_SERIES: NassSeries[] = [
  {
    seriesKey: 'cash_rent',
    commodity: 'RENT',
    statCat: 'EXPENSE',
    countyExtra: { prodn_practice_desc: 'NON-IRRIGATED' },
    stateShortDesc: 'RENT, CASH, CROPLAND - EXPENSE, MEASURED IN $ / ACRE',
    countyEnabled: true,
  },
  {
    seriesKey: 'land_value',
    commodity: 'AG LAND',
    statCat: 'ASSET VALUE',
    countyExtra: {},
    stateShortDesc: 'AG LAND, INCL BUILDINGS - ASSET VALUE, MEASURED IN $ / ACRE',
    countyEnabled: false,
  },
  {
    seriesKey: 'corn_yield',
    commodity: 'CORN',
    statCat: 'YIELD',
    countyExtra: {},
    stateShortDesc: 'CORN, GRAIN - YIELD, MEASURED IN BU / ACRE',
    countyEnabled: true,
  },
  {
    seriesKey: 'soybean_yield',
    commodity: 'SOYBEANS',
    statCat: 'YIELD',
    countyExtra: {},
    stateShortDesc: 'SOYBEANS - YIELD, MEASURED IN BU / ACRE',
    countyEnabled: true,
  },
  {
    seriesKey: 'wheat_yield',
    commodity: 'WHEAT',
    statCat: 'YIELD',
    countyExtra: {},
    stateShortDesc: 'WHEAT - YIELD, MEASURED IN BU / ACRE',
    countyEnabled: true,
  },
];
export const NASS_SERIES_KEYS = NASS_SERIES.map((series) => series.seriesKey) as Array<
  (typeof NASS_SERIES)[number]['seriesKey']
>;

const NASS_BASE = 'https://quickstats.nass.usda.gov/api/api_GET/';
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const AG_INDEX_TICKERS = ['DBA', 'MOO', 'CROP', 'WEAT'] as const;
const NASS_TIMEOUT_MS = 25_000;
const FRED_TIMEOUT_MS = 20_000;
const YAHOO_TIMEOUT_MS = 20_000;

function seriesCatalogKey(seriesKey: string, geoLevel: string): string {
  return `${seriesKey}:${geoLevel}`;
}

function yearChunks(startYear: number, endYear: number, chunkSize = 20): [number, number][] {
  const chunks: [number, number][] = [];
  for (let year = startYear; year <= endYear; year += chunkSize) {
    chunks.push([year, Math.min(year + chunkSize - 1, endYear)]);
  }
  return chunks;
}

async function ensureDataSource(
  db: D1Database,
  sourceName: string,
  sourceUrl: string,
  cadence: string,
): Promise<number> {
  const existing = await db
    .prepare('SELECT id FROM data_sources WHERE name = ?')
    .bind(sourceName)
    .first<{ id: number }>();
  if (existing) return existing.id;

  const inserted = await db
    .prepare('INSERT INTO data_sources (name, url, cadence) VALUES (?, ?, ?) RETURNING id')
    .bind(sourceName, sourceUrl, cadence)
    .first<{ id: number }>();
  if (!inserted) throw new Error(`Failed to create data source ${sourceName}`);
  return inserted.id;
}

async function ensureSeriesCatalog(db: D1Database): Promise<Record<string, number>> {
  const bySource = new Map<string, number>();
  const catalog: Record<string, number> = {};

  for (const seriesDef of SERIES_DEFINITIONS) {
    const sourceKey = `${seriesDef.sourceName}|${seriesDef.sourceUrl}|${seriesDef.cadence}`;
    let sourceId = bySource.get(sourceKey);
    if (!sourceId) {
      sourceId = await ensureDataSource(db, seriesDef.sourceName, seriesDef.sourceUrl, seriesDef.cadence);
      bySource.set(sourceKey, sourceId);
    }

    const existing = await db
      .prepare('SELECT id FROM data_series WHERE series_key = ? AND geo_level = ?')
      .bind(seriesDef.seriesKey, seriesDef.geoLevel)
      .first<{ id: number }>();

    let seriesId = existing?.id;
    if (!seriesId) {
      const inserted = await db
        .prepare(
          `INSERT INTO data_series (series_key, geo_level, frequency, unit, source_id)
           VALUES (?, ?, ?, ?, ?) RETURNING id`,
        )
        .bind(seriesDef.seriesKey, seriesDef.geoLevel, seriesDef.frequency, seriesDef.unit, sourceId)
        .first<{ id: number }>();
      seriesId = inserted?.id;
    }

    if (!seriesId) {
      throw new Error(`Failed to ensure series catalog for ${seriesDef.seriesKey}:${seriesDef.geoLevel}`);
    }

    catalog[seriesCatalogKey(seriesDef.seriesKey, seriesDef.geoLevel)] = seriesId;
  }

  return catalog;
}

async function fetchNass(apiKey: string, params: Record<string, string>): Promise<NassRecord[]> {
  const query = new URLSearchParams({ key: apiKey, format: 'JSON', ...params });
  const response = await fetchWithTimeout(`${NASS_BASE}?${query}`, NASS_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`NASS API ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { data?: NassRecord[] };
  return payload.data ?? [];
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timerId);
  }
}

async function upsertDataPoint(
  db: D1Database,
  seriesId: number,
  geoKey: string,
  asOfDate: string,
  value: number,
): Promise<boolean> {
  const existing = await db
    .prepare('SELECT id, value FROM data_points WHERE series_id = ? AND geo_key = ? AND as_of_date = ?')
    .bind(seriesId, geoKey, asOfDate)
    .first<{ id: number; value: number }>();

  if (existing) {
    if (Math.abs(existing.value - value) < 0.001) return false;
    await db
      .prepare('UPDATE data_points SET value = ? WHERE id = ?')
      .bind(value, existing.id)
      .run();
    return true;
  }

  await db
    .prepare('INSERT INTO data_points (series_id, geo_key, as_of_date, value) VALUES (?, ?, ?, ?)')
    .bind(seriesId, geoKey, asOfDate, value)
    .run();
  return true;
}

async function ingestNass(
  env: ResolvedEnv,
  catalog: Record<string, number>,
  startYear: number,
  endYear: number,
  states: readonly string[],
  seriesKeys?: string[],
): Promise<IngestResult> {
  const result: IngestResult = { source: 'USDA-NASS', inserted: 0, skipped: 0, errors: [] };
  const chunks = yearChunks(startYear, endYear);
  const selectedSeries = seriesKeys?.length
    ? NASS_SERIES.filter((series) => seriesKeys.includes(series.seriesKey))
    : NASS_SERIES;

  for (const series of selectedSeries) {
    const countySeriesId = catalog[seriesCatalogKey(series.seriesKey, 'county')];
    const stateSeriesId = catalog[seriesCatalogKey(series.seriesKey, 'state')];

    for (const state of states) {
      if (series.countyEnabled && countySeriesId) {
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

            for (const row of countyData) {
              const value = Number.parseFloat((row.Value ?? '').replace(/,/g, ''));
              if (Number.isNaN(value)) continue;
              const fips = `${row.state_fips_code}${row.county_code}`;
              const changed = await upsertDataPoint(env.DB, countySeriesId, fips, row.year, value);
              if (changed) result.inserted += 1;
              else result.skipped += 1;
            }
          } catch (error: any) {
            result.errors.push(`${series.seriesKey}/${state}/county/${chunkStart}-${chunkEnd}: ${error.message}`);
          }
        }
      }

      if (stateSeriesId) {
        try {
          const stateData = await fetchNass(env.NASS_API_KEY, {
            source_desc: 'SURVEY',
            short_desc: series.stateShortDesc,
            agg_level_desc: 'STATE',
            state_alpha: state,
            year__GE: String(startYear),
            year__LE: String(endYear),
          });

          for (const row of stateData) {
            const value = Number.parseFloat((row.Value ?? '').replace(/,/g, ''));
            if (Number.isNaN(value)) continue;
            const changed = await upsertDataPoint(env.DB, stateSeriesId, row.state_alpha, row.year, value);
            if (changed) result.inserted += 1;
            else result.skipped += 1;
          }
        } catch (error: any) {
          result.errors.push(`${series.seriesKey}/${state}/state: ${error.message}`);
        }
      }
    }
  }

  return result;
}

async function fetchFredAnnualAvg(
  apiKey: string,
  seriesId: string,
  startYear: number,
  endYear: number,
): Promise<Array<{ year: string; value: number }>> {
  const query = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    observation_start: `${startYear}-01-01`,
    observation_end: `${endYear}-12-31`,
    frequency: 'a',
    aggregation_method: 'avg',
  });
  const response = await fetchWithTimeout(`${FRED_BASE}?${query}`, FRED_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`FRED API ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { observations?: FredObservation[] };
  const rows: Array<{ year: string; value: number }> = [];
  for (const obs of payload.observations ?? []) {
    const value = Number.parseFloat(obs.value);
    if (Number.isNaN(value) || obs.value === '.') continue;
    rows.push({ year: obs.date.slice(0, 4), value });
  }
  return rows;
}

async function fetchNassCornPrice(
  apiKey: string,
  startYear: number,
  endYear: number,
): Promise<Array<{ year: string; value: number }>> {
  const data = await fetchNass(apiKey, {
    source_desc: 'SURVEY',
    commodity_desc: 'CORN',
    short_desc: 'CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU',
    agg_level_desc: 'NATIONAL',
    year__GE: String(startYear),
    year__LE: String(endYear),
  });

  const rows: Array<{ year: string; value: number }> = [];
  for (const row of data) {
    const value = Number.parseFloat((row.Value ?? '').replace(/,/g, ''));
    if (!Number.isNaN(value)) {
      rows.push({ year: row.year, value });
    }
  }
  return rows;
}

async function ingestFred(
  env: ResolvedEnv,
  catalog: Record<string, number>,
  startYear: number,
  endYear: number,
): Promise<IngestResult> {
  const result: IngestResult = { source: 'FRED', inserted: 0, skipped: 0, errors: [] };

  const treasurySeriesId = catalog[seriesCatalogKey('treasury_10y', 'national')];
  if (treasurySeriesId) {
    try {
      const rows = await fetchFredAnnualAvg(env.FRED_API_KEY, 'DGS10', startYear, endYear);
      for (const row of rows) {
        const changed = await upsertDataPoint(env.DB, treasurySeriesId, 'US', row.year, row.value);
        if (changed) result.inserted += 1;
        else result.skipped += 1;
      }
    } catch (error: any) {
      result.errors.push(`treasury_10y: ${error.message}`);
    }
  }

  const cornPriceSeriesId = catalog[seriesCatalogKey('corn_price', 'national')];
  if (cornPriceSeriesId) {
    try {
      const rows = await fetchNassCornPrice(env.NASS_API_KEY, startYear, endYear);
      for (const row of rows) {
        const changed = await upsertDataPoint(env.DB, cornPriceSeriesId, 'US', row.year, row.value);
        if (changed) result.inserted += 1;
        else result.skipped += 1;
      }
    } catch (error: any) {
      result.errors.push(`corn_price: ${error.message}`);
    }
  }

  return result;
}

async function ensureAgCompositeIndexTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ag_composite_index (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         as_of_date TEXT NOT NULL UNIQUE,
         value REAL NOT NULL,
         component_json TEXT NOT NULL,
         zscore REAL,
         created_at TEXT DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ix_ag_composite_index_as_of ON ag_composite_index(as_of_date DESC)').run();
}

async function fetchYahooDailyClose(symbol: string, range = '3y'): Promise<Array<{ date: string; close: number }>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const response = await fetchWithTimeout(url, YAHOO_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Yahoo Finance ${symbol} ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as YahooChartResponse;
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const rows: Array<{ date: string; close: number }> = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (close == null || Number.isNaN(close)) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    rows.push({ date, close });
  }
  return rows;
}

function computeZscore(value: number, series: number[]): number {
  if (!series.length) return 0;
  const mean = series.reduce((sum, n) => sum + n, 0) / series.length;
  const variance = series.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / series.length;
  const stddev = Math.sqrt(variance);
  if (stddev <= 0) return 0;
  return (value - mean) / stddev;
}

async function ingestAgCompositeIndex(db: D1Database): Promise<IngestResult> {
  const result: IngestResult = { source: 'AG-COMPOSITE', inserted: 0, skipped: 0, errors: [] };
  await ensureAgCompositeIndexTable(db);

  const histories = await Promise.all(
    AG_INDEX_TICKERS.map(async (ticker) => {
      try {
        const rows = await fetchYahooDailyClose(ticker, '3y');
        return { ticker, rows };
      } catch (error: any) {
        result.errors.push(`${ticker}: ${error.message}`);
        return { ticker, rows: [] as Array<{ date: string; close: number }> };
      }
    }),
  );

  const byDate = new Map<string, Record<string, number>>();
  for (const history of histories) {
    for (const row of history.rows) {
      const bucket = byDate.get(row.date) ?? {};
      bucket[history.ticker] = row.close;
      byDate.set(row.date, bucket);
    }
  }

  const dates = [...byDate.keys()].sort();
  const indexValues: Array<{ date: string; value: number; components: Record<string, number> }> = [];

  for (const date of dates) {
    const components = byDate.get(date) ?? {};
    const values = Object.values(components).filter((n) => Number.isFinite(n));
    if (!values.length) continue;
    const composite = values.reduce((sum, n) => sum + n, 0) / values.length;
    indexValues.push({
      date,
      value: Math.round(composite * 10000) / 10000,
      components,
    });
  }

  const onlyValues = indexValues.map((row) => row.value);
  for (const row of indexValues) {
    const z = computeZscore(row.value, onlyValues);
    await db
      .prepare(
        `INSERT INTO ag_composite_index (as_of_date, value, component_json, zscore)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(as_of_date)
         DO UPDATE SET value = excluded.value, component_json = excluded.component_json, zscore = excluded.zscore`,
      )
      .bind(row.date, row.value, JSON.stringify(row.components), Math.round(z * 10000) / 10000)
      .run();
    result.inserted += 1;
  }

  if (!indexValues.length) {
    result.skipped += 1;
    result.errors.push('No ag index rows were computed from ticker histories.');
  }

  return result;
}

async function logFreshness(db: D1Database, source: string, ingestResult: IngestResult): Promise<void> {
  await db
    .prepare(
      `INSERT INTO data_freshness (source_name, last_updated, record_count, notes)
       VALUES (?, datetime('now'), ?, ?)`,
    )
    .bind(
      source,
      ingestResult.inserted,
      JSON.stringify({
        inserted: ingestResult.inserted,
        skipped: ingestResult.skipped,
        errors: ingestResult.errors,
        timestamp: new Date().toISOString(),
      }),
    )
    .run();
}

export async function ingestBulkDataPoints(
  rawEnv: RawEnv,
  rows: BulkDataPointInput[],
  source = 'USDA-NASS-BULK',
): Promise<IngestResult> {
  const result: IngestResult = {
    source,
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  if (!rows.length) {
    await logFreshness(rawEnv.DB, source, result);
    return result;
  }

  const catalog = await ensureSeriesCatalog(rawEnv.DB);
  for (const row of rows) {
    const value = Number(row.value);
    if (!Number.isFinite(value)) {
      result.errors.push(
        `invalid_value/${row.seriesKey}/${row.geoLevel}/${row.geoKey}/${row.asOfDate}`,
      );
      continue;
    }

    const seriesId = catalog[seriesCatalogKey(row.seriesKey, row.geoLevel)];
    if (!seriesId) {
      result.errors.push(`unknown_series/${row.seriesKey}:${row.geoLevel}`);
      continue;
    }

    try {
      const changed = await upsertDataPoint(rawEnv.DB, seriesId, row.geoKey, row.asOfDate, value);
      if (changed) result.inserted += 1;
      else result.skipped += 1;
    } catch (error: any) {
      result.errors.push(
        `write_error/${row.seriesKey}/${row.geoLevel}/${row.geoKey}/${row.asOfDate}: ${error.message}`,
      );
    }
  }

  await logFreshness(rawEnv.DB, source, result);
  return result;
}

export async function runIngestion(
  rawEnv: RawEnv,
  options?: {
    startYear?: number;
    endYear?: number;
    states?: string[];
    nassSeriesKeys?: string[];
    includeNass?: boolean;
    includeFred?: boolean;
    includeAgIndex?: boolean;
  },
): Promise<{
  nass: IngestResult;
  fred: IngestResult;
  ag_index: IngestResult;
  duration_ms: number;
  year_range: { start: number; end: number };
  states: readonly string[];
}> {
  const startedAt = Date.now();
  const currentYear = new Date().getUTCFullYear();
  const startYear = options?.startYear ?? currentYear - 2;
  const endYear = options?.endYear ?? currentYear;
  const selectedStates = options?.states?.length ? [...options.states] : [...TRACKED_STATES];
  const selectedNassSeries = options?.nassSeriesKeys?.length ? [...options.nassSeriesKeys] : undefined;
  const includeNass = options?.includeNass ?? true;
  const includeFred = options?.includeFred ?? true;
  const includeAgIndex = options?.includeAgIndex ?? true;

  const [fredKey, nassKey] = await Promise.all([
    rawEnv.FRED_API_KEY.get(),
    rawEnv.NASS_API_KEY.get(),
  ]);

  const env: ResolvedEnv = {
    DB: rawEnv.DB,
    FRED_API_KEY: fredKey,
    NASS_API_KEY: nassKey,
  };

  const catalog = await ensureSeriesCatalog(env.DB);

  const emptyResult = (source: string): IngestResult => ({
    source,
    inserted: 0,
    skipped: 0,
    errors: [],
  });

  const nass = includeNass
    ? await ingestNass(env, catalog, startYear, endYear, selectedStates, selectedNassSeries)
    : emptyResult('USDA-NASS');
  const fred = includeFred
    ? await ingestFred(env, catalog, startYear, endYear)
    : emptyResult('FRED');
  const agIndex = includeAgIndex
    ? await ingestAgCompositeIndex(env.DB)
    : emptyResult('AG-COMPOSITE');

  const freshnessWrites: Promise<void>[] = [];
  if (includeNass) freshnessWrites.push(logFreshness(env.DB, 'USDA-NASS', nass));
  if (includeFred) freshnessWrites.push(logFreshness(env.DB, 'FRED', fred));
  if (includeAgIndex) freshnessWrites.push(logFreshness(env.DB, 'AG-COMPOSITE', agIndex));
  await Promise.all(freshnessWrites);

  return {
    nass,
    fred,
    ag_index: agIndex,
    duration_ms: Date.now() - startedAt,
    year_range: { start: startYear, end: endYear },
    states: selectedStates,
  };
}
