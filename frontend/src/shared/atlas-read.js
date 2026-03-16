import { $, $pct } from '../formatting.js';

function pct(value, digits = 0) {
  if (value == null) return 'N/A';
  return `${Number(value).toFixed(digits)}%`;
}

function num(value, digits = 1) {
  if (value == null) return 'N/A';
  return Number(value).toFixed(digits);
}

function classifyValuation(valueSpreadPct) {
  if (valueSpreadPct == null) {
    return {
      score: 0,
      label: 'INSUFFICIENT',
      className: 'badge-a',
      detail: 'Spread to benchmark is not available.',
    };
  }
  if (valueSpreadPct >= 12) {
    return {
      score: 2,
      label: 'ATTRACTIVE',
      className: 'badge-g',
      detail: `Fair value is ${pct(valueSpreadPct, 1)} above benchmark.`,
    };
  }
  if (valueSpreadPct >= 5) {
    return {
      score: 1,
      label: 'UPSIDE',
      className: 'badge-g',
      detail: `Fair value is ${pct(valueSpreadPct, 1)} above benchmark.`,
    };
  }
  if (valueSpreadPct <= -10) {
    return {
      score: -1,
      label: 'STRETCHED',
      className: 'badge-r',
      detail: `Benchmark value is ${pct(Math.abs(valueSpreadPct), 1)} above fair value.`,
    };
  }
  return {
    score: 0,
    label: 'BALANCED',
    className: 'badge-a',
    detail: 'Fair value and benchmark are broadly aligned.',
  };
}

function classifySiteQuality({ soil, irrigation, productivityActive, yieldProductivityFactor }) {
  const soilShare = soil?.significant_share_pct ?? null;
  const aws100 = soil?.rootzone_aws_100cm ?? null;
  const irrigatedAcres = irrigation?.irrigated_acres ?? null;

  if (
    (soilShare != null && soilShare >= 70) ||
    (aws100 != null && aws100 >= 18) ||
    (productivityActive && yieldProductivityFactor != null && yieldProductivityFactor >= 1.03) ||
    (irrigatedAcres != null && irrigatedAcres >= 10000)
  ) {
    return {
      score: 2,
      label: 'STRONG',
      className: 'badge-g',
      detail: soilShare != null
        ? `NRCS farmland share is ${pct(soilShare, 0)}.`
        : irrigatedAcres != null
          ? `${Math.round(irrigatedAcres).toLocaleString('en-US')} irrigated acres are reported.`
          : 'County soil/productivity context is strong.',
    };
  }

  if (
    (soilShare != null && soilShare >= 50) ||
    (aws100 != null && aws100 >= 14) ||
    productivityActive ||
    (irrigatedAcres != null && irrigatedAcres >= 1000)
  ) {
    return {
      score: 1,
      label: 'MIXED',
      className: 'badge-a',
      detail: soilShare != null
        ? `NRCS farmland share is ${pct(soilShare, 0)} with usable soil/water context.`
        : 'County has partial land-quality support.',
    };
  }

  return {
    score: -1,
    label: 'LIMITED',
    className: 'badge-r',
    detail: soilShare != null
      ? `NRCS farmland share is only ${pct(soilShare, 0)}.`
      : 'Atlas has limited soil / irrigation support for this county.',
  };
}

function classifyResilience({ drought, flood }) {
  const droughtScore = drought?.risk_score ?? null;
  const floodScore = flood?.hazard_score ?? null;

  if (droughtScore != null && floodScore != null && droughtScore < 45 && floodScore < 45) {
    return {
      score: 2,
      label: 'HAZARD LIGHT',
      className: 'badge-g',
      detail: `Drought ${num(droughtScore, 0)} / Flood ${num(floodScore, 0)} are both low.`,
    };
  }
  if ((droughtScore != null && droughtScore >= 80) || (floodScore != null && floodScore >= 80)) {
    return {
      score: -1,
      label: 'ELEVATED',
      className: 'badge-r',
      detail: `${droughtScore != null && droughtScore >= 80 ? `Drought ${num(droughtScore, 0)}` : `Flood ${num(floodScore, 0)}`} is elevated.`,
    };
  }
  if (droughtScore != null || floodScore != null) {
    return {
      score: 1,
      label: 'MIXED',
      className: 'badge-a',
      detail: `Drought ${droughtScore != null ? num(droughtScore, 0) : 'N/A'} / Flood ${floodScore != null ? num(floodScore, 0) : 'N/A'}.`,
    };
  }
  return {
    score: 0,
    label: 'UNKNOWN',
    className: 'badge-a',
    detail: 'Flood and drought evidence are incomplete.',
  };
}

