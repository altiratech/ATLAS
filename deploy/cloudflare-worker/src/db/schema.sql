-- Farmland Terminal D1 Schema
-- Ported from SQLAlchemy models (backend/app/models/schema.py)

-- ── Core Geography ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo_county (
  fips TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  state_name TEXT,
  centroid_lat REAL,
  centroid_lon REAL
);
CREATE INDEX IF NOT EXISTS ix_geo_county_state ON geo_county(state);

-- ── Data Pipeline ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  url TEXT,
  cadence TEXT,
  last_checked_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS data_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_key TEXT NOT NULL,
  geo_level TEXT NOT NULL,
  frequency TEXT NOT NULL,
  unit TEXT,
  source_id INTEGER REFERENCES data_sources(id),
  UNIQUE(series_key, geo_level)
);
CREATE INDEX IF NOT EXISTS ix_data_series_key ON data_series(series_key);

CREATE TABLE IF NOT EXISTS data_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL REFERENCES data_series(id),
  geo_key TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  value REAL,
  quality_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_dp_series_geo_date ON data_points(series_id, geo_key, as_of_date);

-- ── Facilities / Access ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poi_facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  meta_json TEXT,
  last_verified TEXT
);
CREATE INDEX IF NOT EXISTS ix_poi_type ON poi_facilities(type);

CREATE TABLE IF NOT EXISTS geo_access_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  distances_json TEXT,
  density_json TEXT,
  access_score REAL,
  computed_at TEXT DEFAULT (datetime('now')),
  context_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_access_geo_date ON geo_access_metrics(geo_key, as_of_date);

-- ── Modeling ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metric_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  description TEXT,
  unit TEXT,
  category TEXT,
  dependencies_json TEXT,
  compute_spec_json TEXT,
  UNIQUE(key, version)
);

CREATE TABLE IF NOT EXISTS assumption_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  params_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS screen_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  filters_json TEXT,
  ranking_json TEXT,
  columns_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS model_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semver TEXT NOT NULL,
  git_sha TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS run_contexts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_version_id INTEGER REFERENCES model_versions(id),
  assumption_set_id INTEGER REFERENCES assumption_sets(id),
  screen_definition_id INTEGER REFERENCES screen_definitions(id),
  run_type TEXT,
  run_at TEXT DEFAULT (datetime('now')),
  context_json TEXT
);

-- ── Outputs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metric_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_definition_id INTEGER NOT NULL REFERENCES metric_definitions(id),
  run_context_id INTEGER REFERENCES run_contexts(id),
  geo_key TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  value REAL,
  confidence REAL DEFAULT 1.0,
  explain_json TEXT,
  computed_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_mv_metric_geo_date ON metric_values(metric_definition_id, geo_key, as_of_date);

CREATE TABLE IF NOT EXISTS scenario_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_context_id INTEGER REFERENCES run_contexts(id),
  geo_key TEXT NOT NULL,
  horizon INTEGER,
  bands_json TEXT,
  computed_at TEXT DEFAULT (datetime('now'))
);

-- ── Logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES data_sources(id),
  run_at TEXT DEFAULT (datetime('now')),
  status TEXT,
  stats_json TEXT,
  errors_json TEXT
);

CREATE TABLE IF NOT EXISTS fallback_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_context_id INTEGER REFERENCES run_contexts(id),
  geo_key TEXT,
  metric_key TEXT,
  fallback_type TEXT,
  details_json TEXT
);

-- ── Watchlist ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT NOT NULL REFERENCES geo_county(fips) UNIQUE,
  added_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  alert_cap_below REAL,
  alert_cap_above REAL
);

-- ── County Notes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS county_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT NOT NULL REFERENCES geo_county(fips),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── Research Workspace ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL DEFAULT 'owner_default',
  geo_key TEXT NOT NULL REFERENCES geo_county(fips),
  thesis TEXT,
  analysis_json TEXT,
  tags_json TEXT,
  status TEXT NOT NULL DEFAULT 'exploring',
  conviction REAL NOT NULL DEFAULT 50,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(owner_key, geo_key)
);
CREATE INDEX IF NOT EXISTS ix_research_workspace_geo ON research_workspaces(geo_key);
CREATE INDEX IF NOT EXISTS ix_research_workspace_owner ON research_workspaces(owner_key);

CREATE TABLE IF NOT EXISTS research_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_research_notes_workspace ON research_notes(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS research_scenario_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  risk_premium REAL NOT NULL,
  growth_rate REAL NOT NULL,
  rent_shock REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_research_scenario_packs_workspace ON research_scenario_packs(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS research_scenario_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
  scenario_name TEXT,
  as_of_date TEXT NOT NULL,
  assumptions_json TEXT NOT NULL,
  comparison_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_research_scenario_runs_workspace ON research_scenario_runs(workspace_id, created_at DESC);

-- ── Auth Sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  identity_source TEXT NOT NULL DEFAULT 'session',
  created_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_user ON auth_sessions(user_key);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_expires ON auth_sessions(expires_at);

-- ── Portfolios ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  geo_key TEXT NOT NULL REFERENCES geo_county(fips),
  acres REAL NOT NULL DEFAULT 100,
  purchase_price_per_acre REAL,
  purchase_year TEXT,
  notes TEXT,
  UNIQUE(portfolio_id, geo_key)
);

-- ── Future hooks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT,
  name TEXT,
  params_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deal_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER REFERENCES deals(id),
  run_context_id INTEGER REFERENCES run_contexts(id),
  results_json TEXT,
  computed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT,
  date TEXT,
  price_per_acre REAL,
  acres REAL,
  source TEXT,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT,
  date TEXT,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS distress_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geo_key TEXT,
  date TEXT,
  event_type TEXT,
  meta_json TEXT
);

-- ── Data Freshness (new for live ingestion) ─────────────────────────
CREATE TABLE IF NOT EXISTS data_freshness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  series_key TEXT,
  last_updated TEXT NOT NULL,
  record_count INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS ag_composite_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  as_of_date TEXT NOT NULL UNIQUE,
  value REAL NOT NULL,
  component_json TEXT NOT NULL,
  zscore REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_ag_composite_index_as_of ON ag_composite_index(as_of_date DESC);
