"""SQLAlchemy models — complete schema with watchlist, notes, portfolios."""
from sqlalchemy import (
    Column, Integer, Float, String, Text, DateTime, JSON, ForeignKey,
    Index, UniqueConstraint, Boolean
)
from sqlalchemy.sql import func
from app.core.database import Base


# ── Core Geography ───────────────────────────────────────────────────
class GeoCounty(Base):
    __tablename__ = "geo_county"
    fips = Column(String(5), primary_key=True)
    name = Column(String(120), nullable=False)
    state = Column(String(2), nullable=False)
    state_name = Column(String(60))
    centroid_lat = Column(Float)
    centroid_lon = Column(Float)
    __table_args__ = (Index("ix_geo_county_state", "state"),)


# ── Data Pipeline ────────────────────────────────────────────────────
class DataSource(Base):
    __tablename__ = "data_sources"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False, unique=True)
    url = Column(Text)
    cadence = Column(String(20))
    last_checked_at = Column(DateTime)
    notes = Column(Text)


class DataSeries(Base):
    __tablename__ = "data_series"
    id = Column(Integer, primary_key=True, autoincrement=True)
    series_key = Column(String(200), nullable=False)
    geo_level = Column(String(20), nullable=False)
    frequency = Column(String(20), nullable=False)
    unit = Column(String(40))
    source_id = Column(Integer, ForeignKey("data_sources.id"))
    __table_args__ = (
        UniqueConstraint("series_key", "geo_level", name="uq_series_key_geo"),
        Index("ix_data_series_key", "series_key"),
    )


class DataPoint(Base):
    __tablename__ = "data_points"
    id = Column(Integer, primary_key=True, autoincrement=True)
    series_id = Column(Integer, ForeignKey("data_series.id"), nullable=False)
    geo_key = Column(String(10), nullable=False)
    as_of_date = Column(String(10), nullable=False)
    value = Column(Float)
    quality_json = Column(JSON)
    __table_args__ = (
        Index("ix_dp_series_geo_date", "series_id", "geo_key", "as_of_date"),
    )


# ── Facilities / Access ─────────────────────────────────────────────
class PoiFacility(Base):
    __tablename__ = "poi_facilities"
    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(40), nullable=False)
    name = Column(String(200))
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    meta_json = Column(JSON)
    last_verified = Column(DateTime)
    __table_args__ = (Index("ix_poi_type", "type"),)


class GeoAccessMetric(Base):
    __tablename__ = "geo_access_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    geo_key = Column(String(10), nullable=False)
    as_of_date = Column(String(10), nullable=False)
    distances_json = Column(JSON)
    density_json = Column(JSON)
    access_score = Column(Float)
    computed_at = Column(DateTime, server_default=func.now())
    context_json = Column(JSON)
    __table_args__ = (
        Index("ix_access_geo_date", "geo_key", "as_of_date"),
    )


# ── Modeling ─────────────────────────────────────────────────────────
class MetricDefinition(Base):
    __tablename__ = "metric_definitions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(80), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    label = Column(String(120))
    description = Column(Text)
    unit = Column(String(40))
    category = Column(String(40))
    dependencies_json = Column(JSON)
    compute_spec_json = Column(JSON)
    __table_args__ = (
        UniqueConstraint("key", "version", name="uq_metric_key_ver"),
    )


class AssumptionSet(Base):
    __tablename__ = "assumption_sets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    params_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (
        UniqueConstraint("name", "version", name="uq_assumption_name_ver"),
    )


class ScreenDefinition(Base):
    __tablename__ = "screen_definitions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    filters_json = Column(JSON)
    ranking_json = Column(JSON)
    columns_json = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (
        UniqueConstraint("name", "version", name="uq_screen_name_ver"),
    )


class ModelVersion(Base):
    __tablename__ = "model_versions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    semver = Column(String(20), nullable=False)
    git_sha = Column(String(40))
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class RunContext(Base):
    __tablename__ = "run_contexts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    model_version_id = Column(Integer, ForeignKey("model_versions.id"))
    assumption_set_id = Column(Integer, ForeignKey("assumption_sets.id"))
    screen_definition_id = Column(Integer, ForeignKey("screen_definitions.id"))
    run_type = Column(String(40))
    run_at = Column(DateTime, server_default=func.now())
    context_json = Column(JSON)


# ── Outputs ──────────────────────────────────────────────────────────
class MetricValue(Base):
    __tablename__ = "metric_values"
    id = Column(Integer, primary_key=True, autoincrement=True)
    metric_definition_id = Column(Integer, ForeignKey("metric_definitions.id"), nullable=False)
    run_context_id = Column(Integer, ForeignKey("run_contexts.id"))
    geo_key = Column(String(10), nullable=False)
    as_of_date = Column(String(10), nullable=False)
    value = Column(Float)
    confidence = Column(Float, default=1.0)
    explain_json = Column(JSON)
    computed_at = Column(DateTime, server_default=func.now())
    __table_args__ = (
        Index("ix_mv_metric_geo_date", "metric_definition_id", "geo_key", "as_of_date"),
    )