function classifyFinance({ credit, metrics }) {
  const combinedStressDscr = credit?.combined_stress_dscr ?? null;
  const baseDscr = credit?.base_dscr ?? metrics?.dscr ?? null;

  if ((combinedStressDscr != null && combinedStressDscr >= 1.1) || (combinedStressDscr == null && baseDscr != null && baseDscr >= 1.35)) {
    return {
      score: 2,
      label: 'RESILIENT',
      className: 'badge-g',
      detail: combinedStressDscr != null
        ? `Combined-stress DSCR is ${num(combinedStressDscr, 2)}x.`
        : `Base DSCR is ${num(baseDscr, 2)}x.`,
    };
  }
  if ((combinedStressDscr != null && combinedStressDscr < 0.9) || (combinedStressDscr == null && baseDscr != null && baseDscr < 1)) {
    return {
      score: -1,
      label: 'FRAGILE',
      className: 'badge-r',
      detail: combinedStressDscr != null
        ? `Combined-stress DSCR falls to ${num(combinedStressDscr, 2)}x.`
        : `Base DSCR is only ${num(baseDscr, 2)}x.`,
    };
  }
  if (combinedStressDscr != null || baseDscr != null) {
    return {
      score: 1,
      label: 'TIGHT',
      className: 'badge-a',
      detail: combinedStressDscr != null
        ? `Combined-stress DSCR is ${num(combinedStressDscr, 2)}x.`
        : `Base DSCR is ${num(baseDscr, 2)}x.`,
    };
  }
  return {
    score: 0,
    label: 'UNKNOWN',
    className: 'badge-a',
    detail: 'Credit stress outputs are incomplete.',
  };
}

export function evaluateAtlasCountyRead({
  metrics = {},
  sourceQuality,
  productivityActive,
  yieldProductivityFactor,
  soil,
  irrigation,
  drought,
  flood,
  credit,
  benchmarkMethodDetail,
}) {
  const fairValue = metrics?.fair_value ?? null;
  const benchmarkValue = metrics?.benchmark_value ?? null;
  const valueSpreadPct = fairValue != null && benchmarkValue != null && benchmarkValue > 0
    ? ((fairValue - benchmarkValue) / benchmarkValue) * 100
    : null;

  const pillars = {
    valuation: classifyValuation(valueSpreadPct),
    site: classifySiteQuality({ soil, irrigation, productivityActive, yieldProductivityFactor }),
    resilience: classifyResilience({ drought, flood }),
    finance: classifyFinance({ credit, metrics }),
  };

  const hasCoreValuation = metrics?.implied_cap_rate != null && metrics?.noi_per_acre != null;
  const proxyDriven = ['proxy', 'mixed', 'state', 'national'].includes(String(sourceQuality || ''));
  const missingAccess = metrics?.access_score == null;

  let overall;
  if (!hasCoreValuation) {
    overall = {
      label: 'TRIAGE ONLY',
      className: 'badge-b',
      summary: 'Core valuation outputs are incomplete, so this county is useful for triage but not yet for a full decision read.',
    };
  } else if (
    pillars.valuation.score >= 2 &&
    pillars.site.score >= 1 &&
    pillars.resilience.score >= 0 &&
    pillars.finance.score >= 0 &&
    !proxyDriven
  ) {
    overall = {
      label: 'PRIORITY RESEARCH',
      className: 'badge-g',
      summary: 'Valuation is attractive and the current site, hazard, and finance signals are strong enough to justify deeper work now.',
    };
  } else if (
    pillars.valuation.score >= 1 &&
    pillars.site.score >= 0 &&
    pillars.finance.score >= 0 &&
    pillars.resilience.score >= 0
  ) {
    overall = {
      label: 'RESEARCHABLE',
      className: 'badge-g',
      summary: 'The county has enough upside and supporting context to belong in research, but it still needs a tighter thesis and downside check.',
    };
  } else if (pillars.valuation.score <= -1 && (pillars.finance.score <= -1 || pillars.resilience.score <= -1)) {
    overall = {
      label: 'PASS FOR NOW',
      className: 'badge-r',
      summary: 'Current valuation is weak and the downside context is not compensating for it.',
    };
  } else if (proxyDriven || missingAccess) {
    overall = {
      label: 'WATCH / CONDITIONAL',
      className: 'badge-a',
      summary: 'There is signal here, but it is still conditional on tighter county evidence, access context, or cleaner benchmark support.',
    };
  } else {
    overall = {
      label: 'WATCHLIST CANDIDATE',
      className: 'badge-a',
      summary: 'The county is worth monitoring or comparing, but the current read does not yet make it a top-priority underwrite.',
    };
  }

  const supportPoints = [
    pillars.valuation.score >= 1 && valueSpreadPct != null
      ? `Fair value is ${pct(valueSpreadPct, 1)} above benchmark.`
      : null,
    typeof metrics?.cap_spread_to_10y === 'number'
      ? `Cap spread to the 10Y is ${$(metrics.cap_spread_to_10y, 0)} bps.`
      : null,
    pillars.site.score >= 1 ? pillars.site.detail : null,
    productivityActive && yieldProductivityFactor != null
      ? `County productivity factor is ${Number(yieldProductivityFactor).toFixed(2)}x.`
      : null,
    pillars.finance.score >= 1 ? pillars.finance.detail : null,
    metrics?.access_score != null
      ? `Access score is ${Number(metrics.access_score).toFixed(1)} / 100.`
      : null,
  ].filter(Boolean);

  const cautionPoints = [
    proxyDriven
      ? `Benchmark is ${String(sourceQuality).toUpperCase()}-driven: ${benchmarkMethodDetail || 'county land value is not directly observed.'}`
      : null,
    missingAccess ? 'Access score is still missing, so market-readiness is only partially underwritten.' : null,
    pillars.site.score < 0 ? pillars.site.detail : null,
    pillars.resilience.score < 0 ? pillars.resilience.detail : null,
    pillars.finance.score < 0 ? pillars.finance.detail : null,
    !productivityActive ? 'County yield basis is inactive in the current fair value model.' : null,
  ].filter(Boolean);

  const gatingChecks = [
    proxyDriven ? 'Confirm the benchmark with cleaner county or parcel evidence before treating the valuation read as decision-grade.' : null,
    missingAccess ? 'Load access context before presenting this county as fully underwritten.' : null,
    pillars.finance.score <= 0 ? 'Pressure-test leverage and downside DSCR in Scenario Lab before advancing it.' : null,
    pillars.resilience.score < 1 ? 'Check whether hazard exposure is acceptable for the target hold period and strategy.' : null,
  ].filter(Boolean);

  return {
    overall,
    pillars,
    valueSpreadPct,
    supportPoints: supportPoints.slice(0, 4),
    cautionPoints: cautionPoints.slice(0, 4),
    gatingChecks: gatingChecks.slice(0, 4),
  };
}

