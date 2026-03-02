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
    ResearchWorkspace, ResearchNote, ResearchScenarioPack, AuthSession,
)
from app.services.metric_engine import (
    ComputeContext, compute_all, compute_sensitivity,
    get_metric_catalog, METRIC_REGISTRY,
)
from app.services.portfolio import compute_portfolio_metrics

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
                    id, owner_key, geo_key, thesis, tags_json, status, conviction, created_at, updated_at
                )
                SELECT
                    id,
                    'owner_default',
                    geo_key,
                    thesis,
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
    payload.update({
        "thesis": workspace.thesis or "",
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


@app.get("/api/v1/assumptions")
def list_assumptions(db: Session = Depends(get_db)):
    rows = db.query(AssumptionSet).all()
    return [{"id": r.id, "name": r.name, "version": r.version,
             "params": r.params_json, "created_at": str(r.created_at)} for r in rows]


class AssumptionCreate(BaseModel):
    name: str
    params: dict

@app.post("/api/v1/assumptions")
def create_assumption(body: AssumptionCreate, db: Session = Depends(get_db)):
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
def create_screen(body: ScreenCreate, db: Session = Depends(get_db)):
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
    geo_key: str, as_of: str = "2025",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    return _compute_county(db, geo_key, as_of, assumptions)


@app.get("/api/v1/geo/{geo_key}/timeseries")
def county_timeseries(
    geo_key: str,
    metrics: str = "cash_rent,benchmark_value,implied_cap_rate,fair_value",
    start_year: str = "2015", end_year: str = "2025",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    metric_keys = [m.strip() for m in metrics.split(",")]
    years = [str(y) for y in range(int(start_year), int(end_year) + 1)]
    result = []
    for year in years:
        data = _compute_county(db, geo_key, year, assumptions)
        row = {"year": year}
        for mk in metric_keys:
            row[mk] = data["metrics"].get(mk)
        result.append(row)
    return result


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
    as_of: str = "2025",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    fips_list = [f.strip() for f in fips.split(",")][:6]
    results = []
    for f in fips_list:
        data = _compute_county(db, f, as_of, assumptions)
        results.append(data)
    return {"as_of": as_of, "counties": results}


# ═══════════════════════════════════════════════════════════════════════
# Screener
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/screener")
def run_screener(
    screen_id: Optional[int] = None, as_of: str = "2025",
    assumption_set_id: Optional[int] = None,
    min_cap: Optional[float] = None,
    max_rent_mult: Optional[float] = None,
    min_access: Optional[float] = None,
    state: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = "desc",
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)

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

    q = db.query(GeoCounty)
    if state:
        q = q.filter(GeoCounty.state == state.upper())
    counties = q.all()

    results = []
    for c in counties:
        data = _compute_county(db, c.fips, as_of, assumptions)
        m = data["metrics"]

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

        if passes:
            results.append({
                "fips": c.fips, "county": c.name, "state": c.state,
                "metrics": {k: round(v, 2) if v else None for k, v in m.items()},
            })

    # Sort
    sort_key = sort_by or "implied_cap_rate"
    reverse = sort_dir != "asc"
    results.sort(key=lambda x: x["metrics"].get(sort_key, 0) or 0, reverse=reverse)
    return {"count": len(results), "as_of": as_of, "filters": filters, "results": results}


# ═══════════════════════════════════════════════════════════════════════
# Scenario / Sensitivity / Backtest
# ═══════════════════════════════════════════════════════════════════════

class ScenarioRequest(BaseModel):
    geo_key: str
    as_of: str = "2025"
    assumption_set_id: int | None = None
    overrides: dict | None = None
    vary_params: list[dict] | None = None

@app.post("/api/v1/run/scenario")
def run_scenario(body: ScenarioRequest, db: Session = Depends(get_db)):
    assumptions = _get_assumptions(db, body.assumption_set_id)
    if body.overrides:
        assumptions = {**assumptions, **body.overrides}

    base = _compute_county(db, body.geo_key, body.as_of, assumptions)
    sensitivities = {}
    if body.vary_params:
        series = _load_series_for_county(db, body.geo_key, body.as_of)
        for vp in body.vary_params:
            ctx = ComputeContext(
                geo_key=body.geo_key, as_of_year=body.as_of,
                series=series, metrics={}, assumptions=assumptions,
            )
            results = compute_sensitivity(
                ctx, vary_param=vp["param"], values=vp["values"],
                target_metric=vp.get("target_metric", "fair_value"),
            )
            sensitivities[vp["param"]] = results
    return {"base": base, "sensitivities": sensitivities}


@app.get("/api/v1/geo/{geo_key}/sensitivity")
def sensitivity_matrix(
    geo_key: str, as_of: str = "2025",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    assumptions = _get_assumptions(db, assumption_set_id)
    series = _load_series_for_county(db, geo_key, as_of)
    rent_shocks = [s / 100 for s in range(-20, 25, 5)]

    matrix = []
    for rv in [2.0, 3.0, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0]:
        row = {"risk_premium": rv}
        for gv in [0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04]:
            ctx = ComputeContext(
                geo_key=geo_key, as_of_year=as_of,
                series=dict(series), metrics={},
                assumptions={**assumptions, "risk_premium": rv, "long_run_growth": gv},
            )
            compute_all(ctx)
            row[f"g_{gv}"] = round(ctx.metrics.get("fair_value", 0), 0) if ctx.metrics.get("fair_value") else None
        matrix.append(row)

    rent_sens = []
    for rs in rent_shocks:
        ctx = ComputeContext(
            geo_key=geo_key, as_of_year=as_of,
            series=dict(series), metrics={},
            assumptions={**assumptions, "near_term_rent_shock": rs},
        )
        compute_all(ctx)
        rent_sens.append({
            "rent_shock": rs,
            "fair_value": round(ctx.metrics.get("fair_value", 0), 0) if ctx.metrics.get("fair_value") else None,
            "noi": round(ctx.metrics.get("noi_per_acre", 0), 2) if ctx.metrics.get("noi_per_acre") else None,
        })

    return {"geo_key": geo_key, "rate_growth_matrix": matrix, "rent_shock_sensitivity": rent_sens}


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
    end = start + body.eval_years

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
        end_data = _compute_county(db, item["fips"], str(min(end, 2025)), assumptions)
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
        "start_year": body.start_year, "eval_years": body.eval_years,
        "counties_screened": len(counties), "counties_flagged": len(flagged),
        "results": flagged,
    }


# ═══════════════════════════════════════════════════════════════════════
# Dashboard
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/v1/dashboard")
def dashboard(as_of: str = "2025", assumption_set_id: Optional[int] = None, db: Session = Depends(get_db)):
    assumptions = _get_assumptions(db, assumption_set_id)
    counties = db.query(GeoCounty).all()

    all_data = []
    for c in counties:
        data = _compute_county(db, c.fips, as_of, assumptions)
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

    return {
        "as_of": as_of, "county_count": len(counties),
        "summary": {
            "implied_cap_rate": stats(caps), "fair_value": stats(fvs),
            "cash_rent": stats(rents), "benchmark_value": stats(vals),
            "access_score": stats(access_scores),
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
def get_watchlist(as_of: str = "2025", db: Session = Depends(get_db)):
    items = db.query(WatchlistItem).all()
    assumptions = _get_assumptions(db)
    result = []
    for item in items:
        data = _compute_county(db, item.geo_key, as_of, assumptions)
        # Previous year for change tracking
        prev = _compute_county(db, item.geo_key, str(int(as_of) - 1), assumptions)
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
    return result


class WatchlistAdd(BaseModel):
    geo_key: str
    notes: str | None = None

@app.post("/api/v1/watchlist")
def add_to_watchlist(body: WatchlistAdd, db: Session = Depends(get_db)):
    existing = db.query(WatchlistItem).filter(WatchlistItem.geo_key == body.geo_key).first()
    if existing:
        return {"id": existing.id, "status": "already_watching"}
    item = WatchlistItem(geo_key=body.geo_key, notes=body.notes)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": "added"}


@app.delete("/api/v1/watchlist/{geo_key}")
def remove_from_watchlist(geo_key: str, db: Session = Depends(get_db)):
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
def add_note(geo_key: str, body: NoteCreate, db: Session = Depends(get_db)):
    note = CountyNote(geo_key=geo_key, content=body.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "content": note.content, "created_at": str(note.created_at)}


@app.delete("/api/v1/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
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
def get_portfolio(portfolio_id: int, as_of: str = "2025", db: Session = Depends(get_db)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not p:
        raise HTTPException(404, "Portfolio not found")

    holdings = db.query(PortfolioHolding).filter(PortfolioHolding.portfolio_id == p.id).all()
    assumptions = _get_assumptions(db)

    # Compute all county data
    county_data = {}
    holding_dicts = []
    for h in holdings:
        data = _compute_county(db, h.geo_key, as_of, assumptions)
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
        "as_of": as_of,
        **analytics,
    }


class PortfolioCreate(BaseModel):
    name: str
    description: str | None = None

@app.post("/api/v1/portfolios")
def create_portfolio(body: PortfolioCreate, db: Session = Depends(get_db)):
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
def add_holding(portfolio_id: int, body: HoldingAdd, db: Session = Depends(get_db)):
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
def remove_holding(portfolio_id: int, geo_key: str, db: Session = Depends(get_db)):
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
    as_of: str = "2025",
    assumption_set_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Export all counties as CSV."""
    assumptions = _get_assumptions(db, assumption_set_id)
    counties = db.query(GeoCounty).order_by(GeoCounty.state, GeoCounty.name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    headers = ["FIPS", "County", "State", "Cash Rent", "Land Value", "NOI/Acre",
               "Implied Cap Rate", "Rent Multiple", "Fair Value", "Cap Spread (bps)",
               "Access Score", "DSCR", "Payback Years"]
    writer.writerow(headers)

    for c in counties:
        data = _compute_county(db, c.fips, as_of, assumptions)
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
        headers={"Content-Disposition": f"attachment; filename=farmland_screener_{as_of}.csv"},
    )
