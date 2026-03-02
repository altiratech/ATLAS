# Altira Atlas

**Agriculture intelligence platform** for land research, scenario modeling, and investment diligence across farmland markets.

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

### Core Analytics
- **15-metric valuation engine** with DAG-based dependency resolution (topological sort ensures correct computation order)
- **Gordon Growth Model** fair value: `FV = NOI × (1+g) / (r − g)` with configurable risk premium, growth rate, and guardrails
- **Implied cap rate**, rent multiples, DSCR, payback period, cap spread to 10Y Treasury
- **Access Score** (0–100) based on Haversine-distance proximity to grain elevators, ethanol plants, rail terminals, and river ports

### Dashboard
- Aggregate statistics across all 45 tracked counties
- Median/mean metrics summary (cap rate, fair value, cash rent, etc.)
- Top movers — counties with largest YoY metric changes
- State-level summary breakdown

### County Deep Dive
- Full metric profile with all 15 computed metrics
- 11-year time series (2015–2025) with sparkline charts
- Access score breakdown showing nearest facilities
- Notes system — attach research notes to any county

### Screener
- Filter counties by state, minimum cap rate, and sort criteria
- Real-time results with all key metrics
- CSV export of full screener results

### Watchlist
- Track counties of interest with one-click add/remove
- YoY change tracking for key metrics
- Persistent across sessions

### Comparison Tool
- Side-by-side comparison of up to 6 counties
- Full metric comparison table
- Identifies advantages/disadvantages for each county

### Portfolio Manager
- Create portfolios with multiple holdings (county + acres + purchase price)
- Weighted metric aggregation across holdings
- HHI-based diversification rating (Concentrated → Moderate → Well-Diversified → Excellent)
- State exposure analysis
- Unrealized gain/loss tracking
- Portfolio yield calculation

### Scenario Lab
- Override any assumption (risk premium, growth rate, etc.) and see fair value impact
- Sensitivity analysis — vary a parameter across multiple values
- Pre-built sensitivity matrix: discount rate × growth rate grid for any county
- Rent shock analysis (±10%, ±20%, ±30%)

### Backtesting
- Run screens against historical data
- Evaluate how screen criteria performed over configurable time horizons
- Identifies counties flagged by screen criteria

### Search & Command Palette
- `Ctrl+K` / `Cmd+K` to open command palette
- Search counties by name, state, or FIPS code
- Search metrics by name
- Quick navigation to any county

### Product Orientation
- In-app **Mission** page explains what the platform is, who it serves, and why each tool exists
- In-app **About** page clarifies scope and near-term roadmap priorities
- Canonical web app URL: `https://atlas.altiratech.com`
- `https://atlas.altiratech.com/altiratech-home` serves a compatibility mirror of the canonical company homepage source at `Code/active/altiratech-site/public/index.html`

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
| `/api/v1/dashboard` | GET | Aggregate dashboard with stats, top movers, state summary |
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
| `/api/v1/screens` | GET | Saved screen configurations |
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
