# Altira Atlas

**Real-assets intelligence and underwriting platform** for land research, scenario modeling, and investment diligence, starting with farmland.

Current live coverage starts with farmland research and underwriting. Near-term expansion stays focused on industrial, logistics, data-center, energy, and development-oriented land. Selected commercial real estate workflows are later-phase work where site, infrastructure, and location drive value. Atlas is not intended to become a generic PE research terminal or a full-spectrum CRE operating system.

## Quick Start

```bash
# Clone / download the project, then:
cd Code/active/farmland-terminal

# Option 1: Native desktop window (requires pywebview)
./run.sh

# Option 2: Open in your default browser
./run.sh --browser

# Option 3: API server only (headless)
./run.sh --server
```

The app auto-installs dependencies, initializes schema-only local storage, and launches at `http://127.0.0.1:3000`.

## Requirements

- Python 3.9+
- Dependencies (auto-installed by `run.sh`):
  - `fastapi`, `uvicorn` — API server
  - `sqlalchemy` — Database ORM
  - `pydantic` — Data validation
  - `numpy` — Numeric computation
  - `pywebview` — Native desktop window (optional; falls back to browser)

Manual install: `pip install -r requirements.txt`

## Features

### Atlas Home
- Default entry point for the product
- Choose a playbook, resume recent work, reopen saved views, and jump back into research, scenario, or portfolio workflow
- Avoids ambiguous cross-lens market metrics at the top level

### Playbook Home
- First live playbook is **Farmland Income**
- Defines the current live universe in plain English
- Separates observed / basis-quality context from modeled interpretation
- Launches into starter screens instead of pretending there is one default “best counties” list

### Core Analytics
- County benchmark value, fair value, implied cap rate, NOI, DSCR, break-even rent, spread, and scenario-sensitive valuation context
- Acquisition underwriting, leverage, refinance roll-forward, and lender / credit stress
- Assumption-set-aware modeling across playbook home, screener, county detail, compare, research, backtest, and portfolio

### Evidence Stack
- Benchmark basis lineage (`county observed`, `proxy`, `state`, `national`)
- FEMA drought evidence
- FEMA flood evidence
- USDA irrigation footprint
- NRCS soil / farmland share / available water storage context

### Shared Tools
- **Screener**: playbook-aware filters, evidence presets, saved views, and export
- **County Detail**: valuation, evidence, decision read, underwriting, and credit stress in one place
- **Comparison**: side-by-side county trust context and modeled comparison
- **Research Workspace**: decision record, memo snapshot, scenario history, and county read carry-through
- **Scenario Lab**: unlevered + levered underwriting, refi, and credit stress
- **Portfolio**: holdings management plus aggregated risk / soil / hazard / stress synthesis
- **Backtest**: historical replay of reusable core saved-view filters

### Saved Views
- Evolved from older “saved screens” behavior
- Persist playbook context, reusable core filters, sort order, notes, and view state
- Reopen into the shared Screener workflow and support Backtest where the historical replay contract is wired today

### Product Orientation
- In-app **Mission** explains the playbook-based workflow and shared-tool model
- In-app **About** clarifies current scope, expansion principles, and why Atlas stays a specialist product
- Canonical web app URL: `https://atlas.altiratech.com`
- `https://atlas.altiratech.com/altiratech-home` serves a compatibility mirror of the canonical company homepage source at `Code/active/altiratech-site/public/index.html`

## Identity And Billing Compatibility

- Atlas currently uses module-local session auth via `/api/v1/auth/bootstrap`.
- Optional edge identity headers can seed Atlas sessions in protected environments, but that is not the long-term default end-user identity model.
- Atlas should stay compatible with a shared Altira account/workspace/membership model rather than invent product-local billing or entitlement systems.
- Visible roles should remain simple when suite auth lands: `user`, `manager`, `admin`.
- Workspace billing, subscriptions, and module entitlements should live above Atlas, not inside Atlas.
- Enterprise SSO is a later layer, not the default auth assumption for this module.

## Architecture

