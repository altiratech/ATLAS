/**
 * Altira Atlas — Cloudflare Workers + Hono
 * Main application entry point with all API routes.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import type { D1Database } from '@cloudflare/workers-types';
import {
  computeAll,
  createContext,
  computeSensitivity,
  getMetricCatalog,
  METRIC_REGISTRY,
} from './services/metric-engine';
import type { SeriesData, Assumptions } from './services/metric-engine';
import { computePortfolioMetrics } from './services/portfolio';
import {
  loadSeriesForCounty,
  getAssumptions,
  getAccessScore,
  getAllCounties,
  getCounty,
  getTimeseries,
} from './db/queries';
import { runIngestion } from './services/ingest';

// ── Types ───────────────────────────────────────────────────────────

interface SecretStoreSecret {
  get(): Promise<string>;
}

interface AssetFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

type Bindings = {
  DB: D1Database;
  FRED_API_KEY: SecretStoreSecret;
  NASS_API_KEY: SecretStoreSecret;
  ASSETS: AssetFetcher;
  ENVIRONMENT?: string;
  CANONICAL_HOST?: string;
  LEGACY_HOST?: string;
  ALLOW_ANON_SESSIONS?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ── Middleware ───────────────────────────────────────────────────────

app.use('*', cors());
app.use('*', async (c, next) => {
  const canonicalHost = (c.env.CANONICAL_HOST ?? '').toLowerCase();
  const legacyHost = (c.env.LEGACY_HOST ?? '').toLowerCase();
  const reqHost = (c.req.header('host') ?? '').toLowerCase();

  // Controlled migration: keep legacy API host working while redirecting web traffic.
  if (
    canonicalHost &&
    legacyHost &&
    reqHost === legacyHost &&
    !c.req.path.startsWith('/api/')
  ) {
    const url = new URL(c.req.url);
    url.hostname = canonicalHost;
    if (!url.searchParams.has('legacy_redirect')) {
      url.searchParams.set('legacy_redirect', '1');
    }
    return c.redirect(url.toString(), 308);
  }

  return next();
});

app.get('/assets/*', async (c) => {
  const assetResp = await c.env.ASSETS.fetch(c.req.raw);
  const headers = new Headers(assetResp.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(assetResp.body, {
    status: assetResp.status,
    statusText: assetResp.statusText,
    headers,
  });
});

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

// ── Helpers ─────────────────────────────────────────────────────────

async function computeCounty(
  db: D1Database,
  geoKey: string,
  asOf: string,
  assumptions: Assumptions,
) {
  const series = await loadSeriesForCounty(db, geoKey, asOf);

  // Inject access score into series if available
  const accessData = await getAccessScore(db, geoKey, asOf);
  if (accessData) {
    (series as any)['computed.access_score'] = accessData.score;
  }

  const ctx = createContext(geoKey, asOf, series, assumptions);
  computeAll(ctx);

  const county = await getCounty(db, geoKey);

  return {
    geo_key: geoKey,
    county_name: county?.name ?? geoKey,
    state: county?.state ?? '',
    lat: county?.centroid_lat ?? null,
    lon: county?.centroid_lon ?? null,
    as_of: asOf,
    metrics: Object.fromEntries(
      Object.entries(ctx.metrics).map(([k, v]) => [k, v != null ? Math.round(v * 10000) / 10000 : null]),
    ),
    explains: ctx.explains,
    fallbacks: ctx.fallbacks,
    access_details: accessData?.distances ?? {},
    access_density: accessData?.density ?? {},
  };
}

function stats(arr: number[]) {
  if (!arr.length) return {};
  arr.sort((a, b) => a - b);
  const n = arr.length;
  return {
    min: Math.round(Math.min(...arr) * 100) / 100,
    max: Math.round(Math.max(...arr) * 100) / 100,
    mean: Math.round((arr.reduce((s, v) => s + v, 0) / n) * 100) / 100,
    median: Math.round(arr[Math.floor(n / 2)] * 100) / 100,
    p25: Math.round(arr[Math.floor(n / 4)] * 100) / 100,
    p75: Math.round(arr[Math.floor((3 * n) / 4)] * 100) / 100,
  };
}

function parseOptionalYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

interface ResearchWorkspaceRow {
  id: number;
  owner_key: string;
  geo_key: string;
  thesis: string | null;
  tags_json: string | null;
  status: string | null;
  conviction: number | null;
  created_at: string | null;
  updated_at: string | null;
}

const RESEARCH_LEGACY_USER = 'owner_default';
const SESSION_TTL_DAYS = 30;

function sanitizeResearchUser(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  let result = '';
  for (const ch of lowered) {
    const isAlphaNum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (isAlphaNum || ch === '@' || ch === '.' || ch === '_' || ch === '-' || ch === '+') {
      result += ch;
    }
  }
  return result.slice(0, 120);
}

function isProduction(c: Context<{ Bindings: Bindings }>): boolean {
  return (c.env.ENVIRONMENT ?? 'development').toLowerCase() === 'production';
}

function allowDevIdentityHeader(c: Context<{ Bindings: Bindings }>): boolean {
  return !isProduction(c);
}

function allowAnonSessions(c: Context<{ Bindings: Bindings }>): boolean {
  return (c.env.ALLOW_ANON_SESSIONS ?? '1') === '1';
}

function extractHeaderIdentity(
  c: Context<{ Bindings: Bindings }>,
): { userKey: string; source: 'cloudflare_access' | 'dev_header' } | null {
  const email = c.req.header('cf-access-authenticated-user-email');
  const userId = c.req.header('cf-access-authenticated-user-id');
  const devHeader = allowDevIdentityHeader(c) ? c.req.header('x-atlas-user') : null;
  const candidate = email ?? userId ?? devHeader;
  if (!candidate) return null;
  const cleaned = sanitizeResearchUser(candidate);
  if (!cleaned) return null;
  return { userKey: cleaned, source: email || userId ? 'cloudflare_access' : 'dev_header' };
}

function extractBearerToken(c: Context<{ Bindings: Bindings }>): string | null {
  const authHeader = c.req.header('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function randomTokenHex(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseSqliteDate(value: string | null): number {
  if (!value) return 0;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

type AuthSessionRow = {
  id: number;
  user_key: string;
  token_hash: string;
  identity_source: string;
  created_at: string | null;
  last_seen_at: string | null;
  expires_at: string;
  revoked_at: string | null;
};

type AuthState = {
  userKey: string;
  source: string;
  token: string | null;
  expiresAt: string | null;
};

async function getValidSession(db: D1Database, token: string | null): Promise<AuthSessionRow | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await db
    .prepare(
      `SELECT id, user_key, token_hash, identity_source, created_at, last_seen_at, expires_at, revoked_at
       FROM auth_sessions
       WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .bind(tokenHash)
    .first<AuthSessionRow>();
  if (!session) return null;

  const expiresAtMs = parseSqliteDate(session.expires_at);
  if (expiresAtMs && expiresAtMs < Date.now()) {
    await db
      .prepare("UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = ?")
      .bind(session.id)
      .run();
    return null;
  }

  await db
    .prepare("UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ?")
    .bind(session.id)
    .run();
  return session;
}

async function createSession(
  c: Context<{ Bindings: Bindings }>,
  db: D1Database,
  userKey: string,
  source: string,
): Promise<{ token: string; session: AuthSessionRow }> {
  const token = randomTokenHex(32);
  const tokenHash = await sha256Hex(token);
  const ip = c.req.header('cf-connecting-ip') ?? '';
  const ipHash = ip ? await sha256Hex(ip) : null;
  const userAgent = (c.req.header('user-agent') ?? '').slice(0, 255);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO auth_sessions (
         user_key, token_hash, identity_source, created_at, last_seen_at, expires_at, revoked_at, user_agent, ip_hash
       ) VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, NULL, ?, ?)`,
    )
    .bind(userKey, tokenHash, source, expiresAt, userAgent, ipHash)
    .run();

  const session = await db
    .prepare(
      `SELECT id, user_key, token_hash, identity_source, created_at, last_seen_at, expires_at, revoked_at
       FROM auth_sessions
       WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first<AuthSessionRow>();
  if (!session) throw new Error('Failed to create session');
  return { token, session };
}

function authPayload(state: AuthState) {
  return {
    user_key: state.userKey,
    source: state.source,
    token: state.token,
    expires_at: state.expiresAt,
    is_anonymous: state.userKey.startsWith('anon_'),
  };
}

async function requireAuthState(
  c: Context<{ Bindings: Bindings }>,
  db: D1Database,
): Promise<AuthState> {
  const token = extractBearerToken(c);
  const session = await getValidSession(db, token);
  if (session) {
    return {
      userKey: session.user_key,
      source: session.identity_source || 'session',
      token,
      expiresAt: session.expires_at,
    };
  }

  const headerIdentity = extractHeaderIdentity(c);
  if (headerIdentity) {
    return {
      userKey: headerIdentity.userKey,
      source: headerIdentity.source,
      token: null,
      expiresAt: null,
    };
  }

  throw new Error('AUTH_REQUIRED');
}

async function requireAuthOrError(
  c: Context<{ Bindings: Bindings }>,
  db: D1Database,
  errorMessage = 'Authentication required',
): Promise<AuthState | Response> {
  await ensureResearchSchema(db);
  try {
    return await requireAuthState(c, db);
  } catch {
    return c.json({ error: errorMessage }, 401);
  }
}

function workspaceVisibleToUser(workspace: ResearchWorkspaceRow, userKey: string): boolean {
  return (workspace.owner_key || RESEARCH_LEGACY_USER) === userKey;
}

function clampConviction(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return 50;
  return Math.max(0, Math.min(100, num));
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    result.push(trimmed);
  }
  return result;
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    return normalizeTags(parsed);
  } catch {
    return [];
  }
}

function emptyResearchWorkspace(geoKey: string) {
  return {
    geo_key: geoKey,
    thesis: '',
    tags: [],
    status: 'exploring',
    conviction: 50,
    notes: [],
    scenario_packs: [],
    created_at: null,
    updated_at: null,
  };
}

async function getResearchWorkspaceRow(db: D1Database, userKey: string, geoKey: string) {
  return db
    .prepare(
      'SELECT id, owner_key, geo_key, thesis, tags_json, status, conviction, created_at, updated_at FROM research_workspaces WHERE owner_key = ? AND geo_key = ?',
    )
    .bind(userKey, geoKey)
    .first<ResearchWorkspaceRow>();
}

async function findResearchWorkspaceForUser(db: D1Database, userKey: string, geoKey: string) {
  return getResearchWorkspaceRow(db, userKey, geoKey);
}

async function ensureResearchWorkspace(db: D1Database, userKey: string, geoKey: string) {
  const existing = await findResearchWorkspaceForUser(db, userKey, geoKey);
  if (existing) return existing;

  await db
    .prepare(
      "INSERT INTO research_workspaces (owner_key, geo_key, thesis, tags_json, status, conviction, created_at, updated_at) VALUES (?, ?, '', '[]', 'exploring', 50, datetime('now'), datetime('now'))",
    )
    .bind(userKey, geoKey)
    .run();

  const created = await getResearchWorkspaceRow(db, userKey, geoKey);
  if (!created) {
    throw new Error(`Failed to create research workspace for ${userKey}:${geoKey}`);
  }
  return created;
}

async function serializeResearchWorkspace(db: D1Database, workspace: ResearchWorkspaceRow) {
  const notes = await db
    .prepare(
      'SELECT id, content, created_at FROM research_notes WHERE workspace_id = ? ORDER BY created_at DESC, id DESC',
    )
    .bind(workspace.id)
    .all<{ id: number; content: string; created_at: string | null }>();

  const packs = await db
    .prepare(
      `SELECT id, name, risk_premium, growth_rate, rent_shock, created_at, updated_at
       FROM research_scenario_packs
       WHERE workspace_id = ?
       ORDER BY updated_at DESC, id DESC`,
    )
    .bind(workspace.id)
    .all<{
      id: number;
      name: string;
      risk_premium: number;
      growth_rate: number;
      rent_shock: number;
      created_at: string | null;
      updated_at: string | null;
    }>();

  return {
    geo_key: workspace.geo_key,
    thesis: workspace.thesis ?? '',
    tags: parseTags(workspace.tags_json),
    status: workspace.status ?? 'exploring',
    conviction: clampConviction(workspace.conviction),
    notes: notes.results.map((n) => ({
      id: n.id,
      content: n.content,
      created_at: n.created_at,
    })),
    scenario_packs: packs.results.map((p) => ({
      id: p.id,
      name: p.name,
      risk_premium: p.risk_premium,
      growth_rate: p.growth_rate,
      rent_shock: p.rent_shock,
      created_at: p.created_at,
      updated_at: p.updated_at,
    })),
    created_at: workspace.created_at,
    updated_at: workspace.updated_at,
  };
}

async function ensureResearchSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS research_workspaces (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         owner_key TEXT NOT NULL DEFAULT 'owner_default',
         geo_key TEXT NOT NULL REFERENCES geo_county(fips),
         thesis TEXT,
         tags_json TEXT,
         status TEXT NOT NULL DEFAULT 'exploring',
         conviction REAL NOT NULL DEFAULT 50,
         created_at TEXT DEFAULT (datetime('now')),
         updated_at TEXT DEFAULT (datetime('now')),
         UNIQUE(owner_key, geo_key)
       )`,
    )
    .run();

  const workspaceCols = await db.prepare('PRAGMA table_info(research_workspaces)').all<{ name: string }>();
  const hasOwnerKey = workspaceCols.results.some((col) => col.name === 'owner_key');
  if (!hasOwnerKey && workspaceCols.results.length > 0) {
    await db.prepare('PRAGMA foreign_keys=OFF').run();
    try {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS research_workspaces_new (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             owner_key TEXT NOT NULL DEFAULT 'owner_default',
             geo_key TEXT NOT NULL REFERENCES geo_county(fips),
             thesis TEXT,
             tags_json TEXT,
             status TEXT NOT NULL DEFAULT 'exploring',
             conviction REAL NOT NULL DEFAULT 50,
             created_at TEXT DEFAULT (datetime('now')),
             updated_at TEXT DEFAULT (datetime('now')),
             UNIQUE(owner_key, geo_key)
           )`,
        )
        .run();
      await db
        .prepare(
          `INSERT INTO research_workspaces_new (
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
           FROM research_workspaces`,
        )
        .run();
      await db.prepare('DROP TABLE research_workspaces').run();
      await db.prepare('ALTER TABLE research_workspaces_new RENAME TO research_workspaces').run();
    } finally {
      await db.prepare('PRAGMA foreign_keys=ON').run();
    }
  }

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS research_notes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         workspace_id INTEGER NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
         content TEXT NOT NULL,
         created_at TEXT DEFAULT (datetime('now'))
       )`,
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS research_scenario_packs (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         workspace_id INTEGER NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
         name TEXT NOT NULL,
         risk_premium REAL NOT NULL,
         growth_rate REAL NOT NULL,
         rent_shock REAL NOT NULL,
         created_at TEXT DEFAULT (datetime('now')),
         updated_at TEXT DEFAULT (datetime('now'))
       )`,
    )
    .run();

  await db.prepare('CREATE INDEX IF NOT EXISTS ix_research_workspace_geo ON research_workspaces(geo_key)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ix_research_workspace_owner ON research_workspaces(owner_key)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ix_research_notes_workspace ON research_notes(workspace_id, created_at DESC)').run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS ix_research_scenario_packs_workspace ON research_scenario_packs(workspace_id, updated_at DESC)')
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS auth_sessions (
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
       )`,
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ix_auth_sessions_user ON auth_sessions(user_key)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ix_auth_sessions_expires ON auth_sessions(expires_at)').run();
}

// ═════════════════════════════════════════════════════════════════════
// Frontend Serving
// ═════════════════════════════════════════════════════════════════════

// Workers Sites or static asset serving will be configured separately.
// For now, the API-only worker can coexist with a static frontend.

// ═════════════════════════════════════════════════════════════════════
// Metadata Endpoints
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/metrics', (c) => {
  return c.json(getMetricCatalog());
});

app.get('/api/v1/assumptions', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare('SELECT id, name, version, params_json, created_at FROM assumption_sets ORDER BY name, version DESC')
    .all<{ id: number; name: string; version: number; params_json: string; created_at: string }>();
  return c.json(
    rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      params: JSON.parse(r.params_json),
      created_at: r.created_at,
    })),
  );
});

app.post('/api/v1/assumptions', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const body = await c.req.json<{ name: string; params: Record<string, any> }>();
  const existing = await db
    .prepare('SELECT MAX(version) as max_v FROM assumption_sets WHERE name = ?')
    .bind(body.name)
    .first<{ max_v: number | null }>();
  const newVer = (existing?.max_v ?? 0) + 1;
  const result = await db
    .prepare('INSERT INTO assumption_sets (name, version, params_json) VALUES (?, ?, ?) RETURNING id')
    .bind(body.name, newVer, JSON.stringify(body.params))
    .first<{ id: number }>();
  return c.json({ id: result!.id, name: body.name, version: newVer, params: body.params });
});

app.get('/api/v1/screens', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare('SELECT id, name, version, filters_json, ranking_json, columns_json FROM screen_definitions')
    .all<{ id: number; name: string; version: number; filters_json: string; ranking_json: string; columns_json: string }>();
  return c.json(
    rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      filters: JSON.parse(r.filters_json || '[]'),
      ranking: JSON.parse(r.ranking_json || 'null'),
      columns: JSON.parse(r.columns_json || 'null'),
    })),
  );
});

app.post('/api/v1/screens', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const body = await c.req.json<{ name: string; filters: any[]; ranking?: any[]; columns?: string[] }>();
  const existing = await db
    .prepare('SELECT MAX(version) as max_v FROM screen_definitions WHERE name = ?')
    .bind(body.name)
    .first<{ max_v: number | null }>();
  const newVer = (existing?.max_v ?? 0) + 1;
  const result = await db
    .prepare(
      'INSERT INTO screen_definitions (name, version, filters_json, ranking_json, columns_json) VALUES (?, ?, ?, ?, ?) RETURNING id',
    )
    .bind(body.name, newVer, JSON.stringify(body.filters), JSON.stringify(body.ranking ?? null), JSON.stringify(body.columns ?? null))
    .first<{ id: number }>();
  return c.json({ id: result!.id, name: body.name, version: newVer });
});

app.get('/api/v1/sources', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare('SELECT id, name, url, cadence, notes FROM data_sources')
    .all<{ id: number; name: string; url: string; cadence: string; notes: string }>();
  return c.json(rows.results);
});

// ═════════════════════════════════════════════════════════════════════
// Geo Endpoints
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/counties', async (c) => {
  const db = c.env.DB;
  const state = c.req.query('state');
  const result = await getAllCounties(db, state?.toUpperCase());
  return c.json(
    result.results.map((r: any) => ({
      fips: r.fips,
      name: r.name,
      state: r.state,
      lat: r.centroid_lat,
      lon: r.centroid_lon,
    })),
  );
});

app.get('/api/v1/geo/:geoKey/summary', async (c) => {
  const db = c.env.DB;
  const geoKey = c.req.param('geoKey');
  const asOf = c.req.query('as_of') ?? '2025';
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const result = await computeCounty(db, geoKey, asOf, assumptions);
  return c.json(result);
});

app.get('/api/v1/geo/:geoKey/timeseries', async (c) => {
  const db = c.env.DB;
  const geoKey = c.req.param('geoKey');
  const metricsParam = c.req.query('metrics') ?? 'cash_rent,benchmark_value,implied_cap_rate,fair_value';
  const startYear = parseInt(c.req.query('start_year') ?? '2015');
  const endYear = parseInt(c.req.query('end_year') ?? '2025');
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const metricKeys = metricsParam.split(',').map((m) => m.trim());

  const result: Record<string, any>[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const data = await computeCounty(db, geoKey, String(y), assumptions);
    const row: Record<string, any> = { year: String(y) };
    for (const mk of metricKeys) {
      row[mk] = data.metrics[mk] ?? null;
    }
    result.push(row);
  }
  return c.json(result);
});

app.get('/api/v1/geo/:geoKey/access', async (c) => {
  const db = c.env.DB;
  const geoKey = c.req.param('geoKey');
  const access = await db
    .prepare(
      'SELECT access_score, distances_json, density_json, context_json FROM geo_access_metrics WHERE geo_key = ? ORDER BY as_of_date DESC LIMIT 1',
    )
    .bind(geoKey)
    .first<{ access_score: number; distances_json: string; density_json: string; context_json: string }>();
  if (!access) {
    return c.json({ error: 'No access data for county' }, 404);
  }
  return c.json({
    geo_key: geoKey,
    access_score: access.access_score,
    distances: JSON.parse(access.distances_json || '{}'),
    density: JSON.parse(access.density_json || '{}'),
    context: JSON.parse(access.context_json || '{}'),
  });
});

// ═════════════════════════════════════════════════════════════════════
// Search
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/search', async (c) => {
  const db = c.env.DB;
  const q = (c.req.query('q') ?? '').toLowerCase().trim();
  if (!q) return c.json([]);

  const results: any[] = [];

  // Counties
  const counties = await db.prepare('SELECT fips, name, state, state_name FROM geo_county').all<{
    fips: string;
    name: string;
    state: string;
    state_name: string | null;
  }>();
  for (const co of counties.results) {
    let score = 0;
    if (co.name.toLowerCase().includes(q)) score = 100;
    else if (co.state.toLowerCase().includes(q) || (co.state_name ?? '').toLowerCase().includes(q)) score = 60;
    else if (co.fips.includes(q)) score = 80;
    if (score > 0) {
      results.push({
        type: 'county',
        id: co.fips,
        label: `${co.name}, ${co.state}`,
        sublabel: `FIPS ${co.fips}`,
        score,
      });
    }
  }

  // Screens
  const screens = await db.prepare('SELECT id, name, version FROM screen_definitions').all<{
    id: number;
    name: string;
    version: number;
  }>();
  for (const s of screens.results) {
    if (s.name.toLowerCase().includes(q)) {
      results.push({ type: 'screen', id: s.id, label: s.name, sublabel: `Screen v${s.version}`, score: 70 });
    }
  }

  // Metrics
  for (const m of METRIC_REGISTRY) {
    if (m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q)) {
      results.push({
        type: 'metric',
        id: m.key,
        label: m.label,
        sublabel: (m as any).description?.substring(0, 60) ?? m.key,
        score: 50,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return c.json(results.slice(0, 20));
});

// ═════════════════════════════════════════════════════════════════════
// Comparison
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/compare', async (c) => {
  const db = c.env.DB;
  const fipsParam = c.req.query('fips') ?? '';
  const asOf = c.req.query('as_of') ?? '2025';
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const fipsList = fipsParam
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 6);

  const results = [];
  for (const f of fipsList) {
    results.push(await computeCounty(db, f, asOf, assumptions));
  }
  return c.json({ as_of: asOf, counties: results });
});

// ═════════════════════════════════════════════════════════════════════
// Screener
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/screener', async (c) => {
  const db = c.env.DB;
  const asOf = c.req.query('as_of') ?? '2025';
  const screenId = c.req.query('screen_id');
  const assumptionSetId = c.req.query('assumption_set_id');
  const minCap = c.req.query('min_cap');
  const maxRentMult = c.req.query('max_rent_mult');
  const minAccess = c.req.query('min_access');
  const state = c.req.query('state');
  const sortBy = c.req.query('sort_by') ?? 'implied_cap_rate';
  const sortDir = c.req.query('sort_dir') ?? 'desc';

  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};

  let filters: { metric: string; op: string; value: number }[] = [];
  if (screenId) {
    const screen = await db
      .prepare('SELECT filters_json FROM screen_definitions WHERE id = ?')
      .bind(Number(screenId))
      .first<{ filters_json: string }>();
    if (screen) filters = JSON.parse(screen.filters_json || '[]');
  } else {
    if (minCap) filters.push({ metric: 'implied_cap_rate', op: '>', value: Number(minCap) });
    if (maxRentMult) filters.push({ metric: 'rent_multiple', op: '<', value: Number(maxRentMult) });
    if (minAccess) filters.push({ metric: 'access_score', op: '>', value: Number(minAccess) });
  }

  const countiesResult = await getAllCounties(db, state?.toUpperCase());
  const results: any[] = [];

  for (const co of countiesResult.results as any[]) {
    const data = await computeCounty(db, co.fips, asOf, assumptions);
    const m = data.metrics;

    let passes = true;
    for (const f of filters) {
      const val = m[f.metric];
      if (val == null) {
        passes = false;
        break;
      }
      if (f.op === '>' && val <= f.value) passes = false;
      else if (f.op === '<' && val >= f.value) passes = false;
      else if (f.op === '>=' && val < f.value) passes = false;
      else if (f.op === '<=' && val > f.value) passes = false;
      if (!passes) break;
    }

    if (passes) {
      results.push({
        fips: co.fips,
        county: co.name,
        state: co.state,
        metrics: Object.fromEntries(
          Object.entries(m).map(([k, v]) => [k, v != null ? Math.round((v as number) * 100) / 100 : null]),
        ),
      });
    }
  }

  const reverse = sortDir !== 'asc';
  results.sort((a, b) => {
    const av = a.metrics[sortBy] ?? 0;
    const bv = b.metrics[sortBy] ?? 0;
    return reverse ? bv - av : av - bv;
  });

  return c.json({ count: results.length, as_of: asOf, filters, results });
});

// ═════════════════════════════════════════════════════════════════════
// Scenario / Sensitivity / Backtest
// ═════════════════════════════════════════════════════════════════════

app.post('/api/v1/run/scenario', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    geo_key: string;
    as_of?: string;
    assumption_set_id?: number;
    overrides?: Record<string, any>;
    vary_params?: { param: string; values: number[]; target_metric?: string }[];
  }>();

  const asOf = body.as_of ?? '2025';
  let assumptions = (await getAssumptions(db, body.assumption_set_id)) ?? {};
  if (body.overrides) assumptions = { ...assumptions, ...body.overrides };

  const base = await computeCounty(db, body.geo_key, asOf, assumptions);
  const sensitivities: Record<string, any> = {};

  if (body.vary_params) {
    const series = await loadSeriesForCounty(db, body.geo_key, asOf);
    for (const vp of body.vary_params) {
      const ctx = createContext(body.geo_key, asOf, series, assumptions);
      const results = computeSensitivity(ctx, vp.param, vp.values, vp.target_metric ?? 'fair_value');
      sensitivities[vp.param] = results;
    }
  }

  return c.json({ base, sensitivities });
});

app.get('/api/v1/geo/:geoKey/sensitivity', async (c) => {
  const db = c.env.DB;
  const geoKey = c.req.param('geoKey');
  const asOf = c.req.query('as_of') ?? '2025';
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const series = await loadSeriesForCounty(db, geoKey, asOf);

  // Rate/growth matrix
  const matrix: Record<string, any>[] = [];
  for (const rv of [2.0, 3.0, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0]) {
    const row: Record<string, any> = { risk_premium: rv };
    for (const gv of [0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04]) {
      const ctx = createContext(geoKey, asOf, { ...series }, { ...assumptions, risk_premium: rv, long_run_growth: gv });
      computeAll(ctx);
      const fv = ctx.metrics.fair_value;
      row[`g_${gv}`] = fv != null ? Math.round(fv) : null;
    }
    matrix.push(row);
  }

  // Rent shock sensitivity
  const rentShocks: number[] = [];
  for (let s = -20; s <= 20; s += 5) rentShocks.push(s / 100);

  const rentSens: Record<string, any>[] = [];
  for (const rs of rentShocks) {
    const ctx = createContext(geoKey, asOf, { ...series }, { ...assumptions, near_term_rent_shock: rs });
    computeAll(ctx);
    rentSens.push({
      rent_shock: rs,
      fair_value: ctx.metrics.fair_value != null ? Math.round(ctx.metrics.fair_value) : null,
      noi: ctx.metrics.noi_per_acre != null ? Math.round(ctx.metrics.noi_per_acre * 100) / 100 : null,
    });
  }

  return c.json({ geo_key: geoKey, rate_growth_matrix: matrix, rent_shock_sensitivity: rentSens });
});

app.post('/api/v1/run/backtest', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    screen_id: number;
    start_year?: string;
    eval_years?: number;
    assumption_set_id?: number;
  }>();

  const screen = await db
    .prepare('SELECT id, name, filters_json FROM screen_definitions WHERE id = ?')
    .bind(body.screen_id)
    .first<{ id: number; name: string; filters_json: string }>();
  if (!screen) return c.json({ error: 'Screen not found' }, 404);

  const assumptions = (await getAssumptions(db, body.assumption_set_id)) ?? {};
  const startYear = body.start_year ?? '2018';
  const evalYears = body.eval_years ?? 3;
  const endYear = Math.min(parseInt(startYear) + evalYears, 2025);
  const screenFilters = JSON.parse(screen.filters_json || '[]');

  const countiesResult = await getAllCounties(db);
  const flagged: any[] = [];

  for (const co of countiesResult.results as any[]) {
    const data = await computeCounty(db, co.fips, startYear, assumptions);
    const m = data.metrics;

    let passes = true;
    for (const f of screenFilters) {
      const val = m[f.metric];
      if (val == null) {
        passes = false;
        break;
      }
      if (f.op === '>' && val <= f.value) passes = false;
      else if (f.op === '<' && val >= f.value) passes = false;
      if (!passes) break;
    }

    if (passes) {
      flagged.push({
        fips: co.fips,
        county: co.name,
        state: co.state,
        start_metrics: Object.fromEntries(
          Object.entries(m).map(([k, v]) => [k, v != null ? Math.round((v as number) * 100) / 100 : null]),
        ),
      });
    }
  }

  // Compute end metrics and changes
  for (const item of flagged) {
    const endData = await computeCounty(db, item.fips, String(endYear), assumptions);
    const em = endData.metrics;
    const sv = (item.start_metrics.benchmark_value as number) || 0;
    const ev = (em.benchmark_value as number) || 0;
    const vc = sv > 0 ? ((ev - sv) / sv) * 100 : 0;
    const sr = (item.start_metrics.cash_rent as number) || 0;
    const er = (em.cash_rent as number) || 0;
    const rc = sr > 0 ? ((er - sr) / sr) * 100 : 0;

    item.end_metrics = Object.fromEntries(
      Object.entries(em).map(([k, v]) => [k, v != null ? Math.round((v as number) * 100) / 100 : null]),
    );
    item.value_change_pct = Math.round(vc * 100) / 100;
    item.rent_change_pct = Math.round(rc * 100) / 100;
    item.total_return_est =
      Math.round((vc + ((item.start_metrics.implied_cap_rate as number) || 0) * evalYears) * 100) / 100;
  }

  flagged.sort((a, b) => (b.total_return_est ?? 0) - (a.total_return_est ?? 0));
  return c.json({
    screen: { id: screen.id, name: screen.name, filters: screenFilters },
    start_year: startYear,
    eval_years: evalYears,
    counties_screened: countiesResult.results.length,
    counties_flagged: flagged.length,
    results: flagged,
  });
});

// ═════════════════════════════════════════════════════════════════════
// Dashboard
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/dashboard', async (c) => {
  const db = c.env.DB;
  const asOf = c.req.query('as_of') ?? '2025';
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};

  const countiesResult = await getAllCounties(db);
  const allData: any[] = [];
  for (const co of countiesResult.results as any[]) {
    allData.push(await computeCounty(db, co.fips, asOf, assumptions));
  }

  const caps = allData.map((d) => d.metrics.implied_cap_rate).filter((v): v is number => v != null);
  const fvs = allData.map((d) => d.metrics.fair_value).filter((v): v is number => v != null);
  const rents = allData.map((d) => d.metrics.cash_rent).filter((v): v is number => v != null);
  const vals = allData.map((d) => d.metrics.benchmark_value).filter((v): v is number => v != null);
  const accessScores = allData.map((d) => d.metrics.access_score).filter((v): v is number => v != null);

  // Top movers
  const movers: any[] = [];
  for (const d of allData) {
    const fv = d.metrics.fair_value;
    const bv = d.metrics.benchmark_value;
    if (fv && bv && bv > 0) {
      const spread = ((fv - bv) / bv) * 100;
      movers.push({
        fips: d.geo_key,
        county: d.county_name,
        state: d.state,
        fair_value: Math.round(fv),
        benchmark_value: Math.round(bv),
        spread_pct: Math.round(spread * 10) / 10,
        implied_cap: Math.round((d.metrics.implied_cap_rate ?? 0) * 100) / 100,
        access_score: Math.round((d.metrics.access_score ?? 0) * 10) / 10,
        noi: Math.round(d.metrics.noi_per_acre ?? 0),
      });
    }
  }
  movers.sort((a, b) => Math.abs(b.spread_pct) - Math.abs(a.spread_pct));

  // State summary
  const stateData: Record<string, any[]> = {};
  for (const d of allData) {
    const st = d.state;
    if (!stateData[st]) stateData[st] = [];
    stateData[st].push(d.metrics);
  }
  const stateSummary: Record<string, any> = {};
  for (const [st, items] of Object.entries(stateData)) {
    const cList = items.map((i) => i.implied_cap_rate ?? 0);
    const vList = items.map((i) => i.benchmark_value ?? 0);
    stateSummary[st] = {
      count: items.length,
      avg_cap: cList.length ? Math.round((cList.reduce((a, b) => a + b, 0) / cList.length) * 100) / 100 : 0,
      avg_value: vList.length ? Math.round(vList.reduce((a, b) => a + b, 0) / vList.length) : 0,
    };
  }

  const treasury10y =
    allData.length > 0
      ? (allData[0].metrics.required_return ?? 0) - (assumptions.risk_premium ?? 2.0)
      : 0;

  return c.json({
    as_of: asOf,
    county_count: countiesResult.results.length,
    summary: {
      implied_cap_rate: stats(caps),
      fair_value: stats(fvs),
      cash_rent: stats(rents),
      benchmark_value: stats(vals),
      access_score: stats(accessScores),
    },
    treasury_10y: treasury10y,
    top_movers: movers.slice(0, 15),
    state_summary: stateSummary,
  });
});

// ═════════════════════════════════════════════════════════════════════
// Facilities
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/facilities', async (c) => {
  const db = c.env.DB;
  const type = c.req.query('type');
  let rows;
  if (type) {
    rows = await db.prepare('SELECT id, type, name, lat, lon FROM poi_facilities WHERE type = ?').bind(type).all();
  } else {
    rows = await db.prepare('SELECT id, type, name, lat, lon FROM poi_facilities').all();
  }
  return c.json(rows.results);
});

// ═════════════════════════════════════════════════════════════════════
// Watchlist
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/watchlist', async (c) => {
  const db = c.env.DB;
  const asOf = c.req.query('as_of') ?? '2025';
  const assumptions = (await getAssumptions(db)) ?? {};

  const items = await db.prepare('SELECT id, geo_key, notes, added_at FROM watchlist_items').all<{
    id: number;
    geo_key: string;
    notes: string | null;
    added_at: string;
  }>();

  const result: any[] = [];
  for (const item of items.results) {
    const data = await computeCounty(db, item.geo_key, asOf, assumptions);
    const prev = await computeCounty(db, item.geo_key, String(parseInt(asOf) - 1), assumptions);
    const m = data.metrics;
    const pm = prev.metrics;

    const delta = (k: string) => {
      const cur = m[k];
      const prv = pm[k];
      if (cur != null && prv != null && prv !== 0) {
        return Math.round(((cur - prv) / Math.abs(prv)) * 1000) / 10;
      }
      return null;
    };

    result.push({
      id: item.id,
      fips: item.geo_key,
      county: data.county_name,
      state: data.state,
      added_at: item.added_at,
      notes: item.notes,
      metrics: Object.fromEntries(
        Object.entries(m).map(([k, v]) => [k, v != null ? Math.round((v as number) * 100) / 100 : null]),
      ),
      changes: {
        cash_rent: delta('cash_rent'),
        benchmark_value: delta('benchmark_value'),
        implied_cap_rate: delta('implied_cap_rate'),
        fair_value: delta('fair_value'),
      },
    });
  }
  return c.json(result);
});

app.post('/api/v1/watchlist', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const body = await c.req.json<{ geo_key: string; notes?: string }>();
  const existing = await db
    .prepare('SELECT id FROM watchlist_items WHERE geo_key = ?')
    .bind(body.geo_key)
    .first<{ id: number }>();
  if (existing) return c.json({ id: existing.id, status: 'already_watching' });

  const result = await db
    .prepare('INSERT INTO watchlist_items (geo_key, notes) VALUES (?, ?) RETURNING id')
    .bind(body.geo_key, body.notes ?? null)
    .first<{ id: number }>();
  return c.json({ id: result!.id, status: 'added' });
});

app.delete('/api/v1/watchlist/:geoKey', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const geoKey = c.req.param('geoKey');
  const item = await db.prepare('SELECT id FROM watchlist_items WHERE geo_key = ?').bind(geoKey).first();
  if (!item) return c.json({ error: 'Not in watchlist' }, 404);
  await db.prepare('DELETE FROM watchlist_items WHERE geo_key = ?').bind(geoKey).run();
  return c.json({ status: 'removed' });
});

// ═════════════════════════════════════════════════════════════════════
// Notes
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/notes/:geoKey', async (c) => {
  const db = c.env.DB;
  const geoKey = c.req.param('geoKey');
  const notes = await db
    .prepare('SELECT id, content, created_at FROM county_notes WHERE geo_key = ? ORDER BY created_at DESC')
    .bind(geoKey)
    .all<{ id: number; content: string; created_at: string }>();
  return c.json(notes.results);
});

app.post('/api/v1/notes/:geoKey', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const geoKey = c.req.param('geoKey');
  const body = await c.req.json<{ content: string }>();
  const result = await db
    .prepare('INSERT INTO county_notes (geo_key, content) VALUES (?, ?) RETURNING id, content, created_at')
    .bind(geoKey, body.content)
    .first<{ id: number; content: string; created_at: string }>();
  return c.json(result);
});

app.delete('/api/v1/notes/:noteId', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const noteId = c.req.param('noteId');
  const note = await db.prepare('SELECT id FROM county_notes WHERE id = ?').bind(Number(noteId)).first();
  if (!note) return c.json({ error: 'Note not found' }, 404);
  await db.prepare('DELETE FROM county_notes WHERE id = ?').bind(Number(noteId)).run();
  return c.json({ status: 'deleted' });
});

// ═════════════════════════════════════════════════════════════════════
// Auth
// ═════════════════════════════════════════════════════════════════════

app.post('/api/v1/auth/bootstrap', async (c) => {
  const db = c.env.DB;
  await ensureResearchSchema(db);

  const token = extractBearerToken(c);
  const session = await getValidSession(db, token);
  if (session) {
    return c.json(
      authPayload({
        userKey: session.user_key,
        source: session.identity_source || 'session',
        token,
        expiresAt: session.expires_at,
      }),
    );
  }

  const headerIdentity = extractHeaderIdentity(c);
  if (headerIdentity) {
    const created = await createSession(c, db, headerIdentity.userKey, headerIdentity.source);
    return c.json(
      authPayload({
        userKey: headerIdentity.userKey,
        source: headerIdentity.source,
        token: created.token,
        expiresAt: created.session.expires_at,
      }),
    );
  }

  if (allowAnonSessions(c)) {
    const anonUser = `anon_${randomTokenHex(8)}`;
    const created = await createSession(c, db, anonUser, 'anonymous');
    return c.json(
      authPayload({
        userKey: anonUser,
        source: 'anonymous',
        token: created.token,
        expiresAt: created.session.expires_at,
      }),
    );
  }

  return c.json({ error: 'Authentication required' }, 401);
});

app.get('/api/v1/auth/me', async (c) => {
  const db = c.env.DB;
  await ensureResearchSchema(db);
  try {
    const auth = await requireAuthState(c, db);
    return c.json(authPayload(auth));
  } catch {
    return c.json({ error: 'Authentication required' }, 401);
  }
});

app.post('/api/v1/auth/logout', async (c) => {
  const db = c.env.DB;
  await ensureResearchSchema(db);
  const token = extractBearerToken(c);
  const session = await getValidSession(db, token);
  if (!session || !token) return c.json({ error: 'Authentication required' }, 401);
  await db
    .prepare("UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = ?")
    .bind(session.id)
    .run();
  return c.json({ status: 'logged_out' });
});

// ═════════════════════════════════════════════════════════════════════
// Research Workspace
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/research/workspaces', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const rows = await db
    .prepare(
      `SELECT id, owner_key, geo_key, thesis, tags_json, status, conviction, created_at, updated_at
       FROM research_workspaces
       ORDER BY updated_at DESC, id DESC`,
    )
    .all<ResearchWorkspaceRow>();

  const payload: Record<string, unknown>[] = [];
  for (const row of rows.results) {
    if (!workspaceVisibleToUser(row, auth.userKey)) continue;
    payload.push(await serializeResearchWorkspace(db, row));
  }
  return c.json(payload);
});

app.get('/api/v1/research/workspaces/:geoKey', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const geoKey = c.req.param('geoKey');
  const workspace = await findResearchWorkspaceForUser(db, auth.userKey, geoKey);
  if (!workspace) return c.json(emptyResearchWorkspace(geoKey));
  return c.json(await serializeResearchWorkspace(db, workspace));
});

app.put('/api/v1/research/workspaces/:geoKey', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const geoKey = c.req.param('geoKey');
  const body = await c.req.json<{
    thesis?: string;
    tags?: unknown;
    status?: string;
    conviction?: number;
  }>();

  const workspace = await ensureResearchWorkspace(db, auth.userKey, geoKey);
  const thesis = (body.thesis ?? '').trim();
  const tags = normalizeTags(body.tags);
  const status = (body.status ?? 'exploring').trim() || 'exploring';
  const conviction = clampConviction(body.conviction);

  await db
    .prepare(
      `UPDATE research_workspaces
       SET thesis = ?, tags_json = ?, status = ?, conviction = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(thesis, JSON.stringify(tags), status, conviction, workspace.id)
    .run();

  const updated = await findResearchWorkspaceForUser(db, auth.userKey, geoKey);
  if (!updated) return c.json({ error: 'Failed to update workspace' }, 500);
  return c.json(await serializeResearchWorkspace(db, updated));
});

app.post('/api/v1/research/workspaces/:geoKey/notes', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const geoKey = c.req.param('geoKey');
  const body = await c.req.json<{ content?: string }>();
  const content = (body.content ?? '').trim();
  if (!content) return c.json({ error: 'Note content is required' }, 400);

  const workspace = await ensureResearchWorkspace(db, auth.userKey, geoKey);
  const note = await db
    .prepare(
      `INSERT INTO research_notes (workspace_id, content, created_at)
       VALUES (?, ?, datetime('now'))
       RETURNING id, content, created_at`,
    )
    .bind(workspace.id, content)
    .first<{ id: number; content: string; created_at: string | null }>();

  await db
    .prepare("UPDATE research_workspaces SET updated_at = datetime('now') WHERE id = ?")
    .bind(workspace.id)
    .run();

  if (!note) return c.json({ error: 'Failed to add note' }, 500);
  return c.json({ ...note, workspace_id: workspace.id });
});

app.delete('/api/v1/research/notes/:noteId', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const noteId = Number(c.req.param('noteId'));
  const note = await db
    .prepare('SELECT id, workspace_id FROM research_notes WHERE id = ?')
    .bind(noteId)
    .first<{ id: number; workspace_id: number }>();
  if (!note) return c.json({ error: 'Research note not found' }, 404);

  const workspace = await db
    .prepare('SELECT owner_key, geo_key FROM research_workspaces WHERE id = ?')
    .bind(note.workspace_id)
    .first<{ owner_key: string; geo_key: string }>();
  if (!workspace || (workspace.owner_key || RESEARCH_LEGACY_USER) !== auth.userKey) {
    return c.json({ error: 'Research note not found' }, 404);
  }

  await db.prepare('DELETE FROM research_notes WHERE id = ?').bind(noteId).run();
  await db
    .prepare("UPDATE research_workspaces SET updated_at = datetime('now') WHERE id = ?")
    .bind(note.workspace_id)
    .run();
  return c.json({ status: 'deleted' });
});

app.post('/api/v1/research/workspaces/:geoKey/scenario-packs', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const geoKey = c.req.param('geoKey');
  const body = await c.req.json<{
    name?: string;
    risk_premium: number;
    growth_rate: number;
    rent_shock: number;
  }>();

  const workspace = await ensureResearchWorkspace(db, auth.userKey, geoKey);
  const name = (body.name ?? '').trim() || `Pack ${new Date().toISOString().slice(0, 10)}`;
  const riskPremium = Number(body.risk_premium);
  const growthRate = Number(body.growth_rate);
  const rentShock = Number(body.rent_shock);
  if (Number.isNaN(riskPremium) || Number.isNaN(growthRate) || Number.isNaN(rentShock)) {
    return c.json({ error: 'Invalid scenario pack inputs' }, 400);
  }

  const pack = await db
    .prepare(
      `INSERT INTO research_scenario_packs (
         workspace_id, name, risk_premium, growth_rate, rent_shock, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       RETURNING id, name, risk_premium, growth_rate, rent_shock, created_at, updated_at`,
    )
    .bind(workspace.id, name, riskPremium, growthRate, rentShock)
    .first<{
      id: number;
      name: string;
      risk_premium: number;
      growth_rate: number;
      rent_shock: number;
      created_at: string | null;
      updated_at: string | null;
    }>();

  await db
    .prepare("UPDATE research_workspaces SET updated_at = datetime('now') WHERE id = ?")
    .bind(workspace.id)
    .run();

  if (!pack) return c.json({ error: 'Failed to create scenario pack' }, 500);
  return c.json({ ...pack, workspace_id: workspace.id });
});

app.delete('/api/v1/research/scenario-packs/:packId', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const packId = Number(c.req.param('packId'));
  const pack = await db
    .prepare('SELECT id, workspace_id FROM research_scenario_packs WHERE id = ?')
    .bind(packId)
    .first<{ id: number; workspace_id: number }>();
  if (!pack) return c.json({ error: 'Scenario pack not found' }, 404);

  const workspace = await db
    .prepare('SELECT owner_key, geo_key FROM research_workspaces WHERE id = ?')
    .bind(pack.workspace_id)
    .first<{ owner_key: string; geo_key: string }>();
  if (!workspace || (workspace.owner_key || RESEARCH_LEGACY_USER) !== auth.userKey) {
    return c.json({ error: 'Scenario pack not found' }, 404);
  }

  await db.prepare('DELETE FROM research_scenario_packs WHERE id = ?').bind(packId).run();
  await db
    .prepare("UPDATE research_workspaces SET updated_at = datetime('now') WHERE id = ?")
    .bind(pack.workspace_id)
    .run();
  return c.json({ status: 'deleted' });
});

// ═════════════════════════════════════════════════════════════════════
// Portfolios
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/portfolios', async (c) => {
  const db = c.env.DB;
  const portfolios = await db.prepare('SELECT id, name, description, created_at FROM portfolios').all<{
    id: number;
    name: string;
    description: string | null;
    created_at: string;
  }>();

  const result: any[] = [];
  for (const p of portfolios.results) {
    const holdings = await db
      .prepare('SELECT acres FROM portfolio_holdings WHERE portfolio_id = ?')
      .bind(p.id)
      .all<{ acres: number }>();
    result.push({
      id: p.id,
      name: p.name,
      description: p.description,
      holdings_count: holdings.results.length,
      total_acres: holdings.results.reduce((sum, h) => sum + h.acres, 0),
      created_at: p.created_at,
    });
  }
  return c.json(result);
});

app.get('/api/v1/portfolios/:portfolioId', async (c) => {
  const db = c.env.DB;
  const portfolioId = Number(c.req.param('portfolioId'));
  const asOf = c.req.query('as_of') ?? '2025';
  const assumptions = (await getAssumptions(db)) ?? {};

  const p = await db
    .prepare('SELECT id, name, description FROM portfolios WHERE id = ?')
    .bind(portfolioId)
    .first<{ id: number; name: string; description: string | null }>();
  if (!p) return c.json({ error: 'Portfolio not found' }, 404);

  const holdings = await db
    .prepare('SELECT geo_key, acres, purchase_price_per_acre, purchase_year FROM portfolio_holdings WHERE portfolio_id = ?')
    .bind(portfolioId)
    .all<{ geo_key: string; acres: number; purchase_price_per_acre: number | null; purchase_year: string | null }>();

  const countyData: Record<string, any> = {};
  const holdingDicts: any[] = [];
  for (const h of holdings.results) {
    countyData[h.geo_key] = await computeCounty(db, h.geo_key, asOf, assumptions);
    holdingDicts.push({
      geo_key: h.geo_key,
      acres: h.acres,
      purchase_price_per_acre: h.purchase_price_per_acre,
      purchase_year: h.purchase_year,
    });
  }

  const analytics = computePortfolioMetrics(holdingDicts, countyData);

  return c.json({
    id: p.id,
    name: p.name,
    description: p.description,
    as_of: asOf,
    ...analytics,
  });
});

app.post('/api/v1/portfolios', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const body = await c.req.json<{ name: string; description?: string }>();
  const result = await db
    .prepare('INSERT INTO portfolios (name, description) VALUES (?, ?) RETURNING id')
    .bind(body.name, body.description ?? null)
    .first<{ id: number }>();
  return c.json({ id: result!.id, name: body.name });
});

app.post('/api/v1/portfolios/:portfolioId/holdings', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const portfolioId = Number(c.req.param('portfolioId'));
  const body = await c.req.json<{
    geo_key: string;
    acres?: number;
    purchase_price_per_acre?: number;
    purchase_year?: string;
  }>();

  const p = await db.prepare('SELECT id FROM portfolios WHERE id = ?').bind(portfolioId).first();
  if (!p) return c.json({ error: 'Portfolio not found' }, 404);

  const result = await db
    .prepare(
      'INSERT INTO portfolio_holdings (portfolio_id, geo_key, acres, purchase_price_per_acre, purchase_year) VALUES (?, ?, ?, ?, ?) RETURNING id',
    )
    .bind(portfolioId, body.geo_key, body.acres ?? 100, body.purchase_price_per_acre ?? null, body.purchase_year ?? null)
    .first<{ id: number }>();
  return c.json({ id: result!.id, status: 'added' });
});

app.delete('/api/v1/portfolios/:portfolioId/holdings/:geoKey', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const portfolioId = Number(c.req.param('portfolioId'));
  const geoKey = c.req.param('geoKey');
  const h = await db
    .prepare('SELECT id FROM portfolio_holdings WHERE portfolio_id = ? AND geo_key = ?')
    .bind(portfolioId, geoKey)
    .first();
  if (!h) return c.json({ error: 'Holding not found' }, 404);
  await db.prepare('DELETE FROM portfolio_holdings WHERE portfolio_id = ? AND geo_key = ?').bind(portfolioId, geoKey).run();
  return c.json({ status: 'removed' });
});

// ═════════════════════════════════════════════════════════════════════
// Export
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/export/screener', async (c) => {
  const db = c.env.DB;
  const asOf = c.req.query('as_of') ?? '2025';
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};

  const countiesResult = await db
    .prepare('SELECT * FROM geo_county ORDER BY state, name')
    .all<any>();

  const headers = [
    'FIPS',
    'County',
    'State',
    'Cash Rent',
    'Land Value',
    'NOI/Acre',
    'Implied Cap Rate',
    'Rent Multiple',
    'Fair Value',
    'Cap Spread (bps)',
    'Access Score',
    'DSCR',
    'Payback Years',
  ];

  let csv = headers.join(',') + '\n';
  for (const co of countiesResult.results) {
    const data = await computeCounty(db, co.fips, asOf, assumptions);
    const m = data.metrics;
    csv +=
      [
        co.fips,
        `"${co.name}"`,
        co.state,
        Math.round(((m.cash_rent as number) ?? 0) * 100) / 100,
        Math.round((m.benchmark_value as number) ?? 0),
        Math.round(((m.noi_per_acre as number) ?? 0) * 100) / 100,
        Math.round(((m.implied_cap_rate as number) ?? 0) * 100) / 100,
        Math.round(((m.rent_multiple as number) ?? 0) * 10) / 10,
        Math.round((m.fair_value as number) ?? 0),
        Math.round((m.cap_spread_to_10y as number) ?? 0),
        Math.round(((m.access_score as number) ?? 0) * 10) / 10,
        Math.round(((m.dscr as number) ?? 0) * 100) / 100,
        Math.round(((m.payback_period as number) ?? 0) * 10) / 10,
      ].join(',') + '\n';
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=farmland_screener_${asOf}.csv`,
    },
  });
});

// ═════════════════════════════════════════════════════════════════════
// Health Check
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/health', (c) => {
  return c.json({ status: 'ok', version: '0.3.0', runtime: 'cloudflare-workers' });
});

// ═════════════════════════════════════════════════════════════════════
// NASS Debug — test a single query to diagnose parameter issues
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/debug/nass', async (c) => {
  if ((c.env.ENVIRONMENT ?? 'production').toLowerCase() === 'production') {
    return c.json({ error: 'Not found' }, 404);
  }

  const nassKey = await c.env.NASS_API_KEY.get();
  // Build params from query string, injecting the API key
  const params: Record<string, string> = { key: nassKey, format: 'JSON' };
  for (const [k, v] of Object.entries(c.req.query())) {
    if (k !== 'key') params[k] = v as string;
  }
  const qs = new URLSearchParams(params);
  const url = `https://quickstats.nass.usda.gov/api/api_GET/?${qs}`;
  const resp = await fetch(url);
  const body = await resp.text();
  return c.json({
    status: resp.status,
    url_without_key: url.replace(nassKey, 'REDACTED'),
    record_count: resp.ok ? (JSON.parse(body).data?.length ?? 0) : null,
    response: resp.ok ? JSON.parse(body).data?.slice(0, 3) : JSON.parse(body),
  });
});

// ═════════════════════════════════════════════════════════════════════
// Manual Ingestion Trigger
// ═════════════════════════════════════════════════════════════════════

app.post('/api/v1/ingest', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  const rawStartYear = c.req.query('start_year');
  const rawEndYear = c.req.query('end_year');
  const startYear = parseOptionalYear(rawStartYear);
  const endYear = parseOptionalYear(rawEndYear);
  const currentYear = new Date().getFullYear();

  if (rawStartYear && startYear === undefined) {
    return c.json({ error: 'Invalid start_year. Expected a 4-digit year.' }, 400);
  }
  if (rawEndYear && endYear === undefined) {
    return c.json({ error: 'Invalid end_year. Expected a 4-digit year.' }, 400);
  }
  if (startYear != null && (startYear < 1950 || startYear > currentYear)) {
    return c.json({ error: `start_year must be between 1950 and ${currentYear}.` }, 400);
  }
  if (endYear != null && (endYear < 1950 || endYear > currentYear)) {
    return c.json({ error: `end_year must be between 1950 and ${currentYear}.` }, 400);
  }
  if (startYear != null && endYear != null && startYear > endYear) {
    return c.json({ error: 'start_year must be less than or equal to end_year.' }, 400);
  }
  if (startYear != null && endYear != null && endYear - startYear > 75) {
    return c.json({ error: 'Year range too large. Use a range of 75 years or less.' }, 400);
  }

  const result = await runIngestion(
    { DB: db, FRED_API_KEY: c.env.FRED_API_KEY, NASS_API_KEY: c.env.NASS_API_KEY },
    { startYear, endYear },
  );
  return c.json(result);
});

// Freshness status
app.get('/api/v1/data-freshness', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare('SELECT * FROM data_freshness ORDER BY last_updated DESC')
    .all();
  return c.json(rows.results);
});

// ═════════════════════════════════════════════════════════════════════
// Export — fetch handler (Hono) + scheduled handler (Cron)
// ═════════════════════════════════════════════════════════════════════

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      runIngestion(env).then(async (result) => {
        console.log('Ingestion complete:', JSON.stringify(result));
      }),
    );
  },
};
