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

function classifyThesisInfrastructure({ metrics, industrial }) {
  const accessScore = metrics?.access_score ?? null;
  const powerIndex = industrial?.power_cost_index ?? null;
  const powerPrice = industrial?.industrial_power_price ?? null;

  if (
    (accessScore != null && accessScore >= 60)
    || (powerIndex != null && powerIndex >= 70)
    || (accessScore != null && accessScore >= 45 && powerIndex != null && powerIndex >= 50)
    || (accessScore != null && accessScore >= 40 && powerPrice != null && powerPrice <= 8.5)
  ) {
    return {
      score: 2,
      label: 'SUPPORTIVE',
      className: 'badge-g',
      detail: accessScore != null && powerIndex != null
        ? `Access ${num(accessScore, 1)} and power index ${num(powerIndex, 1)} both support transition work.`
        : accessScore != null
          ? `Access score is ${num(accessScore, 1)} / 100.`
          : `Power index is ${num(powerIndex, 1)}.`,
    };
  }

  if (accessScore != null || powerIndex != null || powerPrice != null) {
    return {
      score: 1,
      label: 'PARTIAL',
      className: 'badge-a',
      detail: accessScore != null
        ? `Access is visible at ${num(accessScore, 1)} / 100, but movement / power context is still incomplete.`
        : powerIndex != null
          ? `Power context is partially visible at ${num(powerIndex, 1)}.`
          : `Power price is ${$(powerPrice, 2)}.`,
    };
  }

  return {
    score: -1,
    label: 'MISSING',
    className: 'badge-r',
    detail: 'Movement and power proxies are still thin for this county.',
  };
}

function classifyThesisHazardWindow({ drought, flood }) {
  const droughtScore = drought?.risk_score ?? null;
  const floodScore = flood?.hazard_score ?? null;

  if (droughtScore == null && floodScore == null) {
    return {
      score: 0,
      label: 'UNKNOWN',
      className: 'badge-a',
      detail: 'Hazard evidence is incomplete for this thesis read.',
    };
  }

  if (
    (droughtScore != null && droughtScore >= 85)
    || (floodScore != null && floodScore >= 85)
  ) {
    return {
      score: -1,
      label: 'CONSTRAINED',
      className: 'badge-r',
      detail: `Hazard burden is elevated: drought ${droughtScore != null ? num(droughtScore, 0) : 'N/A'} / flood ${floodScore != null ? num(floodScore, 0) : 'N/A'}.`,
    };
  }

  if (
    (droughtScore == null || droughtScore <= 75)
    && (floodScore == null || floodScore <= 75)
  ) {
    return {
      score: 1,
      label: 'MANAGEABLE',
      className: 'badge-g',
      detail: `Hazards look manageable at drought ${droughtScore != null ? num(droughtScore, 0) : 'N/A'} / flood ${floodScore != null ? num(floodScore, 0) : 'N/A'}.`,
    };
  }

  return {
    score: 0,
    label: 'MIXED',
    className: 'badge-a',
    detail: `Hazard read is mixed at drought ${droughtScore != null ? num(droughtScore, 0) : 'N/A'} / flood ${floodScore != null ? num(floodScore, 0) : 'N/A'}.`,
  };
}

function classifyThesisUnderwrite({ metrics, valueSpreadPct }) {
  const capRate = metrics?.implied_cap_rate ?? null;
  const fairValue = metrics?.fair_value ?? null;
  const benchmarkValue = metrics?.benchmark_value ?? null;

  if (valueSpreadPct != null && valueSpreadPct >= 5) {
    return {
      score: 2,
      label: 'OPEN',
      className: 'badge-g',
      detail: `Fair value sits ${pct(valueSpreadPct, 1)} above benchmark.`,
    };
  }

  if (valueSpreadPct != null && valueSpreadPct <= -10) {
    return {
      score: -1,
      label: 'TIGHT',
      className: 'badge-r',
      detail: `Benchmark runs ${pct(Math.abs(valueSpreadPct), 1)} above fair value.`,
    };
  }

  if (capRate != null || fairValue != null || benchmarkValue != null) {
    return {
      score: 1,
      label: 'VISIBLE',
      className: 'badge-a',
      detail: capRate != null
        ? `Cap rate is ${pct(capRate, 2)} with visible benchmark/fair-value context.`
        : 'Underwrite context is partially visible.',
    };
  }

  return {
    score: 0,
    label: 'INCOMPLETE',
    className: 'badge-a',
    detail: 'Atlas does not yet have enough underwrite context for this thesis read.',
  };
}

