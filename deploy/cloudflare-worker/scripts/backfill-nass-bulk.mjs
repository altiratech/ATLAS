#!/usr/bin/env node

import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { appendFile, stat, writeFile } from 'node:fs/promises';

const DEFAULT_BASE_URL = 'https://atlas.altiratech.com';
const DEFAULT_STATES = [
  'IA', 'IL', 'IN', 'NE', 'KS', 'MN', 'OH', 'WI', 'MO', 'SD',
  'ND', 'TX', 'CA', 'WA', 'OR', 'ID', 'MT', 'CO', 'MI', 'PA',
];

const DATASETS_URL = 'https://www.nass.usda.gov/datasets/';
const DATASET_DISCOVERY_URLS = [
  'https://www.nass.usda.gov/datasets/',
  'https://www.nass.usda.gov/datasets',
  'https://data.nass.usda.gov/datasets/',
];
const STATE_SHORT_DESC = new Map([
  ['RENT, CASH, CROPLAND - EXPENSE, MEASURED IN $ / ACRE', 'cash_rent'],
  ['AG LAND, INCL BUILDINGS - ASSET VALUE, MEASURED IN $ / ACRE', 'land_value'],
  ['CORN, GRAIN - YIELD, MEASURED IN BU / ACRE', 'corn_yield'],
  ['SOYBEANS - YIELD, MEASURED IN BU / ACRE', 'soybean_yield'],
  ['WHEAT - YIELD, MEASURED IN BU / ACRE', 'wheat_yield'],
]);
const NATIONAL_SHORT_DESC = new Map([
  ['CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU', 'corn_price'],
]);

