/**
 * Metric Engine — 15-metric DAG computation engine.
 * Ported from Python backend/app/services/metric_engine.py
 *
 * Assumptions are a plain dict matching Python keys:
 *   risk_premium, long_run_growth, cost_pct, near_term_rent_shock,
 *   ltv, loan_rate, loan_term_years, grain_price, base_rate_default
 */

// ── Types ───────────────────────────────────────────────────────────

/** Assumptions are a flexible dict — keys match the Python metric engine exactly. */
export type Assumptions = Record<string, number>;

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  risk_premium: 2.0,
  long_run_growth: 0.025,
  cost_pct: 0.10,
  near_term_rent_shock: 0.0,
  ltv: 0.60,
  loan_rate: 0.065,
  loan_term_years: 25,
  grain_price: 4.5,
  base_rate_default: 4.5,
};

/** Series data — flexible dict matching Python series keys. */
export type SeriesData = Record<string, number>;

export interface ComputeContext {
  geoKey: string;
  asOfYear: string;
  series: SeriesData;
  assumptions: Assumptions;
  metrics: Record<string, number>;
  explains: Record<string, MetricExplain>;
  fallbacks: string[];
}

export interface MetricExplain {
  formula?: string;
  value?: number;
  unit?: string;
  dependencies?: Record<string, number> | string[];
  warning?: string;
  error?: string;
}

