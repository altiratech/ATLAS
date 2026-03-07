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
  loadCountySeriesWindow,
} from './db/queries';
import { runIngestion, ingestBulkDataPoints, TRACKED_STATES, NASS_SERIES_KEYS } from './services/ingest';
import { resolveAsOf } from './services/asof';
import { computeZScoreStats, zscoreBand } from './services/zscore';
import { filterAnalyticCountyRows } from './services/county-scope';

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
  INGEST_ADMIN_TOKEN?: string;
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

function computeCountyFromSeries(
  county: {
    fips: string;
    name: string;
    state: string;
    centroid_lat: number | null;
    centroid_lon: number | null;
  },
  asOf: string,
  series: SeriesData,
  assumptions: Assumptions,
  accessScore?: number | null,
) {
  const hydratedSeries = { ...series };
  if (accessScore != null) {
    hydratedSeries['computed.access_score'] = accessScore;
  }

  const ctx = createContext(county.fips, asOf, hydratedSeries, assumptions);
  computeAll(ctx);

  return {
    geo_key: county.fips,
    county_name: county.name,
    state: county.state,
    lat: county.centroid_lat ?? null,
    lon: county.centroid_lon ?? null,
    as_of: asOf,
    metrics: Object.fromEntries(
      Object.entries(ctx.metrics).map(([k, v]) => [k, v != null ? Math.round(v * 10000) / 10000 : null]),
    ),
    explains: ctx.explains,
    fallbacks: ctx.fallbacks,
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

function hasModeledCoreMetrics(metrics: Record<string, number | null | undefined>) {
  return ['cash_rent', 'implied_cap_rate', 'fair_value'].some((key) => {
    const value = metrics[key];
    return typeof value === 'number' && Number.isFinite(value);
  });
}

function roundNullable(value: number | null | undefined, decimals = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseOptionalYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const INGEST_PROGRESS_STATUSES = ['pending', 'running', 'success', 'failed', 'skipped'] as const;
type IngestProgressStatus = (typeof INGEST_PROGRESS_STATUSES)[number];
const MAX_SENSITIVITY_PARAMS = 5;
const MAX_SENSITIVITY_VALUES_PER_PARAM = 25;
const MAX_SENSITIVITY_TOTAL_POINTS = 100;

interface IngestProgressRow {
  source: string;
  year: number;
  state: string;
  status: IngestProgressStatus;
  rows_total: number;
  inserted: number;
  skipped: number;
  attempts: number;
  last_error: string | null;
  meta_json: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function parseStatesCsv(
  rawStates: string | undefined,
): { states: string[]; invalidStates: string[] } {
  if (!rawStates) return { states: [], invalidStates: [] };
  const states = Array.from(
    new Set(
      rawStates
        .split(',')
        .map((state) => state.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  const invalidStates = states.filter((state) => !/^[A-Z]{2}$/.test(state));
  return { states, invalidStates };
}

function isIngestProgressStatus(value: unknown): value is IngestProgressStatus {
  return (
    typeof value === 'string' &&
    (INGEST_PROGRESS_STATUSES as readonly string[]).includes(value)
  );
}

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const RESPONSE_CACHE = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
  const entry = RESPONSE_CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    RESPONSE_CACHE.delete(key);
    return null;
  }
  return entry.payload as T;
}

function cacheSet(key: string, payload: unknown, ttlMs: number) {
  RESPONSE_CACHE.set(key, { payload, expiresAt: Date.now() + ttlMs });
}

const CORE_MODEL_SERIES = [
  'cash_rent',
  'land_value',
  'corn_yield',
  'treasury_10y',
  'corn_price',
] as const;

const ZSCORE_DEFAULT_METRICS = [
  'implied_cap_rate',
  'fair_value',
  'cash_rent',
  'benchmark_value',
] as const;

type MetricZScoreMap = Record<
  string,
  {
    value: number | null;
    mean: number | null;
    stddev: number | null;
    zscore: number | null;
    percentile: number | null;
    window_n: number;
    window_start: string | null;
    window_end: string | null;
    band: 'cheap' | 'normal' | 'expensive' | 'na';
  }
>;

async function resolveRequestAsOf(
  db: D1Database,
  requestedAsOf?: string | null,
  state?: string | null,
  requiredSeries: string[] = [...CORE_MODEL_SERIES],
) {
  return resolveAsOf(db, {
    requestedAsOf,
    state,
    requiredSeries,
  });
}

async function computeMetricZscoresForCounty(
  db: D1Database,
  geoKey: string,
  asOf: string,
  assumptions: Assumptions,
  metricKeys: string[] = [...ZSCORE_DEFAULT_METRICS],
  windowYears = 10,
): Promise<MetricZScoreMap> {
  const endYear = Number.parseInt(asOf, 10);
  if (Number.isNaN(endYear)) {
    return Object.fromEntries(
      metricKeys.map((metric) => [
        metric,
        {
          value: null,
          mean: null,
          stddev: null,
          zscore: null,
          percentile: null,
          window_n: 0,
          window_start: null,
          window_end: null,
          band: 'na',
        },
      ]),
    );
  }

  const startYear = Math.max(1950, endYear - Math.max(1, windowYears) + 1);
  const yearLabels: string[] = [];
  const valuesByMetric: Record<string, number[]> = Object.fromEntries(
    metricKeys.map((metric) => [metric, []]),
  );
  let currentMetrics: Record<string, number | null> = {};

  for (let year = startYear; year <= endYear; year += 1) {
    const yearStr = String(year);
    const computed = await computeCounty(db, geoKey, yearStr, assumptions);
    yearLabels.push(yearStr);
    for (const metric of metricKeys) {
      const metricValue = computed.metrics[metric];
      if (typeof metricValue === 'number' && Number.isFinite(metricValue)) {
        valuesByMetric[metric].push(metricValue);
      }
    }
    if (year === endYear) {
      currentMetrics = computed.metrics;
    }
  }

  const zscores: MetricZScoreMap = {};
  for (const metric of metricKeys) {
    const currentValue = (currentMetrics[metric] ?? null) as number | null;
    const stats = computeZScoreStats(currentValue, valuesByMetric[metric] ?? [], yearLabels);
    zscores[metric] = {
      ...stats,
      band: zscoreBand(stats.zscore),
    };
  }
  return zscores;
}

interface ResearchWorkspaceRow {
  id: number;
  owner_key: string;
  geo_key: string;
  thesis: string | null;
  analysis_json: string | null;
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

function hasValidIngestAdminToken(c: Context<{ Bindings: Bindings }>): boolean {
  const configuredToken = (c.env.INGEST_ADMIN_TOKEN ?? '').trim();
  if (!configuredToken) return false;
  const providedToken = (c.req.header('x-atlas-ingest-token') ?? '').trim();
  if (!providedToken) return false;
  return providedToken === configuredToken;
}

async function requireIngestAuthState(
  c: Context<{ Bindings: Bindings }>,
  db: D1Database,
): Promise<{ authMode: 'ingest_admin_token' | 'session' } | Response> {
  if (hasValidIngestAdminToken(c)) {
    return { authMode: 'ingest_admin_token' };
  }
  const auth = await requireAuthOrError(c, db);
  if (auth instanceof Response) return auth;
  return { authMode: 'session' };
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

function defaultAnalysisRecord() {
  return {
    thesis: '',
    bull_case: '',
    bear_case: '',
    key_risks: [] as string[],
    catalysts: [] as string[],
    decision_state: 'exploring',
  };
}

function parseAnalysis(analysisJson: string | null) {
  if (!analysisJson) return defaultAnalysisRecord();
  try {
    const parsed = JSON.parse(analysisJson);
    return {
      thesis: typeof parsed?.thesis === 'string' ? parsed.thesis : '',
      bull_case: typeof parsed?.bull_case === 'string' ? parsed.bull_case : '',
      bear_case: typeof parsed?.bear_case === 'string' ? parsed.bear_case : '',
      key_risks: Array.isArray(parsed?.key_risks)
        ? parsed.key_risks.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      catalysts: Array.isArray(parsed?.catalysts)
        ? parsed.catalysts.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      decision_state: typeof parsed?.decision_state === 'string' ? parsed.decision_state : 'exploring',
    };
  } catch {
    return defaultAnalysisRecord();
  }
}

function normalizeAnalysisInput(value: unknown, fallback = defaultAnalysisRecord()) {
  if (!value || typeof value !== 'object') return fallback;
  const incoming = value as Record<string, unknown>;
  return {
    thesis: typeof incoming.thesis === 'string' ? incoming.thesis : fallback.thesis,
    bull_case: typeof incoming.bull_case === 'string' ? incoming.bull_case : fallback.bull_case,
    bear_case: typeof incoming.bear_case === 'string' ? incoming.bear_case : fallback.bear_case,
    key_risks: Array.isArray(incoming.key_risks)
      ? incoming.key_risks.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : fallback.key_risks,
    catalysts: Array.isArray(incoming.catalysts)
      ? incoming.catalysts.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : fallback.catalysts,
    decision_state: typeof incoming.decision_state === 'string'
      ? incoming.decision_state
      : fallback.decision_state,
  };
}

function emptyResearchWorkspace(geoKey: string) {
  return {
    geo_key: geoKey,
    thesis: '',
    analysis: defaultAnalysisRecord(),
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
      'SELECT id, owner_key, geo_key, thesis, analysis_json, tags_json, status, conviction, created_at, updated_at FROM research_workspaces WHERE owner_key = ? AND geo_key = ?',
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
      "INSERT INTO research_workspaces (owner_key, geo_key, thesis, analysis_json, tags_json, status, conviction, created_at, updated_at) VALUES (?, ?, '', '{}', '[]', 'exploring', 50, datetime('now'), datetime('now'))",
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
    analysis: parseAnalysis(workspace.analysis_json),
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

let researchSchemaReady = false;
let researchSchemaPromise: Promise<void> | null = null;

async function getResearchWorkspaceColumns(db: D1Database): Promise<Set<string>> {
  const cols = await db.prepare('PRAGMA table_info(research_workspaces)').all<{ name: string }>();
  return new Set((cols.results ?? []).map((col) => col.name));
}

async function ensureResearchSchema(db: D1Database) {
  if (researchSchemaReady) return;
  if (!researchSchemaPromise) {
    researchSchemaPromise = (async () => {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS research_workspaces (
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
           )`,
        )
        .run();

      let workspaceCols = await getResearchWorkspaceColumns(db);
      if (!workspaceCols.has('owner_key') && workspaceCols.size > 0) {
        await db.prepare('PRAGMA foreign_keys=OFF').run();
        try {
          await db
            .prepare(
              `CREATE TABLE IF NOT EXISTS research_workspaces_new (
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
               )`,
            )
            .run();
          await db
            .prepare(
              `INSERT INTO research_workspaces_new (
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
               FROM research_workspaces`,
            )
            .run();
          await db.prepare('DROP TABLE research_workspaces').run();
          await db.prepare('ALTER TABLE research_workspaces_new RENAME TO research_workspaces').run();
        } finally {
          await db.prepare('PRAGMA foreign_keys=ON').run();
        }
        workspaceCols = await getResearchWorkspaceColumns(db);
      }

      if (!workspaceCols.has('analysis_json')) {
        try {
          await db.prepare('ALTER TABLE research_workspaces ADD COLUMN analysis_json TEXT').run();
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (!msg.toLowerCase().includes('duplicate column')) {
            throw error;
          }
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
          `CREATE TABLE IF NOT EXISTS research_scenario_runs (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             workspace_id INTEGER NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
             scenario_name TEXT,
             as_of_date TEXT NOT NULL,
             assumptions_json TEXT NOT NULL,
             comparison_json TEXT NOT NULL,
             created_at TEXT DEFAULT (datetime('now'))
           )`,
        )
        .run();
      await db
        .prepare('CREATE INDEX IF NOT EXISTS ix_research_scenario_runs_workspace ON research_scenario_runs(workspace_id, created_at DESC)')
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

      researchSchemaReady = true;
    })().catch((error) => {
      researchSchemaPromise = null;
      throw error;
    });
  }
  await researchSchemaPromise;
}

async function ensureAgCompositeIndexSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ag_composite_index (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         as_of_date TEXT NOT NULL UNIQUE,
         value REAL NOT NULL,
         component_json TEXT NOT NULL,
         zscore REAL,
         created_at TEXT DEFAULT (datetime('now'))
       )`,
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS ix_ag_composite_index_as_of ON ag_composite_index(as_of_date DESC)').run();
}

let ingestProgressSchemaReady = false;
let ingestProgressSchemaPromise: Promise<void> | null = null;

async function ensureIngestProgressSchema(db: D1Database) {
  if (ingestProgressSchemaReady) return;
  if (!ingestProgressSchemaPromise) {
    ingestProgressSchemaPromise = (async () => {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS ingest_progress (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             source TEXT NOT NULL,
             year INTEGER NOT NULL,
             state TEXT NOT NULL,
             status TEXT NOT NULL,
             rows_total INTEGER NOT NULL DEFAULT 0,
             inserted INTEGER NOT NULL DEFAULT 0,
             skipped INTEGER NOT NULL DEFAULT 0,
             attempts INTEGER NOT NULL DEFAULT 0,
             last_error TEXT,
             meta_json TEXT,
             created_at TEXT DEFAULT (datetime('now')),
             updated_at TEXT DEFAULT (datetime('now')),
             UNIQUE(source, year, state)
           )`,
        )
        .run();
      await db.prepare('CREATE INDEX IF NOT EXISTS ix_ingest_progress_source_year ON ingest_progress(source, year)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS ix_ingest_progress_status ON ingest_progress(status)').run();
      ingestProgressSchemaReady = true;
    })().catch((error) => {
      ingestProgressSchemaPromise = null;
      throw error;
    });
  }
  await ingestProgressSchemaPromise;
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

app.get('/api/v1/meta/as-of', async (c) => {
  const db = c.env.DB;
  const state = c.req.query('state');
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const requiredSeriesParam = c.req.query('required_series');
  const requiredSeries = requiredSeriesParam
    ? requiredSeriesParam.split(',').map((item) => item.trim()).filter(Boolean)
    : [...CORE_MODEL_SERIES];
  const resolved = await resolveRequestAsOf(db, requestedAsOf, state, requiredSeries);
  return c.json({
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
  });
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
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
  const result = await computeCounty(db, geoKey, resolved.asOf, assumptions);
  const zscores = await computeMetricZscoresForCounty(
    db,
    geoKey,
    resolved.asOf,
    assumptions,
    [...ZSCORE_DEFAULT_METRICS],
  );
  return c.json({
    ...result,
    zscores,
    as_of_meta: resolved.meta,
  });
});

app.get('/api/v1/geo/:geoKey/zscore', async (c) => {
  const db = c.env.DB;
  const geoKey = c.req.param('geoKey');
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const windowYears = parseOptionalYear(c.req.query('window_years')) ?? 10;
  const metricsParam = c.req.query('metrics');
  const metricKeys = metricsParam
    ? metricsParam.split(',').map((item) => item.trim()).filter(Boolean)
    : [...ZSCORE_DEFAULT_METRICS];
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
  const metrics = await computeMetricZscoresForCounty(
    db,
    geoKey,
    resolved.asOf,
    assumptions,
    metricKeys,
    windowYears,
  );
  return c.json({
    geo_key: geoKey,
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
    window_years: windowYears,
    metrics,
  });
});

app.get('/api/v1/geo/:geoKey/timeseries', async (c) => {
  const db = c.env.DB;
  const geoKey = c.req.param('geoKey');
  const metricsParam = c.req.query('metrics') ?? 'cash_rent,benchmark_value,implied_cap_rate,fair_value';
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
  const resolvedYear = Number.parseInt(resolved.asOf, 10);
  const defaultEndYear = Number.isNaN(resolvedYear) ? new Date().getUTCFullYear() : resolvedYear;
  const startYearRaw = parseOptionalYear(c.req.query('start_year'));
  const endYearRaw = parseOptionalYear(c.req.query('end_year'));
  const endYear = endYearRaw ?? defaultEndYear;
  const startYear = startYearRaw ?? Math.max(1950, endYear - 10);
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const metricKeys = metricsParam.split(',').map((m) => m.trim());

  const boundedStart = Math.min(startYear, endYear);
  const boundedEnd = Math.max(startYear, endYear);
  const rows: Record<string, any>[] = [];
  for (let y = boundedStart; y <= boundedEnd; y++) {
    const data = await computeCounty(db, geoKey, String(y), assumptions);
    const row: Record<string, any> = { year: String(y) };
    for (const mk of metricKeys) {
      row[mk] = data.metrics[mk] ?? null;
    }
    rows.push(row);
  }

  const bands: Record<string, any> = {};
  for (const mk of metricKeys) {
    const values = rows
      .map((row) => row[mk])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (!values.length) continue;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    const stddev = Math.sqrt(variance);
    bands[mk] = {
      mean: Math.round(mean * 10000) / 10000,
      stddev: Math.round(stddev * 10000) / 10000,
      plus_1sigma: Math.round((mean + stddev) * 10000) / 10000,
      minus_1sigma: Math.round((mean - stddev) * 10000) / 10000,
      plus_2sigma: Math.round((mean + stddev * 2) * 10000) / 10000,
      minus_2sigma: Math.round((mean - stddev * 2) * 10000) / 10000,
    };
  }

  return c.json({
    geo_key: geoKey,
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
    start_year: String(boundedStart),
    end_year: String(boundedEnd),
    series: rows,
    bands,
  });
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
  for (const co of filterAnalyticCountyRows(counties.results ?? [])) {
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
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
  const fipsList = fipsParam
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 6);

  const results = [];
  for (const f of fipsList) {
    results.push(await computeCounty(db, f, resolved.asOf, assumptions));
  }
  return c.json({ as_of: resolved.asOf, as_of_meta: resolved.meta, counties: results });
});

// ═════════════════════════════════════════════════════════════════════
// Screener
// ═════════════════════════════════════════════════════════════════════

app.get('/api/v1/screener', async (c) => {
  const db = c.env.DB;
  const cacheKey = `screener:${c.req.url}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) return c.json(cached);

  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const screenId = c.req.query('screen_id');
  const assumptionSetId = c.req.query('assumption_set_id');
  const minCap = c.req.query('min_cap');
  const maxRentMult = c.req.query('max_rent_mult');
  const minAccess = c.req.query('min_access');
  const state = c.req.query('state');
  const sortBy = c.req.query('sort_by') ?? 'implied_cap_rate';
  const sortDir = c.req.query('sort_dir') ?? 'desc';
  const windowYears = parseOptionalYear(c.req.query('window_years')) ?? 10;

  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const resolved = await resolveRequestAsOf(db, requestedAsOf, state ?? null, [...CORE_MODEL_SERIES]);
  const zMetrics = ['implied_cap_rate', 'fair_value', 'cash_rent'];
  const resolvedYear = Number.parseInt(resolved.asOf, 10);
  if (Number.isNaN(resolvedYear)) {
    return c.json({
      count: 0,
      as_of: resolved.asOf,
      as_of_meta: resolved.meta,
      filters: [],
      z_filters: {},
      results: [],
    });
  }

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

  const zFilters: Record<string, { min?: number; max?: number }> = {};
  for (const metric of zMetrics) {
    const minRaw = c.req.query(`z_${metric}_min`);
    const maxRaw = c.req.query(`z_${metric}_max`);
    const zMin = minRaw != null && minRaw !== '' ? Number(minRaw) : undefined;
    const zMax = maxRaw != null && maxRaw !== '' ? Number(maxRaw) : undefined;
    if ((zMin != null && !Number.isNaN(zMin)) || (zMax != null && !Number.isNaN(zMax))) {
      zFilters[metric] = {
        ...(zMin != null && !Number.isNaN(zMin) ? { min: zMin } : {}),
        ...(zMax != null && !Number.isNaN(zMax) ? { max: zMax } : {}),
      };
    }
  }

  const windowStartYear = Math.max(1950, resolvedYear - Math.max(1, windowYears) + 1);
  const window = await loadCountySeriesWindow(db, windowStartYear, resolvedYear, state?.toUpperCase());
  const results: any[] = [];

  for (const county of window.counties) {
    const yearSeries = window.seriesByCountyYear.get(county.fips);
    if (!yearSeries) continue;

    const metricHistory: Record<string, number[]> = Object.fromEntries(
      zMetrics.map((metric) => [metric, []]),
    );
    let data: ReturnType<typeof computeCountyFromSeries> | null = null;

    for (const year of window.years) {
      const series = yearSeries.get(year);
      if (!series) continue;
      const computed = computeCountyFromSeries(
        county,
        year,
        series,
        assumptions,
        year === resolved.asOf ? (window.accessByCounty.get(county.fips) ?? null) : null,
      );
      for (const metric of zMetrics) {
        const value = computed.metrics[metric];
        if (typeof value === 'number' && Number.isFinite(value)) {
          metricHistory[metric].push(value);
        }
      }
      if (year === resolved.asOf) {
        data = computed;
      }
    }

    if (!data) continue;
    const m = data.metrics;
    if (!hasModeledCoreMetrics(m)) continue;
    const zscores = Object.fromEntries(
      zMetrics.map((metric) => {
        const currentValue = (m[metric] ?? null) as number | null;
        const stats = computeZScoreStats(currentValue, metricHistory[metric] ?? [], window.years);
        return [
          metric,
          {
            ...stats,
            band: zscoreBand(stats.zscore),
          },
        ];
      }),
    ) as MetricZScoreMap;

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
      for (const [metric, bounds] of Object.entries(zFilters)) {
        const zValue = zscores[metric]?.zscore;
        if (zValue == null) {
          passes = false;
          break;
        }
        if (bounds.min != null && zValue < bounds.min) {
          passes = false;
          break;
        }
        if (bounds.max != null && zValue > bounds.max) {
          passes = false;
          break;
        }
      }
    }

    if (passes) {
      results.push({
        fips: county.fips,
        county: county.name,
        state: county.state,
        zscores,
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

  const payload = {
    count: results.length,
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
    filters,
    z_filters: zFilters,
    results,
  };
  cacheSet(cacheKey, payload, 30_000);
  return c.json(payload);
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
    scenario_sets?: { name?: string; overrides?: Record<string, any> }[];
  }>();

  const normalizedVaryParams: Array<{ param: string; values: number[]; target_metric?: string }> = [];
  if (Array.isArray(body.vary_params)) {
    if (body.vary_params.length > MAX_SENSITIVITY_PARAMS) {
      return c.json(
        { error: `Too many sensitivity parameters. Maximum is ${MAX_SENSITIVITY_PARAMS}.` },
        400,
      );
    }

    let totalPoints = 0;
    for (const varyParam of body.vary_params) {
      const param = typeof varyParam?.param === 'string' ? varyParam.param.trim() : '';
      if (!param) {
        return c.json({ error: 'Each sensitivity parameter must include a non-empty "param".' }, 400);
      }

      const values = Array.isArray(varyParam?.values)
        ? varyParam.values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];
      if (!values.length) {
        return c.json({ error: `Sensitivity parameter "${param}" must include at least one numeric value.` }, 400);
      }
      if (values.length > MAX_SENSITIVITY_VALUES_PER_PARAM) {
        return c.json(
          {
            error: `Sensitivity parameter "${param}" exceeds max values (${MAX_SENSITIVITY_VALUES_PER_PARAM}).`,
          },
          400,
        );
      }

      totalPoints += values.length;
      if (totalPoints > MAX_SENSITIVITY_TOTAL_POINTS) {
        return c.json(
          { error: `Sensitivity request too large. Maximum total points is ${MAX_SENSITIVITY_TOTAL_POINTS}.` },
          400,
        );
      }

      const targetMetric = typeof varyParam?.target_metric === 'string' && varyParam.target_metric.trim()
        ? varyParam.target_metric.trim()
        : undefined;

      normalizedVaryParams.push({ param, values, ...(targetMetric ? { target_metric: targetMetric } : {}) });
    }
  }

  const resolved = await resolveRequestAsOf(db, body.as_of ?? 'latest', null, [...CORE_MODEL_SERIES]);
  let assumptions = (await getAssumptions(db, body.assumption_set_id)) ?? {};
  if (body.overrides) assumptions = { ...assumptions, ...body.overrides };

  const base = await computeCounty(db, body.geo_key, resolved.asOf, assumptions);
  const sensitivities: Record<string, any> = {};

  if (normalizedVaryParams.length) {
    const series = await loadSeriesForCounty(db, body.geo_key, resolved.asOf);
    for (const vp of normalizedVaryParams) {
      const ctx = createContext(body.geo_key, resolved.asOf, series, assumptions);
      const results = computeSensitivity(ctx, vp.param, vp.values, vp.target_metric ?? 'fair_value');
      sensitivities[vp.param] = results;
    }
  }

  let comparisonTable: any[] = [];
  let assumptionDeltas: Record<string, Record<string, number>> = {};
  let driverDecomposition: any[] = [];
  let scenarioResults: any[] = [];

  if (Array.isArray(body.scenario_sets) && body.scenario_sets.length > 0) {
    for (const [index, scenarioSet] of body.scenario_sets.entries()) {
      const name = (scenarioSet.name ?? `scenario_${index + 1}`).trim() || `scenario_${index + 1}`;
      const setOverrides = scenarioSet.overrides ?? {};
      const scenarioAssumptions = { ...assumptions, ...setOverrides };
      const scenario = await computeCounty(db, body.geo_key, resolved.asOf, scenarioAssumptions);
      scenarioResults.push({
        name,
        assumptions: scenarioAssumptions,
        result: scenario,
      });

      const fairValue = scenario.metrics.fair_value ?? null;
      const baseFairValue = base.metrics.fair_value ?? null;
      const deltaVsBase = (fairValue != null && baseFairValue != null) ? fairValue - baseFairValue : null;

      comparisonTable.push({
        scenario: name,
        fair_value: fairValue,
        implied_cap_rate: scenario.metrics.implied_cap_rate ?? null,
        noi_per_acre: scenario.metrics.noi_per_acre ?? null,
        delta_fair_value_vs_base: deltaVsBase,
      });

      const deltas: Record<string, number> = {};
      for (const [key, value] of Object.entries(setOverrides)) {
        const numericOverride = Number(value);
        const numericBase = Number(assumptions[key]);
        if (!Number.isNaN(numericOverride) && !Number.isNaN(numericBase)) {
          deltas[key] = numericOverride - numericBase;
        }
      }
      assumptionDeltas[name] = deltas;

      const driverRows: { driver: string; delta: number }[] = [];
      for (const [driver, overrideValue] of Object.entries(setOverrides)) {
        const oneAtATimeAssumptions = { ...assumptions, [driver]: overrideValue };
        const oneAtATime = await computeCounty(db, body.geo_key, resolved.asOf, oneAtATimeAssumptions);
        const oneDelta =
          (oneAtATime.metrics.fair_value != null && base.metrics.fair_value != null)
            ? oneAtATime.metrics.fair_value - base.metrics.fair_value
            : 0;
        driverRows.push({ driver, delta: Math.round(oneDelta * 10000) / 10000 });
      }
      const netDelta =
        (fairValue != null && baseFairValue != null)
          ? fairValue - baseFairValue
          : 0;
      const explainedDelta = driverRows.reduce((sum, row) => sum + row.delta, 0);
      const residual = Math.round((netDelta - explainedDelta) * 10000) / 10000;

      driverDecomposition.push({
        scenario: name,
        drivers: driverRows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
        residual,
      });
    }
  }

  return c.json({
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
    base,
    sensitivities,
    scenarios: scenarioResults,
    comparison_table: comparisonTable,
    assumption_deltas: assumptionDeltas,
    driver_decomposition: driverDecomposition,
  });
});

app.get('/api/v1/geo/:geoKey/sensitivity', async (c) => {
  const db = c.env.DB;
  const geoKey = c.req.param('geoKey');
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const series = await loadSeriesForCounty(db, geoKey, resolved.asOf);

  // Rate/growth matrix
  const matrix: Record<string, any>[] = [];
  for (const rv of [2.0, 3.0, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0]) {
    const row: Record<string, any> = { risk_premium: rv };
    for (const gv of [0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04]) {
      const ctx = createContext(geoKey, resolved.asOf, { ...series }, { ...assumptions, risk_premium: rv, long_run_growth: gv });
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
    const ctx = createContext(geoKey, resolved.asOf, { ...series }, { ...assumptions, near_term_rent_shock: rs });
    computeAll(ctx);
    rentSens.push({
      rent_shock: rs,
      fair_value: ctx.metrics.fair_value != null ? Math.round(ctx.metrics.fair_value) : null,
      noi: ctx.metrics.noi_per_acre != null ? Math.round(ctx.metrics.noi_per_acre * 100) / 100 : null,
    });
  }

  return c.json({
    geo_key: geoKey,
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
    rate_growth_matrix: matrix,
    rent_shock_sensitivity: rentSens,
  });
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
  const resolved = await resolveRequestAsOf(db, 'latest', null, [...CORE_MODEL_SERIES]);
  const maxModelYear = Number.parseInt(resolved.asOf, 10) || new Date().getUTCFullYear();
  const endYear = Math.min(parseInt(startYear) + evalYears, maxModelYear);
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
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
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
  const cacheKey = `dashboard:${c.req.url}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) return c.json(cached);

  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
  const resolvedYear = Number.parseInt(resolved.asOf, 10);
  const chartEndYear = Number.isNaN(resolvedYear) ? new Date().getUTCFullYear() : resolvedYear;
  const chartStartYear = Math.max(2000, chartEndYear - 9);
  const window = await loadCountySeriesWindow(db, chartStartYear, chartEndYear);
  const yearlyMetrics = new Map<string, { caps: number[]; fair: number[]; rent: number[] }>();
  for (const year of window.years) {
    yearlyMetrics.set(year, { caps: [], fair: [], rent: [] });
  }

  const allData: Array<ReturnType<typeof computeCountyFromSeries>> = [];
  for (const county of window.counties) {
    const yearSeries = window.seriesByCountyYear.get(county.fips);
    if (!yearSeries) continue;
    for (const year of window.years) {
      const series = yearSeries.get(year);
      if (!series) continue;
      const computed = computeCountyFromSeries(
        county,
        year,
        series,
        assumptions,
        year === resolved.asOf ? (window.accessByCounty.get(county.fips) ?? null) : null,
      );
      const bucket = yearlyMetrics.get(year);
      if (bucket) {
        const cap = computed.metrics.implied_cap_rate;
        const fair = computed.metrics.fair_value;
        const rent = computed.metrics.cash_rent;
        if (typeof cap === 'number' && Number.isFinite(cap)) bucket.caps.push(cap);
        if (typeof fair === 'number' && Number.isFinite(fair)) bucket.fair.push(fair);
        if (typeof rent === 'number' && Number.isFinite(rent)) bucket.rent.push(rent);
      }
      if (year === resolved.asOf) {
        if (hasModeledCoreMetrics(computed.metrics)) {
          allData.push(computed);
        }
      }
    }
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
        implied_cap: roundNullable(d.metrics.implied_cap_rate),
        access_score: roundNullable(d.metrics.access_score, 1),
        noi: roundNullable(d.metrics.noi_per_acre, 0),
      });
    }
  }
  const positiveSpread = movers
    .filter((row) => row.spread_pct > 0)
    .sort((a, b) => b.spread_pct - a.spread_pct);
  const closestToFair = movers
    .filter((row) => row.spread_pct <= 0)
    .sort((a, b) => b.spread_pct - a.spread_pct);
  const overvalued = movers
    .filter((row) => row.spread_pct < 0)
    .sort((a, b) => a.spread_pct - b.spread_pct);
  const rankedMovers = [
    ...positiveSpread.slice(0, 15),
    ...closestToFair.slice(0, Math.max(0, 15 - positiveSpread.length)),
  ].slice(0, 15);

  // State summary
  const stateData: Record<string, any[]> = {};
  for (const d of allData) {
    const st = String(d.state ?? '');
    if (!st) continue;
    if (!stateData[st]) stateData[st] = [];
    stateData[st].push(d.metrics);
  }
  const stateSummary: Record<string, any> = {};
  for (const [st, items] of Object.entries(stateData)) {
    const cList = items.map((i) => i.implied_cap_rate).filter((value: unknown): value is number => typeof value === 'number');
    const vList = items.map((i) => i.benchmark_value).filter((value: unknown): value is number => typeof value === 'number');
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

  const chartRows: Array<{
    year: string;
    cap_rate_median: number | null;
    fair_value_median: number | null;
    cash_rent_median: number | null;
    treasury_10y: number | null;
  }> = [];

  for (const year of window.years) {
    const yearSeries = yearlyMetrics.get(year) ?? { caps: [], fair: [], rent: [] };
    const firstCounty = window.counties.find((county) => window.seriesByCountyYear.get(county.fips)?.get(year));
    const yearTreasury = firstCounty
      ? (() => {
          const series = window.seriesByCountyYear.get(firstCounty.fips)?.get(year);
          if (!series) return null;
          const computed = computeCountyFromSeries(firstCounty, year, series, assumptions, null);
          return (computed.metrics.required_return ?? null) != null
            ? ((computed.metrics.required_return ?? 0) - (assumptions.risk_premium ?? 2.0))
            : null;
        })()
      : null;
    chartRows.push({
      year,
      cap_rate_median: (stats(yearSeries.caps).median as number | undefined) ?? null,
      fair_value_median: (stats(yearSeries.fair).median as number | undefined) ?? null,
      cash_rent_median: (stats(yearSeries.rent).median as number | undefined) ?? null,
      treasury_10y: yearTreasury != null ? Math.round(yearTreasury * 10000) / 10000 : null,
    });
  }

  const chartYears = chartRows.map((row) => row.year);
  const capSeries = chartRows.map((row) => row.cap_rate_median).filter((value): value is number => value != null);
  const fairSeries = chartRows.map((row) => row.fair_value_median).filter((value): value is number => value != null);
  const rentSeries = chartRows.map((row) => row.cash_rent_median).filter((value): value is number => value != null);
  const capSummaryStats = computeZScoreStats((stats(caps).median as number | null) ?? null, capSeries, chartYears);
  const fairSummaryStats = computeZScoreStats((stats(fvs).median as number | null) ?? null, fairSeries, chartYears);
  const rentSummaryStats = computeZScoreStats((stats(rents).median as number | null) ?? null, rentSeries, chartYears);
  const capRateDistribution = [
    { label: '<1.5%', min: 0, max: 1.5 },
    { label: '1.5-2%', min: 1.5, max: 2 },
    { label: '2-2.5%', min: 2, max: 2.5 },
    { label: '2.5-3%', min: 2.5, max: 3 },
    { label: '3-4%', min: 3, max: 4 },
    { label: '>4%', min: 4, max: Number.POSITIVE_INFINITY },
  ].map((bucket) => ({
    label: bucket.label,
    value: caps.filter((cap) => cap >= bucket.min && cap < bucket.max).length,
  }));

  const payload = {
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
    county_count: window.counties.length,
    summary: {
      implied_cap_rate: stats(caps),
      fair_value: stats(fvs),
      cash_rent: stats(rents),
      benchmark_value: stats(vals),
      access_score: stats(accessScores),
    },
    summary_zscores: {
      implied_cap_rate: {
        ...capSummaryStats,
        band: zscoreBand(capSummaryStats.zscore),
      },
      fair_value: {
        ...fairSummaryStats,
        band: zscoreBand(fairSummaryStats.zscore),
      },
      cash_rent: {
        ...rentSummaryStats,
        band: zscoreBand(rentSummaryStats.zscore),
      },
    },
    charts: {
      cap_rate_median_by_year: chartRows.map((row) => ({ year: row.year, value: row.cap_rate_median })),
      fair_value_median_by_year: chartRows.map((row) => ({ year: row.year, value: row.fair_value_median })),
      cash_rent_median_by_year: chartRows.map((row) => ({ year: row.year, value: row.cash_rent_median })),
      treasury_10y_by_year: chartRows.map((row) => ({ year: row.year, value: row.treasury_10y })),
    },
    cap_rate_distribution: capRateDistribution,
    treasury_10y: treasury10y,
    top_movers: rankedMovers,
    top_overvalued: overvalued.slice(0, 15),
    state_summary: stateSummary,
  };
  cacheSet(cacheKey, payload, 60_000);
  return c.json(payload);
});

app.get('/api/v1/ag-index', async (c) => {
  const db = c.env.DB;
  const cacheKey = `ag-index:${c.req.url}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) return c.json(cached);

  await ensureAgCompositeIndexSchema(db);
  const rows = await db
    .prepare(
      `SELECT as_of_date, value, component_json, zscore
       FROM ag_composite_index
       ORDER BY as_of_date DESC
       LIMIT 900`,
    )
    .all<{
      as_of_date: string;
      value: number;
      component_json: string;
      zscore: number | null;
    }>();

  if (!rows.results.length) {
    const emptyPayload = {
      latest: null,
      history: [],
      message: 'Ag composite index has not been ingested yet.',
    };
    cacheSet(cacheKey, emptyPayload, 120_000);
    return c.json(emptyPayload);
  }

  const desc = rows.results;
  const asc = [...desc].reverse();
  const history = asc.map((row) => ({
    as_of_date: row.as_of_date,
    value: Math.round(row.value * 10000) / 10000,
    zscore: row.zscore == null ? null : Math.round(row.zscore * 10000) / 10000,
    band: zscoreBand(row.zscore),
  }));

  const latest = desc[0];
  const prev1d = desc[1];
  const prev1w = desc[5];
  const change1dPct = prev1d && prev1d.value
    ? Math.round((((latest.value - prev1d.value) / prev1d.value) * 100) * 100) / 100
    : null;
  const change1wPct = prev1w && prev1w.value
    ? Math.round((((latest.value - prev1w.value) / prev1w.value) * 100) * 100) / 100
    : null;

  let components: Record<string, number> = {};
  try {
    components = JSON.parse(latest.component_json || '{}');
  } catch {
    components = {};
  }
  const componentValues = Object.entries(components)
    .map(([ticker, value]) => ({ ticker, value: Number(value) }))
    .filter((entry) => Number.isFinite(entry.value));
  const componentSum = componentValues.reduce((sum, entry) => sum + entry.value, 0);
  const componentContrib = componentValues.map((entry) => ({
    ticker: entry.ticker,
    value: Math.round(entry.value * 10000) / 10000,
    weight: componentValues.length ? Math.round((1 / componentValues.length) * 10000) / 10000 : 0,
    contribution_pct: componentSum
      ? Math.round(((entry.value / componentSum) * 100) * 100) / 100
      : 0,
  }));

  const payload = {
    latest: {
      as_of_date: latest.as_of_date,
      value: Math.round(latest.value * 10000) / 10000,
      zscore: latest.zscore == null ? null : Math.round(latest.zscore * 10000) / 10000,
      band: zscoreBand(latest.zscore),
      change_1d_pct: change1dPct,
      change_1w_pct: change1wPct,
      components: componentContrib,
    },
    history: history.slice(-756),
  };
  cacheSet(cacheKey, payload, 120_000);
  return c.json(payload);
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
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const assumptions = (await getAssumptions(db)) ?? {};
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
  const asOfYear = Number.parseInt(resolved.asOf, 10);
  const prevYear = Number.isNaN(asOfYear) ? null : String(asOfYear - 1);

  const items = await db.prepare('SELECT id, geo_key, notes, added_at FROM watchlist_items').all<{
    id: number;
    geo_key: string;
    notes: string | null;
    added_at: string;
  }>();

  const result: any[] = [];
  for (const item of items.results) {
    const data = await computeCounty(db, item.geo_key, resolved.asOf, assumptions);
    const prev = prevYear ? await computeCounty(db, item.geo_key, prevYear, assumptions) : data;
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
  return c.json({
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
    items: result,
  });
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
      `SELECT id, owner_key, geo_key, thesis, analysis_json, tags_json, status, conviction, created_at, updated_at
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
    analysis?: unknown;
    tags?: unknown;
    status?: string;
    conviction?: number;
  }>();

  const workspace = await ensureResearchWorkspace(db, auth.userKey, geoKey);
  const thesis = (body.thesis ?? '').trim();
  const analysis = normalizeAnalysisInput(body.analysis, parseAnalysis(workspace.analysis_json));
  const tags = normalizeTags(body.tags);
  const status = (body.status ?? 'exploring').trim() || 'exploring';
  const conviction = clampConviction(body.conviction);

  await db
    .prepare(
      `UPDATE research_workspaces
       SET thesis = ?, analysis_json = ?, tags_json = ?, status = ?, conviction = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(thesis, JSON.stringify(analysis), JSON.stringify(tags), status, conviction, workspace.id)
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

app.get('/api/v1/research/workspaces/:geoKey/scenario-runs', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const geoKey = c.req.param('geoKey');
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.min(100, Math.max(1, Number(limitRaw))) : 25;

  const workspace = await findResearchWorkspaceForUser(db, auth.userKey, geoKey);
  if (!workspace) return c.json([]);

  const rows = await db
    .prepare(
      `SELECT id, scenario_name, as_of_date, assumptions_json, comparison_json, created_at
       FROM research_scenario_runs
       WHERE workspace_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(workspace.id, limit)
    .all<{
      id: number;
      scenario_name: string | null;
      as_of_date: string;
      assumptions_json: string;
      comparison_json: string;
      created_at: string | null;
    }>();

  return c.json(
    rows.results.map((row) => ({
      id: row.id,
      scenario_name: row.scenario_name ?? '',
      as_of_date: row.as_of_date,
      assumptions: JSON.parse(row.assumptions_json || '{}'),
      comparison: JSON.parse(row.comparison_json || '{}'),
      created_at: row.created_at,
    })),
  );
});

app.post('/api/v1/research/workspaces/:geoKey/scenario-runs', async (c) => {
  const db = c.env.DB;
  const auth = await requireAuthOrError(c, db, 'Missing research user identity');
  if (auth instanceof Response) return auth;
  const geoKey = c.req.param('geoKey');
  const body = await c.req.json<{
    scenario_name?: string;
    as_of_date?: string;
    assumptions?: Record<string, unknown>;
    comparison?: Record<string, unknown>;
  }>();

  const workspace = await ensureResearchWorkspace(db, auth.userKey, geoKey);
  const assumptions = body.assumptions ?? {};
  const comparison = body.comparison ?? {};
  const asOfDate = (body.as_of_date ?? '').trim();
  if (!asOfDate || !/^\\d{4}(-\\d{2}-\\d{2})?$/.test(asOfDate)) {
    return c.json({ error: 'as_of_date is required (YYYY or YYYY-MM-DD)' }, 400);
  }

  const inserted = await db
    .prepare(
      `INSERT INTO research_scenario_runs (
         workspace_id, scenario_name, as_of_date, assumptions_json, comparison_json, created_at
       ) VALUES (?, ?, ?, ?, ?, datetime('now'))
       RETURNING id, scenario_name, as_of_date, assumptions_json, comparison_json, created_at`,
    )
    .bind(
      workspace.id,
      (body.scenario_name ?? '').trim() || null,
      asOfDate,
      JSON.stringify(assumptions),
      JSON.stringify(comparison),
    )
    .first<{
      id: number;
      scenario_name: string | null;
      as_of_date: string;
      assumptions_json: string;
      comparison_json: string;
      created_at: string | null;
    }>();

  await db
    .prepare("UPDATE research_workspaces SET updated_at = datetime('now') WHERE id = ?")
    .bind(workspace.id)
    .run();

  if (!inserted) return c.json({ error: 'Failed to save scenario run' }, 500);
  return c.json({
    id: inserted.id,
    scenario_name: inserted.scenario_name ?? '',
    as_of_date: inserted.as_of_date,
    assumptions: JSON.parse(inserted.assumptions_json || '{}'),
    comparison: JSON.parse(inserted.comparison_json || '{}'),
    created_at: inserted.created_at,
  });
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
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
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
    countyData[h.geo_key] = await computeCounty(db, h.geo_key, resolved.asOf, assumptions);
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
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
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
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const resolved = await resolveRequestAsOf(db, requestedAsOf, null, [...CORE_MODEL_SERIES]);
  const assumptionSetId = c.req.query('assumption_set_id');
  const assumptions = (await getAssumptions(db, assumptionSetId ? Number(assumptionSetId) : undefined)) ?? {};

  const countiesResult = await getAllCounties(db);

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
  for (const co of countiesResult.results as any[]) {
    const data = await computeCounty(db, co.fips, resolved.asOf, assumptions);
    const m = data.metrics;
    csv +=
      [
        co.fips,
        `"${co.name}"`,
        co.state,
        roundNullable(m.cash_rent) ?? '',
        roundNullable(m.benchmark_value, 0) ?? '',
        roundNullable(m.noi_per_acre) ?? '',
        roundNullable(m.implied_cap_rate) ?? '',
        roundNullable(m.rent_multiple, 1) ?? '',
        roundNullable(m.fair_value, 0) ?? '',
        roundNullable(m.cap_spread_to_10y, 0) ?? '',
        roundNullable(m.access_score, 1) ?? '',
        roundNullable(m.dscr) ?? '',
        roundNullable(m.payback_period, 1) ?? '',
      ].join(',') + '\n';
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=farmland_screener_${resolved.asOf}.csv`,
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

type BulkIngestRowPayload = {
  series_key?: string;
  geo_level?: string;
  geo_key?: string;
  as_of_date?: string;
  value?: number | string;
};

type IngestProgressUpsertPayload = {
  source?: string;
  year?: number | string;
  state?: string;
  status?: IngestProgressStatus | string;
  rows_total?: number | string;
  rows?: number | string;
  inserted?: number | string;
  skipped?: number | string;
  increment_attempt?: boolean | string | number;
  last_error?: string | null;
  meta?: unknown;
};

app.get('/api/v1/ingest/progress', async (c) => {
  const db = c.env.DB;
  const ingestAuth = await requireIngestAuthState(c, db);
  if (ingestAuth instanceof Response) return ingestAuth;
  await ensureIngestProgressSchema(db);

  const source = (c.req.query('source') ?? 'USDA-NASS-BULK').trim() || 'USDA-NASS-BULK';
  const startYear = parseOptionalInteger(c.req.query('start_year'));
  const endYear = parseOptionalInteger(c.req.query('end_year'));
  const limitValue = parseOptionalInteger(c.req.query('limit'));
  const limit = Math.min(Math.max(limitValue ?? 500, 1), 5000);
  if (startYear != null && endYear != null && startYear > endYear) {
    return c.json({ error: 'start_year must be less than or equal to end_year.' }, 400);
  }

  const { states, invalidStates } = parseStatesCsv(c.req.query('states'));
  if (invalidStates.length) {
    return c.json({ error: `Invalid states: ${invalidStates.join(', ')}` }, 400);
  }

  const statusesParam = c.req.query('statuses') ?? c.req.query('status') ?? '';
  const requestedStatuses = statusesParam
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const invalidStatuses = requestedStatuses.filter((status) => !isIngestProgressStatus(status));
  if (invalidStatuses.length) {
    return c.json(
      { error: `Invalid statuses: ${invalidStatuses.join(', ')}. Allowed: ${INGEST_PROGRESS_STATUSES.join(', ')}` },
      400,
    );
  }

  const whereClauses = ['source = ?'];
  const bindings: Array<string | number> = [source];
  if (startYear != null) {
    whereClauses.push('year >= ?');
    bindings.push(startYear);
  }
  if (endYear != null) {
    whereClauses.push('year <= ?');
    bindings.push(endYear);
  }
  if (states.length) {
    whereClauses.push(`state IN (${states.map(() => '?').join(',')})`);
    bindings.push(...states);
  }
  if (requestedStatuses.length) {
    whereClauses.push(`status IN (${requestedStatuses.map(() => '?').join(',')})`);
    bindings.push(...requestedStatuses);
  }
  bindings.push(limit);

  const sql = `
    SELECT source, year, state, status, rows_total, inserted, skipped, attempts, last_error, meta_json, created_at, updated_at
    FROM ingest_progress
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY year ASC, state ASC, updated_at DESC
    LIMIT ?
  `;
  const rowsResult = await db
    .prepare(sql)
    .bind(...bindings)
    .all<IngestProgressRow>();
  const rows = rowsResult.results ?? [];

  const byStatus: Record<IngestProgressStatus, number> = {
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  };
  let totalRows = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  for (const row of rows) {
    byStatus[row.status] += 1;
    totalRows += row.rows_total;
    totalInserted += row.inserted;
    totalSkipped += row.skipped;
  }

  return c.json({
    source,
    filters: {
      start_year: startYear ?? null,
      end_year: endYear ?? null,
      states: states.length ? states : null,
      statuses: requestedStatuses.length ? requestedStatuses : null,
      limit,
    },
    summary: {
      units: rows.length,
      by_status: byStatus,
      rows_total: totalRows,
      inserted: totalInserted,
      skipped: totalSkipped,
    },
    rows: rows.map((row) => ({
      ...row,
      meta: row.meta_json ? (() => {
        try {
          return JSON.parse(row.meta_json) as unknown;
        } catch {
          return row.meta_json;
        }
      })() : null,
    })),
  });
});

app.post('/api/v1/ingest/progress', async (c) => {
  const db = c.env.DB;
  const ingestAuth = await requireIngestAuthState(c, db);
  if (ingestAuth instanceof Response) return ingestAuth;
  await ensureIngestProgressSchema(db);

  let payload: IngestProgressUpsertPayload;
  try {
    payload = await c.req.json<IngestProgressUpsertPayload>();
  } catch {
    return c.json({ error: 'Invalid JSON payload.' }, 400);
  }

  const source = String(payload.source ?? 'USDA-NASS-BULK').trim() || 'USDA-NASS-BULK';
  const year = typeof payload.year === 'number' ? payload.year : Number.parseInt(String(payload.year ?? ''), 10);
  const state = String(payload.state ?? '').trim().toUpperCase();
  const rawStatus = String(payload.status ?? '').trim().toLowerCase();
  if (source.length > 128) {
    return c.json({ error: 'source must be 128 chars or fewer.' }, 400);
  }
  if (!Number.isFinite(year) || year < 1900 || year > 2200) {
    return c.json({ error: 'year must be a valid 4-digit value.' }, 400);
  }
  if (!/^[A-Z]{2}$/.test(state)) {
    return c.json({ error: 'state must be a 2-letter code.' }, 400);
  }
  if (!isIngestProgressStatus(rawStatus)) {
    return c.json({ error: `status must be one of: ${INGEST_PROGRESS_STATUSES.join(', ')}` }, 400);
  }

  const rowsCandidate = payload.rows_total ?? payload.rows ?? 0;
  const rowsTotal = Number.parseInt(String(rowsCandidate), 10);
  const inserted = Number.parseInt(String(payload.inserted ?? 0), 10);
  const skipped = Number.parseInt(String(payload.skipped ?? 0), 10);
  if (!Number.isFinite(rowsTotal) || rowsTotal < 0) {
    return c.json({ error: 'rows_total must be a non-negative integer.' }, 400);
  }
  if (!Number.isFinite(inserted) || inserted < 0) {
    return c.json({ error: 'inserted must be a non-negative integer.' }, 400);
  }
  if (!Number.isFinite(skipped) || skipped < 0) {
    return c.json({ error: 'skipped must be a non-negative integer.' }, 400);
  }

  const incrementAttemptRaw = payload.increment_attempt;
  let incrementAttempt = false;
  if (typeof incrementAttemptRaw === 'boolean') {
    incrementAttempt = incrementAttemptRaw;
  } else if (typeof incrementAttemptRaw === 'number') {
    incrementAttempt = incrementAttemptRaw > 0;
  } else if (typeof incrementAttemptRaw === 'string') {
    const parsed = parseOptionalBoolean(incrementAttemptRaw);
    if (parsed == null) {
      return c.json({ error: 'increment_attempt must be true/false.' }, 400);
    }
    incrementAttempt = parsed;
  }

  const lastError = payload.last_error == null ? null : String(payload.last_error).slice(0, 2000);
  let metaJson: string | null = null;
  if (payload.meta != null) {
    try {
      metaJson = JSON.stringify(payload.meta);
    } catch {
      return c.json({ error: 'meta must be valid JSON-serializable content.' }, 400);
    }
    if (metaJson.length > 20000) {
      return c.json({ error: 'meta payload is too large (max 20000 chars after serialization).' }, 400);
    }
  }

  const attemptDelta = incrementAttempt ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO ingest_progress (
         source, year, state, status, rows_total, inserted, skipped, attempts, last_error, meta_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(source, year, state) DO UPDATE SET
         status = excluded.status,
         rows_total = excluded.rows_total,
         inserted = excluded.inserted,
         skipped = excluded.skipped,
         attempts = ingest_progress.attempts + ?,
         last_error = excluded.last_error,
         meta_json = excluded.meta_json,
         updated_at = datetime('now')`,
    )
    .bind(
      source,
      year,
      state,
      rawStatus,
      rowsTotal,
      inserted,
      skipped,
      attemptDelta,
      lastError,
      metaJson,
      attemptDelta,
    )
    .run();

  const saved = await db
    .prepare(
      `SELECT source, year, state, status, rows_total, inserted, skipped, attempts, last_error, meta_json, created_at, updated_at
       FROM ingest_progress
       WHERE source = ? AND year = ? AND state = ?`,
    )
    .bind(source, year, state)
    .first<IngestProgressRow>();

  return c.json({
    status: 'ok',
    auth_mode: ingestAuth.authMode,
    row: saved
      ? {
          ...saved,
          meta: saved.meta_json ? (() => {
            try {
              return JSON.parse(saved.meta_json) as unknown;
            } catch {
              return saved.meta_json;
            }
          })() : null,
        }
      : null,
  });
});

app.post('/api/v1/ingest/bulk', async (c) => {
  const db = c.env.DB;
  const ingestAuth = await requireIngestAuthState(c, db);
  if (ingestAuth instanceof Response) return ingestAuth;
  const authMode = ingestAuth.authMode;

  let payload: { source?: string; rows?: BulkIngestRowPayload[] };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body.' }, 400);
  }

  const rawRows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!rawRows.length) {
    return c.json({ error: 'rows is required and must contain at least one row.' }, 400);
  }
  if (rawRows.length > 1000) {
    return c.json({ error: 'rows exceeds max batch size (1000).' }, 400);
  }

  const allowedSeries = new Set<string>([...NASS_SERIES_KEYS, 'corn_price']);
  const allowedGeoLevels = new Set(['county', 'state', 'national']);
  const normalizedRows: Array<{
    seriesKey: string;
    geoLevel: 'county' | 'state' | 'national';
    geoKey: string;
    asOfDate: string;
    value: number;
  }> = [];

  for (let i = 0; i < rawRows.length; i += 1) {
    const row = rawRows[i] ?? {};
    const seriesKey = (row.series_key ?? '').trim().toLowerCase();
    const geoLevel = (row.geo_level ?? '').trim().toLowerCase();
    const geoKey = (row.geo_key ?? '').trim().toUpperCase();
    const asOfDate = (row.as_of_date ?? '').trim();
    const value = Number(row.value);

    if (!allowedSeries.has(seriesKey)) {
      return c.json({ error: `rows[${i}].series_key is invalid.` }, 400);
    }
    if (!allowedGeoLevels.has(geoLevel)) {
      return c.json({ error: `rows[${i}].geo_level is invalid.` }, 400);
    }
    if (!geoKey || geoKey.length > 16) {
      return c.json({ error: `rows[${i}].geo_key is invalid.` }, 400);
    }
    if (!/^\d{4}$/.test(asOfDate)) {
      return c.json({ error: `rows[${i}].as_of_date must be YYYY.` }, 400);
    }
    if (!Number.isFinite(value)) {
      return c.json({ error: `rows[${i}].value must be numeric.` }, 400);
    }

    normalizedRows.push({
      seriesKey,
      geoLevel: geoLevel as 'county' | 'state' | 'national',
      geoKey,
      asOfDate,
      value,
    });
  }

  const source = (payload?.source ?? 'USDA-NASS-BULK').trim() || 'USDA-NASS-BULK';
  const result = await ingestBulkDataPoints(
    { DB: db, FRED_API_KEY: c.env.FRED_API_KEY, NASS_API_KEY: c.env.NASS_API_KEY },
    normalizedRows,
    source,
  );

  return c.json({
    ...result,
    auth_mode: authMode,
    received_rows: normalizedRows.length,
  });
});

// ═════════════════════════════════════════════════════════════════════
// Manual Ingestion Trigger
// ═════════════════════════════════════════════════════════════════════

app.post('/api/v1/ingest', async (c) => {
  const db = c.env.DB;
  const ingestAuth = await requireIngestAuthState(c, db);
  if (ingestAuth instanceof Response) return ingestAuth;
  const authMode = ingestAuth.authMode;
  const rawStartYear = c.req.query('start_year');
  const rawEndYear = c.req.query('end_year');
  const rawStates = c.req.query('states');
  const rawNassSeries = c.req.query('nass_series');
  const rawIncludeNass = c.req.query('include_nass');
  const rawIncludeFred = c.req.query('include_fred');
  const rawIncludeAgIndex = c.req.query('include_ag_index');
  const startYear = parseOptionalYear(rawStartYear);
  const endYear = parseOptionalYear(rawEndYear);
  const includeNass = parseOptionalBoolean(rawIncludeNass);
  const includeFred = parseOptionalBoolean(rawIncludeFred);
  const includeAgIndex = parseOptionalBoolean(rawIncludeAgIndex);
  const currentYear = new Date().getFullYear();

  let selectedStates: string[] | undefined;
  let selectedNassSeries: string[] | undefined;
  if (rawStates) {
    selectedStates = Array.from(
      new Set(
        rawStates
          .split(',')
          .map((state) => state.trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    if (!selectedStates.length) {
      return c.json({ error: 'Invalid states. Provide a comma-separated list like states=IA,IL,IN.' }, 400);
    }
    const trackedSet = new Set<string>(TRACKED_STATES);
    const invalidStates = selectedStates.filter((state) => !trackedSet.has(state));
    if (invalidStates.length) {
      return c.json(
        {
          error: `Invalid states: ${invalidStates.join(', ')}. Allowed states: ${TRACKED_STATES.join(', ')}`,
        },
        400,
      );
    }
  }
  if (rawNassSeries) {
    selectedNassSeries = Array.from(
      new Set(
        rawNassSeries
          .split(',')
          .map((series) => series.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (!selectedNassSeries.length) {
      return c.json(
        { error: 'Invalid nass_series. Provide a comma-separated list like nass_series=cash_rent,corn_yield.' },
        400,
      );
    }
    const allowedNassSeries = new Set<string>(NASS_SERIES_KEYS);
    const invalidSeries = selectedNassSeries.filter((series) => !allowedNassSeries.has(series));
    if (invalidSeries.length) {
      return c.json(
        {
          error: `Invalid nass_series: ${invalidSeries.join(', ')}. Allowed series: ${NASS_SERIES_KEYS.join(', ')}`,
        },
        400,
      );
    }
  }

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
  if (rawIncludeNass && includeNass === undefined) {
    return c.json({ error: 'Invalid include_nass. Use true/false or 1/0.' }, 400);
  }
  if (rawIncludeFred && includeFred === undefined) {
    return c.json({ error: 'Invalid include_fred. Use true/false or 1/0.' }, 400);
  }
  if (rawIncludeAgIndex && includeAgIndex === undefined) {
    return c.json({ error: 'Invalid include_ag_index. Use true/false or 1/0.' }, 400);
  }
  if (includeNass === false && includeFred === false && includeAgIndex === false) {
    return c.json(
      { error: 'At least one ingest target must be enabled (include_nass/include_fred/include_ag_index).' },
      400,
    );
  }

  const result = await runIngestion(
    { DB: db, FRED_API_KEY: c.env.FRED_API_KEY, NASS_API_KEY: c.env.NASS_API_KEY },
    {
      startYear,
      endYear,
      states: selectedStates,
      nassSeriesKeys: selectedNassSeries,
      includeNass,
      includeFred,
      includeAgIndex,
    },
  );
  return c.json({
    ...result,
    auth_mode: authMode,
  });
});

// Freshness status
app.get('/api/v1/data-freshness', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare('SELECT * FROM data_freshness ORDER BY last_updated DESC')
    .all();
  return c.json(rows.results);
});

app.get('/api/v1/data/coverage', async (c) => {
  const db = c.env.DB;
  const state = c.req.query('state');
  const normalizedState = state && state.toUpperCase() !== 'ALL' ? state.toUpperCase() : null;
  const requestedAsOf = c.req.query('as_of') ?? 'latest';
  const requiredSeriesParam = c.req.query('required_series');
  const requiredSeries = requiredSeriesParam
    ? requiredSeriesParam.split(',').map((item) => item.trim()).filter(Boolean)
    : [...CORE_MODEL_SERIES];

  const resolved = await resolveRequestAsOf(db, requestedAsOf, normalizedState, requiredSeries);
  const counties = await getAllCounties(db, normalizedState ?? undefined);

  const placeholders = requiredSeries.map(() => '?').join(',');
  const rows = requiredSeries.length
    ? await db
        .prepare(
          `SELECT ds.series_key AS series_key, dp.geo_key AS geo_key
           FROM data_points dp
           JOIN data_series ds ON ds.id = dp.series_id
           WHERE dp.as_of_date = ?
             AND ds.series_key IN (${placeholders})`,
        )
        .bind(resolved.asOf, ...requiredSeries)
        .all<{ series_key: string; geo_key: string }>()
    : { results: [] as Array<{ series_key: string; geo_key: string }> };

  const seriesGeo = new Map<string, Set<string>>();
  for (const key of requiredSeries) {
    seriesGeo.set(key, new Set<string>());
  }
  for (const row of rows.results) {
    const set = seriesGeo.get(row.series_key);
    if (set) set.add(row.geo_key);
  }

  const stateCoverage: Record<
    string,
    { counties_total: number; counties_complete: number; coverage_pct: number }
  > = {};
  const seriesCoveredByCounty: Record<string, number> = Object.fromEntries(
    requiredSeries.map((seriesKey) => [seriesKey, 0]),
  );

  const countiesList = counties.results as Array<{ fips: string; state: string }>;
  for (const county of countiesList) {
    const stateKey = county.state;
    if (!stateCoverage[stateKey]) {
      stateCoverage[stateKey] = { counties_total: 0, counties_complete: 0, coverage_pct: 0 };
    }
    stateCoverage[stateKey].counties_total += 1;

    let countyComplete = true;
    for (const seriesKey of requiredSeries) {
      const set = seriesGeo.get(seriesKey);
      const covered = !!set && (set.has(county.fips) || set.has(county.state) || set.has('US'));
      if (covered) {
        seriesCoveredByCounty[seriesKey] += 1;
      } else {
        countyComplete = false;
      }
    }
    if (countyComplete) {
      stateCoverage[stateKey].counties_complete += 1;
    }
  }

  for (const bucket of Object.values(stateCoverage)) {
    bucket.coverage_pct = bucket.counties_total
      ? Math.round((bucket.counties_complete / bucket.counties_total) * 10000) / 10000
      : 0;
  }

  const totalCounties = countiesList.length;
  const seriesCompleteness = requiredSeries.map((seriesKey) => {
    const covered = totalCounties ? seriesCoveredByCounty[seriesKey] : 0;
    const coveragePct = totalCounties ? covered / totalCounties : 0;
    return {
      series_key: seriesKey,
      covered_counties: covered,
      total_counties: totalCounties,
      coverage_pct: Math.round(coveragePct * 10000) / 10000,
      missing_counties: Math.max(0, totalCounties - covered),
    };
  });

  const freshness = await db
    .prepare(
      `SELECT source_name, MAX(last_updated) AS last_updated, MAX(record_count) AS record_count
       FROM data_freshness
       GROUP BY source_name
       ORDER BY last_updated DESC`,
    )
    .all<{ source_name: string; last_updated: string; record_count: number }>();

  const warnings: string[] = [];
  if (resolved.meta.coverage_pct < 0.7) warnings.push('LOW_COVERAGE');
  if (freshness.results.length === 0) warnings.push('STALE_SOURCE');

  return c.json({
    as_of: resolved.asOf,
    as_of_meta: resolved.meta,
    county_coverage_by_state: stateCoverage,
    series_completeness: seriesCompleteness,
    missingness_summary: {
      counties_total: totalCounties,
      counties_complete: Object.values(stateCoverage).reduce((sum, row) => sum + row.counties_complete, 0),
      counties_partial: Math.max(
        0,
        totalCounties - Object.values(stateCoverage).reduce((sum, row) => sum + row.counties_complete, 0),
      ),
    },
    freshness: freshness.results,
    warnings,
  });
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
