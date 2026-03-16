/**
 * Portfolio Analytics Service — weighted metrics, diversification, HHI.
 * Ported from Python backend/app/services/portfolio.py
 */

export interface Holding {
  geo_key: string;
  acres: number;
  purchase_price_per_acre: number | null;
  purchase_year: string | null;
}

/** County data as returned by computeCounty() — metrics dict + geo info. */
export interface CountyData {
  metrics: Record<string, number | null>;
  state: string;
  [key: string]: any;
}

export interface PortfolioResult {
  total_acres: number;
  total_current_value: number;
  total_fair_value: number;
  total_purchase_value: number | null;
  annual_noi: number;
  portfolio_yield_pct: number;
  unrealized_gain_pct: number | null;
  weighted_metrics: Record<string, number>;
  holdings: HoldingDetail[];
  state_exposure: Record<string, number>;
  risk_summary: PortfolioRiskSummary;
  hhi: number;
  diversification_rating: string;
  num_counties: number;
  num_states: number;
}

interface HoldingDetail {
  geo_key: string;
  county_name: string;
  acres: number;
  purchase_price_per_acre: number | null;
  purchase_year: string | null;
  weight_pct: number;
  current_value: number;
  fair_value: number;
  purchase_value: number | null;
  unrealized_gain_pct: number | null;
  annual_noi: number;
  cash_rent: number;
  implied_cap_rate: number;
  access_score: number;
  state: string;
  source_quality: string | null;
  benchmark_method: string | null;
  benchmark_method_detail: string | null;
  productivity_active: boolean | null;
  yield_productivity_factor: number | null;
  metrics: Record<string, number | null>;
  drought: {
    risk_score: number | null;
    risk_rating_label: string | null;
  } | null;
  flood: {
    hazard_score: number | null;
    hazard_rating_label: string | null;
  } | null;
  irrigation: {
    irrigated_acres: number | null;
  } | null;
  soil: {
    significant_share_pct: number | null;
    prime_share_pct: number | null;
    rootzone_aws_100cm: number | null;
    rootzone_aws_150cm: number | null;
  } | null;
  credit: {
    base_dscr: number | null;
    combined_stress_dscr: number | null;
  } | null;
}

interface PortfolioRiskSummary {
  weighted_drought_risk: number | null;
  weighted_flood_risk: number | null;
  weighted_soil_significant_share_pct: number | null;
  weighted_rootzone_aws_100cm: number | null;
  weighted_combined_stress_dscr: number | null;
  county_observed_acres_pct: number;
  proxy_county_acres_pct: number;
  high_drought_acres_pct: number;
  high_flood_acres_pct: number;
  strong_soil_acres_pct: number;
}

const WEIGHT_KEYS = [
  'cash_rent', 'benchmark_value', 'noi_per_acre', 'implied_cap_rate',
  'fair_value', 'rent_multiple', 'access_score', 'dscr',
] as const;