interface MetricDef {
  key: string;
  label: string;
  unit: string;
  category: string;
  description: string;
  formula: string;
  dependencies: string[];
  compute: (ctx: ComputeContext) => number | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function getSeries(ctx: ComputeContext, key: string, fallback?: string): number | null {
  const v = ctx.series[key];
  if (v != null) return v;
  if (fallback) {
    const fb = ctx.series[fallback];
    if (fb != null) {
      ctx.fallbacks.push(`${key} → ${fallback}`);
      return fb;
    }
  }
  return null;
}

function getAssumption(ctx: ComputeContext, key: string, defaultVal: number): number {
  return ctx.assumptions[key] ?? defaultVal;
}

// ── Metric Registry ────────────────────────────────────────────────

export const METRIC_REGISTRY: MetricDef[] = [
  // 1) Cash Rent
  {
    key: 'cash_rent',
    label: 'Cash Rent',
    unit: '$/acre',
    category: 'rent',
    description: 'USDA reported cash rent per acre',
    formula: 'cash_rent = USDA county cash rent (state fallback)',
    dependencies: [],
    compute: (ctx) => {
      // In the D1 version, series keys are simplified: cash_rent, land_value, etc.
      // The query layer already handles county→state→national fallback.
      return ctx.series.cash_rent ?? null;
    },
  },
  // 2) Benchmark Land Value
  {
    key: 'benchmark_value',
    label: 'Benchmark Land Value',
    unit: '$/acre',
    category: 'valuation',
    description: 'USDA reported land value per acre',
    formula: 'benchmark_value = USDA county land value (state fallback)',
    dependencies: [],
    compute: (ctx) => ctx.series.land_value ?? null,
  },
  // 3) Owner-Paid Costs
  {
    key: 'owner_costs',
    label: 'Owner-Paid Costs',
    unit: '$/acre',
    category: 'valuation',
    description: 'Taxes + insurance + maintenance per acre',
    formula: 'owner_costs = cash_rent × cost_pct',
    dependencies: ['cash_rent'],
    compute: (ctx) => {
      const rent = ctx.metrics.cash_rent;
      if (rent == null) return null;
      return round2(rent * getAssumption(ctx, 'cost_pct', 0.10));
    },
  },
  // 4) NOI per Acre
  {
    key: 'noi_per_acre',
    label: 'NOI per Acre',
    unit: '$/acre',
    category: 'valuation',
    description: 'Net Operating Income = Cash Rent − Owner Costs',
    formula: 'noi_per_acre = cash_rent - owner_costs',
    dependencies: ['cash_rent', 'owner_costs'],
    compute: (ctx) => {
      const rent = ctx.metrics.cash_rent;
      const costs = ctx.metrics.owner_costs;
      if (rent == null) return null;
      return round2(rent - (costs ?? 0));
    },
  },
  // 5) Implied Cap Rate
  {
    key: 'implied_cap_rate',
    label: 'Implied Cap Rate',
    unit: '%',
    category: 'valuation',
    description: 'NOI / Benchmark Value × 100',
    formula: 'implied_cap_rate = noi_per_acre / benchmark_value × 100',
    dependencies: ['noi_per_acre', 'benchmark_value'],
    compute: (ctx) => {
      const noi = ctx.metrics.noi_per_acre;
      const bv = ctx.metrics.benchmark_value;
      if (noi == null || !bv || bv <= 0) return null;
      return round4((noi / bv) * 100);
    },
  },
  // 6) Rent Multiple
  {
    key: 'rent_multiple',
    label: 'Rent Multiple',
    unit: 'x',
    category: 'valuation',
    description: 'Benchmark Value / Cash Rent (price-to-rent ratio)',
    formula: 'rent_multiple = benchmark_value / cash_rent',
    dependencies: ['benchmark_value', 'cash_rent'],
    compute: (ctx) => {
      const bv = ctx.metrics.benchmark_value;
      const rent = ctx.metrics.cash_rent;
      if (!rent || rent <= 0 || bv == null) return null;
      return round2(bv / rent);
    },
  },
  // 7) Required Return
  {
    key: 'required_return',
    label: 'Required Return',
    unit: '%',
    category: 'valuation',
    description: 'Base rate + risk premium',
    formula: 'required_return = base_rate + risk_premium',
    dependencies: [],
    compute: (ctx) => {
      const baseRate = ctx.series.treasury_10y ?? getAssumption(ctx, 'base_rate_default', 4.5);
      const riskPremium = getAssumption(ctx, 'risk_premium', 2.0);
      return round4(baseRate + riskPremium);
    },
  },
  // 8) Cap Spread to 10Y
  {
    key: 'cap_spread_to_10y',
    label: 'Cap Spread to 10Y',
    unit: 'bps',
    category: 'valuation',
    description: 'Implied cap rate minus 10-year Treasury yield',
    formula: 'cap_spread = (implied_cap_rate - 10y_rate) × 100 bps',
    dependencies: ['implied_cap_rate'],
    compute: (ctx) => {
      const cap = ctx.metrics.implied_cap_rate;
      if (cap == null) return null;
      const treasury = ctx.series.treasury_10y ?? 0;
      return round2((cap - treasury) * 100);
    },
  },
  // 9) Fair Value (Gordon Growth Model)
  {
    key: 'fair_value',
    label: 'Fair Value (GGM)',
    unit: '$/acre',
    category: 'valuation',
    description: 'Gordon Growth Model: NOI×(1+g) / (r - g) with guardrails',
    formula: 'fair_value = noi × (1+g) / (r - g); clamp if r ≤ g',
    dependencies: ['noi_per_acre', 'required_return'],
    compute: (ctx) => {
      const noi = ctx.metrics.noi_per_acre;
      const r = ctx.metrics.required_return;
      if (noi == null || r == null) return null;

      const rDec = r / 100;
      const g = getAssumption(ctx, 'long_run_growth', 0.025);
      const rentShock = getAssumption(ctx, 'near_term_rent_shock', 0.0);
      const noiAdj = noi * (1 + rentShock) * (1 + g);
      let spread = rDec - g;

      if (spread <= 0.005) {
        ctx.explains.fair_value = {
          warning: 'required_return ≤ growth; clamped spread to 0.5%',
        };
        spread = 0.005;
      }
      return round2(noiAdj / spread);
    },
  },
  // 10) Rate Duration Proxy
  {
    key: 'rate_duration_proxy',
    label: 'Rate Duration Proxy',
    unit: '$/acre per 100bps',
    category: 'valuation',
    description: 'Approx value change per +100bps in required return',
    formula: 'Δvalue ≈ fair_value(r) - fair_value(r+1%)',
    dependencies: ['noi_per_acre', 'required_return'],
    compute: (ctx) => {
      const noi = ctx.metrics.noi_per_acre;
      const r = ctx.metrics.required_return;
      if (noi == null || r == null) return null;

      const rDec = r / 100;
      const g = getAssumption(ctx, 'long_run_growth', 0.025);
      const noiG = noi * (1 + g);

      const fv = (rate: number) => {
        let s = rate - g;
        if (s <= 0.005) s = 0.005;
        return noiG / s;
      };
      return round2(fv(rDec) - fv(rDec + 0.01));
    },
  },
  // 11) Break-even Rent at Price
  {
    key: 'break_even_rent',
    label: 'Break-even Rent at Price',
    unit: '$/acre',
    category: 'valuation',
    description: 'Rent needed for cap rate = required return',
    formula: 'break_even_rent = benchmark_value × (r/100) / (1 - cost_pct)',
    dependencies: ['required_return', 'benchmark_value'],
    compute: (ctx) => {
      const bv = ctx.metrics.benchmark_value;
      const r = ctx.metrics.required_return;
      if (!bv || !r) return null;
      const costPct = getAssumption(ctx, 'cost_pct', 0.10);
      return round2((bv * (r / 100)) / (1 - costPct));
    },
  },
  // 12) Payback Period
  {
    key: 'payback_period',
    label: 'Payback Period',
    unit: 'years',
    category: 'deal',
    description: 'Benchmark value / NOI (years to recoup)',
    formula: 'payback_period = benchmark_value / noi_per_acre',
    dependencies: ['benchmark_value', 'noi_per_acre'],
    compute: (ctx) => {
      const bv = ctx.metrics.benchmark_value;
      const noi = ctx.metrics.noi_per_acre;
      if (!noi || noi <= 0 || bv == null) return null;
      return round2(bv / noi);
    },
  },
  // 13) Rent-to-Revenue Proxy
  {
    key: 'rent_to_revenue_proxy',
    label: 'Rent / Revenue Proxy',
    unit: '%',
    category: 'rent',
    description: 'Cash rent as % of estimated crop revenue',
    formula: 'rent_pct = cash_rent / (yield × grain_price) × 100',
    dependencies: ['cash_rent'],
    compute: (ctx) => {
      const rent = ctx.metrics.cash_rent;
      const yld = ctx.series.corn_yield ?? ctx.series.soybean_yield ?? 180;
      const price = ctx.series.corn_price ?? getAssumption(ctx, 'grain_price', 4.5);
      if (!rent || !yld || !price || yld * price <= 0) return null;
      return round2((rent / (yld * price)) * 100);
    },
  },
  // 14) DSCR
  {
    key: 'dscr',
    label: 'DSCR',
    unit: 'x',
    category: 'deal',
    description: 'Debt Service Coverage Ratio (NOI / annual debt service)',
    formula: 'dscr = noi / debt_service; debt = value × LTV, amortized',
    dependencies: ['noi_per_acre', 'benchmark_value'],
    compute: (ctx) => {
      const noi = ctx.metrics.noi_per_acre;
      const bv = ctx.metrics.benchmark_value;
      if (!noi || !bv) return null;

      const ltv = getAssumption(ctx, 'ltv', 0.60);
      const loanRate = getAssumption(ctx, 'loan_rate', 0.065);
      const loanTerm = getAssumption(ctx, 'loan_term_years', 25);
      const loan = bv * ltv;

      if (loanRate <= 0) return null;
      const mr = loanRate / 12;
      const n = loanTerm * 12;
      const pmt = loan * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
      const annualDs = pmt * 12;
      if (annualDs <= 0) return null;
      return round2(noi / annualDs);
    },
  },
  // 15) Access Score
  {
    key: 'access_score',
    label: 'Market Access Score',
    unit: '0-100',
    category: 'access',
    description: 'Pre-computed facility proximity and density score',
    formula: 'Weighted proximity + density score across facility types',
    dependencies: [],
    compute: (ctx) => {
      // Access score is pre-computed and injected from DB via series
      return ctx.series['computed.access_score'] ?? null;
    },
  },
];

// ── DAG Resolution ──────────────────────────────────────────────────

function resolveOrder(): string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  const registry = new Map(METRIC_REGISTRY.map((m) => [m.key, m]));

