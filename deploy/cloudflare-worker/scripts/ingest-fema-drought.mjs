#!/usr/bin/env node
import fs from 'node:fs/promises';

const SOURCE_NAME = 'FEMA';
const SOURCE_URL = 'https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/National_Risk_Index_County_Drought_Hazard_Type_Risk_Index_Rating/FeatureServer/0/query';
const SOURCE_CADENCE = 'periodic';
const SERVICE_URL = 'https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/National_Risk_Index_County_Drought_Hazard_Type_Risk_Index_Rating/FeatureServer/0';
const PAGE_SIZE = 1000;

const SERIES_DEFS = [
  { key: 'drought_risk_score', geoLevels: ['county', 'state', 'national'], unit: 'score_0_100_higher_worse' },
  { key: 'drought_ag_loss_rate_pct', geoLevels: ['county', 'state', 'national'], unit: 'pct_of_ag_value' },
  { key: 'drought_risk_rating_code', geoLevels: ['county'], unit: 'score_1_5' },
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

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function sqlString(value) {
  return `'${escapeSqlString(value)}'`;
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toFiniteNumber(value) {
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function normalizeYear(value) {
  const raw = String(value ?? '').trim();
  return /^\d{4}$/.test(raw) ? raw : null;
}

function ratingToCode(label) {
  switch (String(label ?? '').trim().toLowerCase()) {
    case 'very low':
      return 1;
    case 'relatively low':
      return 2;
    case 'relatively moderate':
      return 3;
    case 'relatively high':
      return 4;
    case 'very high':
      return 5;
    default:
      return null;
  }
}

async function fetchPage(offset) {
  const url = new URL(SOURCE_URL);
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', 'STATEABBRV,STCOFIPS,DRGT_RISKS,DRGT_RISKR,DRGT_ALRA,DRGT_EALA,DRGT_EXPA,NRI_VER');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('resultOffset', String(offset));
  url.searchParams.set('resultRecordCount', String(PAGE_SIZE));
  url.searchParams.set('f', 'json');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Altira-Atlas-Drought-Ingest/1.0',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FEMA drought request failed: ${res.status} ${res.statusText} :: ${text.slice(0, 400)}`);
  }

  const payload = await res.json();
  if (!Array.isArray(payload?.features)) {
    throw new Error('Unexpected FEMA drought payload: missing features array');
  }
  return payload.features.map((feature) => feature.attributes ?? {});
}

async function fetchAllRows() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage(offset);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function buildAggregates(rows) {
  const byState = new Map();
  const national = {
    weight: 0,
    weightedRisk: 0,
    agLossTotal: 0,
    agExposureTotal: 0,
    unweightedRisk: [],
    unweightedLossRate: [],
  };

  for (const row of rows) {
    const state = row.state;
    const weight = row.agExposureValue != null && row.agExposureValue > 0 ? row.agExposureValue : 0;
    let bucket = byState.get(state);
    if (!bucket) {
      bucket = {
        weight: 0,
        weightedRisk: 0,
        agLossTotal: 0,
        agExposureTotal: 0,
        unweightedRisk: [],
        unweightedLossRate: [],
      };
      byState.set(state, bucket);
    }

    if (row.riskScore != null) {
      bucket.unweightedRisk.push(row.riskScore);
      national.unweightedRisk.push(row.riskScore);
      if (weight > 0) {
        bucket.weight += weight;
        bucket.weightedRisk += row.riskScore * weight;
        national.weight += weight;
        national.weightedRisk += row.riskScore * weight;
      }
    }

    if (row.agLossRatePct != null) {
      bucket.unweightedLossRate.push(row.agLossRatePct);
      national.unweightedLossRate.push(row.agLossRatePct);
    }
    if (row.agExpectedAnnualLoss != null) {
      bucket.agLossTotal += row.agExpectedAnnualLoss;
      national.agLossTotal += row.agExpectedAnnualLoss;
    }
    if (row.agExposureValue != null) {
      bucket.agExposureTotal += row.agExposureValue;
      national.agExposureTotal += row.agExposureValue;
    }
  }

  return { byState, national };
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveAggregateRisk(bucket) {
  if (bucket.weight > 0) return bucket.weightedRisk / bucket.weight;
  return average(bucket.unweightedRisk);
}

function resolveAggregateLossRate(bucket) {
  if (bucket.agExposureTotal > 0) return (bucket.agLossTotal / bucket.agExposureTotal) * 100;
  return average(bucket.unweightedLossRate);
}

function buildSql({ rows, startYear, endYear }) {
  const lines = [];
  const years = [];
  for (let year = startYear; year <= endYear; year += 1) years.push(String(year));

  lines.push(
    `INSERT OR IGNORE INTO data_sources (name, url, cadence, notes)
     VALUES (${sqlString(SOURCE_NAME)}, ${sqlString(SOURCE_URL)}, ${sqlString(SOURCE_CADENCE)}, ${sqlString('County drought hazard evidence from FEMA National Risk Index public services.')});`,
  );

  for (const series of SERIES_DEFS) {
    for (const geoLevel of series.geoLevels) {
      lines.push(
        `INSERT OR IGNORE INTO data_series (series_key, geo_level, frequency, unit, source_id)
         VALUES (${sqlString(series.key)}, ${sqlString(geoLevel)}, ${sqlString('periodic')}, ${sqlString(series.unit)}, (SELECT id FROM data_sources WHERE name = ${sqlString(SOURCE_NAME)} LIMIT 1));`,
      );
    }
  }

  const { byState, national } = buildAggregates(rows);
  let rowCount = 0;

  for (const year of years) {
    for (const row of rows) {
      const baseQuality = JSON.stringify({
        source: SOURCE_NAME,
        source_url: SERVICE_URL,
        nri_version: row.nriVersion,
        carried_forward_from: '2023',
        atlas_as_of_year: year,
      });

      if (row.riskScore != null) {
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('drought_risk_score')} AND geo_level = 'county' LIMIT 1), ${sqlString(row.fips)}, ${sqlString(year)}, ${round(row.riskScore)}, ${sqlString(baseQuality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }

      if (row.agLossRatePct != null) {
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('drought_ag_loss_rate_pct')} AND geo_level = 'county' LIMIT 1), ${sqlString(row.fips)}, ${sqlString(year)}, ${round(row.agLossRatePct)}, ${sqlString(baseQuality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }

      if (row.ratingCode != null) {
        const ratingQuality = JSON.stringify({
          source: SOURCE_NAME,
          source_url: SERVICE_URL,
          nri_version: row.nriVersion,
          official_rating: row.ratingLabel,
          carried_forward_from: '2023',
          atlas_as_of_year: year,
        });
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('drought_risk_rating_code')} AND geo_level = 'county' LIMIT 1), ${sqlString(row.fips)}, ${sqlString(year)}, ${row.ratingCode}, ${sqlString(ratingQuality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }
    }

    for (const [state, bucket] of byState.entries()) {
      const riskScore = resolveAggregateRisk(bucket);
      const agLossRatePct = resolveAggregateLossRate(bucket);
      const quality = JSON.stringify({
        source: SOURCE_NAME,
        source_url: SERVICE_URL,
        transform: 'State aggregate derived from county FEMA NRI drought rows; risk score weighted by agriculture exposure where available.',
        carried_forward_from: '2023',
        atlas_as_of_year: year,
      });

      if (riskScore != null) {
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('drought_risk_score')} AND geo_level = 'state' LIMIT 1), ${sqlString(state)}, ${sqlString(year)}, ${round(riskScore)}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }

      if (agLossRatePct != null) {
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('drought_ag_loss_rate_pct')} AND geo_level = 'state' LIMIT 1), ${sqlString(state)}, ${sqlString(year)}, ${round(agLossRatePct)}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }
    }

    const nationalRisk = resolveAggregateRisk(national);
    const nationalLossRate = resolveAggregateLossRate(national);
    const nationalQuality = JSON.stringify({
      source: SOURCE_NAME,
      source_url: SERVICE_URL,
      transform: 'National aggregate derived from county FEMA NRI drought rows; risk score weighted by agriculture exposure where available.',
      carried_forward_from: '2023',
      atlas_as_of_year: year,
    });

    if (nationalRisk != null) {
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('drought_risk_score')} AND geo_level = 'national' LIMIT 1), 'US', ${sqlString(year)}, ${round(nationalRisk)}, ${sqlString(nationalQuality)})
         ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
      );
      rowCount += 1;
    }

    if (nationalLossRate != null) {
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('drought_ag_loss_rate_pct')} AND geo_level = 'national' LIMIT 1), 'US', ${sqlString(year)}, ${round(nationalLossRate)}, ${sqlString(nationalQuality)})
         ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
      );
      rowCount += 1;
    }
  }

  return { sql: lines.join('\n'), rowCount, years };
}