```
farmland-terminal/
├── launcher.py              # Native desktop launcher (pywebview)
├── run.sh                   # Shell launcher (3 modes)
├── requirements.txt
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app — all endpoints + frontend serving
│   │   ├── seed.py          # Legacy seed script (disabled for runtime; test/reference only)
│   │   ├── core/
│   │   │   └── database.py  # SQLAlchemy engine + session
│   │   ├── models/
│   │   │   └── schema.py    # ORM models (GeoCounty, DataPoint, Facility, etc.)
│   │   └── services/
│   │       ├── metric_engine.py  # 15-metric DAG engine
│   │       ├── access_score.py   # Facility proximity scoring
│   │       └── portfolio.py      # Portfolio analytics
│   └── tests/
│       ├── test_api.py           # 32 API integration tests
│       ├── test_metric_engine.py # 15 metric engine unit tests
│       ├── test_access_score.py  # 4 access score tests
│       └── test_portfolio.py     # 10 portfolio analytics tests
├── frontend/
│   └── index.html           # React 18 SPA (single-file, no build step)
├── deploy/
│   └── cloudflare-worker/   # Cloudflare Workers deployment profile (Hono + D1)
└── docs/
    └── ADDING_DATA_AND_METRICS.md
```

### Tech Stack
- **Backend**: FastAPI + SQLAlchemy + SQLite (zero-config, portable database)
- **Frontend**: React 18 + Babel standalone (no build step, single HTML file)
- **Cloud Deploy Profile**: Cloudflare Workers + Hono + D1 (`deploy/cloudflare-worker`)
- **Desktop**: pywebview for native OS window (WebKit on macOS, EdgeChromium on Windows)
- **Database**: SQLite stored at `backend/farmland.db` (auto-created on first run)

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Frontend SPA |
| `/api/v1/dashboard` | GET | Farmland Income playbook home summary, context, charts, and coverage-supporting aggregates |
| `/api/v1/metrics` | GET | Metric catalog (15 metrics with descriptions) |
| `/api/v1/counties` | GET | All counties (optional `?state=IA` filter) |
| `/api/v1/geo/{fips}/summary` | GET | County detail with all computed metrics |
| `/api/v1/geo/{fips}/timeseries` | GET | Historical data (`?start_year=2020&end_year=2025`) |
| `/api/v1/geo/{fips}/access` | GET | Access score breakdown |
| `/api/v1/geo/{fips}/sensitivity` | GET | Pre-computed sensitivity matrix |
| `/api/v1/search` | GET | Search counties and metrics (`?q=Polk`) |
| `/api/v1/screener` | GET | Screen counties (`?min_cap=2.5&state=IA&sort_by=cap`) |
| `/api/v1/compare` | GET | Compare up to 6 counties (`?fips=19153,17113`) |
| `/api/v1/watchlist` | GET/POST/DELETE | Manage watchlist |
| `/api/v1/notes/{fips}` | GET/POST/DELETE | County notes CRUD |
| `/api/v1/portfolios` | GET/POST | Portfolio management |
| `/api/v1/portfolios/{id}` | GET | Portfolio detail with analytics |
| `/api/v1/portfolios/{id}/holdings` | POST/DELETE | Manage portfolio holdings |
| `/api/v1/run/scenario` | POST | Run scenario with overrides + sensitivity |
| `/api/v1/run/backtest` | POST | Backtest a screen against historical data |
| `/api/v1/screens` | GET | Saved view definitions with playbook, filters, sort, notes, and view-state context |
| `/api/v1/assumptions` | GET | Assumption sets |
| `/api/v1/sources` | GET | Data source catalog |
| `/api/v1/export/screener` | GET | CSV export of screener results |

## Running Tests

```bash
cd backend
python -m pytest tests/ -v
```

Expected baseline is 61 tests; one portfolio test can fail if using a persistent local DB with prior state.

## Data

This workspace follows the no-synthetic-data policy (`D-014`):
- Runtime paths do not auto-seed fabricated records.
- Local SQLite starts schema-only.
- Production data should come from live ingestion sources (USDA NASS / FRED via the Cloudflare Worker).
- If data is unavailable, use explicit placeholders rather than generated samples.

See `docs/ADDING_DATA_AND_METRICS.md` for instructions on adding custom data and metrics.

## License

Private — for internal use.
