"""Integration tests for the FastAPI endpoints."""
import pytest
import sys
import os

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.core.database import engine, Base
from app.models import schema  # noqa: registers models
from app.main import app
from app.seed import seed_if_empty


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    """Create tables and seed once for all tests in this module."""
    Base.metadata.create_all(bind=engine)
    seed_if_empty()
    yield


@pytest.fixture
def client():
    return TestClient(app)


# ── Frontend ──────────────────────────────────────────────────────
class TestFrontend:
    def test_serves_html(self, client):
        r = client.get("/")
        assert r.status_code == 200
        assert "Altira Atlas" in r.text

    def test_serves_altiratech_home(self, client):
        r = client.get("/altiratech-home.html")
        assert r.status_code == 200
        assert "Altira Tech" in r.text

    def test_serves_altiratech_home_clean(self, client):
        r = client.get("/altiratech-home")
        assert r.status_code == 200
        assert "Altira Tech" in r.text


# ── Metadata ──────────────────────────────────────────────────────
class TestMetadata:
    def test_list_metrics(self, client):
        r = client.get("/api/v1/metrics")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 10  # at least 10 metrics in catalog
        keys = {m["key"] for m in data}
        assert "cash_rent" in keys
        assert "fair_value" in keys

    def test_list_assumptions(self, client):
        r = client.get("/api/v1/assumptions")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert data[0]["name"] == "Default"

    def test_list_screens(self, client):
        r = client.get("/api/v1/screens")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1

    def test_list_sources(self, client):
        r = client.get("/api/v1/sources")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1


