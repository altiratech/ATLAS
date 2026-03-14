import type { Assumptions } from './metric-engine';

export type AcquisitionUnderwritingInputs = {
  entry_price_per_acre?: number | null;
  hold_years?: number | null;
  exit_cap_rate?: number | null;
  sale_cost_pct?: number | null;
  acres?: number | null;
  leverage_ltv_pct?: number | null;
  leverage_loan_rate_pct?: number | null;
  leverage_loan_term_years?: number | null;
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
  leverage_basis: 'assumption_set' | 'custom' | 'missing';
  leverage_mode: 'levered' | 'cash' | 'invalid';
  ltv_pct: number | null;
  loan_rate_pct: number | null;
  loan_term_years: number | null;
  debt_amount_per_acre: number | null;
  equity_check_per_acre: number | null;
  annual_debt_service_per_acre: number | null;
  year1_cash_after_debt_per_acre: number | null;
  year1_cash_on_cash_yield_pct: number | null;
  cumulative_cash_after_debt_per_acre: number | null;
  remaining_loan_balance_per_acre: number | null;
  net_exit_equity_per_acre: number | null;
  levered_moic: number | null;
  levered_irr_pct: number | null;
  equity_check_total: number | null;
  cumulative_cash_after_debt_total: number | null;
  remaining_loan_balance_total: number | null;
  net_exit_equity_total: number | null;
  levered_total_profit: number | null;
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

function amortizedAnnualDebtService(principal: number, rateDec: number, termYears: number): number | null {
  if (!Number.isFinite(principal) || principal < 0) return null;
  if (!Number.isFinite(termYears) || termYears <= 0) return null;
  if (!Number.isFinite(rateDec) || rateDec < 0) return null;
  if (principal === 0) return 0;
  if (rateDec === 0) return principal / termYears;
  const mr = rateDec / 12;
  const n = termYears * 12;
  const numerator = principal * (mr * Math.pow(1 + mr, n));
  const denominator = Math.pow(1 + mr, n) - 1;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 12;
}

function remainingLoanBalance(principal: number, rateDec: number, termYears: number, elapsedYears: number): number | null {
  if (!Number.isFinite(principal) || principal < 0) return null;
  if (!Number.isFinite(termYears) || termYears <= 0) return null;
  if (!Number.isFinite(elapsedYears) || elapsedYears < 0) return null;
  if (principal === 0) return 0;
  const periodsElapsed = Math.min(termYears, elapsedYears) * 12;
  const n = termYears * 12;
  if (periodsElapsed >= n) return 0;
  if (!Number.isFinite(rateDec) || rateDec < 0) return null;
  if (rateDec === 0) {
    const annualPrincipal = principal / termYears;
    return Math.max(0, principal - annualPrincipal * Math.min(termYears, elapsedYears));
  }
  const mr = rateDec / 12;
  const payment = amortizedAnnualDebtService(principal, rateDec, termYears);
  if (!Number.isFinite(payment) || payment == null) return null;
  const monthlyPayment = payment / 12;
  const remaining =
    principal * Math.pow(1 + mr, periodsElapsed) -
    monthlyPayment * ((Math.pow(1 + mr, periodsElapsed) - 1) / mr);
  return Math.max(0, remaining);
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
  const hasCustomLeverage =
    Number.isFinite(inputs.leverage_ltv_pct)
    || Number.isFinite(inputs.leverage_loan_rate_pct)
    || Number.isFinite(inputs.leverage_loan_term_years);
  const leverageBasis: AcquisitionUnderwritingResult['leverage_basis'] = hasCustomLeverage
    ? 'custom'
    : 'assumption_set';
  const ltvPct = Number.isFinite(inputs.leverage_ltv_pct)
    ? Number(inputs.leverage_ltv_pct)
    : defaultIfFinite(assumptions.ltv, 0.60) * 100;
  const loanRatePct = Number.isFinite(inputs.leverage_loan_rate_pct)
    ? Number(inputs.leverage_loan_rate_pct)
    : defaultIfFinite(assumptions.loan_rate, 0.065) * 100;
  const loanTermYears = Math.max(1, Math.round(
    Number.isFinite(inputs.leverage_loan_term_years)
      ? Number(inputs.leverage_loan_term_years)
      : defaultIfFinite(assumptions.loan_term_years, 25),
  ));
  const leverageMode: AcquisitionUnderwritingResult['leverage_mode'] =
    ltvPct <= 0
      ? 'cash'
      : ltvPct >= 100 || loanRatePct < 0 || loanTermYears <= 0
        ? 'invalid'
        : 'levered';

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
  if (leverageBasis === 'custom') {
    notes.push('Leverage inputs override the active assumption-set debt terms for this deal view.');
  } else {
    notes.push('Leverage defaults to the active assumption-set LTV, loan rate, and amortization term.');
  }
  if (leverageMode === 'cash') {
    notes.push('No leverage is applied; levered outputs collapse to the cash deal view.');
  } else if (leverageMode === 'invalid') {
    notes.push('Leverage inputs are invalid for a deal model. Levered outputs are suppressed until LTV is below 100% and debt terms are valid.');
  }

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
      leverage_basis: leverageBasis,
      leverage_mode: leverageMode,
      ltv_pct: round4(ltvPct),
      loan_rate_pct: round4(loanRatePct),
      loan_term_years: loanTermYears,
      debt_amount_per_acre: null,
      equity_check_per_acre: null,
      annual_debt_service_per_acre: null,
      year1_cash_after_debt_per_acre: null,
      year1_cash_on_cash_yield_pct: null,
      cumulative_cash_after_debt_per_acre: null,
      remaining_loan_balance_per_acre: null,
      net_exit_equity_per_acre: null,
      levered_moic: null,
      levered_irr_pct: null,
      equity_check_total: null,
      cumulative_cash_after_debt_total: null,
      remaining_loan_balance_total: null,
      net_exit_equity_total: null,
      levered_total_profit: null,
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
  const debtAmountPerAcre = leverageMode === 'invalid' ? null : entryPricePerAcre * Math.max(0, ltvPct / 100);
  const equityCheckPerAcre = debtAmountPerAcre != null ? entryPricePerAcre - debtAmountPerAcre : null;
  const annualDebtServicePerAcre = debtAmountPerAcre != null
    ? amortizedAnnualDebtService(debtAmountPerAcre, Math.max(0, loanRatePct) / 100, loanTermYears)
    : null;
  const remainingLoanBalancePerAcre = debtAmountPerAcre != null
    ? remainingLoanBalance(debtAmountPerAcre, Math.max(0, loanRatePct) / 100, loanTermYears, holdYears)
    : null;
  const year1CashAfterDebtPerAcre = annualDebtServicePerAcre != null ? year1Noi - annualDebtServicePerAcre : null;
  const yearlyCashAfterDebt = yearlyNoi.map((value) => annualDebtServicePerAcre != null ? value - annualDebtServicePerAcre : null);
  const cumulativeCashAfterDebtPerAcre = yearlyCashAfterDebt.every((value) => value != null)
    ? yearlyCashAfterDebt.reduce((sum, value) => sum + Number(value), 0)
    : null;
  const netExitEquityPerAcre =
    netExitValuePerAcre != null && remainingLoanBalancePerAcre != null
      ? netExitValuePerAcre - remainingLoanBalancePerAcre
      : null;
  const leveredCashFlows =
    equityCheckPerAcre != null
    && equityCheckPerAcre > 0
    && annualDebtServicePerAcre != null
    && remainingLoanBalancePerAcre != null
      ? [
          -equityCheckPerAcre,
          ...yearlyNoi.slice(0, -1).map((value) => value - annualDebtServicePerAcre),
          exitNoi - annualDebtServicePerAcre + (netExitValuePerAcre - remainingLoanBalancePerAcre),
        ]
      : null;
  const leveredIrrPct = leveredCashFlows ? computeIrr(leveredCashFlows) : null;
  const leveredMoic =
    equityCheckPerAcre != null
    && equityCheckPerAcre > 0
    && cumulativeCashAfterDebtPerAcre != null
    && netExitEquityPerAcre != null
      ? (cumulativeCashAfterDebtPerAcre + netExitEquityPerAcre) / equityCheckPerAcre
      : null;

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
    leverage_basis: leverageBasis,
    leverage_mode: leverageMode,
    ltv_pct: round4(ltvPct),
    loan_rate_pct: round4(loanRatePct),
    loan_term_years: loanTermYears,
    debt_amount_per_acre: debtAmountPerAcre != null ? round2(debtAmountPerAcre) : null,
    equity_check_per_acre: equityCheckPerAcre != null ? round2(equityCheckPerAcre) : null,
    annual_debt_service_per_acre: annualDebtServicePerAcre != null ? round2(annualDebtServicePerAcre) : null,
    year1_cash_after_debt_per_acre: year1CashAfterDebtPerAcre != null ? round2(year1CashAfterDebtPerAcre) : null,
    year1_cash_on_cash_yield_pct:
      equityCheckPerAcre != null && equityCheckPerAcre > 0 && year1CashAfterDebtPerAcre != null
        ? round4((year1CashAfterDebtPerAcre / equityCheckPerAcre) * 100)
        : null,
    cumulative_cash_after_debt_per_acre: cumulativeCashAfterDebtPerAcre != null ? round2(cumulativeCashAfterDebtPerAcre) : null,
    remaining_loan_balance_per_acre: remainingLoanBalancePerAcre != null ? round2(remainingLoanBalancePerAcre) : null,
    net_exit_equity_per_acre: netExitEquityPerAcre != null ? round2(netExitEquityPerAcre) : null,
    levered_moic: leveredMoic != null ? round4(leveredMoic) : null,
    levered_irr_pct: leveredIrrPct,
    equity_check_total: equityCheckPerAcre != null ? round2(equityCheckPerAcre * acres) : null,
    cumulative_cash_after_debt_total: cumulativeCashAfterDebtPerAcre != null ? round2(cumulativeCashAfterDebtPerAcre * acres) : null,
    remaining_loan_balance_total: remainingLoanBalancePerAcre != null ? round2(remainingLoanBalancePerAcre * acres) : null,
    net_exit_equity_total: netExitEquityPerAcre != null ? round2(netExitEquityPerAcre * acres) : null,
    levered_total_profit:
      equityCheckPerAcre != null
      && equityCheckPerAcre > 0
      && cumulativeCashAfterDebtPerAcre != null
      && netExitEquityPerAcre != null
        ? round2(((cumulativeCashAfterDebtPerAcre + netExitEquityPerAcre) - equityCheckPerAcre) * acres)
        : null,
    notes,
  };
}
