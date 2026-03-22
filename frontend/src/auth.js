import { API, AUTH_TOKEN_KEY } from './config.js';

function readAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function writeAuthToken(token) {
  try {
    if (!token) return false;
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function clearAuthToken() {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {}
}

let AUTH_TOKEN = readAuthToken();
let AUTH_BOOTSTRAP_INFLIGHT = null;

export function defaultResearchRecord() {
  return {
    playbook_key:'',
    thesis:'',
    analysis:{
      thesis:'',
      bull_case:'',
      bear_case:'',
      key_risks:[],
      catalysts:[],
      decision_state:'exploring',
      asset_type:'',
      target_use_case:'',
      thesis_lens_key:'',
      thesis_lens_label:'',
      critical_dependencies:[],
      missing_data_notes:[],
      approval_state:'',
    },
    tags:[],
    conviction:50,
    status:'exploring',
    notes:[],
    scenario_packs:[],
    scenario_runs:[],
    scenario_runs_count:0,
    updated_at:null,
  };
}

export function normalizeResearchRecord(record) {
  const base = defaultResearchRecord();
  const safe = record && typeof record === 'object' ? record : {};
  const conviction = Number(safe.conviction);
  return {
    ...base,
    ...safe,
    playbook_key: typeof safe.playbook_key === 'string' ? safe.playbook_key : base.playbook_key,
    analysis: {
      ...base.analysis,
      ...(safe.analysis && typeof safe.analysis === 'object' ? safe.analysis : {}),
      key_risks: Array.isArray(safe.analysis?.key_risks) ? safe.analysis.key_risks : base.analysis.key_risks,
      catalysts: Array.isArray(safe.analysis?.catalysts) ? safe.analysis.catalysts : base.analysis.catalysts,
      critical_dependencies: Array.isArray(safe.analysis?.critical_dependencies) ? safe.analysis.critical_dependencies : base.analysis.critical_dependencies,
      missing_data_notes: Array.isArray(safe.analysis?.missing_data_notes) ? safe.analysis.missing_data_notes : base.analysis.missing_data_notes,
    },
    tags: Array.isArray(safe.tags) ? safe.tags : [],
    notes: Array.isArray(safe.notes) ? safe.notes : [],
    scenario_packs: Array.isArray(safe.scenario_packs) ? safe.scenario_packs : [],
    scenario_runs: Array.isArray(safe.scenario_runs) ? safe.scenario_runs : [],
    scenario_runs_count: Number.isFinite(Number(safe.scenario_runs_count)) ? Math.max(0, Number(safe.scenario_runs_count)) : 0,
    conviction: Number.isFinite(conviction) ? Math.max(0, Math.min(100, conviction)) : base.conviction,
    status: safe.status || base.status,
  };
}

function indexResearchWorkspaceStore(rows) {
  const store = {};
  for (const row of (rows || [])) {
    if (!row || typeof row !== 'object' || !row.geo_key) continue;
    store[row.geo_key] = normalizeResearchRecord(row);
  }
  return store;
}

export async function bootstrapAuth(force = false) {
  if (AUTH_BOOTSTRAP_INFLIGHT && !force) return AUTH_BOOTSTRAP_INFLIGHT;
  const pending = (async () => {
    const headers = new Headers();
    if (AUTH_TOKEN) headers.set('Authorization', `Bearer ${AUTH_TOKEN}`);
    const res = await fetch(API + '/auth/bootstrap', { method:'POST', headers });
    if (res.status === 401) {
      const err = new Error('Authentication required');
      err.authRequired = true;
      err.status = 401;
      throw err;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    if (data && data.token) {
      AUTH_TOKEN = data.token;
      writeAuthToken(data.token);
    }
    return data;
  })();
  AUTH_BOOTSTRAP_INFLIGHT = pending;
  try {
    return await pending;
  } finally {
    if (AUTH_BOOTSTRAP_INFLIGHT === pending) AUTH_BOOTSTRAP_INFLIGHT = null;
  }
}

export async function api(path, opts, attemptedRefresh = false) {
  const headers = new Headers((opts && opts.headers) || {});
  if (AUTH_TOKEN && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${AUTH_TOKEN}`);
  const res = await fetch(API + path, { ...(opts || {}), headers });
  if (res.status === 401 && !attemptedRefresh) {
    await bootstrapAuth(true);
    return api(path, opts, true);
  }
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function logoutAuth() {
  const token = AUTH_TOKEN;
  if (!token) return;
  try {
    await fetch(API + '/auth/logout', {
      method:'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {}
  AUTH_TOKEN = '';
  clearAuthToken();
}

export async function fetchResearchWorkspaces() {
  const rows = await api('/research/workspaces');
  return indexResearchWorkspaceStore(rows);
}

export async function fetchResearchWorkspace(geoKey) {
  const row = await api(`/research/workspaces/${geoKey}`);
  return normalizeResearchRecord(row);
}

export function clearAuthState() {
  AUTH_TOKEN = '';
  clearAuthToken();
}
