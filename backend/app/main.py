"""
Altira Atlas — FastAPI backend.
Serves API under /api/v1 and the frontend SPA from /.
"""
import os
import csv
import io
import hashlib
import secrets
from datetime import datetime
from datetime import timedelta
from fastapi import FastAPI, Depends, HTTPException, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db, engine, Base
from app.models.schema import (
    GeoCounty, DataSource, DataSeries, DataPoint,
    PoiFacility, GeoAccessMetric, MetricDefinition,
    AssumptionSet, ScreenDefinition, ModelVersion,
    RunContext, MetricValue, FallbackLog, ScenarioOutput,
    WatchlistItem, CountyNote, Portfolio, PortfolioHolding,
    ResearchWorkspace, ResearchNote, ResearchScenarioPack, ResearchScenarioRun,
    AuthSession, AgCompositeIndex,
)
from app.services.metric_engine import (
    ComputeContext, compute_all, compute_sensitivity,
    get_metric_catalog, METRIC_REGISTRY,
)
from app.services.portfolio import compute_portfolio_metrics
from app.services.asof import resolve_as_of
from app.services.zscore import compute_zscore_stats, zscore_band

app = FastAPI(title="Altira Atlas", version="0.2.0")
APP_ENV = (os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "development").lower()
ALLOW_DEV_IDENTITY_HEADER = APP_ENV != "production"
ALLOW_ANON_SESSIONS = os.getenv("ALLOW_ANON_SESSIONS", "1") == "1"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _migrate_research_workspace_owner_schema():
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        exists = conn.execute(text(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_workspaces'"
        )).first()
        if not exists:
            return

        cols = conn.execute(text("PRAGMA table_info(research_workspaces)")).fetchall()
        col_names = {row[1] for row in cols}
        if "owner_key" in col_names:
            return

        conn.execute(text("PRAGMA foreign_keys=OFF"))
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS research_workspaces_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_key VARCHAR(120) NOT NULL DEFAULT 'owner_default',
                    geo_key VARCHAR(10) NOT NULL REFERENCES geo_county(fips),
                    thesis TEXT,
                    analysis_json JSON,
                    tags_json JSON,
                    status VARCHAR(40) NOT NULL DEFAULT 'exploring',
                    conviction FLOAT NOT NULL DEFAULT 50,
                    created_at DATETIME,
                    updated_at DATETIME,
                    CONSTRAINT uq_research_workspace_owner_geo UNIQUE (owner_key, geo_key)
                )
            """))
            conn.execute(text("""
                INSERT INTO research_workspaces_new (
                    id, owner_key, geo_key, thesis, analysis_json, tags_json, status, conviction, created_at, updated_at
                )
                SELECT
                    id,
                    'owner_default',
                    geo_key,
                    thesis,
                    NULL,
                    tags_json,
                    COALESCE(status, 'exploring'),
                    COALESCE(conviction, 50),
                    created_at,
                    updated_at
                FROM research_workspaces
            """))
            conn.execute(text("DROP TABLE research_workspaces"))
            conn.execute(text("ALTER TABLE research_workspaces_new RENAME TO research_workspaces"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_workspace_owner ON research_workspaces(owner_key)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_research_workspace_geo ON research_workspaces(geo_key)"))
        finally:
            conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()


@app.on_event("startup")
def ensure_schema_tables():
    Base.metadata.create_all(bind=engine)
    _migrate_research_workspace_owner_schema()
    if engine.dialect.name == "sqlite":
        with engine.connect() as conn:
            cols = conn.execute(text("PRAGMA table_info(research_workspaces)")).fetchall()
            col_names = {row[1] for row in cols}
            if "analysis_json" not in col_names and cols:
                conn.execute(text("ALTER TABLE research_workspaces ADD COLUMN analysis_json JSON"))
                conn.commit()
            conn.execute(text(
                """
                CREATE TABLE IF NOT EXISTS data_freshness (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  source_name TEXT NOT NULL,
                  series_key TEXT,
                  last_updated TEXT NOT NULL,
                  record_count INTEGER,
                  notes TEXT
                )
                """
            ))
            conn.commit()
    Base.metadata.create_all(bind=engine)


# Ensure schema/migrations are applied even when app startup hooks are bypassed (e.g., some test clients/import paths).
ensure_schema_tables()


# ═══════════════════════════════════════════════════════════════════════
# Frontend Serving
# ═══════════════════════════════════════════════════════════════════════

_FRONTEND_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "frontend", "index.html",
)
_ALTIRATECH_HOME_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "deploy", "cloudflare-worker", "public", "altiratech-home.html",
)

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    try:
        with open(_FRONTEND_PATH, "r") as f:
            return f.read()
    except FileNotFoundError:
        return HTMLResponse("<h1>Frontend not found</h1><p>Expected at: " + _FRONTEND_PATH + "</p>", 404)

@app.get("/altiratech-home.html", response_class=HTMLResponse)
async def serve_altiratech_home():
    try:
        with open(_ALTIRATECH_HOME_PATH, "r") as f:
            return f.read()
    except FileNotFoundError:
        return HTMLResponse("<h1>File not found</h1><p>Expected at: " + _ALTIRATECH_HOME_PATH + "</p>", 404)

@app.get("/altiratech-home", response_class=HTMLResponse)
async def serve_altiratech_home_clean():
    return await serve_altiratech_home()


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════

def _load_series_for_county(db: Session, geo_key: str, as_of: str) -> dict[str, float]:
    """Load all relevant data series for a county + year."""
    series = {}
    county = db.query(GeoCounty).filter(GeoCounty.fips == geo_key).first()
    state = county.state if county else None

    # County-level
    rows = db.execute(text("""
        SELECT ds.series_key, dp.value
        FROM data_points dp
        JOIN data_series ds ON ds.id = dp.series_id
        WHERE dp.geo_key = :geo AND dp.as_of_date = :dt
    """), {"geo": geo_key, "dt": as_of}).fetchall()
    for sk, v in rows:
        series[sk] = v

    # State fallback
    if state:
        state_rows = db.execute(text("""
            SELECT ds.series_key, dp.value
            FROM data_points dp
            JOIN data_series ds ON ds.id = dp.series_id
            WHERE dp.geo_key = :geo AND dp.as_of_date = :dt
        """), {"geo": state, "dt": as_of}).fetchall()
        for sk, v in state_rows:
            if sk not in series:
                series[sk] = v

    # National
    nat_rows = db.execute(text("""
        SELECT ds.series_key, dp.value
        FROM data_points dp
        JOIN data_series ds ON ds.id = dp.series_id
        WHERE dp.geo_key = 'US' AND dp.as_of_date = :dt
    """), {"dt": as_of}).fetchall()
    for sk, v in nat_rows:
        series[sk] = v

    # Access score
    access = db.query(GeoAccessMetric).filter(
        GeoAccessMetric.geo_key == geo_key
    ).order_by(GeoAccessMetric.as_of_date.desc()).first()
    if access:
        series["computed.access_score"] = access.access_score

    return series


def _get_assumptions(db: Session, assumption_set_id: int | None = None) -> dict:
    if assumption_set_id:
        a = db.query(AssumptionSet).filter(AssumptionSet.id == assumption_set_id).first()
        if a:
            return a.params_json
    a = db.query(AssumptionSet).filter(AssumptionSet.name == "Default").first()
    return a.params_json if a else {}


def _compute_county(db: Session, geo_key: str, as_of: str, assumptions: dict) -> dict:
    series = _load_series_for_county(db, geo_key, as_of)
    ctx = ComputeContext(
        geo_key=geo_key, as_of_year=as_of,
        series=series, metrics={}, assumptions=assumptions,
    )
    compute_all(ctx)
    county = db.query(GeoCounty).filter(GeoCounty.fips == geo_key).first()
    access = db.query(GeoAccessMetric).filter(
        GeoAccessMetric.geo_key == geo_key
    ).order_by(GeoAccessMetric.as_of_date.desc()).first()

    return {
        "geo_key": geo_key,
        "county_name": county.name if county else geo_key,
        "state": county.state if county else "",
        "lat": county.centroid_lat if county else None,
        "lon": county.centroid_lon if county else None,
        "as_of": as_of,
        "metrics": {k: round(v, 4) if v else None for k, v in ctx.metrics.items()},
        "explains": ctx.explains,
        "fallbacks": ctx.fallbacks,
        "access_details": access.distances_json if access else {},
        "access_density": access.density_json if access else {},
    }


CORE_MODEL_SERIES = [
    "usda.cash_rent.county",
    "usda.land_value.county",
    "usda.corn_yield.county",
    "rates.treasury.10y",
    "grain.corn.price",
]

ZSCORE_DEFAULT_METRICS = [
    "implied_cap_rate",
    "fair_value",
    "cash_rent",
    "benchmark_value",
]


def _resolve_as_of_with_meta(
    db: Session,
    requested_as_of: str | None = None,
    state: str | None = None,
    required_series: list[str] | None = None,
) -> tuple[str, dict]:
    resolved = resolve_as_of(
        db,
        requested_as_of=requested_as_of,
        state=state,
        required_series=required_series or CORE_MODEL_SERIES,
    )
    return resolved["as_of"], resolved["meta"]


def _compute_metric_zscores(
    db: Session,
    geo_key: str,
    as_of: str,
    assumptions: dict,
    metric_keys: list[str] | None = None,
    window_years: int = 10,
) -> dict:
    metric_keys = metric_keys or list(ZSCORE_DEFAULT_METRICS)
    try:
        end_year = int(as_of)
    except (TypeError, ValueError):
        end_year = datetime.utcnow().year
    start_year = max(1950, end_year - max(1, int(window_years)) + 1)

    years = [str(y) for y in range(start_year, end_year + 1)]
    values_by_metric: dict[str, list[float]] = {metric: [] for metric in metric_keys}
    current_metrics: dict[str, float | None] = {}

    for year in years:
        county = _compute_county(db, geo_key, year, assumptions)
        for metric in metric_keys:
            value = county["metrics"].get(metric)
            if isinstance(value, (int, float)):
                values_by_metric[metric].append(float(value))
        if year == str(end_year):
            current_metrics = county["metrics"]

    payload = {}
    for metric in metric_keys:
        stats = compute_zscore_stats(
            current_metrics.get(metric),
            values_by_metric.get(metric, []),
            years,
        )
        stats["band"] = zscore_band(stats.get("zscore"))
        payload[metric] = stats
    return payload


RESEARCH_LEGACY_USER = "owner_default"
SESSION_TTL_DAYS = 30


def _sanitize_research_user(raw: str) -> str:
    cleaned = "".join(ch for ch in raw.strip().lower() if ch.isalnum() or ch in {"@", ".", "_", "-", "+"})
    return cleaned[:120]


def _extract_header_identity(request: Request) -> dict | None:
    email = request.headers.get("cf-access-authenticated-user-email")
    user_id = request.headers.get("cf-access-authenticated-user-id")
    dev_header = request.headers.get("x-atlas-user") if ALLOW_DEV_IDENTITY_HEADER else None

    candidate = email or user_id or dev_header
    if not candidate:
        return None
    user_key = _sanitize_research_user(candidate)
    if not user_key:
        return None

    if email or user_id:
        source = "cloudflare_access"
    else:
        source = "dev_header"
    return {"user_key": user_key, "source": source}


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header[7:].strip()
    return token or None


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _get_valid_session(db: Session, token: str | None) -> AuthSession | None:
    if not token:
        return None
    token_hash = _hash_token(token)
    session = db.query(AuthSession).filter(
        AuthSession.token_hash == token_hash,
        AuthSession.revoked_at.is_(None),
    ).first()
    if not session:
        return None
    if session.expires_at and session.expires_at < datetime.utcnow():
        session.revoked_at = datetime.utcnow()
        db.add(session)
        db.commit()
        return None
    session.last_seen_at = datetime.utcnow()
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _create_session(db: Session, request: Request, user_key: str, source: str) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    now = datetime.utcnow()
    ip = request.client.host if request.client else ""
    ip_hash = hashlib.sha256(ip.encode("utf-8")).hexdigest() if ip else None
    session = AuthSession(
        user_key=user_key,
        token_hash=token_hash,
        identity_source=source,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=SESSION_TTL_DAYS),
        user_agent=(request.headers.get("user-agent") or "")[:255],
        ip_hash=ip_hash,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return token, session


def _auth_payload(user_key: str, source: str, token: str, session: AuthSession | None = None) -> dict:
    return {
        "user_key": user_key,
        "source": source,
        "token": token,
        "expires_at": str(session.expires_at) if session and session.expires_at else None,
        "is_anonymous": user_key.startswith("anon_"),
    }


def _require_authenticated_user(request: Request, db: Session) -> str:
    bearer = _extract_bearer_token(request)
    session = _get_valid_session(db, bearer)
    if session:
        return session.user_key

    header_identity = _extract_header_identity(request)
    if header_identity:
        return header_identity["user_key"]

    raise HTTPException(401, "Missing research user identity")


def _get_research_user(request: Request, db: Session) -> str:
    return _require_authenticated_user(request, db)


def _require_write_auth(request: Request, db: Session) -> str:
    return _require_authenticated_user(request, db)


def _workspace_is_visible_to_user(workspace: ResearchWorkspace, user_key: str) -> bool:
    return (workspace.owner_key or RESEARCH_LEGACY_USER) == user_key


def _clamp_conviction(value: float | int | None) -> float:
    try:
        parsed = float(value) if value is not None else 50.0
    except (TypeError, ValueError):
        parsed = 50.0
    return max(0.0, min(100.0, parsed))


def _workspace_defaults(geo_key: str) -> dict:
    return {
        "geo_key": geo_key,
        "thesis": "",
        "analysis": {
            "thesis": "",
            "bull_case": "",
            "bear_case": "",
            "key_risks": [],
            "catalysts": [],
            "decision_state": "exploring",
        },
        "tags": [],
        "status": "exploring",
        "conviction": 50.0,
        "notes": [],
        "scenario_packs": [],
        "created_at": None,
        "updated_at": None,
    }


def _serialize_workspace(db: Session, workspace: ResearchWorkspace) -> dict:
    notes = db.query(ResearchNote).filter(
        ResearchNote.workspace_id == workspace.id
    ).order_by(ResearchNote.created_at.desc()).all()
    packs = db.query(ResearchScenarioPack).filter(
        ResearchScenarioPack.workspace_id == workspace.id
    ).order_by(ResearchScenarioPack.updated_at.desc(), ResearchScenarioPack.id.desc()).all()

    payload = _workspace_defaults(workspace.geo_key)
    analysis = workspace.analysis_json if isinstance(workspace.analysis_json, dict) else {}
    analysis_payload = {
        "thesis": analysis.get("thesis", ""),
        "bull_case": analysis.get("bull_case", ""),
        "bear_case": analysis.get("bear_case", ""),
        "key_risks": analysis.get("key_risks", []) if isinstance(analysis.get("key_risks"), list) else [],
        "catalysts": analysis.get("catalysts", []) if isinstance(analysis.get("catalysts"), list) else [],
        "decision_state": analysis.get("decision_state", "exploring"),
    }
    payload.update({
        "thesis": workspace.thesis or "",
        "analysis": analysis_payload,
        "tags": workspace.tags_json if isinstance(workspace.tags_json, list) else [],
        "status": workspace.status or "exploring",
        "conviction": _clamp_conviction(workspace.conviction),
        "notes": [
            {
                "id": n.id,
                "content": n.content,
                "created_at": str(n.created_at) if n.created_at else None,
            }
            for n in notes
        ],
        "scenario_packs": [
            {
                "id": p.id,
                "name": p.name,
                "risk_premium": p.risk_premium,
                "growth_rate": p.growth_rate,
                "rent_shock": p.rent_shock,
                "created_at": str(p.created_at) if p.created_at else None,
                "updated_at": str(p.updated_at) if p.updated_at else None,
            }
            for p in packs
        ],
        "created_at": str(workspace.created_at) if workspace.created_at else None,
        "updated_at": str(workspace.updated_at) if workspace.updated_at else None,
    })
    return payload


def _find_workspace_for_user(db: Session, user_key: str, geo_key: str) -> ResearchWorkspace | None:
    workspace = db.query(ResearchWorkspace).filter(
        ResearchWorkspace.owner_key == user_key,
        ResearchWorkspace.geo_key == geo_key,
    ).first()
    if workspace:
        return workspace
    return None


def _get_or_create_workspace(db: Session, user_key: str, geo_key: str) -> ResearchWorkspace:
    workspace = _find_workspace_for_user(db, user_key, geo_key)
    if workspace:
        return workspace
    workspace = ResearchWorkspace(
        owner_key=user_key,
        geo_key=geo_key,
        thesis="",
        analysis_json={},
        tags_json=[],
        status="exploring",
        conviction=50.0,
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


# ═══════════════════════════════════════════════════════════════════════
# Metadata Endpoints
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/metrics")
def list_metrics():
    return get_metric_catalog()


@app.get("/api/v1/meta/as-of")
def meta_as_of(
    as_of: str = "latest",
    state: Optional[str] = None,
    required_series: Optional[str] = None,
    db: Session = Depends(get_db),
):
    required = [item.strip() for item in required_series.split(",")] if required_series else CORE_MODEL_SERIES
    resolved = resolve_as_of(
        db,
        requested_as_of=as_of,
        state=state,
        required_series=required,
    )
    return {
        "as_of": resolved["as_of"],
        "as_of_meta": resolved["meta"],
    }


@app.get("/api/v1/assumptions")
def list_assumptions(db: Session = Depends(get_db)):
    rows = db.query(AssumptionSet).all()
    return [{"id": r.id, "name": r.name, "version": r.version,
             "params": r.params_json, "created_at": str(r.created_at)} for r in rows]


class AssumptionCreate(BaseModel):
    name: str
    params: dict

@app.post("/api/v1/assumptions")
def create_assumption(body: AssumptionCreate, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    existing = db.query(AssumptionSet).filter(AssumptionSet.name == body.name).all()
    new_ver = max((a.version for a in existing), default=0) + 1
    a = AssumptionSet(name=body.name, version=new_ver, params_json=body.params)
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "name": a.name, "version": a.version, "params": a.params_json}


@app.get("/api/v1/screens")
def list_screens(db: Session = Depends(get_db)):
    rows = db.query(ScreenDefinition).all()
    return [{"id": r.id, "name": r.name, "version": r.version,
             "filters": r.filters_json, "ranking": r.ranking_json,
             "columns": r.columns_json} for r in rows]


class ScreenCreate(BaseModel):
    name: str
    filters: list[dict]
    ranking: list[dict] | None = None
    columns: list[str] | None = None

@app.post("/api/v1/screens")
def create_screen(body: ScreenCreate, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    existing = db.query(ScreenDefinition).filter(ScreenDefinition.name == body.name).all()
    new_ver = max((s.version for s in existing), default=0) + 1
    s = ScreenDefinition(
        name=body.name, version=new_ver,
        filters_json=body.filters, ranking_json=body.ranking, columns_json=body.columns,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "version": s.version}


@app.get("/api/v1/sources")
def list_sources(db: Session = Depends(get_db)):
    rows = db.query(DataSource).all()
    return [{"id": r.id, "name": r.name, "url": r.url,
             "cadence": r.cadence, "notes": r.notes} for r in rows]


@app.get("/api/v1/data-freshness")
def data_freshness(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM data_freshness ORDER BY last_updated DESC")).mappings().all()
    return [dict(row) for row in rows]


@app.get("/api/v1/data/coverage")
def data_coverage(
    as_of: str = "latest",
    state: str = "ALL",
    required_series: Optional[str] = None,
    db: Session = Depends(get_db),
):
    req_series = [item.strip() for item in required_series.split(",")] if required_series else CORE_MODEL_SERIES
    use_state = None if state.upper() == "ALL" else state.upper()
    resolved = resolve_as_of(
        db,
        requested_as_of=as_of,
        state=use_state,
        required_series=req_series,
    )
    resolved_as_of = resolved["as_of"]
    as_of_meta = resolved["meta"]

    counties = db.execute(
        text("SELECT fips, state FROM geo_county WHERE (:state IS NULL OR state = :state) ORDER BY fips"),
        {"state": use_state},
    ).fetchall()
    county_rows = [{"fips": row[0], "state": row[1]} for row in counties]

    if req_series:
        in_clause = ", ".join(f":s{idx}" for idx in range(len(req_series)))
        params = {"as_of": resolved_as_of}
        for idx, series in enumerate(req_series):
            params[f"s{idx}"] = series
        point_rows = db.execute(
            text(
                f"""
                SELECT ds.series_key, dp.geo_key
                FROM data_points dp
                JOIN data_series ds ON ds.id = dp.series_id
                WHERE dp.as_of_date = :as_of
                  AND ds.series_key IN ({in_clause})
                """
            ),
            params,
        ).fetchall()
    else:
        point_rows = []

    series_geo: dict[str, set[str]] = {series: set() for series in req_series}
    for series_key, geo_key in point_rows:
        if series_key in series_geo and isinstance(geo_key, str):
            series_geo[series_key].add(geo_key)

    state_coverage: dict[str, dict] = {}
    series_covered_count: dict[str, int] = {series: 0 for series in req_series}
    for county in county_rows:
        st = county["state"]
        bucket = state_coverage.setdefault(st, {"counties_total": 0, "counties_complete": 0, "coverage_pct": 0})
        bucket["counties_total"] += 1
        complete = True
        for series in req_series:
            covered = county["fips"] in series_geo[series] or st in series_geo[series] or "US" in series_geo[series]
            if covered:
                series_covered_count[series] += 1
            else:
                complete = False
        if complete:
            bucket["counties_complete"] += 1

    for bucket in state_coverage.values():
        total = bucket["counties_total"]
        bucket["coverage_pct"] = round(bucket["counties_complete"] / total, 4) if total else 0

    total_counties = len(county_rows)
    series_completeness = []
    for series in req_series:
        covered = series_covered_count[series]
        pct = round(covered / total_counties, 4) if total_counties else 0
        series_completeness.append({
            "series_key": series,
            "covered_counties": covered,
            "total_counties": total_counties,
            "coverage_pct": pct,
            "missing_counties": max(0, total_counties - covered),
        })

    freshness_rows = db.execute(
        text(
            """
            SELECT source_name, MAX(last_updated) AS last_updated, MAX(record_count) AS record_count
            FROM data_freshness
            GROUP BY source_name
            ORDER BY last_updated DESC
            """
        )
    ).mappings().all()

    warnings = []
    if as_of_meta.get("coverage_pct", 0) < 0.7:
        warnings.append("LOW_COVERAGE")
    if len(freshness_rows) == 0:
        warnings.append("STALE_SOURCE")

    counties_complete = sum(bucket["counties_complete"] for bucket in state_coverage.values())
    return {
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "county_coverage_by_state": state_coverage,
        "series_completeness": series_completeness,
        "missingness_summary": {
            "counties_total": total_counties,
            "counties_complete": counties_complete,
            "counties_partial": max(0, total_counties - counties_complete),
        },
        "freshness": [dict(row) for row in freshness_rows],
        "warnings": warnings,
    }


@app.get("/api/v1/ag-index")
def ag_index(db: Session = Depends(get_db)):
    rows = db.query(AgCompositeIndex).order_by(AgCompositeIndex.as_of_date.desc()).limit(900).all()
    if not rows:
        return {"latest": None, "history": [], "message": "Ag composite index has not been ingested yet."}

    desc = rows
    asc = list(reversed(desc))
    history = [
        {
            "as_of_date": row.as_of_date,
            "value": round(row.value, 4) if row.value is not None else None,
            "zscore": round(row.zscore, 4) if row.zscore is not None else None,
            "band": zscore_band(row.zscore),
        }
        for row in asc
    ]

    latest = desc[0]
    prev_1d = desc[1] if len(desc) > 1 else None
    prev_1w = desc[5] if len(desc) > 5 else None
    change_1d = None
    change_1w = None
    if prev_1d and prev_1d.value:
        change_1d = round(((latest.value - prev_1d.value) / prev_1d.value) * 100, 2)
    if prev_1w and prev_1w.value:
        change_1w = round(((latest.value - prev_1w.value) / prev_1w.value) * 100, 2)

    components = latest.component_json if isinstance(latest.component_json, dict) else {}
    component_values = [
        {"ticker": ticker, "value": float(value)}
        for ticker, value in components.items()
        if isinstance(value, (int, float))
    ]
    component_sum = sum(item["value"] for item in component_values)
    component_payload = [
        {
            "ticker": item["ticker"],
            "value": round(item["value"], 4),
            "weight": round(1 / len(component_values), 4) if component_values else 0,
            "contribution_pct": round((item["value"] / component_sum) * 100, 2) if component_sum else 0,
        }
        for item in component_values
    ]

    return {
        "latest": {
            "as_of_date": latest.as_of_date,
            "value": round(latest.value, 4) if latest.value is not None else None,
            "zscore": round(latest.zscore, 4) if latest.zscore is not None else None,
            "band": zscore_band(latest.zscore),
            "change_1d_pct": change_1d,
            "change_1w_pct": change_1w,
            "components": component_payload,
        },
        "history": history[-756:],
    }


# ═══════════════════════════════════════════════════════════════════════
# Geo Endpoints
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/counties")
def list_counties(state: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(GeoCounty)
    if state:
        q = q.filter(GeoCounty.state == state.upper())
    rows = q.order_by(GeoCounty.state, GeoCounty.name).all()
    return [{"fips": r.fips, "name": r.name, "state": r.state,
             "lat": r.centroid_lat, "lon": r.centroid_lon} for r in rows]


@app.get("/api/v1/geo/{geo_key}/summary")
def county_summary(
    geo_key: str, as_of: str = "latest",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of)
    data = _compute_county(db, geo_key, resolved_as_of, assumptions)
    zscores = _compute_metric_zscores(db, geo_key, resolved_as_of, assumptions)
    return {**data, "as_of_meta": as_of_meta, "zscores": zscores}


@app.get("/api/v1/geo/{geo_key}/zscore")
def county_zscore(
    geo_key: str,
    as_of: str = "latest",
    window_years: int = 10,
    metrics: Optional[str] = None,
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of)
    metric_keys = [m.strip() for m in metrics.split(",")] if metrics else list(ZSCORE_DEFAULT_METRICS)
    payload = _compute_metric_zscores(
        db,
        geo_key,
        resolved_as_of,
        assumptions,
        metric_keys=metric_keys,
        window_years=window_years,
    )
    return {
        "geo_key": geo_key,
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "window_years": window_years,
        "metrics": payload,
    }


@app.get("/api/v1/geo/{geo_key}/timeseries")
def county_timeseries(
    geo_key: str,
    metrics: str = "cash_rent,benchmark_value,implied_cap_rate,fair_value",
    start_year: Optional[str] = None, end_year: Optional[str] = None,
    as_of: str = "latest",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    metric_keys = [m.strip() for m in metrics.split(",")]
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of)
    try:
        resolved_year_int = int(resolved_as_of)
    except (TypeError, ValueError):
        resolved_year_int = datetime.utcnow().year
    end_year_int = int(end_year) if end_year else resolved_year_int
    start_year_int = int(start_year) if start_year else max(1950, end_year_int - 10)
    lo = min(start_year_int, end_year_int)
    hi = max(start_year_int, end_year_int)
    years = [str(y) for y in range(lo, hi + 1)]
    rows = []
    for year in years:
        data = _compute_county(db, geo_key, year, assumptions)
        row = {"year": year}
        for mk in metric_keys:
            row[mk] = data["metrics"].get(mk)
        rows.append(row)

    bands = {}
    for mk in metric_keys:
        values = [row.get(mk) for row in rows if isinstance(row.get(mk), (int, float))]
        if not values:
            continue
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        stddev = variance ** 0.5
        bands[mk] = {
            "mean": round(mean, 4),
            "stddev": round(stddev, 4),
            "plus_1sigma": round(mean + stddev, 4),
            "minus_1sigma": round(mean - stddev, 4),
            "plus_2sigma": round(mean + (2 * stddev), 4),
            "minus_2sigma": round(mean - (2 * stddev), 4),
        }

    return {
        "geo_key": geo_key,
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "start_year": str(lo),
        "end_year": str(hi),
        "series": rows,
        "bands": bands,
    }


@app.get("/api/v1/geo/{geo_key}/access")
def county_access(geo_key: str, db: Session = Depends(get_db)):
    access = db.query(GeoAccessMetric).filter(
        GeoAccessMetric.geo_key == geo_key
    ).order_by(GeoAccessMetric.as_of_date.desc()).first()
    if not access:
        raise HTTPException(404, "No access data for county")
    return {
        "geo_key": geo_key,
        "access_score": access.access_score,
        "distances": access.distances_json,
        "density": access.density_json,
        "context": access.context_json,
    }


# ═══════════════════════════════════════════════════════════════════════
# Search
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/search")
def search(q: str, db: Session = Depends(get_db)):
    """Fuzzy search across counties, screens, assumptions."""
    ql = q.lower().strip()
    results = []

    # Counties
    counties = db.query(GeoCounty).all()
    for c in counties:
        score = 0
        if ql in c.name.lower():
            score = 100
        elif ql in c.state.lower() or ql in (c.state_name or "").lower():
            score = 60
        elif ql in c.fips:
            score = 80
        if score > 0:
            results.append({"type": "county", "id": c.fips, "label": f"{c.name}, {c.state}",
                            "sublabel": f"FIPS {c.fips}", "score": score})

    # Screens
    screens = db.query(ScreenDefinition).all()
    for s in screens:
        if ql in s.name.lower():
            results.append({"type": "screen", "id": s.id, "label": s.name,
                            "sublabel": f"Screen v{s.version}", "score": 70})

    # Metrics
    for k, spec in METRIC_REGISTRY.items():
        if ql in spec.label.lower() or ql in spec.key.lower():
            results.append({"type": "metric", "id": spec.key, "label": spec.label,
                            "sublabel": spec.description[:60], "score": 50})

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:20]


# ═══════════════════════════════════════════════════════════════════════
# Comparison
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/compare")
def compare_counties(
    fips: str,  # comma-separated list of FIPS codes
    as_of: str = "latest",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of)
    fips_list = [f.strip() for f in fips.split(",")][:6]
    results = []
    for f in fips_list:
        data = _compute_county(db, f, resolved_as_of, assumptions)
        results.append(data)
    return {"as_of": resolved_as_of, "as_of_meta": as_of_meta, "counties": results}


# ═══════════════════════════════════════════════════════════════════════
# Screener
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/screener")
def run_screener(
    screen_id: Optional[int] = None, as_of: str = "latest",
    assumption_set_id: Optional[int] = None,
    min_cap: Optional[float] = None,
    max_rent_mult: Optional[float] = None,
    min_access: Optional[float] = None,
    z_implied_cap_rate_min: Optional[float] = None,
    z_implied_cap_rate_max: Optional[float] = None,
    z_fair_value_min: Optional[float] = None,
    z_fair_value_max: Optional[float] = None,
    z_cash_rent_min: Optional[float] = None,
    z_cash_rent_max: Optional[float] = None,
    window_years: int = 10,
    state: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = "desc",
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of, state=state)

    filters = []
    if screen_id:
        screen = db.query(ScreenDefinition).filter(ScreenDefinition.id == screen_id).first()
        if screen:
            filters = screen.filters_json or []
    else:
        if min_cap is not None:
            filters.append({"metric": "implied_cap_rate", "op": ">", "value": min_cap})
        if max_rent_mult is not None:
            filters.append({"metric": "rent_multiple", "op": "<", "value": max_rent_mult})
        if min_access is not None:
            filters.append({"metric": "access_score", "op": ">", "value": min_access})

    z_filters = {
        "implied_cap_rate": {"min": z_implied_cap_rate_min, "max": z_implied_cap_rate_max},
        "fair_value": {"min": z_fair_value_min, "max": z_fair_value_max},
        "cash_rent": {"min": z_cash_rent_min, "max": z_cash_rent_max},
    }
    z_filters = {
        metric: bounds
        for metric, bounds in z_filters.items()
        if bounds["min"] is not None or bounds["max"] is not None
    }

    q = db.query(GeoCounty)
    if state:
        q = q.filter(GeoCounty.state == state.upper())
    counties = q.all()

    results = []
    for c in counties:
        data = _compute_county(db, c.fips, resolved_as_of, assumptions)
        m = data["metrics"]
        zscores = _compute_metric_zscores(
            db,
            c.fips,
            resolved_as_of,
            assumptions,
            metric_keys=["implied_cap_rate", "fair_value", "cash_rent"],
            window_years=window_years,
        )

        passes = True
        for f in filters:
            val = m.get(f["metric"])
            if val is None:
                passes = False
                break
            op, threshold = f["op"], f["value"]
            if op == ">" and val <= threshold:
                passes = False
            elif op == "<" and val >= threshold:
                passes = False
            elif op == ">=" and val < threshold:
                passes = False
            elif op == "<=" and val > threshold:
                passes = False
            if not passes:
                break

        if passes and z_filters:
            for metric, bounds in z_filters.items():
                z_value = zscores.get(metric, {}).get("zscore")
                if z_value is None:
                    passes = False
                    break
                if bounds["min"] is not None and z_value < bounds["min"]:
                    passes = False
                    break
                if bounds["max"] is not None and z_value > bounds["max"]:
                    passes = False
                    break

        if passes:
            results.append({
                "fips": c.fips, "county": c.name, "state": c.state,
                "zscores": zscores,
                "metrics": {k: round(v, 2) if v else None for k, v in m.items()},
            })

    # Sort
    sort_key = sort_by or "implied_cap_rate"
    reverse = sort_dir != "asc"
    results.sort(key=lambda x: x["metrics"].get(sort_key, 0) or 0, reverse=reverse)
    return {
        "count": len(results),
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "filters": filters,
        "z_filters": z_filters,
        "results": results,
    }


# ═══════════════════════════════════════════════════════════════════════
# Scenario / Sensitivity / Backtest
# ═══════════════════════════════════════════════════════════════════════

class ScenarioRequest(BaseModel):
    geo_key: str
    as_of: str = "latest"
    assumption_set_id: int | None = None
    overrides: dict | None = None
    vary_params: list[dict] | None = None
    scenario_sets: list[dict] | None = None

@app.post("/api/v1/run/scenario")
def run_scenario(body: ScenarioRequest, db: Session = Depends(get_db)):
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, body.as_of)
    assumptions = _get_assumptions(db, body.assumption_set_id)
    if body.overrides:
        assumptions = {**assumptions, **body.overrides}

    base = _compute_county(db, body.geo_key, resolved_as_of, assumptions)
    sensitivities = {}
    if body.vary_params:
        series = _load_series_for_county(db, body.geo_key, resolved_as_of)
        for vp in body.vary_params:
            ctx = ComputeContext(
                geo_key=body.geo_key, as_of_year=resolved_as_of,
                series=series, metrics={}, assumptions=assumptions,
            )
            results = compute_sensitivity(
                ctx, vary_param=vp["param"], values=vp["values"],
                target_metric=vp.get("target_metric", "fair_value"),
            )
            sensitivities[vp["param"]] = results

    scenarios = []
    comparison_table = []
    assumption_deltas = {}
    driver_decomposition = []
    if body.scenario_sets:
        for idx, scenario_set in enumerate(body.scenario_sets):
            name = (scenario_set.get("name") if isinstance(scenario_set, dict) else None) or f"scenario_{idx + 1}"
            overrides = scenario_set.get("overrides", {}) if isinstance(scenario_set, dict) else {}
            scenario_assumptions = {**assumptions, **overrides}
            scenario = _compute_county(db, body.geo_key, resolved_as_of, scenario_assumptions)
            scenarios.append({
                "name": name,
                "assumptions": scenario_assumptions,
                "result": scenario,
            })

            fair_value = scenario["metrics"].get("fair_value")
            base_fair_value = base["metrics"].get("fair_value")
            delta = None
            if isinstance(fair_value, (int, float)) and isinstance(base_fair_value, (int, float)):
                delta = fair_value - base_fair_value
            comparison_table.append({
                "scenario": name,
                "fair_value": fair_value,
                "implied_cap_rate": scenario["metrics"].get("implied_cap_rate"),
                "noi_per_acre": scenario["metrics"].get("noi_per_acre"),
                "delta_fair_value_vs_base": delta,
            })

            deltas = {}
            for key, override_val in overrides.items():
                try:
                    deltas[key] = float(override_val) - float(assumptions.get(key, 0))
                except (TypeError, ValueError):
                    continue
            assumption_deltas[name] = deltas

            driver_rows = []
            for key, override_val in overrides.items():
                one_at_a_time = _compute_county(
                    db,
                    body.geo_key,
                    resolved_as_of,
                    {**assumptions, **{key: override_val}},
                )
                one_value = one_at_a_time["metrics"].get("fair_value")
                base_value = base["metrics"].get("fair_value")
                if isinstance(one_value, (int, float)) and isinstance(base_value, (int, float)):
                    one_delta = one_value - base_value
                else:
                    one_delta = 0.0
                driver_rows.append({"driver": key, "delta": round(one_delta, 4)})
            net_delta = 0.0
            if isinstance(fair_value, (int, float)) and isinstance(base_fair_value, (int, float)):
                net_delta = fair_value - base_fair_value
            explained = sum(item["delta"] for item in driver_rows)
            driver_decomposition.append({
                "scenario": name,
                "drivers": sorted(driver_rows, key=lambda item: abs(item["delta"]), reverse=True),
                "residual": round(net_delta - explained, 4),
            })

    return {
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "base": base,
        "sensitivities": sensitivities,
        "scenarios": scenarios,
        "comparison_table": comparison_table,
        "assumption_deltas": assumption_deltas,
        "driver_decomposition": driver_decomposition,
    }


@app.get("/api/v1/geo/{geo_key}/sensitivity")
def sensitivity_matrix(
    geo_key: str, as_of: str = "latest",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of)
    series = _load_series_for_county(db, geo_key, resolved_as_of)
    rent_shocks = [s / 100 for s in range(-20, 25, 5)]

    matrix = []
    for rv in [2.0, 3.0, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0]:
        row = {"risk_premium": rv}
        for gv in [0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04]:
            ctx = ComputeContext(
                geo_key=geo_key, as_of_year=resolved_as_of,
                series=dict(series), metrics={},
                assumptions={**assumptions, "risk_premium": rv, "long_run_growth": gv},
            )
            compute_all(ctx)
            row[f"g_{gv}"] = round(ctx.metrics.get("fair_value", 0), 0) if ctx.metrics.get("fair_value") else None
        matrix.append(row)

    rent_sens = []
    for rs in rent_shocks:
        ctx = ComputeContext(
            geo_key=geo_key, as_of_year=resolved_as_of,
            series=dict(series), metrics={},
            assumptions={**assumptions, "near_term_rent_shock": rs},
        )
        compute_all(ctx)
        rent_sens.append({
            "rent_shock": rs,
            "fair_value": round(ctx.metrics.get("fair_value", 0), 0) if ctx.metrics.get("fair_value") else None,
            "noi": round(ctx.metrics.get("noi_per_acre", 0), 2) if ctx.metrics.get("noi_per_acre") else None,
        })

    return {
        "geo_key": geo_key,
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "rate_growth_matrix": matrix,
        "rent_shock_sensitivity": rent_sens,
    }


class BacktestRequest(BaseModel):
    screen_id: int
    start_year: str = "2018"
    eval_years: int = 3
    assumption_set_id: int | None = None

@app.post("/api/v1/run/backtest")
def run_backtest(body: BacktestRequest, db: Session = Depends(get_db)):
    screen = db.query(ScreenDefinition).filter(ScreenDefinition.id == body.screen_id).first()
    if not screen:
        raise HTTPException(404, "Screen not found")

    assumptions = _get_assumptions(db, body.assumption_set_id)
    counties = db.query(GeoCounty).all()
    start = int(body.start_year)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, "latest")
    try:
        max_year = int(resolved_as_of)
    except (TypeError, ValueError):
        max_year = datetime.utcnow().year
    end = min(start + body.eval_years, max_year)

    flagged = []
    for c in counties:
        data = _compute_county(db, c.fips, body.start_year, assumptions)
        m = data["metrics"]
        passes = True
        for f in screen.filters_json or []:
            val = m.get(f["metric"])
            if val is None:
                passes = False
                break
            if f["op"] == ">" and val <= f["value"]:
                passes = False
            elif f["op"] == "<" and val >= f["value"]:
                passes = False
            if not passes:
                break
        if passes:
            flagged.append({
                "fips": c.fips, "county": c.name, "state": c.state,
                "start_metrics": {k: round(v, 2) for k, v in m.items()},
            })

    for item in flagged:
        end_data = _compute_county(db, item["fips"], str(end), assumptions)
        em = end_data["metrics"]
        sv = item["start_metrics"].get("benchmark_value", 0) or 0
        ev = em.get("benchmark_value", 0) or 0
        vc = ((ev - sv) / sv * 100) if sv > 0 else 0
        sr = item["start_metrics"].get("cash_rent", 0) or 0
        er = em.get("cash_rent", 0) or 0
        rc = ((er - sr) / sr * 100) if sr > 0 else 0
        item["end_metrics"] = {k: round(v, 2) for k, v in em.items()}
        item["value_change_pct"] = round(vc, 2)
        item["rent_change_pct"] = round(rc, 2)
        item["total_return_est"] = round(vc + (item["start_metrics"].get("implied_cap_rate", 0) or 0) * body.eval_years, 2)

    flagged.sort(key=lambda x: x.get("total_return_est", 0), reverse=True)
    return {
        "screen": {"id": screen.id, "name": screen.name, "filters": screen.filters_json},
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "start_year": body.start_year, "eval_years": body.eval_years,
        "counties_screened": len(counties), "counties_flagged": len(flagged),
        "results": flagged,
    }


# ═══════════════════════════════════════════════════════════════════════
# Dashboard
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/dashboard")
def dashboard(as_of: str = "latest", assumption_set_id: Optional[int] = None, db: Session = Depends(get_db)):
    assumptions = _get_assumptions(db, assumption_set_id)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of)
    counties = db.query(GeoCounty).all()

    all_data = []
    for c in counties:
        data = _compute_county(db, c.fips, resolved_as_of, assumptions)
        all_data.append(data)

    caps = [d["metrics"].get("implied_cap_rate") for d in all_data if d["metrics"].get("implied_cap_rate")]
    fvs = [d["metrics"].get("fair_value") for d in all_data if d["metrics"].get("fair_value")]
    rents = [d["metrics"].get("cash_rent") for d in all_data if d["metrics"].get("cash_rent")]
    vals = [d["metrics"].get("benchmark_value") for d in all_data if d["metrics"].get("benchmark_value")]
    access_scores = [d["metrics"].get("access_score") for d in all_data if d["metrics"].get("access_score")]

    def stats(arr):
        if not arr:
            return {}
        arr.sort()
        n = len(arr)
        return {"min": round(min(arr), 2), "max": round(max(arr), 2),
                "mean": round(sum(arr) / n, 2), "median": round(arr[n // 2], 2),
                "p25": round(arr[n // 4], 2), "p75": round(arr[3 * n // 4], 2)}

    movers = []
    for d in all_data:
        fv = d["metrics"].get("fair_value")
        bv = d["metrics"].get("benchmark_value")
        if fv and bv and bv > 0:
            spread = (fv - bv) / bv * 100
            movers.append({
                "fips": d["geo_key"], "county": d["county_name"], "state": d["state"],
                "fair_value": round(fv, 0), "benchmark_value": round(bv, 0),
                "spread_pct": round(spread, 1),
                "implied_cap": round(d["metrics"].get("implied_cap_rate", 0), 2),
                "access_score": round(d["metrics"].get("access_score", 0) or 0, 1),
                "noi": round(d["metrics"].get("noi_per_acre", 0) or 0, 0),
            })
    movers.sort(key=lambda x: abs(x["spread_pct"]), reverse=True)

    # State breakdown
    state_data: dict[str, list] = {}
    for d in all_data:
        st = d["state"]
        state_data.setdefault(st, []).append(d["metrics"])
    state_summary = {}
    for st, items in state_data.items():
        c_list = [i.get("implied_cap_rate", 0) or 0 for i in items]
        v_list = [i.get("benchmark_value", 0) or 0 for i in items]
        state_summary[st] = {
            "count": len(items),
            "avg_cap": round(sum(c_list) / len(c_list), 2) if c_list else 0,
            "avg_value": round(sum(v_list) / len(v_list), 0) if v_list else 0,
        }

    try:
        end_year = int(resolved_as_of)
    except (TypeError, ValueError):
        end_year = datetime.utcnow().year
    start_year = max(2000, end_year - 9)
    chart_rows = []
    for year in range(start_year, end_year + 1):
        year_data = [_compute_county(db, c.fips, str(year), assumptions) for c in counties]
        year_caps = [d["metrics"].get("implied_cap_rate") for d in year_data if d["metrics"].get("implied_cap_rate")]
        year_fvs = [d["metrics"].get("fair_value") for d in year_data if d["metrics"].get("fair_value")]
        year_rents = [d["metrics"].get("cash_rent") for d in year_data if d["metrics"].get("cash_rent")]
        year_stats_cap = stats(year_caps) if year_caps else {}
        year_stats_fv = stats(year_fvs) if year_fvs else {}
        year_stats_rent = stats(year_rents) if year_rents else {}
        treasury = None
        if year_data:
            req_return = year_data[0]["metrics"].get("required_return")
            if isinstance(req_return, (int, float)):
                treasury = round(req_return - assumptions.get("risk_premium", 2.0), 4)
        chart_rows.append({
            "year": str(year),
            "cap_rate_median": year_stats_cap.get("median"),
            "fair_value_median": year_stats_fv.get("median"),
            "cash_rent_median": year_stats_rent.get("median"),
            "treasury_10y": treasury,
        })

    chart_years = [row["year"] for row in chart_rows]
    cap_series = [row["cap_rate_median"] for row in chart_rows if isinstance(row["cap_rate_median"], (int, float))]
    fair_series = [row["fair_value_median"] for row in chart_rows if isinstance(row["fair_value_median"], (int, float))]
    rent_series = [row["cash_rent_median"] for row in chart_rows if isinstance(row["cash_rent_median"], (int, float))]
    cap_summary_stats = compute_zscore_stats((stats(caps).get("median") if caps else None), cap_series, chart_years)
    fair_summary_stats = compute_zscore_stats((stats(fvs).get("median") if fvs else None), fair_series, chart_years)
    rent_summary_stats = compute_zscore_stats((stats(rents).get("median") if rents else None), rent_series, chart_years)

    return {
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "county_count": len(counties),
        "summary": {
            "implied_cap_rate": stats(caps), "fair_value": stats(fvs),
            "cash_rent": stats(rents), "benchmark_value": stats(vals),
            "access_score": stats(access_scores),
        },
        "summary_zscores": {
            "implied_cap_rate": {**cap_summary_stats, "band": zscore_band(cap_summary_stats.get("zscore"))},
            "fair_value": {**fair_summary_stats, "band": zscore_band(fair_summary_stats.get("zscore"))},
            "cash_rent": {**rent_summary_stats, "band": zscore_band(rent_summary_stats.get("zscore"))},
        },
        "charts": {
            "cap_rate_median_by_year": [{"year": row["year"], "value": row["cap_rate_median"]} for row in chart_rows],
            "fair_value_median_by_year": [{"year": row["year"], "value": row["fair_value_median"]} for row in chart_rows],
            "cash_rent_median_by_year": [{"year": row["year"], "value": row["cash_rent_median"]} for row in chart_rows],
            "treasury_10y_by_year": [{"year": row["year"], "value": row["treasury_10y"]} for row in chart_rows],
        },
        "treasury_10y": all_data[0]["metrics"].get("required_return", 0) - assumptions.get("risk_premium", 2.0) if all_data else 0,
        "top_movers": movers[:15],
        "state_summary": state_summary,
    }


# ═══════════════════════════════════════════════════════════════════════
# Facilities
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/facilities")
def list_facilities(type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(PoiFacility)
    if type:
        q = q.filter(PoiFacility.type == type)
    rows = q.all()
    return [{"id": r.id, "type": r.type, "name": r.name, "lat": r.lat, "lon": r.lon} for r in rows]


# ═══════════════════════════════════════════════════════════════════════
# Watchlist
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/watchlist")
def get_watchlist(as_of: str = "latest", db: Session = Depends(get_db)):
    items = db.query(WatchlistItem).all()
    assumptions = _get_assumptions(db)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of)
    try:
        previous_year = str(int(resolved_as_of) - 1)
    except (TypeError, ValueError):
        previous_year = resolved_as_of
    result = []
    for item in items:
        data = _compute_county(db, item.geo_key, resolved_as_of, assumptions)
        # Previous year for change tracking
        prev = _compute_county(db, item.geo_key, previous_year, assumptions)
        m = data["metrics"]
        pm = prev["metrics"]

        def delta(k):
            cur = m.get(k)
            prv = pm.get(k)
            if cur is not None and prv is not None and prv != 0:
                return round((cur - prv) / abs(prv) * 100, 1)
            return None

        result.append({
            "id": item.id, "fips": item.geo_key,
            "county": data["county_name"], "state": data["state"],
            "added_at": str(item.added_at) if item.added_at else None,
            "notes": item.notes,
            "metrics": {k: round(v, 2) if v else None for k, v in m.items()},
            "changes": {
                "cash_rent": delta("cash_rent"),
                "benchmark_value": delta("benchmark_value"),
                "implied_cap_rate": delta("implied_cap_rate"),
                "fair_value": delta("fair_value"),
            },
        })
    return {
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        "items": result,
    }


class WatchlistAdd(BaseModel):
    geo_key: str
    notes: str | None = None

@app.post("/api/v1/watchlist")
def add_to_watchlist(body: WatchlistAdd, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    existing = db.query(WatchlistItem).filter(WatchlistItem.geo_key == body.geo_key).first()
    if existing:
        return {"id": existing.id, "status": "already_watching"}
    item = WatchlistItem(geo_key=body.geo_key, notes=body.notes)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": "added"}


@app.delete("/api/v1/watchlist/{geo_key}")
def remove_from_watchlist(geo_key: str, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    item = db.query(WatchlistItem).filter(WatchlistItem.geo_key == geo_key).first()
    if not item:
        raise HTTPException(404, "Not in watchlist")
    db.delete(item)
    db.commit()
    return {"status": "removed"}


# ═══════════════════════════════════════════════════════════════════════
# Notes
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/notes/{geo_key}")
def get_notes(geo_key: str, db: Session = Depends(get_db)):
    notes = db.query(CountyNote).filter(
        CountyNote.geo_key == geo_key
    ).order_by(CountyNote.created_at.desc()).all()
    return [{"id": n.id, "content": n.content,
             "created_at": str(n.created_at)} for n in notes]


class NoteCreate(BaseModel):
    content: str

@app.post("/api/v1/notes/{geo_key}")
def add_note(geo_key: str, body: NoteCreate, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    note = CountyNote(geo_key=geo_key, content=body.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "content": note.content, "created_at": str(note.created_at)}


@app.delete("/api/v1/notes/{note_id}")
def delete_note(note_id: int, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    note = db.query(CountyNote).filter(CountyNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()
    return {"status": "deleted"}


# ═══════════════════════════════════════════════════════════════════════
# Auth
# ═══════════════════════════════════════════════════════════════════════

@app.post("/api/v1/auth/bootstrap")
def auth_bootstrap(request: Request, db: Session = Depends(get_db)):
    bearer = _extract_bearer_token(request)
    session = _get_valid_session(db, bearer)
    if session:
        return _auth_payload(
            user_key=session.user_key,
            source=session.identity_source or "session",
            token=bearer or "",
            session=session,
        )

    header_identity = _extract_header_identity(request)
    if header_identity:
        token, new_session = _create_session(
            db,
            request,
            header_identity["user_key"],
            header_identity["source"],
        )
        return _auth_payload(
            user_key=header_identity["user_key"],
            source=header_identity["source"],
            token=token,
            session=new_session,
        )

    if ALLOW_ANON_SESSIONS:
        anon_user = f"anon_{secrets.token_hex(8)}"
        token, new_session = _create_session(db, request, anon_user, "anonymous")
        return _auth_payload(
            user_key=anon_user,
            source="anonymous",
            token=token,
            session=new_session,
        )

    raise HTTPException(401, "Authentication required")


@app.get("/api/v1/auth/me")
def auth_me(request: Request, db: Session = Depends(get_db)):
    bearer = _extract_bearer_token(request)
    session = _get_valid_session(db, bearer)
    if session:
        return _auth_payload(
            user_key=session.user_key,
            source=session.identity_source or "session",
            token=bearer or "",
            session=session,
        )

    header_identity = _extract_header_identity(request)
    if header_identity:
        return {
            "user_key": header_identity["user_key"],
            "source": header_identity["source"],
            "token": None,
            "expires_at": None,
            "is_anonymous": False,
        }

    raise HTTPException(401, "Authentication required")


@app.post("/api/v1/auth/logout")
def auth_logout(request: Request, db: Session = Depends(get_db)):
    bearer = _extract_bearer_token(request)
    if not bearer:
        raise HTTPException(401, "Authentication required")
    session = _get_valid_session(db, bearer)
    if not session:
        raise HTTPException(401, "Authentication required")
    session.revoked_at = datetime.utcnow()
    db.add(session)
    db.commit()
    return {"status": "logged_out"}


# ═══════════════════════════════════════════════════════════════════════
# Research Workspace
# ═══════════════════════════════════════════════════════════════════════

class ResearchWorkspaceUpsert(BaseModel):
    thesis: str | None = None
    analysis: dict | None = None
    tags: list[str] | None = None
    status: str | None = None
    conviction: float | None = None


class ResearchWorkspaceNoteCreate(BaseModel):
    content: str


class ResearchScenarioPackCreate(BaseModel):
    name: str
    risk_premium: float
    growth_rate: float
    rent_shock: float


@app.get("/api/v1/research/workspaces")
def list_research_workspaces(request: Request, db: Session = Depends(get_db)):
    user_key = _get_research_user(request, db)
    rows = db.query(ResearchWorkspace).order_by(
        ResearchWorkspace.updated_at.desc(),
        ResearchWorkspace.id.desc(),
    ).all()
    return [
        _serialize_workspace(db, r)
        for r in rows
        if _workspace_is_visible_to_user(r, user_key)
    ]


@app.get("/api/v1/research/workspaces/{geo_key}")
def get_research_workspace(geo_key: str, request: Request, db: Session = Depends(get_db)):
    user_key = _get_research_user(request, db)
    workspace = _find_workspace_for_user(db, user_key, geo_key)
    if not workspace:
        return _workspace_defaults(geo_key)
    return _serialize_workspace(db, workspace)


@app.put("/api/v1/research/workspaces/{geo_key}")
def upsert_research_workspace(
    geo_key: str, body: ResearchWorkspaceUpsert, request: Request, db: Session = Depends(get_db)
):
    user_key = _get_research_user(request, db)
    workspace = _get_or_create_workspace(db, user_key, geo_key)
    workspace.thesis = (body.thesis or "").strip()
    existing_analysis = workspace.analysis_json if isinstance(workspace.analysis_json, dict) else {}
    merged_analysis = {
        "thesis": body.analysis.get("thesis", existing_analysis.get("thesis", "")) if body.analysis else existing_analysis.get("thesis", ""),
        "bull_case": body.analysis.get("bull_case", existing_analysis.get("bull_case", "")) if body.analysis else existing_analysis.get("bull_case", ""),
        "bear_case": body.analysis.get("bear_case", existing_analysis.get("bear_case", "")) if body.analysis else existing_analysis.get("bear_case", ""),
        "key_risks": body.analysis.get("key_risks", existing_analysis.get("key_risks", [])) if body.analysis else existing_analysis.get("key_risks", []),
        "catalysts": body.analysis.get("catalysts", existing_analysis.get("catalysts", [])) if body.analysis else existing_analysis.get("catalysts", []),
        "decision_state": body.analysis.get("decision_state", existing_analysis.get("decision_state", "exploring")) if body.analysis else existing_analysis.get("decision_state", "exploring"),
    }
    workspace.analysis_json = merged_analysis
    workspace.tags_json = [
        t.strip() for t in (body.tags or [])
        if isinstance(t, str) and t.strip()
    ]
    workspace.status = (body.status or "exploring").strip() or "exploring"
    workspace.conviction = _clamp_conviction(body.conviction)
    workspace.updated_at = datetime.utcnow()
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return _serialize_workspace(db, workspace)


@app.post("/api/v1/research/workspaces/{geo_key}/notes")
def add_research_workspace_note(
    geo_key: str, body: ResearchWorkspaceNoteCreate, request: Request, db: Session = Depends(get_db)
):
    user_key = _get_research_user(request, db)
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "Note content is required")

    workspace = _get_or_create_workspace(db, user_key, geo_key)
    note = ResearchNote(workspace_id=workspace.id, content=content)
    workspace.updated_at = datetime.utcnow()
    db.add(note)
    db.add(workspace)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "workspace_id": workspace.id,
        "content": note.content,
        "created_at": str(note.created_at) if note.created_at else None,
    }


@app.delete("/api/v1/research/notes/{note_id}")
def delete_research_workspace_note(note_id: int, request: Request, db: Session = Depends(get_db)):
    user_key = _get_research_user(request, db)
    note = db.query(ResearchNote).filter(ResearchNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Research note not found")
    workspace = db.query(ResearchWorkspace).filter(
        ResearchWorkspace.id == note.workspace_id
    ).first()
    if not workspace or not _workspace_is_visible_to_user(workspace, user_key):
        raise HTTPException(404, "Research note not found")
    if workspace:
        workspace.updated_at = datetime.utcnow()
        db.add(workspace)
    db.delete(note)
    db.commit()
    return {"status": "deleted"}


@app.post("/api/v1/research/workspaces/{geo_key}/scenario-packs")
def create_research_scenario_pack(
    geo_key: str, body: ResearchScenarioPackCreate, request: Request, db: Session = Depends(get_db)
):
    user_key = _get_research_user(request, db)
    workspace = _get_or_create_workspace(db, user_key, geo_key)
    name = body.name.strip() or f"Pack {datetime.utcnow().date().isoformat()}"
    pack = ResearchScenarioPack(
        workspace_id=workspace.id,
        name=name,
        risk_premium=float(body.risk_premium),
        growth_rate=float(body.growth_rate),
        rent_shock=float(body.rent_shock),
    )
    workspace.updated_at = datetime.utcnow()
    db.add(pack)
    db.add(workspace)
    db.commit()
    db.refresh(pack)
    return {
        "id": pack.id,
        "workspace_id": workspace.id,
        "name": pack.name,
        "risk_premium": pack.risk_premium,
        "growth_rate": pack.growth_rate,
        "rent_shock": pack.rent_shock,
        "created_at": str(pack.created_at) if pack.created_at else None,
        "updated_at": str(pack.updated_at) if pack.updated_at else None,
    }


@app.delete("/api/v1/research/scenario-packs/{pack_id}")
def delete_research_scenario_pack(pack_id: int, request: Request, db: Session = Depends(get_db)):
    user_key = _get_research_user(request, db)
    pack = db.query(ResearchScenarioPack).filter(
        ResearchScenarioPack.id == pack_id
    ).first()
    if not pack:
        raise HTTPException(404, "Scenario pack not found")

    workspace = db.query(ResearchWorkspace).filter(
        ResearchWorkspace.id == pack.workspace_id
    ).first()
    if not workspace or not _workspace_is_visible_to_user(workspace, user_key):
        raise HTTPException(404, "Scenario pack not found")
    if workspace:
        workspace.updated_at = datetime.utcnow()
        db.add(workspace)
    db.delete(pack)
    db.commit()
    return {"status": "deleted"}


class ResearchScenarioRunCreate(BaseModel):
    scenario_name: str | None = None
    as_of_date: str
    assumptions: dict
    comparison: dict


@app.get("/api/v1/research/workspaces/{geo_key}/scenario-runs")
def list_research_scenario_runs(
    geo_key: str,
    request: Request,
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    user_key = _get_research_user(request, db)
    workspace = _find_workspace_for_user(db, user_key, geo_key)
    if not workspace:
        return []

    rows = db.query(ResearchScenarioRun).filter(
        ResearchScenarioRun.workspace_id == workspace.id
    ).order_by(
        ResearchScenarioRun.created_at.desc(),
        ResearchScenarioRun.id.desc(),
    ).limit(limit).all()

    return [
        {
            "id": row.id,
            "scenario_name": row.scenario_name or "",
            "as_of_date": row.as_of_date,
            "assumptions": row.assumptions_json or {},
            "comparison": row.comparison_json or {},
            "created_at": str(row.created_at) if row.created_at else None,
        }
        for row in rows
    ]


@app.post("/api/v1/research/workspaces/{geo_key}/scenario-runs")
def create_research_scenario_run(
    geo_key: str,
    body: ResearchScenarioRunCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    user_key = _get_research_user(request, db)
    workspace = _get_or_create_workspace(db, user_key, geo_key)
    as_of = body.as_of_date.strip()
    if not as_of:
        raise HTTPException(400, "as_of_date is required")
    run = ResearchScenarioRun(
        workspace_id=workspace.id,
        scenario_name=(body.scenario_name or "").strip() or None,
        as_of_date=as_of,
        assumptions_json=body.assumptions or {},
        comparison_json=body.comparison or {},
    )
    workspace.updated_at = datetime.utcnow()
    db.add(run)
    db.add(workspace)
    db.commit()
    db.refresh(run)
    return {
        "id": run.id,
        "scenario_name": run.scenario_name or "",
        "as_of_date": run.as_of_date,
        "assumptions": run.assumptions_json or {},
        "comparison": run.comparison_json or {},
        "created_at": str(run.created_at) if run.created_at else None,
    }


# ═══════════════════════════════════════════════════════════════════════
# Portfolios
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/portfolios")
def list_portfolios(db: Session = Depends(get_db)):
    portfolios = db.query(Portfolio).all()
    result = []
    for p in portfolios:
        holdings = db.query(PortfolioHolding).filter(PortfolioHolding.portfolio_id == p.id).all()
        result.append({
            "id": p.id, "name": p.name, "description": p.description,
            "holdings_count": len(holdings),
            "total_acres": sum(h.acres for h in holdings),
            "created_at": str(p.created_at),
        })
    return result


@app.get("/api/v1/portfolios/{portfolio_id}")
def get_portfolio(portfolio_id: int, as_of: str = "latest", db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p:
        raise HTTPException(404, "Portfolio not found")

    holdings = db.query(PortfolioHolding).filter(PortfolioHolding.portfolio_id == p.id).all()
    assumptions = _get_assumptions(db)
    resolved_as_of, as_of_meta = _resolve_as_of_with_meta(db, as_of)

    # Compute all county data
    county_data = {}
    holding_dicts = []
    for h in holdings:
        data = _compute_county(db, h.geo_key, resolved_as_of, assumptions)
        county_data[h.geo_key] = data
        holding_dicts.append({
            "geo_key": h.geo_key,
            "acres": h.acres,
            "purchase_price_per_acre": h.purchase_price_per_acre,
            "purchase_year": h.purchase_year,
        })

    analytics = compute_portfolio_metrics(holding_dicts, county_data)

    return {
        "id": p.id, "name": p.name, "description": p.description,
        "as_of": resolved_as_of,
        "as_of_meta": as_of_meta,
        **analytics,
    }


class PortfolioCreate(BaseModel):
    name: str
    description: str | None = None

@app.post("/api/v1/portfolios")
def create_portfolio(body: PortfolioCreate, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    p = Portfolio(name=body.name, description=body.description)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name}


class HoldingAdd(BaseModel):
    geo_key: str
    acres: float = 100
    purchase_price_per_acre: float | None = None
    purchase_year: str | None = None

@app.post("/api/v1/portfolios/{portfolio_id}/holdings")
def add_holding(portfolio_id: int, body: HoldingAdd, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p:
        raise HTTPException(404, "Portfolio not found")
    h = PortfolioHolding(
        portfolio_id=portfolio_id, geo_key=body.geo_key,
        acres=body.acres, purchase_price_per_acre=body.purchase_price_per_acre,
        purchase_year=body.purchase_year,
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    return {"id": h.id, "status": "added"}


@app.delete("/api/v1/portfolios/{portfolio_id}/holdings/{geo_key}")
def remove_holding(portfolio_id: int, geo_key: str, request: Request, db: Session = Depends(get_db)):
    _require_write_auth(request, db)
    h = db.query(PortfolioHolding).filter(
        PortfolioHolding.portfolio_id == portfolio_id,
        PortfolioHolding.geo_key == geo_key,
    ).first()
    if not h:
        raise HTTPException(404, "Holding not found")
    db.delete(h)
    db.commit()
    return {"status": "removed"}


# ═══════════════════════════════════════════════════════════════════════
# Export
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/export/screener")
def export_screener(
    as_of: str = "latest",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Export all counties as CSV."""
    assumptions = _get_assumptions(db, assumption_set_id)
    resolved_as_of, _ = _resolve_as_of_with_meta(db, as_of)
    counties = db.query(GeoCounty).order_by(GeoCounty.state, GeoCounty.name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    headers = ["FIPS", "County", "State", "Cash Rent", "Land Value", "NOI/Acre",
               "Implied Cap Rate", "Rent Multiple", "Fair Value", "Cap Spread (bps)",
               "Access Score", "DSCR", "Payback Years"]
    writer.writerow(headers)

    for c in counties:
        data = _compute_county(db, c.fips, resolved_as_of, assumptions)
        m = data["metrics"]
        writer.writerow([
            c.fips, c.name, c.state,
            round(m.get("cash_rent", 0) or 0, 2),
            round(m.get("benchmark_value", 0) or 0, 0),
            round(m.get("noi_per_acre", 0) or 0, 2),
            round(m.get("implied_cap_rate", 0) or 0, 2),
            round(m.get("rent_multiple", 0) or 0, 1),
            round(m.get("fair_value", 0) or 0, 0),
            round(m.get("cap_spread_to_10y", 0) or 0, 0),
            round(m.get("access_score", 0) or 0, 1),
            round(m.get("dscr", 0) or 0, 2),
            round(m.get("payback_period", 0) or 0, 1),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=farmland_screener_{resolved_as_of}.csv"},
    )
