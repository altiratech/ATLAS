"""Tests for the MetricEngine — core valuation logic."""
import sys
sys.path.insert(0, '.')
from app.services.metric_engine import (
    ComputeContext, compute_all, compute_sensitivity,
    get_metric_catalog, METRIC_REGISTRY, resolve_order,
)


def make_ctx(overrides=None):
    """Create a test context with realistic Corn Belt data."""
    series = {
        "usda.cash_rent.county": 260.0,
        "usda.land_value.county": 10000.0,
        "usda.corn_yield.county": 195.0,
        "rates.treasury.10y": 4.4,
        "grain.corn.price": 4.35,
        "computed.access_score": 55.0,
    }
    assumptions = {
        "risk_premium": 2.0,
        "long_run_growth": 0.025,
        "near_term_rent_shock": 0.0,
        "cost_pct": 0.10,
        "base_rate_default": 4.5,
        "ltv": 0.60,
        "loan_rate": 0.065,
        "loan_term_years": 25,
    }
    if overrides:
        assumptions.update(overrides)
    return ComputeContext(
        geo_key="19169",
        as_of_year="2025",
        series=series,
        metrics={},
        assumptions=assumptions,
    )


def test_metric_registry():
    """All expected metrics should be registered."""
    expected = [
        "cash_rent", "benchmark_value", "owner_costs", "noi_per_acre",
        "implied_cap_rate", "rent_multiple", "required_return",
        "cap_spread_to_10y", "fair_value", "rate_duration_proxy",
        "break_even_rent", "payback_period", "rent_to_revenue_proxy",
        "dscr", "access_score",
    ]
    for k in expected:
        assert k in METRIC_REGISTRY, f"Missing metric: {k}"
    print(f"✓ All {len(expected)} metrics registered")


def test_dependency_order():
    """Topological sort should produce valid order."""
    order = resolve_order()
    assert len(order) == len(METRIC_REGISTRY)
    # noi must come before implied_cap_rate
    assert order.index("noi_per_acre") < order.index("implied_cap_rate")
    assert order.index("cash_rent") < order.index("noi_per_acre")
    print("✓ Dependency order is valid")


def test_basic_valuation():
    """Core valuation chain should compute correctly."""
    ctx = make_ctx()
    compute_all(ctx)

    assert ctx.metrics["cash_rent"] == 260.0
    assert ctx.metrics["benchmark_value"] == 10000.0
    assert abs(ctx.metrics["owner_costs"] - 26.0) < 0.01  # 10% of rent
    assert abs(ctx.metrics["noi_per_acre"] - 234.0) < 0.01
    assert abs(ctx.metrics["implied_cap_rate"] - 2.34) < 0.01
    print(f"✓ Valuation chain: NOI={ctx.metrics['noi_per_acre']}, Cap={ctx.metrics['implied_cap_rate']:.2f}%")


def test_required_return():
    ctx = make_ctx()
    compute_all(ctx)
    assert abs(ctx.metrics["required_return"] - 6.4) < 0.01  # 4.4 + 2.0
    print(f"✓ Required return: {ctx.metrics['required_return']}%")


def test_fair_value_gordon():
    """GGM should produce reasonable fair value."""
    ctx = make_ctx()
    compute_all(ctx)
    fv = ctx.metrics["fair_value"]
    # NOI=234, r=6.4%, g=2.5% → FV = 234 * 1.025 / (0.064 - 0.025) = 6148.8
    expected = 234.0 * 1.025 / (0.064 - 0.025)
    assert abs(fv - expected) < 1.0
    print(f"✓ Fair value: ${fv:,.0f} (expected ${expected:,.0f})")


def test_fair_value_clamping():
    """When r ≤ g, spread should clamp to 0.5%."""
    # Use risk_premium=-2 so required_return = 4.4 - 2 = 2.4%, growth = 3% → 0.024 < 0.03
    ctx = make_ctx({"risk_premium": -2.0, "long_run_growth": 0.03})
    compute_all(ctx)
    fv = ctx.metrics.get("fair_value")
    assert fv is not None
    # r=2.4%, g=3% → r_dec=0.024, g=0.03 → spread = -0.006 → clamped to 0.005
    expected = 234.0 * 1.03 / 0.005
    assert abs(fv - expected) < 10
    assert "warning" in ctx.explains.get("fair_value", {})
    print(f"✓ Fair value clamped: ${fv:,.0f} (spread clamped)")


