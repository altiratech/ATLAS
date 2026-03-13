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

    totalCurrentValue += currentVal;
    totalFairValue += fairVal;
    if (purchaseVal != null && totalPurchaseValue != null) {
      totalPurchaseValue += purchaseVal;
    } else {
      totalPurchaseValue = null;
    }
    totalAnnualNoi += annualNoi;

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
    state_exposure: {}, hhi: 10000, diversification_rating: 'Concentrated',
    num_counties: 0, num_states: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
