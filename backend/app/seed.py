"""
Seed data loader — creates realistic mock data for Corn Belt counties.
Designed so swapping in real USDA / FRED data is a one-adapter change.
"""
import random
import math
from datetime import datetime
from app.core.database import engine, SessionLocal, Base
from app.models.schema import (
    GeoCounty, DataSource, DataSeries, DataPoint,
    PoiFacility, MetricDefinition, AssumptionSet, ScreenDefinition,
    ModelVersion, GeoAccessMetric, WatchlistItem, Portfolio, PortfolioHolding,
)
from app.services.metric_engine import METRIC_REGISTRY
from app.services.access_score import compute_access_score

random.seed(42)

# ── County data (real FIPS, names, approx centroids) ──────────────────
COUNTIES = [
    # Iowa
    ("19013", "Black Hawk", "IA", "Iowa", 42.47, -92.31),
    ("19017", "Bremer", "IA", "Iowa", 42.77, -92.06),
    ("19033", "Cerro Gordo", "IA", "Iowa", 43.08, -93.26),
    ("19049", "Dallas", "IA", "Iowa", 41.68, -94.04),
    ("19061", "Dubuque", "IA", "Iowa", 42.47, -90.88),
    ("19083", "Hardin", "IA", "Iowa", 42.37, -93.24),
    ("19099", "Jasper", "IA", "Iowa", 41.69, -93.05),
    ("19103", "Johnson", "IA", "Iowa", 41.67, -91.59),
    ("19113", "Linn", "IA", "Iowa", 42.08, -91.59),
    ("19153", "Polk", "IA", "Iowa", 41.69, -93.57),
    ("19155", "Pottawattamie", "IA", "Iowa", 41.34, -95.54),
    ("19163", "Scott", "IA", "Iowa", 41.64, -90.62),
    ("19169", "Story", "IA", "Iowa", 42.04, -93.47),
    ("19193", "Woodbury", "IA", "Iowa", 42.39, -96.17),
    ("19197", "Wright", "IA", "Iowa", 42.73, -93.74),
    # Illinois
    ("17019", "Champaign", "IL", "Illinois", 40.14, -88.20),
    ("17021", "Christian", "IL", "Illinois", 39.54, -89.27),
    ("17039", "De Witt", "IL", "Illinois", 40.17, -88.90),
    ("17053", "Ford", "IL", "Illinois", 40.59, -88.22),
    ("17105", "Livingston", "IL", "Illinois", 40.89, -88.56),
    ("17107", "Logan", "IL", "Illinois", 40.13, -89.37),
    ("17113", "McLean", "IL", "Illinois", 40.49, -88.85),
    ("17115", "Macon", "IL", "Illinois", 39.86, -88.96),
    ("17123", "Marshall", "IL", "Illinois", 41.03, -89.33),
    ("17129", "Menard", "IL", "Illinois", 40.03, -89.80),
    ("17143", "Peoria", "IL", "Illinois", 40.79, -89.76),
    ("17167", "Sangamon", "IL", "Illinois", 39.76, -89.66),
    ("17175", "Stark", "IL", "Illinois", 41.09, -89.80),
    ("17179", "Tazewell", "IL", "Illinois", 40.51, -89.51),
    ("17203", "Woodford", "IL", "Illinois", 40.79, -89.21),
    # Indiana
    ("18003", "Allen", "IN", "Indiana", 41.09, -85.13),
    ("18011", "Boone", "IN", "Indiana", 40.05, -86.47),
    ("18023", "Clinton", "IN", "Indiana", 40.30, -86.49),
    ("18035", "Delaware", "IN", "Indiana", 40.23, -85.40),
    ("18057", "Hamilton", "IN", "Indiana", 40.07, -86.01),
    ("18059", "Hancock", "IN", "Indiana", 39.83, -85.77),
    ("18065", "Henry", "IN", "Indiana", 39.93, -85.39),
    ("18067", "Howard", "IN", "Indiana", 40.48, -86.11),
    ("18097", "Marion", "IN", "Indiana", 39.78, -86.15),
    ("18107", "Montgomery", "IN", "Indiana", 40.04, -86.90),
    ("18157", "Tippecanoe", "IN", "Indiana", 40.39, -86.89),
    ("18159", "Tipton", "IN", "Indiana", 40.28, -86.04),
    ("18171", "Warren", "IN", "Indiana", 40.35, -87.36),
    ("18177", "Wayne", "IN", "Indiana", 39.86, -84.97),
    ("18183", "Whitley", "IN", "Indiana", 41.14, -85.50),
]

