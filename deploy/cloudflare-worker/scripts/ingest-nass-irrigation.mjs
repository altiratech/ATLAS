#!/usr/bin/env node
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';

const SOURCE_NAME = 'USDA-NASS';
const SOURCE_URL = 'https://www.nass.usda.gov/datasets/';
const SOURCE_CADENCE = 'periodic';
const DATASET_DISCOVERY_URLS = [
  'https://www.nass.usda.gov/datasets/',
  'https://www.nass.usda.gov/datasets',
  'https://data.nass.usda.gov/datasets/',
];
const TARGET_SHORT_DESC = 'AG LAND, IRRIGATED - ACRES';
const SERIES_KEY = 'irrigated_ag_land_acres';

const SERIES_DEFS = [
  { key: SERIES_KEY, geoLevels: ['county', 'state', 'national'], unit: 'acres' },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[key] = value;
  }
  return args;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toFiniteNumber(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').trim();
  if (!cleaned || cleaned === '(D)' || cleaned === '(Z)' || cleaned === '(NA)' || cleaned === '(L)') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalize(value) {
  return String(value ?? '').trim().toUpperCase();
}

async function discoverLatestEconomicsBulkUrl() {
  for (const candidateUrl of DATASET_DISCOVERY_URLS) {
    const res = await fetch(candidateUrl, {
      headers: {
        'User-Agent': 'Altira-Atlas-Irrigation-Ingest/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) continue;
    const html = await res.text();
    const matches = Array.from(html.matchAll(/qs\.economics_(\d{8})\.txt\.gz/gi));
    if (!matches.length) continue;
    matches.sort((a, b) => String(b[1]).localeCompare(String(a[1])));
    return `https://www.nass.usda.gov/datasets/${matches[0][0]}`;
  }
  throw new Error('Unable to discover latest NASS economics bulk file.');
}

function toHeaderIndex(headerLine) {
  const idx = new Map();
  headerLine.split('\t').forEach((name, i) => idx.set(String(name).trim().toLowerCase(), i));
  const required = [
    'source_desc',
    'sector_desc',
    'commodity_desc',
    'class_desc',
    'prodn_practice_desc',
    'statisticcat_desc',
    'unit_desc',
    'short_desc',
    'domain_desc',
    'domaincat_desc',
    'agg_level_desc',
    'state_alpha',
    'state_fips_code',
    'county_code',
    'county_name',
    'state_name',
    'year',
    'value',
  ];
  for (const field of required) {
    if (!idx.has(field)) throw new Error(`Bulk file missing expected header: ${field}`);
  }
  return idx;
}

function valueAt(columns, idx, key) {
  const position = idx.get(key);
  if (position == null) return '';
  return columns[position] ?? '';
}

function parseCountyRow(columns, idx, allowedStates) {
  if (normalize(valueAt(columns, idx, 'source_desc')) !== 'CENSUS') return null;
  if (normalize(valueAt(columns, idx, 'sector_desc')) !== 'ECONOMICS') return null;
  if (normalize(valueAt(columns, idx, 'commodity_desc')) !== 'AG LAND') return null;
  if (normalize(valueAt(columns, idx, 'class_desc')) !== 'ALL CLASSES') return null;
  if (normalize(valueAt(columns, idx, 'prodn_practice_desc')) !== 'IRRIGATED') return null;
  if (normalize(valueAt(columns, idx, 'statisticcat_desc')) !== 'AREA') return null;
  if (normalize(valueAt(columns, idx, 'unit_desc')) !== 'ACRES') return null;
  if (normalize(valueAt(columns, idx, 'short_desc')) !== TARGET_SHORT_DESC) return null;
  if (normalize(valueAt(columns, idx, 'domain_desc')) !== 'TOTAL') return null;
  if (normalize(valueAt(columns, idx, 'domaincat_desc')) !== 'NOT SPECIFIED') return null;
  if (normalize(valueAt(columns, idx, 'agg_level_desc')) !== 'COUNTY') return null;

  const state = normalize(valueAt(columns, idx, 'state_alpha'));
  if (allowedStates.size && !allowedStates.has(state)) return null;

  const stateFips = String(valueAt(columns, idx, 'state_fips_code')).trim();
  const countyCode = String(valueAt(columns, idx, 'county_code')).trim();
  const fips = `${stateFips.padStart(2, '0')}${countyCode.padStart(3, '0')}`;
  if (!/^\d{5}$/.test(fips)) return null;

  const sourceYear = Number.parseInt(valueAt(columns, idx, 'year'), 10);
  if (!Number.isFinite(sourceYear)) return null;

  const acres = toFiniteNumber(valueAt(columns, idx, 'value'));
  if (acres == null) return null;

  return {
    fips,
    state,
    countyName: String(valueAt(columns, idx, 'county_name')).trim() || fips,
    stateName: String(valueAt(columns, idx, 'state_name')).trim() || null,
    sourceYear,
    irrigatedAcres: acres,
  };
}

function chooseLatestValue(valuesByYear, targetYear) {
  const years = Array.from(valuesByYear.keys()).sort((a, b) => a - b);
  let selectedYear = null;
  for (const year of years) {
    if (year <= targetYear) selectedYear = year;
    else break;
  }
  if (selectedYear == null) return null;
  return { sourceYear: selectedYear, value: valuesByYear.get(selectedYear) };
}

function buildSql({ countyMap, startYear, endYear }) {
  const lines = [];
  const years = [];
  for (let year = startYear; year <= endYear; year += 1) years.push(year);

  lines.push(
    `INSERT OR IGNORE INTO data_sources (name, url, cadence, notes)
     VALUES (${sqlString(SOURCE_NAME)}, ${sqlString(SOURCE_URL)}, ${sqlString(SOURCE_CADENCE)}, ${sqlString('County irrigated agricultural acreage derived from USDA NASS Census economics bulk data and carried forward between census years.')});`,
  );

  for (const series of SERIES_DEFS) {
    for (const geoLevel of series.geoLevels) {
      lines.push(
        `INSERT OR IGNORE INTO data_series (series_key, geo_level, frequency, unit, source_id)
         VALUES (${sqlString(series.key)}, ${sqlString(geoLevel)}, ${sqlString('periodic')}, ${sqlString(series.unit)}, (SELECT id FROM data_sources WHERE name = ${sqlString(SOURCE_NAME)} LIMIT 1));`,
      );
    }
  }

  let rowCount = 0;
  for (const targetYear of years) {
    const stateTotals = new Map();
    let nationalTotal = 0;

    for (const county of countyMap.values()) {
      const carried = chooseLatestValue(county.valuesByYear, targetYear);
      if (!carried) continue;
      const quality = JSON.stringify({
        source: SOURCE_NAME,
        source_url: SOURCE_URL,
        source_dataset: 'economics_bulk',
        short_desc: TARGET_SHORT_DESC,
        source_census_year: carried.sourceYear,
        atlas_as_of_year: targetYear,
        carry_forward: carried.sourceYear !== targetYear,
      });
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString(SERIES_KEY)} AND geo_level = 'county' LIMIT 1), ${sqlString(county.fips)}, ${sqlString(String(targetYear))}, ${round(carried.value)}, ${sqlString(quality)})
         ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
      );
      rowCount += 1;
      stateTotals.set(county.state, (stateTotals.get(county.state) || 0) + carried.value);
      nationalTotal += carried.value;
    }

    for (const [state, total] of stateTotals.entries()) {
      const quality = JSON.stringify({
        source: SOURCE_NAME,
        source_url: SOURCE_URL,
        transform: 'State total derived from county irrigated agricultural acreage carried forward from the latest available census year.',
        atlas_as_of_year: targetYear,
      });
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString(SERIES_KEY)} AND geo_level = 'state' LIMIT 1), ${sqlString(state)}, ${sqlString(String(targetYear))}, ${round(total)}, ${sqlString(quality)})
         ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
      );
      rowCount += 1;
    }

    const nationalQuality = JSON.stringify({
      source: SOURCE_NAME,
      source_url: SOURCE_URL,
      transform: 'National total derived from county irrigated agricultural acreage carried forward from the latest available census year.',
      atlas_as_of_year: targetYear,
    });
    lines.push(
      `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
       VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString(SERIES_KEY)} AND geo_level = 'national' LIMIT 1), 'US', ${sqlString(String(targetYear))}, ${round(nationalTotal)}, ${sqlString(nationalQuality)})
       ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
    );
    rowCount += 1;
  }

  return {
    sql: lines.join('\n'),
    rowCount,
    years: years.map(String),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const startYear = Number(args.start_year || '2015');
  const endYear = Number(args.end_year || new Date().getUTCFullYear());
  const sqlFile = args.sql_file;
  const summaryJson = args.summary_json;
  const allowedStates = new Set(
    String(args.states || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean),
  );

  const fileUrl = await discoverLatestEconomicsBulkUrl();
  const response = await fetch(fileUrl, {
    headers: {
      'User-Agent': 'Altira-Atlas-Irrigation-Ingest/1.0',
      Accept: 'application/gzip,application/octet-stream,*/*',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download NASS economics bulk file: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('NASS economics bulk file returned no body.');
  }

  const gunzip = createGunzip();
  const nodeReadable = Readable.fromWeb(response.body);
  const lineReader = readline.createInterface({ input: nodeReadable.pipe(gunzip), crlfDelay: Infinity });

  let lineNo = 0;
  let idx = null;
  const countyMap = new Map();
  const sourceYears = new Set();

  for await (const line of lineReader) {
    lineNo += 1;
    if (lineNo === 1) {
      idx = toHeaderIndex(line);
      continue;
    }
    if (!idx || !line) continue;
    const row = parseCountyRow(line.split('\t'), idx, allowedStates);
    if (!row) continue;

    sourceYears.add(row.sourceYear);
    let current = countyMap.get(row.fips);
    if (!current) {
      current = {
        fips: row.fips,
        state: row.state,
        countyName: row.countyName,
        stateName: row.stateName,
        valuesByYear: new Map(),
      };
      countyMap.set(row.fips, current);
    }
    current.valuesByYear.set(row.sourceYear, row.irrigatedAcres);
  }

  const { sql, rowCount, years } = buildSql({ countyMap, startYear, endYear });
  if (sqlFile) await fs.writeFile(sqlFile, sql, 'utf8');
  else process.stdout.write(sql);

  const summary = {
    source: 'USDA-NASS irrigated agricultural acreage',
    source_url: fileUrl,
    start_year: startYear,
    end_year: endYear,
    years,
    county_count: countyMap.size,
    source_years: Array.from(sourceYears).sort((a, b) => a - b),
    data_point_rows: rowCount,
    states: Array.from(new Set(Array.from(countyMap.values()).map((row) => row.state))).sort(),
  };

  if (summaryJson) await fs.writeFile(summaryJson, JSON.stringify(summary, null, 2), 'utf8');
  console.error(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
