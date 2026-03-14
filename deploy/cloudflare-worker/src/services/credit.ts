import type { Assumptions } from './metric-engine';

export type CreditStressInputs = {
  rent_stress_pct?: number | null;
  rate_shock_bps?: number | null;
};

export type CreditStressResult = {
  status: 'ready' | 'missing';
  ltv: number | null;
  loan_rate_pct: number | null;
  loan_term_years: number | null;
  debt_per_acre: number | null;
  annual_debt_service_per_acre: number | null;
  debt_yield_pct: number | null;
  break_even_rent: number | null;
  base_dscr: number | null;
  rent_stress_pct: number;
  stressed_noi_per_acre: number | null;
  rent_stress_dscr: number | null;
  rate_shock_bps: number;
  stressed_loan_rate_pct: number | null;
  stressed_annual_debt_service_per_acre: number | null;
  rate_stress_dscr: number | null;
  combined_stress_dscr: number | null;
  value_decline_to_100_ltv_pct: number | null;
  fair_value_ltv_pct: number | null;
  fair_value_equity_cushion_pct: number | null;
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
  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isFinite(rateDec) || rateDec <= 0) return null;
  if (!Number.isFinite(termYears) || termYears <= 0) return null;
  const mr = rateDec / 12;
  const n = termYears * 12;
  const numerator = principal * (mr * Math.pow(1 + mr, n));
  const denominator = Math.pow(1 + mr, n) - 1;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 12;
}

