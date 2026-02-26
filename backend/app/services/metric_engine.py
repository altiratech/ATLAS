"""
MetricEngine — DAG-based computation of all farmland metrics.

Every metric is a pure function of data series + other metrics + assumptions.
The engine resolves dependencies, computes in order, and records provenance.
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Any, Callable

# ── Registry ──────────────────────────────────────────────────────────

METRIC_REGISTRY: dict[str, "MetricSpec"] = {}


@dataclass
class MetricSpec:
    key: str
    label: str
    description: str
    unit: str
    category: str  # valuation / rent / access / risk / deal
    dependencies: list[str]  # series keys or metric keys
    formula: str  # human-readable formula
    compute: Callable  # (ctx) -> float | None
    version: int = 1


def register(spec: MetricSpec):
    METRIC_REGISTRY[spec.key] = spec
    return spec


@dataclass
class ComputeContext:
    """Everything a metric compute function needs."""
    geo_key: str
    as_of_year: str  # e.g. "2024"
    series: dict[str, float]  # series_key -> value
    metrics: dict[str, float]  # already-computed metrics
    assumptions: dict[str, Any]
    fallbacks: list[dict] = field(default_factory=list)
    explains: dict[str, dict] = field(default_factory=dict)

    def get_series(self, key: str, fallback_key: str | None = None) -> float | None:
        v = self.series.get(key)
        if v is not None:
            return v
        if fallback_key:
            v = self.series.get(fallback_key)
            if v is not None:
                self.fallbacks.append({
                    "geo_key": self.geo_key,
                    "series_key": key,
                    "fallback_to": fallback_key,
                    "type": "state_fallback"
                })
                return v
        return None

    def get_metric(self, key: str) -> float | None:
        return self.metrics.get(key)

    def get_assumption(self, key: str, default=None):
        return self.assumptions.get(key, default)


# ── Metric Definitions ────────────────────────────────────────────────

# 1) Cash Rent ($/acre)
register(MetricSpec(
    key="cash_rent",
    label="Cash Rent",
    description="USDA reported cash rent per acre",
    unit="$/acre",
    category="rent",
    dependencies=["usda.cash_rent.county"],
    formula="cash_rent = USDA county cash rent (state fallback)",
    compute=lambda ctx: ctx.get_series("usda.cash_rent.county", "usda.cash_rent.state"),
))

# 2) Benchmark Land Value
register(MetricSpec(
    key="benchmark_value",
    label="Benchmark Land Value",
    description="USDA reported land value per acre",
    unit="$/acre",
    category="valuation",
    dependencies=["usda.land_value.county"],
    formula="benchmark_value = USDA county land value (state fallback)",
    compute=lambda ctx: ctx.get_series("usda.land_value.county", "usda.land_value.state"),
))

# 3) Owner-paid costs
register(MetricSpec(
    key="owner_costs",
    label="Owner-Paid Costs",
    description="Taxes + insurance + maintenance per acre",
    unit="$/acre",
    category="valuation",
    dependencies=["cash_rent"],
    formula="owner_costs = cash_rent × cost_pct (assumption, default 10%)",
    compute=lambda ctx: (
        (ctx.get_metric("cash_rent") or 0) * ctx.get_assumption("cost_pct", 0.10)
    ),
))

# 4) NOI per acre
register(MetricSpec(
    key="noi_per_acre",
    label="NOI per Acre",
    description="Net Operating Income = Cash Rent − Owner Costs",
    unit="$/acre",
    category="valuation",
    dependencies=["cash_rent", "owner_costs"],
    formula="noi_per_acre = cash_rent - owner_costs",
    compute=lambda ctx: (
        (ctx.get_metric("cash_rent") or 0) - (ctx.get_metric("owner_costs") or 0)
    ) if ctx.get_metric("cash_rent") else None,
))

# 5) Implied Cap Rate
register(MetricSpec(
    key="implied_cap_rate",
    label="Implied Cap Rate",
    description="NOI / Benchmark Value",
    unit="%",
    category="valuation",
    dependencies=["noi_per_acre", "benchmark_value"],
    formula="implied_cap_rate = noi_per_acre / benchmark_value",
    compute=lambda ctx: (
        (ctx.get_metric("noi_per_acre") / ctx.get_metric("benchmark_value")) * 100
        if ctx.get_metric("benchmark_value") and ctx.get_metric("benchmark_value") > 0
        else None
    ),
))

# 6) Rent Multiple
register(MetricSpec(
    key="rent_multiple",
    label="Rent Multiple",
    description="Benchmark Value / Cash Rent (price-to-rent ratio)",
    unit="x",
    category="valuation",
    dependencies=["benchmark_value", "cash_rent"],
    formula="rent_multiple = benchmark_value / cash_rent",
    compute=lambda ctx: (
        ctx.get_metric("benchmark_value") / ctx.get_metric("cash_rent")
        if ctx.get_metric("cash_rent") and ctx.get_metric("cash_rent") > 0
        else None
    ),
))

# 7) Required Return
register(MetricSpec(
    key="required_return",
    label="Required Return",
    description="Base rate + risk premium",
    unit="%",
    category="valuation",
    dependencies=["rates.treasury.10y"],
    formula="required_return = base_rate + risk_premium",
    compute=lambda ctx: (
        (ctx.get_series("rates.treasury.10y") or ctx.get_assumption("base_rate_default", 4.5))
        + ctx.get_assumption("risk_premium", 2.0)
    ),
))

# 8) Cap Spread to 10Y
register(MetricSpec(
    key="cap_spread_to_10y",
    label="Cap Spread to 10Y",
    description="Implied cap rate minus 10-year Treasury yield",
    unit="bps",
    category="valuation",
    dependencies=["implied_cap_rate", "rates.treasury.10y"],
    formula="cap_spread = implied_cap_rate - 10y_rate (in bps)",
    compute=lambda ctx: (
        ((ctx.get_metric("implied_cap_rate") or 0) -
         (ctx.get_series("rates.treasury.10y") or 0)) * 100
        if ctx.get_metric("implied_cap_rate") is not None
        else None
    ),
))

# 9) Fair Value (Gordon Growth Model)
register(MetricSpec(
    key="fair_value",
    label="Fair Value (GGM)",
    description="Gordon Growth Model: NOI×(1+g) / (r - g) with guardrails",
    unit="$/acre",
    category="valuation",
    dependencies=["noi_per_acre", "required_return"],
    formula="fair_value = noi × (1+g) / (r - g); clamp if r ≤ g",
    compute=lambda ctx: _compute_fair_value(ctx),
))


def _compute_fair_value(ctx: ComputeContext) -> float | None:
    noi = ctx.get_metric("noi_per_acre")
    r = ctx.get_metric("required_return")
    if noi is None or r is None:
        return None
    r_dec = r / 100.0
    g = ctx.get_assumption("long_run_growth", 0.025)
    rent_shock = ctx.get_assumption("near_term_rent_shock", 0.0)
    noi_adj = noi * (1 + rent_shock) * (1 + g)
    spread = r_dec - g
    if spread <= 0.005:
        ctx.explains["fair_value"] = {
            "warning": "required_return ≤ growth; clamped spread to 0.5%"
        }
        spread = 0.005
    return noi_adj / spread


# 10) Rate Duration Proxy
register(MetricSpec(
    key="rate_duration_proxy",
    label="Rate Duration Proxy",
    description="Approx value change per +100bps in required return",
    unit="$/acre per 100bps",
    category="valuation",
    dependencies=["noi_per_acre", "required_return"],
    formula="Δvalue ≈ fair_value(r) - fair_value(r+1%)",
    compute=lambda ctx: _compute_duration(ctx),
))


def _compute_duration(ctx: ComputeContext) -> float | None:
    noi = ctx.get_metric("noi_per_acre")
    r = ctx.get_metric("required_return")
    if noi is None or r is None:
        return None
    r_dec = r / 100.0
    g = ctx.get_assumption("long_run_growth", 0.025)
    noi_g = noi * (1 + g)

    def fv(rate):
        s = rate - g
        if s <= 0.005:
            s = 0.005
        return noi_g / s

    return fv(r_dec) - fv(r_dec + 0.01)


# 11) Break-even Rent at Price
register(MetricSpec(
    key="break_even_rent",
    label="Break-even Rent at Price",
    description="Rent needed for cap rate = required return",
    unit="$/acre",
    category="valuation",
    dependencies=["required_return", "benchmark_value"],
    formula="break_even_rent = benchmark_value × (required_return/100) / (1 - cost_pct)",
    compute=lambda ctx: (
        (ctx.get_metric("benchmark_value") or 0) *
        ((ctx.get_metric("required_return") or 0) / 100) /
        (1 - ctx.get_assumption("cost_pct", 0.10))
        if ctx.get_metric("benchmark_value") and ctx.get_metric("required_return")
        else None
    ),
))

# 12) Payback Period
register(MetricSpec(
    key="payback_period",
    label="Payback Period",
    description="Benchmark value / NOI (years to recoup)",
    unit="years",
    category="deal",
    dependencies=["benchmark_value", "noi_per_acre"],
    formula="payback_period = benchmark_value / noi_per_acre",
    compute=lambda ctx: (
        ctx.get_metric("benchmark_value") / ctx.get_metric("noi_per_acre")
        if ctx.get_metric("noi_per_acre") and ctx.get_metric("noi_per_acre") > 0
        else None
    ),
))

# 13) Rent-to-Revenue Proxy
register(MetricSpec(
    key="rent_to_revenue_proxy",
    label="Rent / Revenue Proxy",
    description="Cash rent as % of estimated crop revenue (yield × grain price)",
    unit="%",
    category="rent",
    dependencies=["cash_rent", "usda.corn_yield.county", "grain.corn.price"],
    formula="rent_pct = cash_rent / (yield × grain_price) × 100",
    compute=lambda ctx: _rent_to_rev(ctx),
))


def _rent_to_rev(ctx: ComputeContext) -> float | None:
    rent = ctx.get_metric("cash_rent")
    yld = ctx.get_series("usda.corn_yield.county", "usda.corn_yield.state")
    px = ctx.get_series("grain.corn.price")
    if rent and yld and px and yld * px > 0:
        return (rent / (yld * px)) * 100
    return None


# 14) DSCR (simple stub for future underwriting)
register(MetricSpec(
    key="dscr",
    label="DSCR",
    description="Debt Service Coverage Ratio (NOI / annual debt service)",
    unit="x",
    category="deal",
    dependencies=["noi_per_acre", "benchmark_value"],
    formula="dscr = noi / debt_service; debt = value × LTV × rate / amort_factor",
    compute=lambda ctx: _compute_dscr(ctx),
))


def _compute_dscr(ctx: ComputeContext) -> float | None:
    noi = ctx.get_metric("noi_per_acre")
    value = ctx.get_metric("benchmark_value")
    if not noi or not value:
        return None
    ltv = ctx.get_assumption("ltv", 0.60)
    loan_rate = ctx.get_assumption("loan_rate", 0.065)
    loan_term = ctx.get_assumption("loan_term_years", 25)
    loan = value * ltv
    if loan_rate <= 0:
        return None
    # Monthly payment → annual
    mr = loan_rate / 12
    n = loan_term * 12
    pmt = loan * (mr * (1 + mr) ** n) / ((1 + mr) ** n - 1)
    annual_ds = pmt * 12
    if annual_ds <= 0:
        return None
    return noi / annual_ds


# 15) Access Score (computed separately, but registered here for catalog)
register(MetricSpec(
    key="access_score",
    label="Market Access Score",
    description="0–100 composite score based on facility proximity & density",
    unit="score",
    category="access",
    dependencies=["poi_facilities"],
    formula="Weighted proximity + density score across facility types",
    compute=lambda ctx: ctx.get_series("computed.access_score"),  # pre-computed
))


# ── Engine ────────────────────────────────────────────────────────────

def resolve_order() -> list[str]:
    """Topological sort of metrics by dependencies."""
    visited: set[str] = set()
    order: list[str] = []

    def visit(key: str):
        if key in visited:
            return
        visited.add(key)
        spec = METRIC_REGISTRY.get(key)
        if spec:
            for dep in spec.dependencies:
                if dep in METRIC_REGISTRY:
                    visit(dep)
        order.append(key)

    for k in METRIC_REGISTRY:
        visit(k)
    return order


def compute_all(ctx: ComputeContext) -> dict[str, float | None]:
    """Compute all registered metrics in dependency order."""
    order = resolve_order()
    for key in order:
        spec = METRIC_REGISTRY.get(key)
        if spec:
            try:
                val = spec.compute(ctx)
                if val is not None:
                    ctx.metrics[key] = val
                    existing = ctx.explains.get(key, {})
                    ctx.explains[key] = {
                        "formula": spec.formula,
                        "value": round(val, 4),
                        "unit": spec.unit,
                        "dependencies": spec.dependencies,
                        **existing,
                    }
            except Exception as e:
                ctx.explains[key] = {"error": str(e)}
    return ctx.metrics


def compute_sensitivity(
    base_ctx: ComputeContext,
    vary_param: str,
    values: list[float],
    target_metric: str = "fair_value",
) -> list[dict]:
    """Vary one assumption and return target metric for each value."""
    results = []
    for v in values:
        ctx_copy = ComputeContext(
            geo_key=base_ctx.geo_key,
            as_of_year=base_ctx.as_of_year,
            series=dict(base_ctx.series),
            metrics={},
            assumptions={**base_ctx.assumptions, vary_param: v},
        )
        compute_all(ctx_copy)
        results.append({
            "param": vary_param,
            "param_value": v,
            "metric": target_metric,
            "metric_value": ctx_copy.metrics.get(target_metric),
        })
    return results


def get_metric_catalog() -> list[dict]:
    """Return all metric definitions for the UI."""
    return [
        {
            "key": s.key,
            "label": s.label,
            "description": s.description,
            "unit": s.unit,
            "category": s.category,
            "formula": s.formula,
            "dependencies": s.dependencies,
            "version": s.version,
        }
        for s in METRIC_REGISTRY.values()
    ]