class ScenarioOutput(Base):
    __tablename__ = "scenario_outputs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_context_id = Column(Integer, ForeignKey("run_contexts.id"))
    geo_key = Column(String(10), nullable=False)
    horizon = Column(Integer)
    bands_json = Column(JSON)
    computed_at = Column(DateTime, server_default=func.now())


# ── Logs ─────────────────────────────────────────────────────────────
class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    source_id = Column(Integer, ForeignKey("data_sources.id"))
    run_at = Column(DateTime, server_default=func.now())
    status = Column(String(20))
    stats_json = Column(JSON)
    errors_json = Column(JSON)


class FallbackLog(Base):
    __tablename__ = "fallback_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_context_id = Column(Integer, ForeignKey("run_contexts.id"))
    geo_key = Column(String(10))
    metric_key = Column(String(80))
    fallback_type = Column(String(40))
    details_json = Column(JSON)


# ── Watchlist ────────────────────────────────────────────────────────
class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    geo_key = Column(String(10), ForeignKey("geo_county.fips"), nullable=False)
    added_at = Column(DateTime, server_default=func.now())
    notes = Column(Text)
    alert_cap_below = Column(Float)
    alert_cap_above = Column(Float)
    __table_args__ = (
        UniqueConstraint("geo_key", name="uq_watchlist_geo"),
    )


# ── County Notes ─────────────────────────────────────────────────────
class CountyNote(Base):
    __tablename__ = "county_notes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    geo_key = Column(String(10), ForeignKey("geo_county.fips"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# ── Research Workspace ───────────────────────────────────────────────
class ResearchWorkspace(Base):
    __tablename__ = "research_workspaces"
    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_key = Column(String(120), nullable=False, default="owner_default")
    geo_key = Column(String(10), ForeignKey("geo_county.fips"), nullable=False)
    thesis = Column(Text)
    tags_json = Column(JSON)
    status = Column(String(40), nullable=False, default="exploring")
    conviction = Column(Float, nullable=False, default=50)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("owner_key", "geo_key", name="uq_research_workspace_owner_geo"),
        Index("ix_research_workspace_owner", "owner_key"),
    )


class ResearchNote(Base):
    __tablename__ = "research_notes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("research_workspaces.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (Index("ix_research_note_workspace", "workspace_id"),)


class ResearchScenarioPack(Base):
    __tablename__ = "research_scenario_packs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("research_workspaces.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(160), nullable=False)
    risk_premium = Column(Float, nullable=False)
    growth_rate = Column(Float, nullable=False)
    rent_shock = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    __table_args__ = (Index("ix_research_pack_workspace", "workspace_id"),)


# ── Auth Sessions ─────────────────────────────────────────────────────
class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_key = Column(String(120), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    identity_source = Column(String(40), nullable=False, default="session")
    created_at = Column(DateTime, server_default=func.now())
    last_seen_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime)
    user_agent = Column(String(255))
    ip_hash = Column(String(64))
    __table_args__ = (
        Index("ix_auth_session_user", "user_key"),
        Index("ix_auth_session_expires", "expires_at"),
    )


# ── Portfolios ───────────────────────────────────────────────────────
class Portfolio(Base):
    __tablename__ = "portfolios"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True)
    description = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class PortfolioHolding(Base):
    __tablename__ = "portfolio_holdings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    geo_key = Column(String(10), ForeignKey("geo_county.fips"), nullable=False)
    acres = Column(Float, nullable=False, default=100)
    purchase_price_per_acre = Column(Float)
    purchase_year = Column(String(4))
    notes = Column(Text)
    __table_args__ = (
        UniqueConstraint("portfolio_id", "geo_key", name="uq_portfolio_holding"),
    )


# ── Future hooks ─────────────────────────────────────────────────────
class Deal(Base):
    __tablename__ = "deals"
    id = Column(Integer, primary_key=True, autoincrement=True)
    geo_key = Column(String(10))
    name = Column(String(200))
    params_json = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())


class DealOutput(Base):
    __tablename__ = "deal_outputs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    deal_id = Column(Integer, ForeignKey("deals.id"))
    run_context_id = Column(Integer, ForeignKey("run_contexts.id"))
    results_json = Column(JSON)
    computed_at = Column(DateTime, server_default=func.now())


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    geo_key = Column(String(10))
    date = Column(String(10))
    price_per_acre = Column(Float)
    acres = Column(Float)
    source = Column(String(120))
    meta_json = Column(JSON)


class Auction(Base):
    __tablename__ = "auctions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    geo_key = Column(String(10))
    date = Column(String(10))
    meta_json = Column(JSON)


class DistressEvent(Base):
    __tablename__ = "distress_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    geo_key = Column(String(10))
    date = Column(String(10))
    event_type = Column(String(60))
    meta_json = Column(JSON)
