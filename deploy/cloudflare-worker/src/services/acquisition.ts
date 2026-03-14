import type { Assumptions } from './metric-engine';

export type AcquisitionUnderwritingInputs = {
  entry_price_per_acre?: number | null;
  hold_years?: number | null;
  exit_cap_rate?: number | null;
  sale_cost_pct?: number | null;
  acres?: number | null;
};

export type AcquisitionUnderwritingResult = {
  status: 'ready' | 'missing';
  entry_price_per_acre: number | null;
  entry_price_basis: 'benchmark_value' | 'custom' | 'missing';
  hold_years: number;
  exit_cap_rate: number | null;
  exit_cap_basis: 'implied_cap_rate' | 'required_return' | 'custom' | 'missing';
  annual_noi_growth_pct: number | null;
  near_term_rent_shock_pct: number | null;
  sale_cost_pct: number;
  acres: number;
  benchmark_value: number | null;
  fair_value: number | null;
  year1_noi_per_acre: number | null;
  year1_cash_yield_pct: number | null;
  cumulative_noi_per_acre: number | null;
  exit_noi_per_acre: number | null;
  gross_exit_value_per_acre: number | null;
  net_exit_value_per_acre: number | null;
  entry_discount_to_benchmark_pct: number | null;
  entry_discount_to_fair_value_pct: number | null;
  moic: number | null;
  irr_pct: number | null;
  deal_size: number | null;
  cumulative_noi_total: number | null;
  net_exit_value_total: number | null;
  total_profit: number | null;
  notes: string[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function defaultIfFinite(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function computeIrr(cashFlows: number[]): number | null {
  if (cashFlows.length < 2) return null;
  const hasPositive = cashFlows.some((value) => value > 0);
  const hasNegative = cashFlows.some((value) => value < 0);
  if (!hasPositive || !hasNegative) return null;

  const npv = (rate: number) => cashFlows.reduce((sum, flow, index) => sum + flow / Math.pow(1 + rate, index), 0);

  let low = -0.99;
  let high = 5;
  let lowNpv = npv(low);
  let highNpv = npv(high);
  let expand = 0;
  while (lowNpv * highNpv > 0 && expand < 20) {
    high *= 2;
    highNpv = npv(high);
    expand += 1;
  }
  if (lowNpv * highNpv > 0) return null;

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const midNpv = npv(mid);
    if (Math.abs(midNpv) < 1e-7) return round4(mid * 100);
    if (lowNpv * midNpv <= 0) {
      high = mid;
      highNpv = midNpv;
    } else {
      low = mid;
      lowNpv = midNpv;
    }
  }

  return round4(((low + high) / 2) * 100);
}

export function computeAcquisitionUnderwriting(
  metrics: Record<string, number | null | undefined>,
  assumptions: Assumptions,
  inputs: AcquisitionUnderwritingInputs = {},
): AcquisitionUnderwritingResult {
  const benchmarkValue = metrics.benchmark_value ?? null;
  const fairValue = metrics.fair_value ?? null;
  const noiPerAcre = metrics.noi_per_acre ?? null;
  const impliedCapRate = metrics.implied_cap_rate ?? null;
  const requiredReturn = metrics.required_return ?? null;
  const growthRate = defaultIfFinite(assumptions.long_run_growth, 0.025);
  const nearTermRentShock = defaultIfFinite(assumptions.near_term_rent_shock, 0);
  const holdYears = Math.max(1, Math.round(defaultIfFinite(inputs.hold_years, 5)));
  const saleCostPct = defaultIfFinite(inputs.sale_cost_pct, 2);
  const acres = defaultIfFinite(inputs.acres, 500);

  const entryPricePerAcre = Number.isFinite(inputs.entry_price_per_acre)
    ? Number(inputs.entry_price_per_acre)
    : benchmarkValue;
  const entryPriceBasis: AcquisitionUnderwritingResult['entry_price_basis'] = Number.isFinite(inputs.entry_price_per_acre)
    ? 'custom'
    : benchmarkValue != null
      ? 'benchmark_value'
      : 'missing';

  const derivedExitCap = impliedCapRate ?? requiredReturn;
  const exitCapRate = Number.isFinite(inputs.exit_cap_rate)
    ? Number(inputs.exit_cap_rate)
    : derivedExitCap;
  const exitCapBasis: AcquisitionUnderwritingResult['exit_cap_basis'] = Number.isFinite(inputs.exit_cap_rate)
    ? 'custom'
    : impliedCapRate != null
      ? 'implied_cap_rate'
      : requiredReturn != null
        ? 'required_return'
        : 'missing';

  const notes: string[] = [];
  if (entryPriceBasis === 'benchmark_value') {
    notes.push('Entry price defaults to the current Atlas benchmark value per acre.');
  }
  if (exitCapBasis === 'implied_cap_rate') {
    notes.push('Exit cap defaults to the current implied cap rate for this county.');
  } else if (exitCapBasis === 'required_return') {
    notes.push('Exit cap defaults to the active required return because implied cap data is missing.');
  }
  notes.push('NOI path uses the active long-run growth and near-term rent-shock assumptions.');

  if (!entryPricePerAcre || entryPricePerAcre <= 0 || !noiPerAcre || noiPerAcre <= 0 || !exitCapRate || exitCapRate <= 0) {
    return {
      status: 'missing',
      entry_price_per_acre: entryPricePerAcre ?? null,
      entry_price_basis: entryPriceBasis,
      hold_years: holdYears,
      exit_cap_rate: exitCapRate ?? null,
      exit_cap_basis: exitCapBasis,
      annual_noi_growth_pct: round4(growthRate * 100),
      near_term_rent_shock_pct: round4(nearTermRentShock * 100),
      sale_cost_pct: round4(saleCostPct),
      acres: round2(acres),
      benchmark_value: benchmarkValue,
      fair_value: fairValue,
      year1_noi_per_acre: null,
      year1_cash_yield_pct: null,
      cumulative_noi_per_acre: null,
      exit_noi_per_acre: null,
      gross_exit_value_per_acre: null,
      net_exit_value_per_acre: null,
      entry_discount_to_benchmark_pct: null,
      entry_discount_to_fair_value_pct: null,
      moic: null,
      irr_pct: null,
      deal_size: null,
      cumulative_noi_total: null,
      net_exit_value_total: null,
      total_profit: null,
      notes,
    };
  }

  const year1Noi = noiPerAcre * (1 + nearTermRentShock);
  const yearlyNoi: number[] = [];
  for (let year = 1; year <= holdYears; year += 1) {
    yearlyNoi.push(year1Noi * Math.pow(1 + growthRate, year - 1));
  }

  const exitNoi = yearlyNoi[yearlyNoi.length - 1];
  const grossExitValuePerAcre = exitNoi / (exitCapRate / 100);
  const netExitValuePerAcre = grossExitValuePerAcre * (1 - saleCostPct / 100);
  const cumulativeNoiPerAcre = yearlyNoi.reduce((sum, value) => sum + value, 0);
  const cashFlows = [-entryPricePerAcre, ...yearlyNoi.slice(0, -1), exitNoi + netExitValuePerAcre];
  const irrPct = computeIrr(cashFlows);
  const totalDistributionsPerAcre = cumulativeNoiPerAcre + netExitValuePerAcre;
  const moic = entryPricePerAcre > 0 ? totalDistributionsPerAcre / entryPricePerAcre : null;

  return {
    status: 'ready',
    entry_price_per_acre: round2(entryPricePerAcre),
    entry_price_basis: entryPriceBasis,
    hold_years: holdYears,
    exit_cap_rate: round4(exitCapRate),
    exit_cap_basis: exitCapBasis,
    annual_noi_growth_pct: round4(growthRate * 100),
    near_term_rent_shock_pct: round4(nearTermRentShock * 100),
    sale_cost_pct: round4(saleCostPct),
    acres: round2(acres),
    benchmark_value: benchmarkValue != null ? round2(benchmarkValue) : null,
    fair_value: fairValue != null ? round2(fairValue) : null,
    year1_noi_per_acre: round2(year1Noi),
    year1_cash_yield_pct: round4((year1Noi / entryPricePerAcre) * 100),
    cumulative_noi_per_acre: round2(cumulativeNoiPerAcre),
    exit_noi_per_acre: round2(exitNoi),
    gross_exit_value_per_acre: round2(grossExitValuePerAcre),
    net_exit_value_per_acre: round2(netExitValuePerAcre),
    entry_discount_to_benchmark_pct: benchmarkValue != null ? round4(((benchmarkValue - entryPricePerAcre) / benchmarkValue) * 100) : null,
    entry_discount_to_fair_value_pct: fairValue != null ? round4(((fairValue - entryPricePerAcre) / fairValue) * 100) : null,
    moic: moic != null ? round4(moic) : null,
    irr_pct: irrPct,
    deal_size: round2(entryPricePerAcre * acres),
    cumulative_noi_total: round2(cumulativeNoiPerAcre * acres),
    net_exit_value_total: round2(netExitValuePerAcre * acres),
    total_profit: round2((totalDistributionsPerAcre - entryPricePerAcre) * acres),
    notes,
  };
}