# ── Counties ──────────────────────────────────────────────────────
class TestCounties:
    def test_list_all(self, client):
        r = client.get("/api/v1/counties")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 45
        assert "fips" in data[0]
        assert "name" in data[0]

    def test_filter_by_state(self, client):
        r = client.get("/api/v1/counties?state=IA")
        assert r.status_code == 200
        data = r.json()
        assert all(c["state"] == "IA" for c in data)
        assert len(data) > 0

    def test_county_summary(self, client):
        r = client.get("/api/v1/geo/19153/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["geo_key"] == "19153"
        assert "metrics" in data
        m = data["metrics"]
        assert "cash_rent" in m
        assert "fair_value" in m
        assert "implied_cap_rate" in m
        assert m["cash_rent"] > 0

    def test_county_timeseries(self, client):
        r = client.get("/api/v1/geo/19153/timeseries?start_year=2020&end_year=2025")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 6  # 2020-2025
        assert "year" in data[0]
        assert "cash_rent" in data[0]

    def test_county_access(self, client):
        r = client.get("/api/v1/geo/19153/access")
        assert r.status_code == 200
        data = r.json()
        assert "access_score" in data


# ── Dashboard ─────────────────────────────────────────────────────
class TestDashboard:
    def test_dashboard(self, client):
        r = client.get("/api/v1/dashboard")
        assert r.status_code == 200
        data = r.json()
        assert data["county_count"] == 45
        assert "summary" in data
        assert "implied_cap_rate" in data["summary"]
        assert "median" in data["summary"]["implied_cap_rate"]
        assert "top_movers" in data
        assert len(data["top_movers"]) > 0
        assert "state_summary" in data


# ── Search ────────────────────────────────────────────────────────
class TestSearch:
    def test_search_county_name(self, client):
        r = client.get("/api/v1/search?q=Polk")
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert any(res["type"] == "county" for res in data)

    def test_search_state(self, client):
        r = client.get("/api/v1/search?q=Iowa")
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0

    def test_search_metric(self, client):
        r = client.get("/api/v1/search?q=cap rate")
        assert r.status_code == 200
        data = r.json()
        assert any(res["type"] == "metric" for res in data)


# ── Comparison ────────────────────────────────────────────────────
class TestComparison:
    def test_compare_two(self, client):
        r = client.get("/api/v1/compare?fips=19153,17113")
        assert r.status_code == 200
        data = r.json()
        assert "counties" in data
        assert len(data["counties"]) == 2

    def test_compare_limit_six(self, client):
        r = client.get("/api/v1/compare?fips=19153,17113,18057,19169,17019,27079,29195")
        data = r.json()
        assert len(data["counties"]) <= 6


# ── Screener ──────────────────────────────────────────────────────
class TestScreener:
    def test_basic_screen(self, client):
        r = client.get("/api/v1/screener")
        assert r.status_code == 200
        data = r.json()
        assert "count" in data
        assert data["count"] == 45
        assert "results" in data
        assert len(data["results"]) == 45

    def test_filtered_screen(self, client):
        r = client.get("/api/v1/screener?min_cap=2.5")
        assert r.status_code == 200
        data = r.json()
        # All results should have cap > 2.5
        for res in data["results"]:
            assert res["metrics"]["implied_cap_rate"] >= 2.5 or res["metrics"]["implied_cap_rate"] is None

    def test_state_filter(self, client):
        r = client.get("/api/v1/screener?state=IA")
        assert r.status_code == 200
        data = r.json()
        assert all(res["state"] == "IA" for res in data["results"])


# ── Watchlist ─────────────────────────────────────────────────────
class TestWatchlist:
    def test_get_watchlist(self, client):
        r = client.get("/api/v1/watchlist")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "fips" in data[0]
            assert "metrics" in data[0]
            assert "changes" in data[0]

    def test_add_remove_watchlist(self, client):
        # Use a county that exists in seed but isn't already watched
        test_fips = "19049"  # Dallas, IA

        # Remove first if already watched (from previous test runs)
        client.delete(f"/api/v1/watchlist/{test_fips}")

        # Add
        r = client.post("/api/v1/watchlist", json={"geo_key": test_fips})
        assert r.status_code == 200
        assert r.json()["status"] == "added"

        # Verify in list
        r = client.get("/api/v1/watchlist")
        fips_list = [w["fips"] for w in r.json()]
        assert test_fips in fips_list

        # Remove
        r = client.delete(f"/api/v1/watchlist/{test_fips}")
        assert r.status_code == 200

    def test_duplicate_add(self, client):
        client.post("/api/v1/watchlist", json={"geo_key": "19153"})
        r = client.post("/api/v1/watchlist", json={"geo_key": "19153"})
        assert r.json()["status"] == "already_watching"


# ── Notes ─────────────────────────────────────────────────────────
class TestNotes:
    def test_add_and_get_notes(self, client):
        # Add
        r = client.post("/api/v1/notes/19153", json={"content": "Test note from pytest"})
        assert r.status_code == 200
        note_id = r.json()["id"]

        # Get
        r = client.get("/api/v1/notes/19153")
        assert r.status_code == 200
        notes = r.json()
        assert any(n["id"] == note_id for n in notes)

        # Delete
        r = client.delete(f"/api/v1/notes/{note_id}")
        assert r.status_code == 200

    def test_delete_nonexistent_note(self, client):
        r = client.delete("/api/v1/notes/99999")
        assert r.status_code == 404


# ── Auth ──────────────────────────────────────────────────────────
class TestAuth:
    def test_bootstrap_creates_session(self, client):
        r = client.post("/api/v1/auth/bootstrap")
        assert r.status_code == 200
        data = r.json()
        assert data["token"]
        assert data["user_key"]
        assert "expires_at" in data

    def test_auth_me_with_token(self, client):
        session = client.post("/api/v1/auth/bootstrap").json()
        token = session["token"]
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["user_key"] == session["user_key"]
        assert data["token"] == token

    def test_logout_revokes_session(self, client):
        session = client.post("/api/v1/auth/bootstrap").json()
        token = session["token"]
        r = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

    def test_bootstrap_enforced_rejects_anon(self, monkeypatch):
        """When ALLOW_ANON_SESSIONS=0, bootstrap without identity returns 401."""
        import app.main as main_mod
        monkeypatch.setattr(main_mod, "ALLOW_ANON_SESSIONS", False)
        c = TestClient(app)
        r = c.post("/api/v1/auth/bootstrap")
        assert r.status_code == 401
        assert "required" in r.json().get("detail", "").lower()

    def test_bootstrap_enforced_allows_cf_access(self, monkeypatch):
        """When ALLOW_ANON_SESSIONS=0, CF Access identity still creates a session."""
        import app.main as main_mod
        monkeypatch.setattr(main_mod, "ALLOW_ANON_SESSIONS", False)
        c = TestClient(app)
        r = c.post("/api/v1/auth/bootstrap", headers={
            "cf-access-authenticated-user-email": "test@altiratech.com"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["token"]
        assert data["user_key"] == "test@altiratech.com"
        assert data["source"] == "cloudflare_access"
        assert data["is_anonymous"] is False

    def test_bootstrap_enforced_allows_existing_session(self, monkeypatch):
        """When ALLOW_ANON_SESSIONS=0, an existing valid token still works."""
        # First create a session while anon is allowed (default)
        c = TestClient(app)
        session = c.post("/api/v1/auth/bootstrap").json()
        token = session["token"]
        # Now disable anon sessions
        import app.main as main_mod
        monkeypatch.setattr(main_mod, "ALLOW_ANON_SESSIONS", False)
        # Existing token should still validate
        r = c.post("/api/v1/auth/bootstrap", headers={
            "Authorization": f"Bearer {token}"
        })
        assert r.status_code == 200
        assert r.json()["user_key"] == session["user_key"]


# ── Research Workspace ──────────────────────────────────────────────
class TestResearchWorkspace:
    USER_A = {"X-Atlas-User": "pytest-user-a@altira"}
    USER_B = {"X-Atlas-User": "pytest-user-b@altira"}

    def test_workspace_default(self, client):
        r = client.get("/api/v1/research/workspaces/19153", headers=self.USER_A)
        assert r.status_code == 200
        data = r.json()
        assert data["geo_key"] == "19153"
        assert isinstance(data["notes"], list)
        assert isinstance(data["scenario_packs"], list)

    def test_requires_user_identity(self, client):
        r = client.get("/api/v1/research/workspaces/19153")
        assert r.status_code == 401

    def test_workspace_upsert_and_children(self, client):
        fips = "19049"

        r = client.put(
            f"/api/v1/research/workspaces/{fips}",
            json={
                "thesis": "Test thesis for research persistence",
                "tags": ["cap-rate", "logistics"],
                "status": "diligence",
                "conviction": 72,
            },
            headers=self.USER_A,
        )
        assert r.status_code == 200
        workspace = r.json()
        assert workspace["geo_key"] == fips
        assert workspace["status"] == "diligence"
        assert round(workspace["conviction"]) == 72
        assert "cap-rate" in workspace["tags"]

        note = client.post(
            f"/api/v1/research/workspaces/{fips}/notes",
            json={"content": "Research note from pytest"},
            headers=self.USER_A,
        )
        assert note.status_code == 200
        note_id = note.json()["id"]

        pack = client.post(
            f"/api/v1/research/workspaces/{fips}/scenario-packs",
            json={
                "name": "pytest-pack",
                "risk_premium": 5.0,
                "growth_rate": 2.5,
                "rent_shock": -4,
            },
            headers=self.USER_A,
        )
        assert pack.status_code == 200
        pack_id = pack.json()["id"]

        r = client.get(f"/api/v1/research/workspaces/{fips}", headers=self.USER_A)
        assert r.status_code == 200
        ws = r.json()
        assert any(n["id"] == note_id for n in ws["notes"])
        assert any(p["id"] == pack_id for p in ws["scenario_packs"])

        r = client.delete(f"/api/v1/research/notes/{note_id}", headers=self.USER_A)
        assert r.status_code == 200
        r = client.delete(f"/api/v1/research/scenario-packs/{pack_id}", headers=self.USER_A)
        assert r.status_code == 200

    def test_workspace_isolation_by_user(self, client):
        fips = "19013"
        client.put(
            f"/api/v1/research/workspaces/{fips}",
            json={
                "thesis": "User A thesis",
                "tags": ["pytest"],
                "status": "watch",
                "conviction": 55,
            },
            headers=self.USER_A,
        )
        client.put(
            f"/api/v1/research/workspaces/{fips}",
            json={
                "thesis": "User B thesis",
                "tags": ["pytest-b"],
                "status": "diligence",
                "conviction": 66,
            },
            headers=self.USER_B,
        )

        r = client.get("/api/v1/research/workspaces", headers=self.USER_A)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(item["geo_key"] == fips for item in data)
        row = next(item for item in data if item["geo_key"] == fips)
        assert row["thesis"] == "User A thesis"

        r = client.get(f"/api/v1/research/workspaces/{fips}", headers=self.USER_B)
        assert r.status_code == 200
        assert r.json()["thesis"] == "User B thesis"

    def test_delete_nonexistent_research_items(self, client):
        r = client.delete("/api/v1/research/notes/999999", headers=self.USER_A)
        assert r.status_code == 404
        r = client.delete("/api/v1/research/scenario-packs/999999", headers=self.USER_A)
        assert r.status_code == 404


# ── Portfolios ────────────────────────────────────────────────────
class TestPortfolios:
    def test_list_portfolios(self, client):
        r = client.get("/api/v1/portfolios")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # seed creates "Corn Belt Core"

    def test_get_portfolio_detail(self, client):
        r = client.get("/api/v1/portfolios")
        pid = r.json()[0]["id"]

        r = client.get(f"/api/v1/portfolios/{pid}")
        assert r.status_code == 200
        data = r.json()
        assert "total_acres" in data
        assert "holdings" in data
        assert "weighted_metrics" in data
        assert "diversification_rating" in data

    def test_create_portfolio(self, client):
        unique_name = f"Test Portfolio Pytest {os.urandom(4).hex()}"
        r = client.post("/api/v1/portfolios", json={"name": unique_name})
        assert r.status_code == 200
        pid = r.json()["id"]

        # Add holding
        r = client.post(f"/api/v1/portfolios/{pid}/holdings", json={
            "geo_key": "19153", "acres": 150, "purchase_price_per_acre": 7500
        })
        assert r.status_code == 200

        # Verify
        r = client.get(f"/api/v1/portfolios/{pid}")
        assert r.json()["total_acres"] == 150

        # Remove holding
        r = client.delete(f"/api/v1/portfolios/{pid}/holdings/19153")
        assert r.status_code == 200


# ── Scenario / Backtest ───────────────────────────────────────────
class TestScenarioBacktest:
    def test_scenario(self, client):
        r = client.post("/api/v1/run/scenario", json={
            "geo_key": "19153",
            "as_of": "2025",
            "overrides": {"risk_premium": 5.0},
        })
        assert r.status_code == 200
        data = r.json()
        assert "base" in data
        assert data["base"]["metrics"]["fair_value"] is not None

    def test_scenario_with_sensitivity(self, client):
        r = client.post("/api/v1/run/scenario", json={
            "geo_key": "19153",
            "vary_params": [{"param": "risk_premium", "values": [3, 4, 5, 6], "target_metric": "fair_value"}],
        })
        assert r.status_code == 200
        data = r.json()
        assert "sensitivities" in data
        assert "risk_premium" in data["sensitivities"]
        assert len(data["sensitivities"]["risk_premium"]) == 4

    def test_sensitivity_matrix(self, client):
        r = client.get("/api/v1/geo/19153/sensitivity")
        assert r.status_code == 200
        data = r.json()
        assert "rate_growth_matrix" in data
        assert "rent_shock_sensitivity" in data
        assert len(data["rate_growth_matrix"]) > 0

    def test_backtest(self, client):
        # Get a screen ID
        screens = client.get("/api/v1/screens").json()
        if len(screens) == 0:
            pytest.skip("No screens available for backtest")
        sid = screens[0]["id"]

        r = client.post("/api/v1/run/backtest", json={
            "screen_id": sid, "start_year": "2020", "eval_years": 2,
        })
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert "counties_flagged" in data


# ── Export ────────────────────────────────────────────────────────
class TestExport:
    def test_csv_export(self, client):
        r = client.get("/api/v1/export/screener")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        lines = r.text.strip().split("\n")
        assert len(lines) == 46  # header + 45 counties
        assert "FIPS" in lines[0]