const COUNTY_RULES = [
  { seriesKey: 'cash_rent', commodity: 'RENT', statCat: 'EXPENSE', prodnPractice: 'NON-IRRIGATED' },
  { seriesKey: 'corn_yield', commodity: 'CORN', statCat: 'YIELD' },
  { seriesKey: 'soybean_yield', commodity: 'SOYBEANS', statCat: 'YIELD' },
  { seriesKey: 'wheat_yield', commodity: 'WHEAT', statCat: 'YIELD' },
];
const SQL_SOURCE_DEFINITIONS = [
  {
    name: 'USDA-NASS',
    url: 'https://quickstats.nass.usda.gov/',
    cadence: 'annual',
  },
];
const SQL_SERIES_DEFINITIONS = [
  { seriesKey: 'cash_rent', geoLevel: 'county', frequency: 'annual', unit: '$/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'cash_rent', geoLevel: 'state', frequency: 'annual', unit: '$/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'land_value', geoLevel: 'state', frequency: 'annual', unit: '$/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'corn_yield', geoLevel: 'county', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'corn_yield', geoLevel: 'state', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'soybean_yield', geoLevel: 'county', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'soybean_yield', geoLevel: 'state', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'wheat_yield', geoLevel: 'county', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'wheat_yield', geoLevel: 'state', frequency: 'annual', unit: 'bu/acre', sourceName: 'USDA-NASS' },
  { seriesKey: 'corn_price', geoLevel: 'national', frequency: 'annual', unit: '$/bu', sourceName: 'USDA-NASS' },
];
const SQL_DEFAULT_MODE = 'api';

function normalize(value) {
  return (value ?? '').trim().toUpperCase();
}

function parseBool(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=', 2);
    const key = rawKey.slice(2);
    if (inlineValue != null) {
      opts[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = 'true';
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

function parseStates(value) {
  const tokens = (value || DEFAULT_STATES.join(','))
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  const states = Array.from(new Set(tokens));
  for (const state of states) {
    if (!/^[A-Z]{2}$/.test(state)) {
      throw new Error(`Invalid state token: ${state}`);
    }
  }
  return states;
}

function parseMode(value) {
  const normalized = String(value ?? SQL_DEFAULT_MODE).trim().toLowerCase();
  if (normalized === 'api' || normalized === 'sql') return normalized;
  throw new Error(`Unsupported mode "${value}". Use "api" or "sql".`);
}

function escapeSqlString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function formatSqlNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Cannot serialize non-finite numeric value to SQL: ${value}`);
  }
  return String(numeric);
}

function buildSqlPreamble(sourceName) {
  const lines = [
    'BEGIN;',
    'CREATE TEMP TABLE temp_bulk_points (series_key TEXT NOT NULL, geo_level TEXT NOT NULL, geo_key TEXT NOT NULL, as_of_date TEXT NOT NULL, value REAL NOT NULL);',
    'CREATE TEMP TABLE temp_bulk_counties (fips TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, state_name TEXT);',
  ];

  for (const source of SQL_SOURCE_DEFINITIONS) {
    lines.push(
      `INSERT INTO data_sources (name, url, cadence)
       VALUES (${escapeSqlString(source.name)}, ${escapeSqlString(source.url)}, ${escapeSqlString(source.cadence)})
       ON CONFLICT(name) DO UPDATE SET url = excluded.url, cadence = excluded.cadence;`,
    );
  }

  for (const series of SQL_SERIES_DEFINITIONS) {
    lines.push(
      `INSERT INTO data_series (series_key, geo_level, frequency, unit, source_id)
       SELECT ${escapeSqlString(series.seriesKey)}, ${escapeSqlString(series.geoLevel)}, ${escapeSqlString(series.frequency)}, ${escapeSqlString(series.unit)}, ds.id
       FROM data_sources ds
       WHERE ds.name = ${escapeSqlString(series.sourceName)}
       ON CONFLICT(series_key, geo_level)
       DO UPDATE SET
         frequency = excluded.frequency,
         unit = excluded.unit,
         source_id = excluded.source_id;`,
    );
  }

  lines.push(`-- Bulk load source: ${sourceName}`);
  return `${lines.join('\n')}\n`;
}

function buildSqlTail(sourceName, matchedRows) {
  return [
    `INSERT INTO geo_county (fips, name, state, state_name)
     SELECT fips, name, state, state_name
     FROM temp_bulk_counties
     WHERE 1 = 1
     ON CONFLICT(fips)
     DO UPDATE SET
       name = excluded.name,
       state = excluded.state,
       state_name = COALESCE(excluded.state_name, geo_county.state_name);`,
    `INSERT INTO data_points (series_id, geo_key, as_of_date, value)
     SELECT ds.id, tbp.geo_key, tbp.as_of_date, tbp.value
     FROM temp_bulk_points tbp
     JOIN data_series ds
       ON ds.series_key = tbp.series_key
      AND ds.geo_level = tbp.geo_level
     WHERE 1 = 1
     ON CONFLICT(series_id, geo_key, as_of_date)
     DO UPDATE SET value = excluded.value
     WHERE ABS(COALESCE(data_points.value, 0) - COALESCE(excluded.value, 0)) >= 0.001;`,
    `INSERT INTO data_freshness (source_name, last_updated, record_count, notes)
     VALUES (
       ${escapeSqlString(sourceName)},
       datetime('now'),
       ${formatSqlNumber(matchedRows)},
       json_object('mode', 'sql_import', 'matched_rows', ${formatSqlNumber(matchedRows)}, 'generated_at', datetime('now'))
     );`,
    'DROP TABLE temp_bulk_counties;',
    'DROP TABLE temp_bulk_points;',
    'COMMIT;',
    '',
  ].join('\n');
}

function buildSqlValuesInsert(tableName, columns, rows, mapRow) {
  if (!rows.length) return '';
  const values = rows.map((row) => `(${mapRow(row)})`).join(',\n');
  return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES\n${values};\n`;
}

async function discoverLatestNassBulkUrls() {
  const findLatestFilename = (text, kind) => {
    const re = new RegExp(`qs\\.${kind}_(\\d{8})\\.txt\\.gz`, 'gi');
    const hits = [];
    let match = re.exec(text);
    while (match) {
      hits.push({
        filename: match[0],
        stamp: match[1],
      });
      match = re.exec(text);
    }
    if (!hits.length) return null;
    hits.sort((a, b) => b.stamp.localeCompare(a.stamp));
    return hits[0].filename;
  };

  let cropsUrl = null;
  let economicsUrl = null;
  const visited = [];

  for (const candidateUrl of DATASET_DISCOVERY_URLS) {
    visited.push(candidateUrl);
    let response;
    try {
      response = await fetch(candidateUrl);
    } catch {
      continue;
    }
    if (!response.ok) {
      continue;
    }
    const text = await response.text();
    const cropsFile = findLatestFilename(text, 'crops');
    const economicsFile = findLatestFilename(text, 'economics');
    if (cropsFile && !cropsUrl) {
      cropsUrl = new URL(cropsFile, candidateUrl).toString();
    }
    if (economicsFile && !economicsUrl) {
      economicsUrl = new URL(economicsFile, candidateUrl).toString();
    }
    if (cropsUrl && economicsUrl) break;
  }

  if (!cropsUrl && !economicsUrl) {
    throw new Error(`Could not discover NASS bulk URLs from datasets pages: ${visited.join(', ')}`);
  }
  return { cropsUrl, economicsUrl };
}

function parseValue(rawValue) {
  const cleaned = (rawValue ?? '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  if (cleaned === '(D)' || cleaned === '(Z)' || cleaned === 'NA') return null;
  const numeric = Number.parseFloat(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function toHeaderIndex(headerLine) {
  const headers = headerLine.split('\t');
  const idx = new Map();
  headers.forEach((header, i) => idx.set(normalize(header).toLowerCase(), i));
  const required = [
    'year',
    'agg_level_desc',
    'state_alpha',
    'state_fips_code',
    'county_code',
    'commodity_desc',
    'statisticcat_desc',
    'prodn_practice_desc',
    'short_desc',
    'value',
  ];
  for (const field of required) {
    if (!idx.has(field)) {
      throw new Error(`Bulk file is missing expected header: ${field}`);
    }
  }
  return idx;
}

function valueAt(columns, idx, key) {
  const position = idx.get(key);
  if (position == null) return '';
  return columns[position] ?? '';
}

function mapCountyRow(columns, idx, allowedStates, startYear, endYear) {
  if (normalize(valueAt(columns, idx, 'agg_level_desc')) !== 'COUNTY') return null;
  const year = Number.parseInt(valueAt(columns, idx, 'year'), 10);
  if (Number.isNaN(year) || year < startYear || year > endYear) return null;

  const state = normalize(valueAt(columns, idx, 'state_alpha'));
  if (!allowedStates.has(state)) return null;

  const commodity = normalize(valueAt(columns, idx, 'commodity_desc'));
  const statCat = normalize(valueAt(columns, idx, 'statisticcat_desc'));
  const prodnPractice = normalize(valueAt(columns, idx, 'prodn_practice_desc'));

  let seriesKey = null;
  for (const rule of COUNTY_RULES) {
    if (commodity !== rule.commodity || statCat !== rule.statCat) continue;
    if (rule.prodnPractice && prodnPractice !== rule.prodnPractice) continue;
    seriesKey = rule.seriesKey;
    break;
  }
  if (!seriesKey) return null;

  const stateFips = valueAt(columns, idx, 'state_fips_code').trim();
  const countyCode = valueAt(columns, idx, 'county_code').trim();
  if (!stateFips || !countyCode) return null;
  const geoKey = `${stateFips.padStart(2, '0')}${countyCode.padStart(3, '0')}`;
  if (!/^\d{5}$/.test(geoKey)) return null;

  const value = parseValue(valueAt(columns, idx, 'value'));
  if (value == null) return null;

  return {
    series_key: seriesKey,
    geo_level: 'county',
    geo_key: geoKey,
    as_of_date: String(year),
    value,
    county_name: valueAt(columns, idx, 'county_name').trim() || null,
    state_name: valueAt(columns, idx, 'state_name').trim() || null,
    state_alpha: state,
  };
}

function mapStateRow(columns, idx, allowedStates, startYear, endYear) {
  if (normalize(valueAt(columns, idx, 'agg_level_desc')) !== 'STATE') return null;
  const year = Number.parseInt(valueAt(columns, idx, 'year'), 10);
  if (Number.isNaN(year) || year < startYear || year > endYear) return null;

  const state = normalize(valueAt(columns, idx, 'state_alpha'));
  if (!allowedStates.has(state)) return null;

  const shortDesc = normalize(valueAt(columns, idx, 'short_desc'));
  const seriesKey = STATE_SHORT_DESC.get(shortDesc);
  if (!seriesKey) return null;

  const value = parseValue(valueAt(columns, idx, 'value'));
  if (value == null) return null;

  return {
    series_key: seriesKey,
    geo_level: 'state',
    geo_key: state,
    as_of_date: String(year),
    value,
  };
}

function mapNationalRow(columns, idx, startYear, endYear) {
  if (normalize(valueAt(columns, idx, 'agg_level_desc')) !== 'NATIONAL') return null;
  const year = Number.parseInt(valueAt(columns, idx, 'year'), 10);
  if (Number.isNaN(year) || year < startYear || year > endYear) return null;

  const shortDesc = normalize(valueAt(columns, idx, 'short_desc'));
  const seriesKey = NATIONAL_SHORT_DESC.get(shortDesc);
  if (!seriesKey) return null;

  const value = parseValue(valueAt(columns, idx, 'value'));
  if (value == null) return null;

  return {
    series_key: seriesKey,
    geo_level: 'national',
    geo_key: 'US',
    as_of_date: String(year),
    value,
  };
}

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function processBulkFile(
  fileUrl,
  label,
  options,
  batchState,
) {
  console.log(`→ Download + parse ${label}: ${fileUrl}`);
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${label}: HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error(`No response body for ${label}`);
  }

  const gunzip = createGunzip();
  const nodeReadable = Readable.fromWeb(response.body);
  const lineReader = readline.createInterface({
    input: nodeReadable.pipe(gunzip),
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  let idx = null;
  for await (const line of lineReader) {
    lineNo += 1;
    if (lineNo === 1) {
      idx = toHeaderIndex(line);
      continue;
    }
    if (!idx || !line) continue;

    const columns = line.split('\t');
    const countyRow = mapCountyRow(columns, idx, options.stateSet, options.startYear, options.endYear);
    const stateRow = mapStateRow(columns, idx, options.stateSet, options.startYear, options.endYear);
    const nationalRow = mapNationalRow(columns, idx, options.startYear, options.endYear);

    const matchedRows = [countyRow, stateRow, nationalRow].filter(Boolean);
    if (!matchedRows.length) continue;

    batchState.matchedRows += matchedRows.length;
    for (const row of matchedRows) {
      if (row.geo_level === 'county' && row.county_name) {
        batchState.counties.set(row.geo_key, {
          fips: row.geo_key,
          name: row.county_name,
          state: row.state_alpha,
          state_name: row.state_name,
        });
      }
      batchState.pending.push(row);
      if (batchState.pending.length >= options.batchSize) {
        await flushPending(options, batchState);
      }
    }

    if (batchState.matchedRows % 5000 === 0) {
      console.log(`  parsed rows matched=${batchState.matchedRows.toLocaleString()} batches=${batchState.sentBatches}`);
    }
  }
}

async function flushPending(options, batchState) {
  if (!batchState.pending.length) return;

  const rows = batchState.pending.splice(0, options.batchSize);
  if (options.dryRun) {
    batchState.sentBatches += 1;
    batchState.sentRows += rows.length;
    return;
  }

  batchState.sentBatches += 1;
  batchState.sentRows += rows.length;
  if (options.mode === 'sql') {
    await appendFile(
      options.sqlFile,
      buildSqlValuesInsert(
        'temp_bulk_points',
        ['series_key', 'geo_level', 'geo_key', 'as_of_date', 'value'],
        rows,
        (row) => [
          escapeSqlString(row.series_key),
          escapeSqlString(row.geo_level),
          escapeSqlString(row.geo_key),
          escapeSqlString(row.as_of_date),
          formatSqlNumber(row.value),
        ].join(', '),
      ),
      'utf8',
    );
    return;
  }

  const payload = {
    source: options.sourceName,
    rows,
  };
  const result = await postJson(
    `${options.baseUrl}/api/v1/ingest/bulk`,
    options.httpHeaders,
    payload,
    options.requestTimeoutMs,
  );
  batchState.inserted += Number(result.inserted ?? 0);
  batchState.skipped += Number(result.skipped ?? 0);
  const errors = Array.isArray(result.errors) ? result.errors : [];
  batchState.errorCount += errors.length;
}

async function finalizeSqlFile(options, batchState) {
  if (options.mode !== 'sql' || options.dryRun) return;

  const countyRows = Array.from(batchState.counties.values()).sort((a, b) => a.fips.localeCompare(b.fips));
  if (countyRows.length) {
    await appendFile(
      options.sqlFile,
      buildSqlValuesInsert(
        'temp_bulk_counties',
        ['fips', 'name', 'state', 'state_name'],
        countyRows,
        (row) => [
          escapeSqlString(row.fips),
          escapeSqlString(row.name),
          escapeSqlString(row.state),
          row.state_name ? escapeSqlString(row.state_name) : 'NULL',
        ].join(', '),
      ),
      'utf8',
    );
  }

  await appendFile(options.sqlFile, buildSqlTail(options.sourceName, batchState.matchedRows), 'utf8');
}

async function maybeRunMacroPass(options) {
  if (!options.runMacro || options.dryRun) return;
  const url =
    `${options.baseUrl}/api/v1/ingest` +
    `?start_year=${options.startYear}` +
    `&end_year=${options.endYear}` +
    `&include_nass=0&include_fred=1&include_ag_index=1`;
  console.log(`→ Macro pass (FRED + ag-index): ${options.startYear}-${options.endYear}`);
  await postJson(url, options.httpHeaders, {}, options.requestTimeoutMs);
}

async function main() {
  const cli = parseArgs(process.argv);
  const currentYear = new Date().getUTCFullYear();
  const startYear = Number.parseInt(cli['start-year'] ?? `${currentYear - 20}`, 10);
  const endYear = Number.parseInt(cli['end-year'] ?? `${currentYear}`, 10);
  if (Number.isNaN(startYear) || Number.isNaN(endYear) || startYear > endYear) {
    throw new Error('Invalid start/end year.');
  }

  const batchSize = Number.parseInt(cli['batch-size'] ?? '500', 10);
  if (Number.isNaN(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error('batch-size must be between 1 and 1000.');
  }

  const mode = parseMode(cli.mode ?? process.env.ATLAS_BACKFILL_MODE);
  const baseUrl = (cli['base-url'] ?? process.env.ATLAS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const states = parseStates(cli.states ?? process.env.ATLAS_BACKFILL_STATES);
  const stateSet = new Set(states);

  const includeCrops = parseBool(cli['include-crops'], true);
  const includeEconomics = parseBool(cli['include-economics'], true);
  const runMacro = parseBool(cli['run-macro'], true);
  const dryRun = parseBool(cli['dry-run'], false);
  const summaryJsonPath = (cli['summary-json'] ?? '').trim();
  const sqlFile = (cli['sql-file'] ?? process.env.ATLAS_BACKFILL_SQL_FILE ?? '').trim();
  const requestTimeoutMs = Number.parseInt(cli['request-timeout-ms'] ?? '120000', 10);
  const sourceName = (cli.source ?? 'USDA-NASS-BULK').trim() || 'USDA-NASS-BULK';

  const headers = {
    'Content-Type': 'application/json',
  };
  if (mode === 'api') {
    const ingestAdminToken = process.env.ATLAS_INGEST_ADMIN_TOKEN?.trim();
    const bearerToken = process.env.ATLAS_BEARER_TOKEN?.trim();
    if (!ingestAdminToken && !bearerToken) {
      throw new Error('Set ATLAS_INGEST_ADMIN_TOKEN or ATLAS_BEARER_TOKEN for api mode.');
    }

    const accessClientId = process.env.ATLAS_CF_ACCESS_CLIENT_ID?.trim() ?? '';
    const accessClientSecret = process.env.ATLAS_CF_ACCESS_CLIENT_SECRET?.trim() ?? '';
    if ((accessClientId && !accessClientSecret) || (!accessClientId && accessClientSecret)) {
      throw new Error('Set both ATLAS_CF_ACCESS_CLIENT_ID and ATLAS_CF_ACCESS_CLIENT_SECRET, or neither.');
    }
    if (ingestAdminToken) headers['X-Atlas-Ingest-Token'] = ingestAdminToken;
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    if (accessClientId && accessClientSecret) {
      headers['CF-Access-Client-Id'] = accessClientId;
      headers['CF-Access-Client-Secret'] = accessClientSecret;
    }
  } else if (!dryRun && !sqlFile) {
    throw new Error('Set --sql-file when mode=sql.');
  }

  let discovered = { cropsUrl: null, economicsUrl: null };
  if (includeCrops || includeEconomics) {
    discovered = await discoverLatestNassBulkUrls();
  }
  const cropsUrl = cli['crops-url'] || process.env.NASS_CROPS_URL || discovered.cropsUrl;
  const economicsUrl = cli['economics-url'] || process.env.NASS_ECONOMICS_URL || discovered.economicsUrl;

  console.log(`Bulk backfill target: ${baseUrl}`);
  console.log(`Mode: ${mode}`);
  console.log(`Year range: ${startYear}-${endYear}`);
  console.log(`States (${states.length}): ${states.join(',')}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Source label: ${sourceName}`);
  console.log(`Include crops file: ${includeCrops}`);
  console.log(`Include economics file: ${includeEconomics}`);
  console.log(`Run macro pass: ${runMacro}`);
  console.log(`Dry run: ${dryRun}`);
  if (mode === 'sql' && sqlFile) {
    console.log(`SQL output: ${sqlFile}`);
  }

  const batchState = {
    pending: [],
    matchedRows: 0,
    sentRows: 0,
    sentBatches: 0,
    inserted: 0,
    skipped: 0,
    errorCount: 0,
    counties: new Map(),
  };
  const options = {
    mode,
    baseUrl,
    startYear,
    endYear,
    stateSet,
    batchSize,
    sourceName,
    runMacro,
    dryRun,
    requestTimeoutMs,
    httpHeaders: headers,
    sqlFile,
  };

  if (mode === 'sql' && !dryRun) {
    await writeFile(sqlFile, buildSqlPreamble(sourceName), 'utf8');
  }

  if (includeEconomics) {
    if (!economicsUrl) throw new Error('Could not resolve economics bulk URL.');
    await processBulkFile(economicsUrl, 'economics', options, batchState);
  }
  if (includeCrops) {
    if (!cropsUrl) throw new Error('Could not resolve crops bulk URL.');
    await processBulkFile(cropsUrl, 'crops', options, batchState);
  }
  await flushPending(options, batchState);
  await finalizeSqlFile(options, batchState);
  if (mode === 'api') {
    await maybeRunMacroPass(options);
  }

  const summary = {
    mode,
    matched_rows: batchState.matchedRows,
    sent_rows: batchState.sentRows,
    sent_batches: batchState.sentBatches,
    inserted: batchState.inserted,
    skipped: batchState.skipped,
    endpoint_errors: batchState.errorCount,
    counties_staged: batchState.counties.size,
    start_year: startYear,
    end_year: endYear,
    states,
    source: sourceName,
    include_crops: includeCrops,
    include_economics: includeEconomics,
    run_macro: runMacro,
    dry_run: dryRun,
    sql_file: mode === 'sql' ? sqlFile || null : null,
  };

  if (mode === 'sql' && !dryRun && sqlFile) {
    const fileStats = await stat(sqlFile);
    summary.sql_bytes = fileStats.size;
  }

  if (summaryJsonPath) {
    await writeFile(summaryJsonPath, JSON.stringify(summary, null, 2), 'utf8');
  }

  console.log('Bulk backfill completed.');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