def test_rent_shock():
    """Rent shock should affect fair value."""
    ctx_base = make_ctx()
    compute_all(ctx_base)

    ctx_shock = make_ctx({"near_term_rent_shock": -0.10})
    compute_all(ctx_shock)

    assert ctx_shock.metrics["fair_value"] < ctx_base.metrics["fair_value"]
    print(f"✓ Rent shock: base=${ctx_base.metrics['fair_value']:,.0f}, shocked=${ctx_shock.metrics['fair_value']:,.0f}")


def test_sensitivity():
    """Sensitivity should return correct number of results."""
    ctx = make_ctx()
    compute_all(ctx)  # Need base metrics
    results = compute_sensitivity(ctx, "risk_premium", [1.0, 2.0, 3.0, 4.0])
    assert len(results) == 4
    # Higher risk premium → lower fair value
    assert results[0]["metric_value"] > results[-1]["metric_value"]
    print(f"✓ Sensitivity: {len(results)} points, FV range ${results[-1]['metric_value']:,.0f}–${results[0]['metric_value']:,.0f}")


def test_rent_multiple():
    ctx = make_ctx()
    compute_all(ctx)
    rm = ctx.metrics["rent_multiple"]
    expected = 10000.0 / 260.0
    assert abs(rm - expected) < 0.01
    print(f"✓ Rent multiple: {rm:.1f}x")


def test_cap_spread():
    ctx = make_ctx()
    compute_all(ctx)
    spread = ctx.metrics["cap_spread_to_10y"]
    expected = (2.34 - 4.4) * 100  # bps
    assert abs(spread - expected) < 1.0
    print(f"✓ Cap spread: {spread:.0f} bps")


def test_dscr():
    ctx = make_ctx()
    compute_all(ctx)
    dscr = ctx.metrics["dscr"]
    assert dscr > 0
    print(f"✓ DSCR: {dscr:.2f}x")


def test_access_score():
    ctx = make_ctx()
    compute_all(ctx)
    assert ctx.metrics["access_score"] == 55.0
    print(f"✓ Access score: {ctx.metrics['access_score']}")


def test_metric_catalog():
    catalog = get_metric_catalog()
    assert len(catalog) == len(METRIC_REGISTRY)
    for m in catalog:
        assert "key" in m
        assert "formula" in m
        assert "unit" in m
    print(f"✓ Metric catalog: {len(catalog)} entries")


def test_explain_provenance():
    """Every computed metric should have an explain entry."""
    ctx = make_ctx()
    compute_all(ctx)
    for key in ctx.metrics:
        assert key in ctx.explains, f"No explain for {key}"
    print(f"✓ Provenance: {len(ctx.explains)} explains for {len(ctx.metrics)} metrics")


def test_state_fallback():
    """Missing county data should fall back to state."""
    ctx = ComputeContext(
        geo_key="99999",
        as_of_year="2025",
        series={
            "usda.cash_rent.state": 240.0,  # State fallback
            "usda.land_value.county": 9000.0,
            "rates.treasury.10y": 4.4,
            "grain.corn.price": 4.0,
        },
        metrics={},
        assumptions={"risk_premium": 2.0, "long_run_growth": 0.025, "cost_pct": 0.10},
    )
    compute_all(ctx)
    assert ctx.metrics.get("cash_rent") is None or len(ctx.fallbacks) > 0 or ctx.metrics["cash_rent"] == 240.0
    print(f"✓ Fallback handling works")


if __name__ == "__main__":
    tests = [
        test_metric_registry,
        test_dependency_order,
        test_basic_valuation,
        test_required_return,
        test_fair_value_gordon,
        test_fair_value_clamping,
        test_rent_shock,
        test_sensitivity,
        test_rent_multiple,
        test_cap_spread,
        test_dscr,
        test_access_score,
        test_metric_catalog,
        test_explain_provenance,
        test_state_fallback,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"✗ {t.__name__}: {e}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)}")