  function visit(key: string) {
    if (seen.has(key)) return;
    seen.add(key);
    const metric = registry.get(key);
    if (!metric) return;
    for (const dep of metric.dependencies) {
      visit(dep);
    }
    resolved.push(key);
  }

  for (const m of METRIC_REGISTRY) {
    visit(m.key);
  }
  return resolved;
}

const METRIC_ORDER = resolveOrder();
const METRIC_REGISTRY_BY_KEY = new Map(METRIC_REGISTRY.map((m) => [m.key, m]));

// ── Main Compute ────────────────────────────────────────────────────

export function computeAll(ctx: ComputeContext): ComputeContext {
  for (const key of METRIC_ORDER) {
    const metric = METRIC_REGISTRY_BY_KEY.get(key)!;
    try {
      const val = metric.compute(ctx);
      if (val != null) {
        ctx.metrics[key] = val;
        // Merge with any existing explains (e.g., warnings set during compute)
        ctx.explains[key] = {
          formula: metric.formula,
          value: round4(val),
          unit: metric.unit,
          dependencies: metric.dependencies,
          ...ctx.explains[key],
        };
      }
    } catch (e: any) {
      ctx.explains[key] = { error: e.message ?? String(e) };
    }
  }
  return ctx;
}

export function createContext(
  geoKey: string,
  asOfYear: string,
  series: SeriesData,
  assumptions?: Assumptions,
  accessScore?: number,
): ComputeContext {
  const merged: Assumptions = { ...DEFAULT_ASSUMPTIONS, ...(assumptions ?? {}) };
  const ctx: ComputeContext = {
    geoKey,
    asOfYear,
    series,
    assumptions: merged,
    metrics: {},
    explains: {},
    fallbacks: [],
  };
  if (accessScore != null) {
    ctx.metrics.access_score = accessScore;
  }
  return ctx;
}

// ── Sensitivity ─────────────────────────────────────────────────────

export function computeSensitivity(
  baseCtx: ComputeContext,
  varyParam: string,
  values: number[],
  targetMetric: string = 'fair_value',
): { param: string; param_value: number; metric: string; metric_value: number | null }[] {
  return values.map((v) => {
    const ctx = createContext(
      baseCtx.geoKey,
      baseCtx.asOfYear,
      { ...baseCtx.series },
      { ...baseCtx.assumptions, [varyParam]: v },
    );
    computeAll(ctx);
    return {
      param: varyParam,
      param_value: v,
      metric: targetMetric,
      metric_value: ctx.metrics[targetMetric] ?? null,
    };
  });
}

// ── Catalog ─────────────────────────────────────────────────────────

export function getMetricCatalog() {
  return METRIC_REGISTRY.map((m) => ({
    key: m.key,
    label: m.label,
    unit: m.unit,
    category: m.category,
    description: m.description,
    formula: m.formula,
    dependencies: m.dependencies,
  }));
}
