#!/usr/bin/env node
import fs from 'node:fs/promises';

const DEFAULT_STATES = ['IA', 'IL', 'IN', 'NE', 'KS', 'MN', 'OH', 'WI', 'MO', 'SD', 'ND', 'TX', 'CA', 'WA', 'OR', 'ID', 'MT', 'CO', 'MI', 'PA'];
const EIA_BASE = 'https://api.eia.gov/v2/electricity/retail-sales/data/';
const SOURCE_NAME = 'EIA';
const SOURCE_URL = 'https://api.eia.gov/v2/electricity/retail-sales/data/';
const SOURCE_CADENCE = 'annual';

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

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function sqlString(value) {
  return `'${escapeSqlString(value)}'`;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function normalizeYear(value) {
  const raw = String(value ?? '').trim();
  return /^\d{4}$/.test(raw) ? raw : null;
}

function toFiniteNumber(value) {
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

async function fetchEiaIndustrialPowerPrices({ apiKey, states, startYear, endYear }) {
  const url = new URL(EIA_BASE);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('frequency', 'annual');
  url.searchParams.set('data[0]', 'price');
  url.searchParams.set('facets[sectorid][]', 'IND');
  url.searchParams.set('sort[0][column]', 'period');
  url.searchParams.set('sort[0][direction]', 'desc');
  url.searchParams.set('offset', '0');
  url.searchParams.set('length', '5000');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Altira-Atlas-Industrial-Ingest/1.0',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EIA request failed: ${res.status} ${res.statusText} :: ${text.slice(0, 400)}`);
  }

  const payload = await res.json();
  const rows = payload?.response?.data;
  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected EIA payload shape: missing response.data`);
  }

  const byYear = new Map();
  for (const row of rows) {
    const year = normalizeYear(row.period);
    const state = String(row.stateid ?? '').trim().toUpperCase();
    const price = toFiniteNumber(row.price);
    if (!year || !state || price == null) continue;
    if (!states.has(state)) continue;
    const yearNum = Number(year);
    if (yearNum < startYear || yearNum > endYear) continue;
    let yearMap = byYear.get(year);
    if (!yearMap) {
      yearMap = new Map();
      byYear.set(year, yearMap);
    }
    yearMap.set(state, price);
  }

  return byYear;
}

function buildSql({ byYear }) {
  const lines = [];
  lines.push(`INSERT OR IGNORE INTO data_sources (name, url, cadence, notes) VALUES (${sqlString(SOURCE_NAME)}, ${sqlString(SOURCE_URL)}, ${sqlString(SOURCE_CADENCE)}, ${sqlString('Industrial power-price context for Atlas industrial screening.')});`);
  lines.push(`INSERT OR IGNORE INTO data_sources (name, url, cadence, notes) VALUES (${sqlString('Atlas Derived')}, ${sqlString('https://atlas.altiratech.com')}, ${sqlString('derived')}, ${sqlString('Derived industrial screening scores computed from public-source inputs.')});`);
  for (const geoLevel of ['state', 'national']) {
    lines.push(
      `INSERT OR IGNORE INTO data_series (series_key, geo_level, frequency, unit, source_id)
       VALUES (${sqlString('industrial_power_price')}, ${sqlString(geoLevel)}, ${sqlString('annual')}, ${sqlString('cents_per_kwh')}, (SELECT id FROM data_sources WHERE name = ${sqlString(SOURCE_NAME)} LIMIT 1));`,
    );
    lines.push(
      `INSERT OR IGNORE INTO data_series (series_key, geo_level, frequency, unit, source_id)
       VALUES (${sqlString('power_cost_index')}, ${sqlString(geoLevel)}, ${sqlString('annual')}, ${sqlString('score_0_100')}, (SELECT id FROM data_sources WHERE name = ${sqlString('Atlas Derived')} LIMIT 1));`,
    );
  }

  let rowCount = 0;
  const years = Array.from(byYear.keys()).sort();
  for (const year of years) {
    const yearMap = byYear.get(year);
    const entries = Array.from(yearMap.entries()).filter(([, price]) => Number.isFinite(price));
    if (!entries.length) continue;
    const prices = entries.map(([, price]) => price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;

    for (const [state, price] of entries) {
      const score = max === min ? 50 : ((max - price) / (max - min)) * 100;
      const quality = JSON.stringify({
        source: 'EIA',
        source_metric: 'industrial electricity price',
        sector: 'IND',
        transform: 'annual industrial retail price normalized into power_cost_index where lower price => higher score',
      });
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('industrial_power_price')} AND geo_level = 'state' LIMIT 1), ${sqlString(state)}, ${sqlString(year)}, ${round4(price)}, ${sqlString(quality)})
         ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
      );
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('power_cost_index')} AND geo_level = 'state' LIMIT 1), ${sqlString(state)}, ${sqlString(year)}, ${round4(score)}, ${sqlString(quality)})
         ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
      );
      rowCount += 2;
    }

    const nationalQuality = JSON.stringify({
      source: 'EIA',
      source_metric: 'industrial electricity price',
      sector: 'IND',
      transform: 'national average across tracked states; power_cost_index fixed at 50 for benchmark fallback',
    });
    lines.push(
      `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
       VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('industrial_power_price')} AND geo_level = 'national' LIMIT 1), 'US', ${sqlString(year)}, ${round4(avg)}, ${sqlString(nationalQuality)})
       ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
    );
    lines.push(
      `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
       VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('power_cost_index')} AND geo_level = 'national' LIMIT 1), 'US', ${sqlString(year)}, 50, ${sqlString(nationalQuality)})
       ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
    );
    rowCount += 2;
  }

  return { sql: lines.join('\n'), rowCount, years };
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.EIA_API_KEY || args.api_key || 'DEMO_KEY';

  const startYear = Number(args.start_year || '2016');
  const endYear = Number(args.end_year || new Date().getUTCFullYear());
  const states = new Set(String(args.states || DEFAULT_STATES.join(',')).split(',').map((item) => item.trim().toUpperCase()).filter(Boolean));
  const sqlFile = args.sql_file;
  const summaryJson = args.summary_json;

  const byYear = await fetchEiaIndustrialPowerPrices({ apiKey, states, startYear, endYear });
  const { sql, rowCount, years } = buildSql({ byYear });

  if (sqlFile) {
    await fs.writeFile(sqlFile, sql, 'utf8');
  } else {
    process.stdout.write(sql);
  }

  const summary = {
    source: 'EIA industrial power price',
    start_year: startYear,
    end_year: endYear,
    states: Array.from(states),
    years,
    state_year_count: Array.from(byYear.values()).reduce((sum, yearMap) => sum + yearMap.size, 0),
    data_point_rows: rowCount,
  };

  if (summaryJson) {
    await fs.writeFile(summaryJson, JSON.stringify(summary, null, 2), 'utf8');
  }

  console.error(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
