#!/usr/bin/env node
import fs from 'node:fs/promises';

const SOURCE_NAME = 'FEMA';
const SOURCE_URL = 'https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/National_Risk_Index_Counties/FeatureServer/0/query';
const SOURCE_CADENCE = 'periodic';
const SERVICE_URL = 'https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/National_Risk_Index_Counties/FeatureServer/0';
const PAGE_SIZE = 1000;

const SERIES_DEFS = [
  { key: 'flood_risk_score', geoLevels: ['county', 'state', 'national'], unit: 'score_0_100_higher_better' },
  { key: 'flood_hazard_score', geoLevels: ['county', 'state', 'national'], unit: 'score_0_100_higher_worse' },
  { key: 'flood_ag_loss_rate_pct', geoLevels: ['county', 'state', 'national'], unit: 'pct_of_ag_value' },
  { key: 'flood_hazard_rating_code', geoLevels: ['county'], unit: 'score_1_5' },
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
    case 'not applicable':
      return null;
    default:
      return null;
  }
}

async function fetchPage(offset) {
  const url = new URL(SOURCE_URL);
  url.searchParams.set('where', '1=1');
  url.searchParams.set(
    'outFields',
    'STATEABBRV,STCOFIPS,IFLD_RISKS,IFLD_RISKR,IFLD_ALRA,IFLD_EALA,IFLD_EXPA,IFLD_EXPT,CFLD_RISKS,CFLD_RISKR,CFLD_EXPT,NRI_VER',
  );
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('resultOffset', String(offset));
  url.searchParams.set('resultRecordCount', String(PAGE_SIZE));
  url.searchParams.set('f', 'json');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Altira-Atlas-Flood-Ingest/1.0',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FEMA flood request failed: ${res.status} ${res.statusText} :: ${text.slice(0, 400)}`);
  }

  const payload = await res.json();
  if (!Array.isArray(payload?.features)) {
    throw new Error('Unexpected FEMA flood payload: missing features array');
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
    weightedHazard: 0,
    agLossTotal: 0,
    agExposureTotal: 0,
    unweightedHazard: [],
    unweightedLossRate: [],
  };

  for (const row of rows) {
    const state = row.state;
    const weight = row.totalExposureValue != null && row.totalExposureValue > 0 ? row.totalExposureValue : 0;
    let bucket = byState.get(state);
    if (!bucket) {
      bucket = {
        weight: 0,
        weightedHazard: 0,
        agLossTotal: 0,
        agExposureTotal: 0,
        unweightedHazard: [],
        unweightedLossRate: [],
      };
      byState.set(state, bucket);
    }

    if (row.hazardScore != null) {
      bucket.unweightedHazard.push(row.hazardScore);
      national.unweightedHazard.push(row.hazardScore);
      if (weight > 0) {
        bucket.weight += weight;
        bucket.weightedHazard += row.hazardScore * weight;
        national.weight += weight;
        national.weightedHazard += row.hazardScore * weight;
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

function resolveAggregateHazard(bucket) {
  if (bucket.weight > 0) return bucket.weightedHazard / bucket.weight;
  return average(bucket.unweightedHazard);
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
     VALUES (${sqlString(SOURCE_NAME)}, ${sqlString(SOURCE_URL)}, ${sqlString(SOURCE_CADENCE)}, ${sqlString('County flood hazard evidence from FEMA National Risk Index public services.')});`,
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
      const quality = JSON.stringify({
        source: SOURCE_NAME,
        source_url: SERVICE_URL,
        nri_version: row.nriVersion,
        hazard_basis: row.hazardBasis,
        inland_hazard_score: row.inlandHazardScore,
        coastal_hazard_score: row.coastalHazardScore,
        atlas_as_of_year: year,
      });

      if (row.hazardScore != null) {
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_hazard_score')} AND geo_level = 'county' LIMIT 1), ${sqlString(row.fips)}, ${sqlString(year)}, ${round(row.hazardScore)}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;

        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_risk_score')} AND geo_level = 'county' LIMIT 1), ${sqlString(row.fips)}, ${sqlString(year)}, ${round(100 - row.hazardScore)}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }

      if (row.agLossRatePct != null) {
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_ag_loss_rate_pct')} AND geo_level = 'county' LIMIT 1), ${sqlString(row.fips)}, ${sqlString(year)}, ${round(row.agLossRatePct)}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }

      if (row.ratingCode != null) {
        const ratingQuality = JSON.stringify({
          source: SOURCE_NAME,
          source_url: SERVICE_URL,
          nri_version: row.nriVersion,
          hazard_basis: row.hazardBasis,
          official_rating: row.ratingLabel,
          atlas_as_of_year: year,
        });
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_hazard_rating_code')} AND geo_level = 'county' LIMIT 1), ${sqlString(row.fips)}, ${sqlString(year)}, ${row.ratingCode}, ${sqlString(ratingQuality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }
    }

    for (const [state, bucket] of byState.entries()) {
      const hazardScore = resolveAggregateHazard(bucket);
      const agLossRatePct = resolveAggregateLossRate(bucket);
      const quality = JSON.stringify({
        source: SOURCE_NAME,
        source_url: SERVICE_URL,
        transform: 'State aggregate derived from county FEMA NRI flood rows; hazard score weighted by county total flood exposure where available.',
        atlas_as_of_year: year,
      });

      if (hazardScore != null) {
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_hazard_score')} AND geo_level = 'state' LIMIT 1), ${sqlString(state)}, ${sqlString(year)}, ${round(hazardScore)}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_risk_score')} AND geo_level = 'state' LIMIT 1), ${sqlString(state)}, ${sqlString(year)}, ${round(100 - hazardScore)}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }

      if (agLossRatePct != null) {
        lines.push(
          `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
           VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_ag_loss_rate_pct')} AND geo_level = 'state' LIMIT 1), ${sqlString(state)}, ${sqlString(year)}, ${round(agLossRatePct)}, ${sqlString(quality)})
           ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
        );
        rowCount += 1;
      }
    }

    const nationalHazard = resolveAggregateHazard(national);
    const nationalLossRate = resolveAggregateLossRate(national);
    const nationalQuality = JSON.stringify({
      source: SOURCE_NAME,
      source_url: SERVICE_URL,
      transform: 'National aggregate derived from county FEMA NRI flood rows; hazard score weighted by county total flood exposure where available.',
      atlas_as_of_year: year,
    });

    if (nationalHazard != null) {
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_hazard_score')} AND geo_level = 'national' LIMIT 1), 'US', ${sqlString(year)}, ${round(nationalHazard)}, ${sqlString(nationalQuality)})
         ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
      );
      rowCount += 1;
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_risk_score')} AND geo_level = 'national' LIMIT 1), 'US', ${sqlString(year)}, ${round(100 - nationalHazard)}, ${sqlString(nationalQuality)})
         ON CONFLICT(series_id, geo_key, as_of_date) DO UPDATE SET value = excluded.value, quality_json = excluded.quality_json;`,
      );
      rowCount += 1;
    }

    if (nationalLossRate != null) {
      lines.push(
        `INSERT INTO data_points (series_id, geo_key, as_of_date, value, quality_json)
         VALUES ((SELECT id FROM data_series WHERE series_key = ${sqlString('flood_ag_loss_rate_pct')} AND geo_level = 'national' LIMIT 1), 'US', ${sqlString(year)}, ${round(nationalLossRate)}, ${sqlString(nationalQuality)})
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
      const inlandHazardScore = toFiniteNumber(attributes.IFLD_RISKS);
      const coastalHazardScore = toFiniteNumber(attributes.CFLD_RISKS);
      const inlandRatingLabel = String(attributes.IFLD_RISKR ?? '').trim() || null;
      const coastalRatingLabel = String(attributes.CFLD_RISKR ?? '').trim() || null;
      const inlandExposure = toFiniteNumber(attributes.IFLD_EXPT);
      const coastalExposure = toFiniteNumber(attributes.CFLD_EXPT);
      const agLossRate = toFiniteNumber(attributes.IFLD_ALRA);
      const agExpectedAnnualLoss = toFiniteNumber(attributes.IFLD_EALA);
      const agExposureValue = toFiniteNumber(attributes.IFLD_EXPA);
      const nriVersion = String(attributes.NRI_VER ?? '').trim() || null;
      if (!state || !/^\d{5}$/.test(fips)) return null;
      if (allowedStates.size && !allowedStates.has(state)) return null;

      const useCoastal = coastalHazardScore != null && (inlandHazardScore == null || coastalHazardScore > inlandHazardScore);
      const hazardScore = useCoastal ? coastalHazardScore : inlandHazardScore ?? coastalHazardScore;
      const ratingLabel = useCoastal ? coastalRatingLabel : inlandRatingLabel || coastalRatingLabel;
      const ratingCode = ratingToCode(ratingLabel);
      const totalExposureValue = useCoastal ? coastalExposure : inlandExposure ?? coastalExposure ?? null;
      const hazardBasis = inlandHazardScore != null && coastalHazardScore != null
        ? 'combined_max'
        : useCoastal
          ? 'coastal_only'
          : 'inland_only';

      if (hazardScore == null) return null;

      return {
        state,
        fips,
        hazardScore,
        hazardBasis,
        ratingLabel,
        ratingCode,
        agLossRatePct: agLossRate == null ? null : agLossRate * 100,
        agExpectedAnnualLoss,
        agExposureValue,
        totalExposureValue,
        inlandHazardScore,
        coastalHazardScore,
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
    source: 'FEMA National Risk Index flood',
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