# ── Realistic value ranges by state ───────────────────────────────────
STATE_PARAMS = {
    "IA": {"rent_base": 250, "rent_var": 60, "value_base": 10500, "value_var": 3000, "yield_base": 195, "yield_var": 20},
    "IL": {"rent_base": 240, "rent_var": 55, "value_base": 10000, "value_var": 2800, "yield_base": 200, "yield_var": 18},
    "IN": {"rent_base": 210, "rent_var": 50, "value_base": 8500, "value_var": 2500, "yield_base": 185, "yield_var": 22},
}

YEARS = [str(y) for y in range(2015, 2026)]

# 10Y Treasury rates (approximate annual average)
TREASURY_10Y = {
    "2015": 2.14, "2016": 1.84, "2017": 2.33, "2018": 2.91, "2019": 2.14,
    "2020": 0.89, "2021": 1.45, "2022": 2.95, "2023": 3.96, "2024": 4.25, "2025": 4.40,
}

CORN_PRICE = {
    "2015": 3.61, "2016": 3.36, "2017": 3.36, "2018": 3.56, "2019": 3.56,
    "2020": 3.56, "2021": 5.45, "2022": 6.54, "2023": 4.65, "2024": 4.20, "2025": 4.35,
}


def _vary(base: float, var: float, year_idx: int, county_seed: int) -> float:
    """Deterministic pseudo-random variation for reproducibility."""
    trend = 1 + 0.02 * year_idx  # 2% annual growth trend
    noise = math.sin(county_seed * 7 + year_idx * 3) * 0.08
    return round(base * trend * (1 + noise) + random.uniform(-var * 0.3, var * 0.3), 1)