function classifyWaterBuffer({ soil, irrigation }) {
  const aws100 = soil?.rootzone_aws_100cm ?? null;
  const irrigatedAcres = irrigation?.irrigated_acres ?? null;

  if (
    (aws100 != null && aws100 >= 18)
    || (irrigatedAcres != null && irrigatedAcres >= 10000)
  ) {
    return {
      score: 2,
      label: 'BUFFERED',
      className: 'badge-g',
      detail: aws100 != null
        ? `AWS 100cm is ${num(aws100, 1)} with strong water-buffer support.`
        : `${Math.round(irrigatedAcres).toLocaleString('en-US')} irrigated acres support the production base.`,
    };
  }

  if (
    (aws100 != null && aws100 >= 14)
    || (irrigatedAcres != null && irrigatedAcres >= 1000)
  ) {
    return {
      score: 1,
      label: 'VISIBLE',
      className: 'badge-a',
      detail: aws100 != null
        ? `AWS 100cm is ${num(aws100, 1)}.`
        : `${Math.round(irrigatedAcres).toLocaleString('en-US')} irrigated acres are visible.`,
    };
  }

  return {
    score: -1,
    label: 'THIN',
    className: 'badge-r',
    detail: 'Water-buffer support is thin or missing in current Atlas evidence.',
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

export function evaluateAtlasThesisSupport({
  lensKey,
  metrics = {},
  productivityActive,
  yieldProductivityFactor,
  soil,
  irrigation,
  drought,
  flood,
  industrial,
}) {
  if (!lensKey) return null;

  const fairValue = metrics?.fair_value ?? null;
  const benchmarkValue = metrics?.benchmark_value ?? null;
  const valueSpreadPct = fairValue != null && benchmarkValue != null && benchmarkValue > 0
    ? ((fairValue - benchmarkValue) / benchmarkValue) * 100
    : null;

  const productiveBase = classifySiteQuality({
    soil,
    irrigation,
    productivityActive,
    yieldProductivityFactor,
  });
  const infrastructure = classifyThesisInfrastructure({ metrics, industrial });
  const hazards = classifyThesisHazardWindow({ drought, flood });
  const underwrite = classifyThesisUnderwrite({ metrics, valueSpreadPct });
  const waterBuffer = classifyWaterBuffer({ soil, irrigation });

  if (lensKey === 'ag_transition_thesis') {
    let overall;
    if (productiveBase.score >= 1 && infrastructure.score >= 1 && hazards.score >= 0) {
      overall = {
        label: 'TRANSITION PLAUSIBLE',
        className: 'badge-g',
        summary: 'The county has enough productive-base and movement support to belong in an ag-transition workflow today.',
      };
    } else if (productiveBase.score >= 1 && hazards.score >= 0) {
      overall = {
        label: 'WATCH THEME',
        className: 'badge-a',
        summary: 'The productive base is visible, but transition-readiness is still conditional on better movement, power, or missing labor-side evidence.',
      };
    } else if (productiveBase.score < 0 || hazards.score < 0) {
      overall = {
        label: 'WEAK FIT',
        className: 'badge-r',
        summary: 'Current Atlas evidence does not support a strong ag-transition read here yet.',
      };
    } else {
      overall = {
        label: 'INCOMPLETE',
        className: 'badge-b',
        summary: 'Atlas still lacks enough live support to turn this into a clean transition-thesis county.',
      };
    }

    return {
      overall,
      pillars: {
        productive_base: productiveBase,
        movement_infrastructure: infrastructure,
        hazard_window: hazards,
        underwrite,
      },
      supportPoints: [
        productiveBase.score >= 1 ? productiveBase.detail : null,
        infrastructure.score >= 1 ? infrastructure.detail : null,
        underwrite.score >= 1 ? underwrite.detail : null,
        hazards.score >= 0 ? hazards.detail : null,
      ].filter(Boolean).slice(0, 4),
      cautionPoints: [
        infrastructure.score < 1 ? infrastructure.detail : null,
        hazards.score < 0 ? hazards.detail : null,
        !productivityActive ? 'County yield-basis support is inactive, so the productive-base read is only partially observed.' : null,
      ].filter(Boolean).slice(0, 4),
      gatingChecks: [
        infrastructure.score < 1 ? 'Confirm movement and power context before presenting this county as transition-ready.' : null,
        'Direct labor, H-2A, wage, broadband, and robotics-adoption series are still missing; keep the thesis framed as proxy-supported rather than labor-modeled.',
      ].filter(Boolean).slice(0, 4),
    };
  }

  if (lensKey === 'resilient_production_base') {
    let overall;
    if (productiveBase.score >= 1 && waterBuffer.score >= 1 && hazards.score >= 0) {
      overall = {
        label: 'DURABLE BASE',
        className: 'badge-g',
        summary: 'The county looks like a credible long-duration production base under the current soil, water, and hazard stack.',
      };
    } else if (productiveBase.score >= 1 && hazards.score >= 0) {
      overall = {
        label: 'USABLE BASE',
        className: 'badge-a',
        summary: 'The production base is visible, but the resilience case still needs tighter water-buffer or hazard confirmation.',
      };
    } else if (productiveBase.score < 0 || waterBuffer.score < 0 || hazards.score < 0) {
      overall = {
        label: 'FRAGILE BASE',
        className: 'badge-r',
        summary: 'Current soil, water, or hazard context does not yet support a strong resilient-base read.',
      };
    } else {
      overall = {
        label: 'INCOMPLETE',
        className: 'badge-b',
        summary: 'Atlas still lacks enough live support to treat this as a resilient production base.',
      };
    }

    return {
      overall,
      pillars: {
        productive_base: productiveBase,
        water_buffer: waterBuffer,
        hazard_window: hazards,
        underwrite,
      },
      supportPoints: [
        productiveBase.score >= 1 ? productiveBase.detail : null,
        waterBuffer.score >= 1 ? waterBuffer.detail : null,
        hazards.score >= 0 ? hazards.detail : null,
        underwrite.score >= 1 ? underwrite.detail : null,
      ].filter(Boolean).slice(0, 4),
      cautionPoints: [
        waterBuffer.score < 1 ? waterBuffer.detail : null,
        hazards.score < 0 ? hazards.detail : null,
        !productivityActive ? 'Yield-productivity support is inactive, so resilience is relying more heavily on soil and irrigation evidence.' : null,
      ].filter(Boolean).slice(0, 4),
      gatingChecks: [
        waterBuffer.score < 1 ? 'Validate water-buffer support before using this county as a durable production anchor.' : null,
        hazards.score < 1 ? 'Pressure-test drought and flood tolerance against the intended hold period.' : null,
      ].filter(Boolean).slice(0, 4),
    };
  }

  return null;
}

export function buildScreenReasons(row, activeFilters = {}, thesisKey = '') {
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
  const thesis = evaluateAtlasThesisSupport({
    lensKey: thesisKey,
    metrics: row.metrics,
    productivityActive: row.productivity_active,
    yieldProductivityFactor: row.metrics?.yield_productivity_factor,
    soil: row.soil,
    irrigation: row.irrigation,
    drought: row.drought,
    flood: row.flood,
    industrial: row.industrial,
  });

  const reasons = [];
  const capRate = row.metrics?.implied_cap_rate;
  const access = row.metrics?.access_score;
  const soilShare = row.soil?.significant_share_pct;
  const droughtRisk = row.drought?.risk_score;
  const floodRisk = row.flood?.hazard_score;
  const yieldFactor = row.metrics?.yield_productivity_factor;

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
  if (activeFilters.minYieldFactor && yieldFactor != null && yieldFactor >= Number(activeFilters.minYieldFactor)) {
    reasons.push(`Yield factor ${num(yieldFactor, 2)} clears the productivity floor.`);
  }
  if (activeFilters.minPowerIndex && row.industrial?.power_cost_index != null && row.industrial.power_cost_index >= Number(activeFilters.minPowerIndex)) {
    reasons.push(`Power index ${num(row.industrial.power_cost_index, 1)} meets the power screen.`);
  }
  if (activeFilters.maxPowerPrice && row.industrial?.industrial_power_price != null && row.industrial.industrial_power_price <= Number(activeFilters.maxPowerPrice)) {
    reasons.push(`Power price ${$(row.industrial.industrial_power_price, 2)} is inside the target band.`);
  }

  for (const support of thesis?.supportPoints || []) {
    if (!reasons.includes(support)) reasons.push(support);
    if (reasons.length >= 3) break;
  }

  for (const support of read.supportPoints) {
    if (!reasons.includes(support)) reasons.push(support);
    if (reasons.length >= 3) break;
  }

  if (!reasons.length) {
    reasons.push(thesis?.overall.summary || read.overall.summary);
  }

  return {
    overall: read.overall,
    thesis,
    reasons: reasons.slice(0, 3),
  };
}