export function computeCreditStress(
  metrics: Record<string, number | null | undefined>,
  assumptions: Assumptions,
  inputs: CreditStressInputs = {},
): CreditStressResult {
  const benchmarkValue = metrics.benchmark_value ?? null;
  const fairValue = metrics.fair_value ?? null;
  const noiPerAcre = metrics.noi_per_acre ?? null;
  const breakEvenRent = metrics.break_even_rent ?? null;
  const ltv = defaultIfFinite(assumptions.ltv, 0.60);
  const loanRateDec = defaultIfFinite(assumptions.loan_rate, 0.065);
  const loanTermYears = Math.max(1, Math.round(defaultIfFinite(assumptions.loan_term_years, 25)));
  const rentStressPct = defaultIfFinite(inputs.rent_stress_pct, -10);
  const rateShockBps = defaultIfFinite(inputs.rate_shock_bps, 100);
  const debtPerAcre = benchmarkValue != null ? benchmarkValue * ltv : null;
  const annualDebtServicePerAcre = debtPerAcre != null
    ? amortizedAnnualDebtService(debtPerAcre, loanRateDec, loanTermYears)
    : null;
  const stressedLoanRateDec = loanRateDec + (rateShockBps / 10000);
  const stressedAnnualDebtServicePerAcre = debtPerAcre != null
    ? amortizedAnnualDebtService(debtPerAcre, stressedLoanRateDec, loanTermYears)
    : null;
  const stressedNoiPerAcre = noiPerAcre != null ? noiPerAcre * (1 + (rentStressPct / 100)) : null;

  const notes: string[] = [
    'Debt basis uses current benchmark value per acre × active LTV.',
    `Rent stress applies ${rentStressPct >= 0 ? '+' : ''}${round2(rentStressPct)}% to current NOI while leverage stays fixed.`,
    `Rate stress adds ${Math.round(rateShockBps)} bps to the active loan rate while keeping term constant.`,
  ];

  if (!benchmarkValue || benchmarkValue <= 0 || !noiPerAcre || noiPerAcre <= 0 || !annualDebtServicePerAcre || annualDebtServicePerAcre <= 0) {
    return {
      status: 'missing',
      ltv: round4(ltv * 100),
      loan_rate_pct: round4(loanRateDec * 100),
      loan_term_years: loanTermYears,
      debt_per_acre: debtPerAcre != null ? round2(debtPerAcre) : null,
      annual_debt_service_per_acre: annualDebtServicePerAcre != null ? round2(annualDebtServicePerAcre) : null,
      debt_yield_pct: null,
      break_even_rent: breakEvenRent != null ? round2(breakEvenRent) : null,
      base_dscr: null,
      rent_stress_pct: round4(rentStressPct),
      stressed_noi_per_acre: stressedNoiPerAcre != null ? round2(stressedNoiPerAcre) : null,
      rent_stress_dscr: null,
      rate_shock_bps: round2(rateShockBps),
      stressed_loan_rate_pct: round4(stressedLoanRateDec * 100),
      stressed_annual_debt_service_per_acre: stressedAnnualDebtServicePerAcre != null ? round2(stressedAnnualDebtServicePerAcre) : null,
      rate_stress_dscr: null,
      combined_stress_dscr: null,
      value_decline_to_100_ltv_pct: round4((1 - ltv) * 100),
      fair_value_ltv_pct: fairValue != null && debtPerAcre != null && fairValue > 0 ? round4((debtPerAcre / fairValue) * 100) : null,
      fair_value_equity_cushion_pct: fairValue != null && debtPerAcre != null && fairValue > 0 ? round4(((fairValue - debtPerAcre) / fairValue) * 100) : null,
      notes,
    };
  }

  const baseDscr = noiPerAcre / annualDebtServicePerAcre;
  const debtPerAcreReady = debtPerAcre as number;
  const debtYieldPct = debtPerAcreReady != null && debtPerAcreReady > 0 ? (noiPerAcre / debtPerAcreReady) * 100 : null;
  const rentStressDscr = stressedNoiPerAcre != null ? stressedNoiPerAcre / annualDebtServicePerAcre : null;
  const rateStressDscr = stressedAnnualDebtServicePerAcre != null && stressedAnnualDebtServicePerAcre > 0
    ? noiPerAcre / stressedAnnualDebtServicePerAcre
    : null;
  const combinedStressDscr = stressedNoiPerAcre != null && stressedAnnualDebtServicePerAcre != null && stressedAnnualDebtServicePerAcre > 0
    ? stressedNoiPerAcre / stressedAnnualDebtServicePerAcre
    : null;
  const fairValueLtvPct = fairValue != null && debtPerAcre != null && fairValue > 0 ? (debtPerAcre / fairValue) * 100 : null;
  const fairValueEquityCushionPct = fairValue != null && debtPerAcre != null && fairValue > 0 ? ((fairValue - debtPerAcre) / fairValue) * 100 : null;

  if (fairValueLtvPct != null && fairValueLtvPct > 100) {
    notes.push('Modeled fair value is below debt basis, so refinance risk is elevated under the active assumptions.');
  }
  if (combinedStressDscr != null && combinedStressDscr < 1) {
    notes.push('Combined rent and rate stress pushes DSCR below 1.0x.');
  }

  return {
    status: 'ready',
    ltv: round4(ltv * 100),
    loan_rate_pct: round4(loanRateDec * 100),
    loan_term_years: loanTermYears,
    debt_per_acre: round2(debtPerAcreReady),
    annual_debt_service_per_acre: round2(annualDebtServicePerAcre),
    debt_yield_pct: debtYieldPct != null ? round4(debtYieldPct) : null,
    break_even_rent: breakEvenRent != null ? round2(breakEvenRent) : null,
    base_dscr: round4(baseDscr),
    rent_stress_pct: round4(rentStressPct),
    stressed_noi_per_acre: stressedNoiPerAcre != null ? round2(stressedNoiPerAcre) : null,
    rent_stress_dscr: rentStressDscr != null ? round4(rentStressDscr) : null,
    rate_shock_bps: round2(rateShockBps),
    stressed_loan_rate_pct: round4(stressedLoanRateDec * 100),
    stressed_annual_debt_service_per_acre: stressedAnnualDebtServicePerAcre != null ? round2(stressedAnnualDebtServicePerAcre) : null,
    rate_stress_dscr: rateStressDscr != null ? round4(rateStressDscr) : null,
    combined_stress_dscr: combinedStressDscr != null ? round4(combinedStressDscr) : null,
    value_decline_to_100_ltv_pct: round4((1 - ltv) * 100),
    fair_value_ltv_pct: fairValueLtvPct != null ? round4(fairValueLtvPct) : null,
    fair_value_equity_cushion_pct: fairValueEquityCushionPct != null ? round4(fairValueEquityCushionPct) : null,
    notes,
  };
}
