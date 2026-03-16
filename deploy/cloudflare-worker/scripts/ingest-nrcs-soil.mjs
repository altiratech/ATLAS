#!/usr/bin/env node
import fs from 'node:fs/promises';

const SOURCE_NAME = 'USDA-NRCS';
const SOURCE_URL = 'https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest';
const SOURCE_CADENCE = 'periodic';
const SDA_URL = SOURCE_URL;
const STATE_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
};

const SERIES_DEFS = [
  { key: 'soil_prime_farmland_share_pct', unit: 'pct_of_surveyed_acres' },
  { key: 'soil_statewide_farmland_share_pct', unit: 'pct_of_surveyed_acres' },
  { key: 'soil_unique_farmland_share_pct', unit: 'pct_of_surveyed_acres' },
  { key: 'soil_local_farmland_share_pct', unit: 'pct_of_surveyed_acres' },
  { key: 'soil_significant_farmland_share_pct', unit: 'pct_of_surveyed_acres' },
  { key: 'soil_other_land_share_pct', unit: 'pct_of_surveyed_acres' },
  { key: 'soil_rootzone_aws_100cm', unit: 'cm_water_storage' },
  { key: 'soil_rootzone_aws_150cm', unit: 'cm_water_storage' },
  { key: 'soil_survey_area_count', unit: 'count' },
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
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeStates(raw) {
  const selected = String(raw || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (!selected.length) return Object.keys(STATE_FIPS);
  return selected.filter((state) => STATE_FIPS[state]);
}

async function querySda(query) {
  const res = await fetch(SDA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Altira-Atlas-NRCS-Soil-Ingest/1.0',
      Accept: 'application/json,text/xml',
    },
    body: JSON.stringify({ format: 'json+columnname', query }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`NRCS SDA request failed: ${res.status} ${res.statusText} :: ${text.slice(0, 400)}`);
  }
  if (text.startsWith('<?xml') || text.includes('<ServiceException')) {
    throw new Error(`NRCS SDA query error: ${text.slice(0, 400)}`);
  }

  const payload = JSON.parse(text);
  const table = Array.isArray(payload?.Table) ? payload.Table : [];
  if (!table.length) return [];
  const [columns, ...rows] = table;
  return rows.map((row) => Object.fromEntries(columns.map((column, idx) => [column, row[idx]])));
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toFiniteNumber(value) {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function buildOverlapQuery(state) {
  return `
    select
      l.areasymbol as survey_areasymbol,
      l.areaname as survey_areaname,
      lo.areasymbol as county_areasymbol,
      lo.areaname as county_name,
      cast(lo.areaovacres as float) as overlap_acres
    from legend l
    join laoverlap lo on lo.lkey = l.lkey
    where l.areatypename = 'Non-MLRA Soil Survey Area'
      and lo.areatypename = 'County or Parish'
      and lo.areasymbol like '${state}%'
    order by lo.areasymbol, overlap_acres desc
  `;
}

function buildSurveyMetricsQuery(symbols) {
  const inClause = symbols.map((symbol) => sqlString(symbol)).join(',');
  return `
    select
      l.areasymbol as survey_areasymbol,
      cast(sum(cast(mu.muacres as float)) as float) as survey_acres,
      cast(sum(case when mu.farmlndcl = 'All areas are prime farmland' or mu.farmlndcl like 'Prime farmland%' then cast(mu.muacres as float) else 0 end) as float) as prime_acres,
      cast(sum(case when mu.farmlndcl like 'Farmland of statewide importance%' then cast(mu.muacres as float) else 0 end) as float) as statewide_acres,
      cast(sum(case when mu.farmlndcl like 'Farmland of unique importance%' then cast(mu.muacres as float) else 0 end) as float) as unique_acres,
      cast(sum(case when mu.farmlndcl like 'Farmland of local importance%' then cast(mu.muacres as float) else 0 end) as float) as local_acres,
      cast(
        sum(case when ma.aws0100wta is not null then cast(mu.muacres as float) * cast(ma.aws0100wta as float) else 0 end)
        / nullif(sum(case when ma.aws0100wta is not null then cast(mu.muacres as float) else 0 end), 0)
        as decimal(10, 4)
      ) as aws0100wta,
      cast(
        sum(case when ma.aws0150wta is not null then cast(mu.muacres as float) * cast(ma.aws0150wta as float) else 0 end)
        / nullif(sum(case when ma.aws0150wta is not null then cast(mu.muacres as float) else 0 end), 0)
        as decimal(10, 4)
      ) as aws0150wta
    from legend l
    join mapunit mu on mu.lkey = l.lkey
    left join muaggatt ma on ma.mukey = mu.mukey
    where l.areasymbol in (${inClause})
    group by l.areasymbol
  `;
}

function surveyMetricsFromRow(row) {
  const surveyAcres = toFiniteNumber(row.survey_acres);
  if (!surveyAcres || surveyAcres <= 0) return null;
  const primeAcres = toFiniteNumber(row.prime_acres) ?? 0;
  const statewideAcres = toFiniteNumber(row.statewide_acres) ?? 0;
  const uniqueAcres = toFiniteNumber(row.unique_acres) ?? 0;
  const localAcres = toFiniteNumber(row.local_acres) ?? 0;
  const significantShare = ((primeAcres + statewideAcres + uniqueAcres + localAcres) / surveyAcres) * 100;
  return {
    surveyAreaSymbol: String(row.survey_areasymbol),
    surveyAcres,
    primeSharePct: (primeAcres / surveyAcres) * 100,
    statewideSharePct: (statewideAcres / surveyAcres) * 100,
    uniqueSharePct: (uniqueAcres / surveyAcres) * 100,
    localSharePct: (localAcres / surveyAcres) * 100,
    significantSharePct: significantShare,
    otherSharePct: Math.max(0, 100 - significantShare),
    aws100: toFiniteNumber(row.aws0100wta),
    aws150: toFiniteNumber(row.aws0150wta),
  };
}

function countyFipsFromAreaSymbol(areaSymbol) {
  const value = String(areaSymbol || '').trim().toUpperCase();
  if (!/^[A-Z]{2}\d{3}$/.test(value)) return null;
  const state = value.slice(0, 2);
  const stateFips = STATE_FIPS[state];
  if (!stateFips) return null;
  return `${stateFips}${value.slice(2)}`;
}

async function fetchCountyOverlapRows(states) {
  const rows = [];
  for (const state of states) {
    const stateRows = await querySda(buildOverlapQuery(state));
    rows.push(...stateRows.map((row) => ({
      surveyAreaSymbol: String(row.survey_areasymbol),
      surveyAreaName: String(row.survey_areaname),
      countyAreaSymbol: String(row.county_areasymbol),
      countyName: String(row.county_name),
      overlapAcres: toFiniteNumber(row.overlap_acres) ?? 0,
    })));
  }
  return rows;
}

async function fetchSurveyMetrics(surveyAreaSymbols) {
  const metricsBySurvey = new Map();
  for (const batch of chunk(surveyAreaSymbols, 120)) {
    const rows = await querySda(buildSurveyMetricsQuery(batch));
    for (const row of rows) {
      const metrics = surveyMetricsFromRow(row);
      if (!metrics) continue;
      metricsBySurvey.set(metrics.surveyAreaSymbol, metrics);
    }
  }
  return metricsBySurvey;
}

function buildCountyRows(overlapRows, metricsBySurvey) {
  const grouped = new Map();
  for (const row of overlapRows) {
    if (!grouped.has(row.countyAreaSymbol)) grouped.set(row.countyAreaSymbol, []);
    grouped.get(row.countyAreaSymbol).push(row);
  }

  const results = [];
  for (const [countyAreaSymbol, rows] of grouped.entries()) {
    const countyFips = countyFipsFromAreaSymbol(countyAreaSymbol);
    if (!countyFips) continue;

    const weightedRows = rows
      .map((row) => ({ ...row, metrics: metricsBySurvey.get(row.surveyAreaSymbol) || null }))
      .filter((row) => row.metrics && row.overlapAcres > 0);
    if (!weightedRows.length) continue;

    const totalOverlap = weightedRows.reduce((sum, row) => sum + row.overlapAcres, 0);
    if (!(totalOverlap > 0)) continue;

    const primary = [...weightedRows].sort((a, b) => b.overlapAcres - a.overlapAcres)[0];
    const aggregate = {
      primeSharePct: 0,
      statewideSharePct: 0,
      uniqueSharePct: 0,
      localSharePct: 0,
      significantSharePct: 0,
      otherSharePct: 0,
      aws100Numerator: 0,
      aws100Weight: 0,
      aws150Numerator: 0,
      aws150Weight: 0,
    };

    for (const row of weightedRows) {
      const weight = row.overlapAcres / totalOverlap;
      aggregate.primeSharePct += weight * row.metrics.primeSharePct;
      aggregate.statewideSharePct += weight * row.metrics.statewideSharePct;
      aggregate.uniqueSharePct += weight * row.metrics.uniqueSharePct;
      aggregate.localSharePct += weight * row.metrics.localSharePct;
      aggregate.significantSharePct += weight * row.metrics.significantSharePct;
      aggregate.otherSharePct += weight * row.metrics.otherSharePct;
      if (row.metrics.aws100 != null) {
        aggregate.aws100Numerator += row.overlapAcres * row.metrics.aws100;
        aggregate.aws100Weight += row.overlapAcres;
      }
      if (row.metrics.aws150 != null) {
        aggregate.aws150Numerator += row.overlapAcres * row.metrics.aws150;
        aggregate.aws150Weight += row.overlapAcres;
      }
    }

    results.push({
      countyFips,
      countyName: primary.countyName,
      countyAreaSymbol,
      surveyAreaCount: weightedRows.length,
      primarySurveyArea: primary.surveyAreaSymbol,
      primaryOverlapPct: (primary.overlapAcres / totalOverlap) * 100,
      primeSharePct: aggregate.primeSharePct,
      statewideSharePct: aggregate.statewideSharePct,
      uniqueSharePct: aggregate.uniqueSharePct,
      localSharePct: aggregate.localSharePct,
      significantSharePct: aggregate.significantSharePct,
      otherSharePct: aggregate.otherSharePct,
      aws100: aggregate.aws100Weight > 0 ? aggregate.aws100Numerator / aggregate.aws100Weight : null,
      aws150: aggregate.aws150Weight > 0 ? aggregate.aws150Numerator / aggregate.aws150Weight : null,
    });
  }

  return results.sort((a, b) => a.countyFips.localeCompare(b.countyFips));
}

function buildSql({ countyRows, startYear, endYear }) {
  const years = [];
  for (let year = startYear; year <= endYear; year += 1) years.push(String(year));

  const lines = [
    `INSERT OR IGNORE INTO data_sources (name, url, cadence, notes)
     VALUES (${sqlString(SOURCE_NAME)}, ${sqlString(SOURCE_URL)}, ${sqlString(SOURCE_CADENCE)}, ${sqlString('County soil and land-quality evidence derived from USDA NRCS SSURGO survey-area overlaps and weighted map-unit attributes via Soil Data Access.')});`,
  ];

  for (const series of SERIES_DEFS) {
    lines.push(
      `INSERT OR IGNORE INTO data_series (series_key, geo_level, frequency, unit, source_id)
       VALUES (${sqlString(series.key)}, 'county', 'periodic', ${sqlString(series.unit)}, (SELECT id FROM data_sources WHERE name = ${sqlString(SOURCE_NAME)} LIMIT 1));`,
    );
  }

  let rowCount = 0;
  for (const year of years) {
    for (const county of countyRows) {
      const quality = JSON.stringify({
        source: SOURCE_NAME,
        source_url: SDA_URL,
        method: 'county_overlap_weighted',
        survey_area_count: county.surveyAreaCount,
        primary_survey_area: county.primarySurveyArea,
        primary_overlap_pct: round(county.primaryOverlapPct, 2),
        atlas_as_of_year: year,
      });
      const values = [
        ['soil_prime_farmland_share_pct', county.primeSharePct],
        ['soil_statewide_farmland_share_pct', county.statewideSharePct],
        ['soil_unique_farmland_share_pct', county.uniqueSharePct],
        ['soil_local_farmland_share_pct', county.localSharePct],
        ['soil_significant_farmland_share_pct', county.significantSharePct],
        ['soil_other_land_share_pct', county.otherSharePct],
        ['soil_rootzone_aws_100cm', county.aws100],
        ['soil_rootzone_aws_150cm', county.aws150],
        ['soil_survey_area_count', county.surveyAreaCount],
      ];
      for (const [seriesKey, rawValue] of values) {
        if (rawValue == null) continue;
        const value = round(rawValue, seriesKey.includes('count') ? 0 : 4);
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString(seriesKey)} AND geo_level = 'county' LIMIT 1), ${sqlString(county.countyFips)}, ${sqlString(year)}, ${value}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }
    }
  }

  return { sql: lines.join('\n'), rowCount, years };
}

async function main() {
  const args = parseArgs(process.argv);
  const startYear = Number(args.start_year || '2015');
  const endYear = Number(args.end_year || new Date().getUTCFullYear());
  const sqlFile = args.sql_file;
  const summaryJson = args.summary_json;
  const states = normalizeStates(args.states);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || startYear > endYear) {
    throw new Error('Invalid start/end year range.');
  }
  if (!sqlFile) throw new Error('--sql_file is required');

  const overlapRows = await fetchCountyOverlapRows(states);
  const surveyAreaSymbols = Array.from(new Set(overlapRows.map((row) => row.surveyAreaSymbol))).sort();
  const metricsBySurvey = await fetchSurveyMetrics(surveyAreaSymbols);
  const countyRows = buildCountyRows(overlapRows, metricsBySurvey);
  const sqlResult = buildSql({ countyRows, startYear, endYear });

  await fs.writeFile(sqlFile, sqlResult.sql, 'utf8');
  if (summaryJson) {
    await fs.writeFile(summaryJson, JSON.stringify({
      source: SOURCE_NAME,
      source_url: SOURCE_URL,
      start_year: startYear,
      end_year: endYear,
      states,
      county_rows: countyRows.length,
      survey_area_rows: surveyAreaSymbols.length,
      overlap_rows: overlapRows.length,
      inserted_rows: sqlResult.rowCount,
    }, null, 2));
  }

  console.log(JSON.stringify({
    states,
    countyRows: countyRows.length,
    surveyAreas: surveyAreaSymbols.length,
    insertedRows: sqlResult.rowCount,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