# ── Facilities (realistic Corn Belt locations) ────────────────────────
FACILITIES = [
    # Iowa elevators
    {"type": "elevator", "name": "ADM Cedar Rapids", "lat": 42.01, "lon": -91.64},
    {"type": "elevator", "name": "Cargill Eddyville", "lat": 41.15, "lon": -92.63},
    {"type": "elevator", "name": "Heartland Co-op Altoona", "lat": 41.64, "lon": -93.47},
    {"type": "elevator", "name": "Ag Partners Fort Dodge", "lat": 42.50, "lon": -94.17},
    {"type": "elevator", "name": "Key Coop Roland", "lat": 42.17, "lon": -93.50},
    {"type": "elevator", "name": "West Central Co-op Manilla", "lat": 41.89, "lon": -95.24},
    {"type": "elevator", "name": "POET Mason City", "lat": 43.15, "lon": -93.20},
    # Illinois elevators
    {"type": "elevator", "name": "ADM Decatur Complex", "lat": 39.84, "lon": -88.95},
    {"type": "elevator", "name": "Bunge Danville", "lat": 40.12, "lon": -87.63},
    {"type": "elevator", "name": "CGB Havana", "lat": 40.30, "lon": -90.06},
    {"type": "elevator", "name": "Consolidated Grain Bloomington", "lat": 40.48, "lon": -88.99},
    {"type": "elevator", "name": "GROWMARK Normal", "lat": 40.51, "lon": -88.99},
    # Indiana elevators
    {"type": "elevator", "name": "Cargill Lafayette", "lat": 40.42, "lon": -86.88},
    {"type": "elevator", "name": "ADM Frankfort", "lat": 40.28, "lon": -86.51},
    {"type": "elevator", "name": "Kokomo Grain", "lat": 40.49, "lon": -86.13},
    # Ethanol plants
    {"type": "ethanol", "name": "POET Emmetsburg", "lat": 43.11, "lon": -94.68},
    {"type": "ethanol", "name": "POET Mason City", "lat": 43.15, "lon": -93.20},
    {"type": "ethanol", "name": "Marquis Energy Hennepin IL", "lat": 41.25, "lon": -89.34},
    {"type": "ethanol", "name": "ADM Cedar Rapids Ethanol", "lat": 42.01, "lon": -91.67},
    {"type": "ethanol", "name": "POET Alexandria IN", "lat": 40.26, "lon": -85.68},
    {"type": "ethanol", "name": "Cardinal Ethanol Union City IN", "lat": 40.20, "lon": -84.82},
    # Processors
    {"type": "processor", "name": "ADM Soy Crush Decatur", "lat": 39.84, "lon": -88.96},
    {"type": "processor", "name": "Bunge Soy Morristown IN", "lat": 39.67, "lon": -85.70},
    {"type": "processor", "name": "Cargill Soy Cedar Rapids", "lat": 42.00, "lon": -91.65},
    {"type": "processor", "name": "ADM Soy Des Moines", "lat": 41.59, "lon": -93.62},
    # Rail
    {"type": "rail", "name": "UP Council Bluffs", "lat": 41.26, "lon": -95.86},
    {"type": "rail", "name": "BNSF Galesburg IL", "lat": 40.95, "lon": -90.37},
    {"type": "rail", "name": "NS Fort Wayne IN", "lat": 41.08, "lon": -85.14},
    {"type": "rail", "name": "UP Clinton IA", "lat": 41.84, "lon": -90.19},
    # River terminals
    {"type": "river", "name": "Davenport River Terminal", "lat": 41.52, "lon": -90.58},
    {"type": "river", "name": "Burlington IA River", "lat": 40.81, "lon": -91.11},
    {"type": "river", "name": "Peoria IL River", "lat": 40.69, "lon": -89.59},
    {"type": "river", "name": "Mt Vernon IN River", "lat": 37.93, "lon": -87.90},
]


