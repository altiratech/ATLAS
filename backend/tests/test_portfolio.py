"""Tests for portfolio analytics service."""
import pytest
from app.services.portfolio import compute_portfolio_metrics


def _mock_county(cash_rent=250, bv=8000, noi=180, cap=2.25, fv=7200, access=65, state="IA", name="Test County"):
    return {
        "county_name": name,
        "state": state,
        "metrics": {
            "cash_rent": cash_rent,
            "benchmark_value": bv,
            "noi_per_acre": noi,
            "implied_cap_rate": cap,
            "fair_value": fv,
            "rent_multiple": bv / cash_rent if cash_rent else 0,
            "required_return": 0.065,
            "cap_spread_to_10y": 120,
            "access_score": access,
            "dscr": 1.8,
            "payback_period": bv / noi if noi else 0,
        },
    }


class TestPortfolioMetrics:
    def test_empty_holdings(self):
        result = compute_portfolio_metrics([], {})
        assert "error" in result

    def test_no_county_data(self):
        result = compute_portfolio_metrics([{"geo_key": "19153", "acres": 100}], {})
        assert "error" in result

    def test_single_holding(self):
        holdings = [{"geo_key": "19153", "acres": 200, "purchase_price_per_acre": 7000}]
        county_data = {"19153": _mock_county()}
        result = compute_portfolio_metrics(holdings, county_data)

        assert result["total_acres"] == 200
        assert result["num_counties"] == 1
        assert result["num_states"] == 1
        assert result["total_current_value"] == 200 * 8000  # 1,600,000
        assert result["total_purchase_value"] == 200 * 7000  # 1,400,000
        assert result["unrealized_gain"] == 200 * (8000 - 7000)  # 200,000
        assert len(result["holdings"]) == 1
        assert result["holdings"][0]["weight_pct"] == 100.0

    def test_multi_holding_weights(self):
        holdings = [
            {"geo_key": "19153", "acres": 300, "purchase_price_per_acre": 7000},
            {"geo_key": "17113", "acres": 200, "purchase_price_per_acre": 8500},
        ]
        county_data = {
            "19153": _mock_county(state="IA", name="Polk, IA"),
            "17113": _mock_county(bv=9000, state="IL", name="McLean, IL"),
        }
        result = compute_portfolio_metrics(holdings, county_data)

        assert result["total_acres"] == 500
        assert result["num_counties"] == 2
        assert result["num_states"] == 2
        # Weight checks
        h = {h["geo_key"]: h for h in result["holdings"]}
        assert h["19153"]["weight_pct"] == 60.0
        assert h["17113"]["weight_pct"] == 40.0

    def test_diversification_rating(self):
        # Single state = Concentrated
        holdings = [{"geo_key": "19153", "acres": 100}]
        county_data = {"19153": _mock_county(state="IA")}
        result = compute_portfolio_metrics(holdings, county_data)
        assert result["diversification_rating"] == "Concentrated"  # HHI = 10000

    def test_multi_state_diversification(self):
        holdings = [
            {"geo_key": "19153", "acres": 100},
            {"geo_key": "17113", "acres": 100},
            {"geo_key": "18057", "acres": 100},
            {"geo_key": "27001", "acres": 100},
            {"geo_key": "39001", "acres": 100},
        ]
        county_data = {
            "19153": _mock_county(state="IA"),
            "17113": _mock_county(state="IL"),
            "18057": _mock_county(state="IN"),
            "27001": _mock_county(state="MN"),
            "39001": _mock_county(state="OH"),
        }
        result = compute_portfolio_metrics(holdings, county_data)
        assert result["hhi"] == 2000  # 5 equal states: 5 * 20^2 = 2000
        assert result["diversification_rating"] == "Excellent"

    def test_weighted_metrics(self):
        holdings = [
            {"geo_key": "A", "acres": 100},
            {"geo_key": "B", "acres": 300},
        ]
        county_data = {
            "A": _mock_county(cash_rent=200, noi=150),
            "B": _mock_county(cash_rent=300, noi=220),
        }
        result = compute_portfolio_metrics(holdings, county_data)
        wm = result["weighted_metrics"]
        # Weighted cash rent = (200*100 + 300*300) / 400 = 110000/400 = 275
        assert wm["cash_rent"] == 275.0

    def test_portfolio_yield(self):
        holdings = [{"geo_key": "19153", "acres": 100}]
        county_data = {"19153": _mock_county(bv=10000, noi=250)}
        result = compute_portfolio_metrics(holdings, county_data)
        # Yield = (250*100) / (10000*100) * 100 = 2.5%
        assert result["portfolio_yield_pct"] == 2.5

    def test_purchase_price_fallback(self):
        """When no purchase price given, defaults to benchmark_value."""
        holdings = [{"geo_key": "19153", "acres": 100}]
        county_data = {"19153": _mock_county(bv=8000)}
        result = compute_portfolio_metrics(holdings, county_data)
        assert result["total_purchase_value"] == 100 * 8000
        assert result["unrealized_gain"] == 0

    def test_state_exposure(self):
        holdings = [
            {"geo_key": "A", "acres": 300},
            {"geo_key": "B", "acres": 100},
        ]
        county_data = {
            "A": _mock_county(state="IA"),
            "B": _mock_county(state="IL"),
        }
        result = compute_portfolio_metrics(holdings, county_data)
        assert result["state_exposure"]["IA"] == 75.0
        assert result["state_exposure"]["IL"] == 25.0