export function computePortfolioMetrics(
  holdings: Holding[],
  countyData: Record<string, CountyData>,
): PortfolioResult {
  const totalAcres = holdings.reduce((s, h) => s + h.acres, 0);
  if (totalAcres === 0) {
    return emptyResult();
  }

  // Weighted metric aggregation
  const weighted: Record<string, number> = {};
  for (const key of WEIGHT_KEYS) {
    let sum = 0;
    for (const h of holdings) {
      const data = countyData[h.geo_key];
      if (data) sum += ((data.metrics[key] as number) ?? 0) * h.acres;
    }
    weighted[key] = round2(sum / totalAcres);
  }

  // Holding-level details
  const holdingDetails: HoldingDetail[] = [];
  let totalCurrentValue = 0;
  let totalFairValue = 0;
  let totalPurchaseValue: number | null = 0;
  let totalAnnualNoi = 0;
  let droughtWeighted = 0;
  let droughtAcres = 0;
  let floodWeighted = 0;
  let floodAcres = 0;
  let soilWeighted = 0;
  let soilAcres = 0;
  let awsWeighted = 0;
  let awsAcres = 0;
  let stressWeighted = 0;
  let stressAcres = 0;
  let countyObservedAcres = 0;
  let proxyCountyAcres = 0;
  let highDroughtAcres = 0;
  let highFloodAcres = 0;
  let strongSoilAcres = 0;

  for (const h of holdings) {
    const data = countyData[h.geo_key];
    if (!data) continue;
    const m = data.metrics;

    const currentVal = ((m.benchmark_value as number) ?? 0) * h.acres;
    const fairVal = ((m.fair_value as number) ?? 0) * h.acres;
    const purchaseVal = h.purchase_price_per_acre != null ? h.purchase_price_per_acre * h.acres : null;
    const annualNoi = ((m.noi_per_acre as number) ?? 0) * h.acres;
    const unrealizedPct = purchaseVal != null && purchaseVal > 0
      ? round2(((currentVal - purchaseVal) / purchaseVal) * 100)
      : null;
    const droughtRisk = Number.isFinite(data?.drought?.risk_score) ? Number(data.drought.risk_score) : null;
    const floodRisk = Number.isFinite(data?.flood?.hazard_score) ? Number(data.flood.hazard_score) : null;
    const soilShare = Number.isFinite(data?.soil?.significant_share_pct) ? Number(data.soil.significant_share_pct) : null;
    const aws100 = Number.isFinite(data?.soil?.rootzone_aws_100cm) ? Number(data.soil.rootzone_aws_100cm) : null;
    const combinedStressDscr = Number.isFinite(data?.credit?.combined_stress_dscr) ? Number(data.credit.combined_stress_dscr) : null;

    totalCurrentValue += currentVal;
    totalFairValue += fairVal;
    if (purchaseVal != null && totalPurchaseValue != null) {
      totalPurchaseValue += purchaseVal;
    } else {
      totalPurchaseValue = null;
    }
    totalAnnualNoi += annualNoi;
    if (droughtRisk != null) {
      droughtWeighted += droughtRisk * h.acres;
      droughtAcres += h.acres;
      if (droughtRisk >= 80) highDroughtAcres += h.acres;
    }
    if (floodRisk != null) {
      floodWeighted += floodRisk * h.acres;
      floodAcres += h.acres;
      if (floodRisk >= 80) highFloodAcres += h.acres;
    }
    if (soilShare != null) {
      soilWeighted += soilShare * h.acres;
      soilAcres += h.acres;
      if (soilShare >= 70) strongSoilAcres += h.acres;
    }
    if (aws100 != null) {
      awsWeighted += aws100 * h.acres;
      awsAcres += h.acres;
    }
    if (combinedStressDscr != null) {
      stressWeighted += combinedStressDscr * h.acres;
      stressAcres += h.acres;
    }
    if (data.source_quality === 'county') countyObservedAcres += h.acres;
    if (['proxy', 'mixed', 'state', 'national'].includes(String(data.source_quality || ''))) proxyCountyAcres += h.acres;

    holdingDetails.push({
      geo_key: h.geo_key,
      county_name: data.county_name ?? h.geo_key,
      acres: h.acres,
      purchase_price_per_acre: h.purchase_price_per_acre,
      purchase_year: h.purchase_year,
      weight_pct: round2((h.acres / totalAcres) * 100),
      current_value: round2(currentVal),
      fair_value: round2(fairVal),
      purchase_value: purchaseVal != null ? round2(purchaseVal) : null,
      unrealized_gain_pct: unrealizedPct,
      annual_noi: round2(annualNoi),
      cash_rent: (m.cash_rent as number) ?? 0,
      implied_cap_rate: (m.implied_cap_rate as number) ?? 0,
      access_score: (m.access_score as number) ?? 0,
      state: data.state,
      source_quality: data.source_quality ?? null,
      benchmark_method: data.benchmark_method ?? null,
      benchmark_method_detail: data.benchmark_method_detail ?? null,
      productivity_active: data.productivity_active ?? null,
      yield_productivity_factor: (m.yield_productivity_factor as number) ?? null,
      metrics: {
        benchmark_value: (m.benchmark_value as number) ?? null,
        fair_value: (m.fair_value as number) ?? null,
        noi_per_acre: (m.noi_per_acre as number) ?? null,
        implied_cap_rate: (m.implied_cap_rate as number) ?? null,
        access_score: (m.access_score as number) ?? null,
        dscr: (m.dscr as number) ?? null,
        cap_spread_to_10y: (m.cap_spread_to_10y as number) ?? null,
        yield_productivity_factor: (m.yield_productivity_factor as number) ?? null,
      },
      drought: data.drought
        ? {
            risk_score: droughtRisk,
            risk_rating_label: data.drought.risk_rating_label ?? null,
          }
        : null,
      flood: data.flood
        ? {
            hazard_score: floodRisk,
            hazard_rating_label: data.flood.hazard_rating_label ?? null,
          }
        : null,
      irrigation: data.irrigation
        ? {
            irrigated_acres: Number.isFinite(data.irrigation.irrigated_acres) ? Number(data.irrigation.irrigated_acres) : null,
          }
        : null,
      soil: data.soil
        ? {
            significant_share_pct: soilShare,
            prime_share_pct: Number.isFinite(data.soil.prime_share_pct) ? Number(data.soil.prime_share_pct) : null,
            rootzone_aws_100cm: aws100,
            rootzone_aws_150cm: Number.isFinite(data.soil.rootzone_aws_150cm) ? Number(data.soil.rootzone_aws_150cm) : null,
          }
        : null,
      credit: data.credit
        ? {
            base_dscr: Number.isFinite(data.credit.base_dscr) ? Number(data.credit.base_dscr) : null,
            combined_stress_dscr: combinedStressDscr,
          }
        : null,
    });
  }

  // State exposure and HHI
  const stateAcres: Record<string, number> = {};
  for (const h of holdingDetails) {
    stateAcres[h.state] = (stateAcres[h.state] || 0) + h.acres;
  }
  const stateExposure: Record<string, number> = {};
  let hhi = 0;
  for (const [state, acres] of Object.entries(stateAcres)) {
    const pct = round2((acres / totalAcres) * 100);
    stateExposure[state] = pct;
    hhi += pct * pct;
  }
  hhi = Math.round(hhi);

  const rating = hhi < 2500 ? 'Excellent' : hhi < 4000 ? 'Good' : hhi < 6000 ? 'Moderate' : 'Concentrated';

  const portfolioYield = totalCurrentValue > 0
    ? round2((totalAnnualNoi / totalCurrentValue) * 100)
    : 0;

  const unrealizedGainTotal = totalPurchaseValue != null && totalPurchaseValue > 0
    ? round2(((totalCurrentValue - totalPurchaseValue) / totalPurchaseValue) * 100)
    : null;

  return {
    total_acres: round2(totalAcres),
    total_current_value: round2(totalCurrentValue),
    total_fair_value: round2(totalFairValue),
    total_purchase_value: totalPurchaseValue != null ? round2(totalPurchaseValue) : null,
    annual_noi: round2(totalAnnualNoi),
    portfolio_yield_pct: portfolioYield,
    unrealized_gain_pct: unrealizedGainTotal,
    weighted_metrics: weighted,
    holdings: holdingDetails,
    state_exposure: stateExposure,
    risk_summary: {
      weighted_drought_risk: droughtAcres > 0 ? round2(droughtWeighted / droughtAcres) : null,
      weighted_flood_risk: floodAcres > 0 ? round2(floodWeighted / floodAcres) : null,
      weighted_soil_significant_share_pct: soilAcres > 0 ? round2(soilWeighted / soilAcres) : null,
      weighted_rootzone_aws_100cm: awsAcres > 0 ? round2(awsWeighted / awsAcres) : null,
      weighted_combined_stress_dscr: stressAcres > 0 ? round2(stressWeighted / stressAcres) : null,
      county_observed_acres_pct: round2((countyObservedAcres / totalAcres) * 100),
      proxy_county_acres_pct: round2((proxyCountyAcres / totalAcres) * 100),
      high_drought_acres_pct: round2((highDroughtAcres / totalAcres) * 100),
      high_flood_acres_pct: round2((highFloodAcres / totalAcres) * 100),
      strong_soil_acres_pct: round2((strongSoilAcres / totalAcres) * 100),
    },
    hhi,
    diversification_rating: rating,
    num_counties: holdingDetails.length,
    num_states: Object.keys(stateExposure).length,
  };
}

function emptyResult(): PortfolioResult {
  return {
    total_acres: 0, total_current_value: 0, total_fair_value: 0,
    total_purchase_value: null, annual_noi: 0, portfolio_yield_pct: 0,
    unrealized_gain_pct: null, weighted_metrics: {}, holdings: [],
    state_exposure: {},
    risk_summary: {
      weighted_drought_risk: null,
      weighted_flood_risk: null,
      weighted_soil_significant_share_pct: null,
      weighted_rootzone_aws_100cm: null,
      weighted_combined_stress_dscr: null,
      county_observed_acres_pct: 0,
      proxy_county_acres_pct: 0,
      high_drought_acres_pct: 0,
      high_flood_acres_pct: 0,
      strong_soil_acres_pct: 0,
    },
    hhi: 10000, diversification_rating: 'Concentrated',
    num_counties: 0, num_states: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