def seed_database():
    """Populate the database with realistic mock data."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # ── Data Sources ──
        src_usda = DataSource(name="USDA-NASS", url="https://quickstats.nass.usda.gov/",
                              cadence="annual", notes="Cash rents, land values, yields")
        src_fred = DataSource(name="FRED", url="https://fred.stlouisfed.org/",
                              cadence="daily", notes="Treasury rates, SOFR")
        src_cme = DataSource(name="CME", url="https://www.cmegroup.com/",
                             cadence="daily", notes="Grain futures prices")
        src_poi = DataSource(name="POI-Manual", cadence="quarterly",
                             notes="Manually curated facility locations")
        db.add_all([src_usda, src_fred, src_cme, src_poi])
        db.flush()

        # ── Series definitions ──
        series_defs = [
            ("usda.cash_rent.county", "county", "annual", "$/acre", src_usda.id),
            ("usda.cash_rent.state", "state", "annual", "$/acre", src_usda.id),
            ("usda.land_value.county", "county", "annual", "$/acre", src_usda.id),
            ("usda.land_value.state", "state", "annual", "$/acre", src_usda.id),
            ("usda.corn_yield.county", "county", "annual", "bu/acre", src_usda.id),
            ("usda.corn_yield.state", "state", "annual", "bu/acre", src_usda.id),
            ("rates.treasury.10y", "national", "annual", "%", src_fred.id),
            ("grain.corn.price", "national", "annual", "$/bu", src_cme.id),
        ]
        series_map = {}
        for sk, gl, freq, unit, sid in series_defs:
            s = DataSeries(series_key=sk, geo_level=gl, frequency=freq, unit=unit, source_id=sid)
            db.add(s)
            db.flush()
            series_map[sk] = s.id

        # ── Counties ──
        for fips, name, state, state_name, lat, lon in COUNTIES:
            db.add(GeoCounty(fips=fips, name=name, state=state,
                             state_name=state_name, centroid_lat=lat, centroid_lon=lon))

        # ── Data Points ──
        # National series
        for year in YEARS:
            db.add(DataPoint(series_id=series_map["rates.treasury.10y"],
                             geo_key="US", as_of_date=year,
                             value=TREASURY_10Y.get(year, 4.0)))
            db.add(DataPoint(series_id=series_map["grain.corn.price"],
                             geo_key="US", as_of_date=year,
                             value=CORN_PRICE.get(year, 4.0)))

        # State averages
        for state, params in STATE_PARAMS.items():
            for yi, year in enumerate(YEARS):
                db.add(DataPoint(series_id=series_map["usda.cash_rent.state"],
                                 geo_key=state, as_of_date=year,
                                 value=_vary(params["rent_base"], 30, yi, hash(state))))
                db.add(DataPoint(series_id=series_map["usda.land_value.state"],
                                 geo_key=state, as_of_date=year,
                                 value=_vary(params["value_base"], 1500, yi, hash(state))))
                db.add(DataPoint(series_id=series_map["usda.corn_yield.state"],
                                 geo_key=state, as_of_date=year,
                                 value=_vary(params["yield_base"], 10, yi, hash(state))))

        # County-level data
        for ci, (fips, name, state, _, lat, lon) in enumerate(COUNTIES):
            params = STATE_PARAMS[state]
            for yi, year in enumerate(YEARS):
                db.add(DataPoint(
                    series_id=series_map["usda.cash_rent.county"],
                    geo_key=fips, as_of_date=year,
                    value=_vary(params["rent_base"], params["rent_var"], yi, ci),
                ))
                db.add(DataPoint(
                    series_id=series_map["usda.land_value.county"],
                    geo_key=fips, as_of_date=year,
                    value=_vary(params["value_base"], params["value_var"], yi, ci),
                ))
                db.add(DataPoint(
                    series_id=series_map["usda.corn_yield.county"],
                    geo_key=fips, as_of_date=year,
                    value=_vary(params["yield_base"], params["yield_var"], yi, ci),
                ))

        # ── Facilities ──
        for f in FACILITIES:
            db.add(PoiFacility(type=f["type"], name=f["name"],
                               lat=f["lat"], lon=f["lon"]))

        # ── Access metrics ──
        for fips, name, state, _, lat, lon in COUNTIES:
            result = compute_access_score(lat, lon, FACILITIES)
            db.add(GeoAccessMetric(
                geo_key=fips, as_of_date="2025",
                distances_json=result["distances_json"],
                density_json=result["density_json"],
                access_score=result["access_score"],
                context_json={"method": "haversine", "facilities_count": len(FACILITIES)},
            ))

        # ── Metric Definitions (persist to DB) ──
        for key, spec in METRIC_REGISTRY.items():
            db.add(MetricDefinition(
                key=spec.key, version=spec.version, label=spec.label,
                description=spec.description, unit=spec.unit, category=spec.category,
                dependencies_json=spec.dependencies,
                compute_spec_json={"formula": spec.formula},
            ))

        # ── Default Assumption Sets ──
        db.add(AssumptionSet(
            name="Default", version=1,
            params_json={
                "base_rate_series": "rates.treasury.10y",
                "risk_premium": 2.0,
                "long_run_growth": 0.025,
                "near_term_rent_shock": 0.0,
                "cost_pct": 0.10,
                "vacancy": 0.0,
                "capex_reserve_pct": 0.02,
                "ltv": 0.60,
                "loan_rate": 0.065,
                "loan_term_years": 25,
                "base_rate_default": 4.5,
            },
        ))
        db.add(AssumptionSet(
            name="Conservative", version=1,
            params_json={
                "base_rate_series": "rates.treasury.10y",
                "risk_premium": 3.0,
                "long_run_growth": 0.015,
                "near_term_rent_shock": -0.05,
                "cost_pct": 0.12,
                "vacancy": 0.03,
                "capex_reserve_pct": 0.03,
                "ltv": 0.50,
                "loan_rate": 0.07,
                "loan_term_years": 20,
                "base_rate_default": 4.5,
            },
        ))
        db.add(AssumptionSet(
            name="Aggressive", version=1,
            params_json={
                "base_rate_series": "rates.treasury.10y",
                "risk_premium": 1.5,
                "long_run_growth": 0.035,
                "near_term_rent_shock": 0.05,
                "cost_pct": 0.08,
                "vacancy": 0.0,
                "capex_reserve_pct": 0.01,
                "ltv": 0.70,
                "loan_rate": 0.06,
                "loan_term_years": 30,
                "base_rate_default": 4.5,
            },
        ))

        # ── Default Screens ──
        db.add(ScreenDefinition(
            name="High Yield / Value", version=1,
            filters_json=[
                {"metric": "implied_cap_rate", "op": ">", "value": 5.0},
                {"metric": "rent_multiple", "op": "<", "value": 25},
            ],
            ranking_json=[
                {"metric": "implied_cap_rate", "weight": 0.5, "direction": "desc"},
                {"metric": "access_score", "weight": 0.3, "direction": "desc"},
                {"metric": "fair_value", "weight": 0.2, "direction": "asc"},
            ],
            columns_json=["cash_rent", "benchmark_value", "implied_cap_rate",
                           "rent_multiple", "fair_value", "access_score"],
        ))
        db.add(ScreenDefinition(
            name="Rate Shock Resilient", version=1,
            filters_json=[
                {"metric": "rate_duration_proxy", "op": ">", "value": -2000},
                {"metric": "implied_cap_rate", "op": ">", "value": 4.0},
            ],
            ranking_json=[
                {"metric": "rate_duration_proxy", "weight": 0.6, "direction": "desc"},
                {"metric": "cap_spread_to_10y", "weight": 0.4, "direction": "desc"},
            ],
            columns_json=["cash_rent", "benchmark_value", "implied_cap_rate",
                           "rate_duration_proxy", "cap_spread_to_10y"],
        ))
        db.add(ScreenDefinition(
            name="Access Advantage", version=1,
            filters_json=[
                {"metric": "access_score", "op": ">", "value": 65},
            ],
            ranking_json=[
                {"metric": "access_score", "weight": 0.6, "direction": "desc"},
                {"metric": "implied_cap_rate", "weight": 0.4, "direction": "desc"},
            ],
            columns_json=["cash_rent", "benchmark_value", "implied_cap_rate",
                           "access_score", "fair_value"],
        ))

        # ── Model Version ──
        db.add(ModelVersion(semver="0.1.0", git_sha="seed", notes="Initial seed"))

        # ── Default Watchlist (a few interesting counties) ──
        for fips in ["19153", "17113", "18057", "19169", "17019"]:
            db.add(WatchlistItem(geo_key=fips))

        # ── Sample Portfolio ──
        p = Portfolio(name="Corn Belt Core", description="Diversified Corn Belt portfolio across IA/IL/IN")
        db.add(p)
        db.flush()
        sample_holdings = [
            ("19153", 320, 10200, "2020"),  # Polk, IA
            ("17113", 240, 9800, "2021"),   # McLean, IL
            ("18057", 160, 8200, "2022"),   # Hamilton, IN
            ("19169", 200, 10500, "2020"),  # Story, IA
            ("17019", 280, 9500, "2019"),   # Champaign, IL
        ]
        for fips, acres, pp, yr in sample_holdings:
            db.add(PortfolioHolding(
                portfolio_id=p.id, geo_key=fips,
                acres=acres, purchase_price_per_acre=pp, purchase_year=yr,
            ))

        db.commit()
        print(f"✓ Seeded {len(COUNTIES)} counties, {len(FACILITIES)} facilities, "
              f"{len(YEARS)} years of data, 1 portfolio, 5 watchlist items")

    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def seed_if_empty():
    """Seed only if the geo_county table is empty."""
    db = SessionLocal()
    try:
        count = db.query(GeoCounty).count()
        if count == 0:
            db.close()
            seed_database()
        else:
            print(f"Database already seeded ({count} counties). Skipping.")
            db.close()
    except Exception:
        db.close()
        seed_database()


if __name__ == "__main__":
    seed_database()