async function main() {
  const args = parseArgs(process.argv);
  const startYear = Number(args.start_year || '2023');
  const endYear = Number(args.end_year || new Date().getUTCFullYear());
  const sqlFile = args.sql_file;
  const summaryJson = args.summary_json;
  const allowedStates = new Set(
    String(args.states || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean),
  );

  const rawRows = await fetchAllRows();
  const rows = rawRows
    .map((attributes) => {
      const state = String(attributes.STATEABBRV ?? '').trim().toUpperCase();
      const fips = String(attributes.STCOFIPS ?? '').trim();
      const riskScore = toFiniteNumber(attributes.DRGT_RISKS);
      const ratingLabel = String(attributes.DRGT_RISKR ?? '').trim() || null;
      const ratingCode = ratingToCode(ratingLabel);
      const agLossRate = toFiniteNumber(attributes.DRGT_ALRA);
      const agExpectedAnnualLoss = toFiniteNumber(attributes.DRGT_EALA);
      const agExposureValue = toFiniteNumber(attributes.DRGT_EXPA);
      const nriVersion = String(attributes.NRI_VER ?? '').trim() || null;
      if (!state || !/^\d{5}$/.test(fips)) return null;
      if (allowedStates.size && !allowedStates.has(state)) return null;
      return {
        state,
        fips,
        riskScore,
        ratingLabel,
        ratingCode,
        agLossRatePct: agLossRate == null ? null : agLossRate * 100,
        agExpectedAnnualLoss,
        agExposureValue,
        nriVersion,
      };
    })
    .filter(Boolean);

  const { sql, rowCount, years } = buildSql({ rows, startYear, endYear });

  if (sqlFile) {
    await fs.writeFile(sqlFile, sql, 'utf8');
  } else {
    process.stdout.write(sql);
  }

  const summary = {
    source: 'FEMA National Risk Index drought',
    source_url: SERVICE_URL,
    start_year: startYear,
    end_year: endYear,
    years,
    county_count: rows.length,
    data_point_rows: rowCount,
    states: Array.from(new Set(rows.map((row) => row.state))).sort(),
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