export function buildScreenReasons(row, activeFilters = {}) {
  const read = evaluateAtlasCountyRead({
    metrics: row.metrics,
    sourceQuality: row.source_quality,
    productivityActive: row.productivity_active,
    yieldProductivityFactor: row.metrics?.yield_productivity_factor,
    soil: row.soil,
    irrigation: row.irrigation,
    drought: row.drought,
    flood: row.flood,
    credit: row.credit,
    benchmarkMethodDetail: row.benchmark_method_detail,
  });

  const reasons = [];
  const capRate = row.metrics?.implied_cap_rate;
  const access = row.metrics?.access_score;
  const soilShare = row.soil?.significant_share_pct;
  const droughtRisk = row.drought?.risk_score;
  const floodRisk = row.flood?.hazard_score;

  if (activeFilters.minCap && capRate != null && capRate >= Number(activeFilters.minCap)) {
    reasons.push(`Cap ${pct(capRate, 2)} clears the ${pct(Number(activeFilters.minCap), 1)} floor.`);
  }
  if (activeFilters.minAccess && access != null && access >= Number(activeFilters.minAccess)) {
    reasons.push(`Access ${num(access, 1)} clears the ${num(Number(activeFilters.minAccess), 1)} threshold.`);
  }
  if (activeFilters.maxDroughtRisk && droughtRisk != null && droughtRisk <= Number(activeFilters.maxDroughtRisk)) {
    reasons.push(`Drought ${num(droughtRisk, 0)} is inside the risk ceiling.`);
  }
  if (activeFilters.maxFloodRisk && floodRisk != null && floodRisk <= Number(activeFilters.maxFloodRisk)) {
    reasons.push(`Flood ${num(floodRisk, 0)} is inside the risk ceiling.`);
  }
  if (activeFilters.minSoilFarmlandPct && soilShare != null && soilShare >= Number(activeFilters.minSoilFarmlandPct)) {
    reasons.push(`NRCS farmland ${pct(soilShare, 0)} clears the quality floor.`);
  }
  if (activeFilters.minPowerIndex && row.industrial?.power_cost_index != null && row.industrial.power_cost_index >= Number(activeFilters.minPowerIndex)) {
    reasons.push(`Power index ${num(row.industrial.power_cost_index, 1)} meets the power screen.`);
  }
  if (activeFilters.maxPowerPrice && row.industrial?.industrial_power_price != null && row.industrial.industrial_power_price <= Number(activeFilters.maxPowerPrice)) {
    reasons.push(`Power price ${$(row.industrial.industrial_power_price, 2)} is inside the target band.`);
  }

  for (const support of read.supportPoints) {
    if (!reasons.includes(support)) reasons.push(support);
    if (reasons.length >= 3) break;
  }

  if (!reasons.length) {
    reasons.push(read.overall.summary);
  }

  return {
    overall: read.overall,
    reasons: reasons.slice(0, 3),
  };
}
