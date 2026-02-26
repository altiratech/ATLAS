"""
Portfolio analytics — compute weighted metrics, diversification, and returns
for a multi-county farmland portfolio.
"""
from __future__ import annotations
import math
from typing import Any


def compute_portfolio_metrics(
    holdings: list[dict],
    county_data: dict[str, dict],
) -> dict:
    """
    Compute portfolio-level metrics from individual county computations.

    holdings: [{geo_key, acres, purchase_price_per_acre, ...}]
    county_data: {fips: {metrics: {...}, county_name, state, ...}}
    """
    if not holdings or not county_data:
        return {"error": "No holdings or county data"}

    total_acres = sum(h["acres"] for h in holdings)
    if total_acres == 0:
        return {"error": "Total acres is zero"}

    # Weighted metrics
    weighted_metrics: dict[str, float] = {}
    metric_keys = [
        "cash_rent", "benchmark_value", "noi_per_acre", "implied_cap_rate",
        "fair_value", "rent_multiple", "required_return", "cap_spread_to_10y",
        "access_score", "dscr", "payback_period",
    ]

    for mk in metric_keys:
        total = 0.0
        weight_sum = 0.0
        for h in holdings:
            cd = county_data.get(h["geo_key"], {})
            m = cd.get("metrics", {})
            val = m.get(mk)
            if val is not None:
                w = h["acres"]
                total += val * w
                weight_sum += w
        if weight_sum > 0:
            weighted_metrics[mk] = round(total / weight_sum, 4)

    # Portfolio value
    total_current_value = 0.0
    total_fair_value = 0.0
    total_purchase_value = 0.0
    total_annual_noi = 0.0

    holding_details = []
    for h in holdings:
        cd = county_data.get(h["geo_key"], {})
        m = cd.get("metrics", {})
        acres = h["acres"]
        bv = m.get("benchmark_value", 0) or 0
        fv = m.get("fair_value", 0) or 0
        noi = m.get("noi_per_acre", 0) or 0
        pp = h.get("purchase_price_per_acre") or bv

        current_val = bv * acres
        fair_val = fv * acres
        purchase_val = pp * acres
        annual_noi = noi * acres

        total_current_value += current_val
        total_fair_value += fair_val
        total_purchase_value += purchase_val
        total_annual_noi += annual_noi

        unrealized_gain = current_val - purchase_val
        unrealized_gain_pct = (unrealized_gain / purchase_val * 100) if purchase_val > 0 else 0

        holding_details.append({
            "geo_key": h["geo_key"],
            "county_name": cd.get("county_name", h["geo_key"]),
            "state": cd.get("state", ""),
            "acres": acres,
            "weight_pct": round(acres / total_acres * 100, 1),
            "purchase_price": round(pp, 0),
            "current_value_acre": round(bv, 0),
            "fair_value_acre": round(fv, 0),
            "noi_acre": round(noi, 2),
            "implied_cap": round(m.get("implied_cap_rate", 0) or 0, 2),
            "access_score": round(m.get("access_score", 0) or 0, 1),
            "total_value": round(current_val, 0),
            "annual_noi": round(annual_noi, 0),
            "unrealized_gain": round(unrealized_gain, 0),
            "unrealized_gain_pct": round(unrealized_gain_pct, 1),
        })

    # State diversification
    state_exposure: dict[str, float] = {}
    for h in holdings:
        cd = county_data.get(h["geo_key"], {})
        st = cd.get("state", "?")
        state_exposure[st] = state_exposure.get(st, 0) + h["acres"]
    state_pcts = {s: round(a / total_acres * 100, 1) for s, a in state_exposure.items()}

    # Herfindahl-Hirschman Index (concentration)
    hhi = sum((a / total_acres * 100) ** 2 for a in state_exposure.values())

    # Portfolio yield
    portfolio_yield = (total_annual_noi / total_current_value * 100) if total_current_value > 0 else 0

    return {
        "total_acres": round(total_acres, 0),
        "total_current_value": round(total_current_value, 0),
        "total_fair_value": round(total_fair_value, 0),
        "total_purchase_value": round(total_purchase_value, 0),
        "total_annual_noi": round(total_annual_noi, 0),
        "portfolio_yield_pct": round(portfolio_yield, 2),
        "unrealized_gain": round(total_current_value - total_purchase_value, 0),
        "unrealized_gain_pct": round(
            (total_current_value - total_purchase_value) / total_purchase_value * 100, 1
        ) if total_purchase_value > 0 else 0,
        "weighted_metrics": weighted_metrics,
        "holdings": holding_details,
        "state_exposure": state_pcts,
        "hhi": round(hhi, 0),
        "diversification_rating": (
            "Excellent" if hhi < 2500 else
            "Good" if hhi < 4000 else
            "Moderate" if hhi < 6000 else
            "Concentrated"
        ),
        "num_counties": len(holdings),
        "num_states": len(state_exposure),
    }
