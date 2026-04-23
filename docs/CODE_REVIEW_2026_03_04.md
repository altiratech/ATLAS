# Atlas Codebase Review — 2026-03-04

**Reviewer:** Claude (Cowork)
**Scope:** Full codebase — 23 source files across backend (Worker + services), frontend (SPA), deploy scripts, and infrastructure config.
**Codebase version:** Post-commit `aca8ca0` (main)

---

## Severity Definitions

- **CRITICAL** — Data corruption, security vulnerability, or production crash risk. Fix before next deploy.
- **HIGH** — Performance degradation, silent data errors, or UX-breaking bugs. Fix this sprint.
- **MEDIUM** — Code quality, maintainability, or edge-case issues. Fix when touching adjacent code.
- **LOW** — Style, documentation, minor polish. Address opportunistically.

---

## Executive Summary

The Atlas codebase is functional and ships real value, but it carries significant technical debt from rapid prototyping. The most pressing issues fall into three clusters:

1. **Security gaps** — SQL injection vectors, auth bypass path, hardcoded secrets in config, anon sessions still enabled in production.
2. **Data integrity risks** — Race conditions in upserts, division-by-zero in metric computation, null propagation producing NaN values, missing foreign key enforcement in D1.
3. **Performance bottlenecks** — N+1 query patterns in the dashboard (computing metrics for all counties × all years on every load), DAG resolution recomputed per request, unbounded scenario computation.

Total findings: **~80 across all severity levels.** Prioritized action plan below.

---

## TIER 1: Fix Before Next Deploy (Critical)

### 1.1 SQL Injection in Dynamic IN Clauses
**File:** `deploy/cloudflare-worker/src/index.ts` (screener route, multiple locations)
**Issue:** State arrays are interpolated directly into SQL strings via template literals when building `WHERE state IN (...)` clauses. User-supplied `states` query param is not parameterized.
**Blast radius:** Any authenticated user can inject arbitrary SQL.
**Fix:** Use D1's parameterized query API. Build placeholder strings (`?, ?, ?`) and pass values as bind params. Apply everywhere `IN (...)` is constructed dynamically.

### 1.2 Auth Bypass via Legacy User Logic
**File:** `deploy/cloudflare-worker/src/index.ts` (auth middleware, ~lines 376-569)
**Issue:** The session bootstrap and validation flow has a code path where `ALLOW_ANON_SESSIONS=1` combined with certain request patterns allows unauthenticated access to write endpoints that should require auth. The middleware checks `session_id` presence but the anon bootstrap path issues tokens that satisfy this check.
**Blast radius:** Write endpoints (watchlist, portfolio, notes, scenarios) accessible without real identity.
**Fix:** Two-part: (1) Disable `ALLOW_ANON_SESSIONS` in production ASAP (this was flagged as temporary in D-049). (2) Add explicit auth-level checks on write routes — verify session is non-anonymous before allowing mutations.

### 1.3 Secret Store IDs in Version Control
**File:** `deploy/cloudflare-worker/wrangler.toml`
**Issue:** Cloudflare secret store binding IDs are hardcoded in `wrangler.toml` which is committed to the repo. While these are reference IDs (not the secrets themselves), they expose infrastructure topology and could aid targeted attacks.
**Fix:** Move secret store references to environment variables or use `wrangler.toml` inheritance with a `.dev.vars` file (gitignored) for sensitive bindings. At minimum, document that these IDs are non-sensitive references in a comment.

### 1.4 Race Condition in Upsert Logic
**File:** `deploy/cloudflare-worker/src/services/ingest.ts`
**Issue:** The bulk ingest `INSERT OR REPLACE` pattern has a TOCTOU race: two concurrent ingest requests for the same `(series_key, state, county_fips, year)` can both read "not exists," then both insert, with the second silently overwriting the first — even if the first had fresher data. D1 doesn't support `INSERT ... ON CONFLICT DO UPDATE WHERE newer` natively.
**Blast radius:** Stale data can overwrite fresh data during concurrent backfill operations.
**Fix:** Add a `last_updated` timestamp column and use `INSERT OR REPLACE` with a check: `INSERT INTO data_points (...) SELECT ... WHERE NOT EXISTS (SELECT 1 FROM data_points WHERE ... AND last_updated > ?)`. Alternatively, serialize ingest operations per state/year combination.

### 1.5 Division by Zero in Metric Engine (DSCR)
**File:** `deploy/cloudflare-worker/src/services/metric-engine.ts`
**Issue:** DSCR (Debt Service Coverage Ratio) computation divides by debt service without a zero-guard. If debt service assumptions are zero or missing, this produces `Infinity` which propagates through downstream DAG nodes.
**Blast radius:** Single bad assumption corrupts an entire county's metric set.
**Fix:** Guard all division operations with explicit zero/null checks. Return `null` (not 0, not Infinity) when denominator is missing or zero.

### 1.6 SQL Injection in As-Of Resolution
**File:** `deploy/cloudflare-worker/src/services/asof.ts`
**Issue:** When `requiredSeries` array is empty, the generated SQL includes an unguarded `IN ()` clause, which is a SQL syntax error in some engines. More critically, the series names are interpolated without parameterization.
**Blast radius:** Malformed queries or injection via series names in query params.
**Fix:** Validate `requiredSeries` is non-empty before query construction. Parameterize all series name values.

### 1.7 Foreign Keys Not Enforced in D1
**File:** `deploy/cloudflare-worker/src/db/schema.sql`
**Issue:** D1 (SQLite-based) does not enforce foreign keys by default. The schema declares FK constraints (`FOREIGN KEY (session_id) REFERENCES sessions(id)`) but without `PRAGMA foreign_keys = ON;` at connection time, these are decorative.
**Blast radius:** Orphaned records accumulate silently. Deleting a session doesn't cascade-clean watchlist items, portfolio entries, etc.
**Fix:** Execute `PRAGMA foreign_keys = ON;` at the start of each request (in middleware). Note: this has performance implications for bulk operations — may need to selectively disable during ingest.

---

## TIER 2: Fix This Sprint (High)

### 2.1 N+1 Query Pattern in Dashboard
**File:** `deploy/cloudflare-worker/src/index.ts` (dashboard route)
**Issue:** The dashboard endpoint computes metrics for all tracked counties × all available years on every request. With 20 states × ~100 counties each × 20 years of data, this is ~40,000 metric computations per dashboard load. The `computeCounty` helper is called in a loop without batching.
**Fix:** Pre-compute and cache dashboard aggregates. Options: (1) Materialize a `dashboard_cache` table updated on ingest. (2) Compute per-state aggregates server-side and cache with `Cache-Control`. (3) At minimum, limit the dashboard to latest-year metrics and add pagination.

### 2.2 Unbounded Scenario Computation
**File:** `deploy/cloudflare-worker/src/index.ts` (scenario routes)
**Issue:** Sensitivity analysis generates a matrix of scenario runs with no upper bound on matrix dimensions. A request with 10 variables × 10 steps = 10^10 combinations would DoS the worker.
**Fix:** Cap sensitivity matrix dimensions (e.g., max 5 variables × 7 steps = 16,807 runs). Return `400` if exceeded.

### 2.3 DAG Resolution Computed Per Request
**File:** `deploy/cloudflare-worker/src/services/metric-engine.ts`
**Issue:** The metric engine's topological sort (DAG resolution for dependency ordering) is recomputed on every `computeCounty` call. The DAG structure is static — it doesn't change between requests.
**Fix:** Compute topological order once at module initialization (or lazily on first call) and cache the result. This is a free performance win.

### 2.4 Null Propagation Producing NaN in Portfolio Metrics
**File:** `deploy/cloudflare-worker/src/services/portfolio.ts`
**Issue:** Weighted metric aggregation multiplies values by portfolio weights without null-checking. If any county metric is `null`, the product becomes `NaN`, which propagates to the final weighted average.
**Fix:** Filter null values before aggregation. Reweight remaining values proportionally. Document the "available weight" coverage so the user knows what percentage of the portfolio was actually computed.

### 2.5 Unvalidated JSON.parse in Query Helpers
**File:** `deploy/cloudflare-worker/src/db/queries.ts`
**Issue:** Multiple `JSON.parse()` calls on D1 query results lack try/catch. If a stored JSON column is corrupted or empty, the entire request crashes with an unhandled exception.
**Fix:** Wrap all `JSON.parse()` in try/catch with fallback to empty object/array. Log the corruption for debugging.

### 2.6 N Database Calls for N Years in getTimeseries
**File:** `deploy/cloudflare-worker/src/db/queries.ts`
**Issue:** `getTimeseries()` makes one DB query per year in the requested range, rather than a single range query. For a 20-year range, this is 20 round-trips to D1.
**Fix:** Single query: `SELECT * FROM data_points WHERE series_key = ? AND state = ? AND county_fips = ? AND year BETWEEN ? AND ? ORDER BY year`.

### 2.7 Missing Indexes on Foreign Key Columns
**File:** `deploy/cloudflare-worker/src/db/schema.sql`
**Issue:** Tables with FK columns (e.g., `session_id` on watchlist, portfolio, notes, scenarios, research_workspaces) lack explicit indexes. D1/SQLite doesn't auto-index FK columns, so joins and lookups on these columns perform full table scans.
**Fix:** Add `CREATE INDEX idx_{table}_{column} ON {table}({column})` for all FK columns.

### 2.8 API Keys Potentially Logged in Error Messages
**File:** `deploy/cloudflare-worker/src/services/ingest.ts`
**Issue:** Error handlers log the full URL or request details when NASS/FRED API calls fail. If the URL includes the API key as a query parameter (which NASS does), the key appears in Cloudflare Worker logs.
**Fix:** Sanitize URLs before logging — strip query params or redact known key param names.

### 2.9 Auth Error Infinite Retry Loop (Frontend)
**File:** `frontend/index.html`
**Issue:** The auth bootstrap flow retries on failure without backoff or max retry limit. If the backend is down or returns persistent errors, the frontend enters an infinite retry loop, burning the user's network and CPU.
**Fix:** Implement exponential backoff with max 3-5 retries. After max retries, show a clear error state with a manual "Retry" button.

### 2.10 Frontend Drift Risk: Source vs. Deployed
**Files:** `frontend/index.html` (~2568 lines) vs. `deploy/cloudflare-worker/public/index.html` (~455 lines)
**Issue:** The development frontend (`frontend/index.html`) and the deployed version (`deploy/cloudflare-worker/public/index.html`) are drastically different in size. The build script (`build-frontend.mjs`) transforms the source, but there's no verification that the deployed version is a correct transformation of the source.
**Fix:** Add a build-verify step to CI: build frontend, diff against deployed version, fail if they diverge. Or better: make the build output the only deployed artifact (never edit `public/index.html` directly).

### 2.11 ALLOW_ANON_SESSIONS Still Enabled in Production
**File:** `deploy/cloudflare-worker/wrangler.toml`
**Issue:** `ALLOW_ANON_SESSIONS="1"` was set as a temporary measure (D-049) to unblock user access. It's still active. This weakens the auth posture for all write endpoints.
**Fix:** Disable once Cloudflare Access is properly configured. This is operationally blocked on access policy finalization but should be tracked as tech debt with a deadline.

### 2.12 Gordon Growth Model Silent Clamping
**File:** `deploy/cloudflare-worker/src/services/metric-engine.ts`
**Issue:** Fair value computation uses a Gordon Growth model where the spread (discount rate minus appreciation rate) is silently clamped to a minimum value when they converge. This prevents division by zero but produces misleadingly large fair values without any signal to the user that the model is at its boundary.
**Fix:** When clamping activates, flag the metric with a `warning` or `bounded` status so the frontend can display an indicator (e.g., "⚠ Model at boundary — appreciation rate near discount rate").

### 2.13 Hardcoded Default Yield Values
**File:** `deploy/cloudflare-worker/src/services/metric-engine.ts`
**Issue:** When crop yield data is missing, the engine substitutes hardcoded national average defaults rather than returning null. This creates phantom data that looks real in the UI.
**Fix:** Return null for missing data. Let the frontend handle the display ("N/A" or "Insufficient data"). If defaults are needed for scenario computation, make them explicit user-editable assumptions, not hidden substitutions.

### 2.14 Access Score Weights Not Validated
**File:** `deploy/cloudflare-worker/src/services/access-score.ts`
**Issue:** Category weights (ethanol plants, grain elevators, rail, highways, rivers) are hardcoded constants that are assumed to sum to 1.0 but this is never validated. A future edit could break the invariant silently.
**Fix:** Add a static assertion or initialization check: `if (Math.abs(weights.reduce((s,w) => s+w, 0) - 1.0) > 0.001) throw new Error('Access score weights must sum to 1.0')`.

---

## TIER 3: Fix When Touching Adjacent Code (Medium)

### 3.1 Cache Poisoning via URL-Based Key
**File:** `deploy/cloudflare-worker/src/index.ts`
**Issue:** Response caching uses the full request URL as the cache key. If query params are reordered or include extraneous params, cache misses proliferate. Conversely, if the URL is user-controlled, different users could poison each other's cache.
**Fix:** Normalize cache keys: sort query params alphabetically, strip unknown params, include session ID in key for user-specific data.

### 3.2 Z-Score Returns 0 Instead of Null When StdDev = 0
**File:** `deploy/cloudflare-worker/src/services/zscore.ts`
**Issue:** When standard deviation is zero (all values identical), the z-score is returned as 0 rather than null. While mathematically defensible (all values are at the mean), it's misleading — a z-score of 0 implies "average within a distribution" when there's actually no distribution at all.
**Fix:** Return null with a `coverage_note: "insufficient variance"` when stddev < epsilon.

### 3.3 Empty Portfolio Returns HHI = 10000
**File:** `deploy/cloudflare-worker/src/services/portfolio.ts`
**Issue:** An empty portfolio (no counties) returns an HHI of 10000 (maximum concentration), which is technically correct (100% of nothing is concentrated) but confusing in the UI.
**Fix:** Return null/undefined for all portfolio metrics when portfolio is empty. Show "Add counties to see portfolio metrics" in the UI.

### 3.4 No Debounce on Command Palette Search (Frontend)
**File:** `frontend/index.html`
**Issue:** The command palette's search input fires a re-render on every keystroke without debouncing. On slower devices, this causes visible lag.
**Fix:** Add 150-200ms debounce to the search input handler.

### 3.5 Race Condition in County Detail Loading
**File:** `frontend/index.html`
**Issue:** Navigating quickly between counties doesn't cancel previous fetch requests. If County A's response arrives after County B's request, County B's view shows County A's data.
**Fix:** Use `AbortController` to cancel in-flight requests when the selected county changes.

### 3.6 Optimistic Watchlist Updates Without Rollback
**File:** `frontend/index.html`
**Issue:** Adding/removing watchlist items updates the UI optimistically but doesn't roll back on API failure. The user sees a success state that may not persist.
**Fix:** Implement rollback on error: revert the UI state and show a toast notification.

### 3.7 Arbitrary 70% Coverage Threshold in As-Of Resolution
**File:** `deploy/cloudflare-worker/src/services/asof.ts`
**Issue:** The as-of resolver uses a hardcoded 70% coverage threshold to determine whether a year has sufficient data. This magic number isn't documented or configurable.
**Fix:** Make configurable via env var or pass as parameter. Document the rationale for 70%.

### 3.8 Integer Cast on Potentially Invalid as_of_date
**File:** `deploy/cloudflare-worker/src/services/asof.ts`
**Issue:** `parseInt(as_of_date)` is called without validating the input is a parseable integer. Non-numeric strings return `NaN`, which propagates into SQL queries.
**Fix:** Validate format before parsing. Return `400` for invalid date parameters.

### 3.9 NASS URL Discovery Brittleness
**File:** `deploy/cloudflare-worker/scripts/backfill-nass-bulk.mjs`
**Issue:** Bulk file URL discovery uses regex on NASS HTML pages to find download links. This is brittle — any change to NASS's page structure breaks the discovery silently.
**Fix:** Add fallback URL patterns and validate discovered URLs with a HEAD request before attempting download. Log warnings when the primary discovery pattern fails.

### 3.10 Insufficient Default Timeouts for Bulk Backfills
**File:** `deploy/cloudflare-worker/scripts/backfill-orchestrator.mjs`
**Issue:** Default timeout settings may not accommodate large state/year combinations, especially when NASS servers are slow.
**Fix:** Make timeout configurable per-run. Set defaults based on observed p99 durations from successful runs.

### 3.11 Missing ARIA Labels Throughout (Frontend)
**File:** `frontend/index.html`
**Issue:** Interactive elements (buttons, inputs, navigation items) lack ARIA labels, roles, and keyboard navigation support. The app is largely inaccessible to screen reader users.
**Fix:** Systematic pass: add `aria-label` to all buttons/icons, `role` attributes to navigation elements, keyboard `tabIndex` management, and `aria-live` regions for dynamic content updates. This is important for enterprise adoption.

### 3.12 Global State Mutation in Auth Token Management (Frontend)
**File:** `frontend/index.html`
**Issue:** Auth tokens are stored in a module-level variable and mutated from multiple async contexts (bootstrap, refresh, API calls). Under concurrent requests, a token refresh can overwrite a token mid-flight.
**Fix:** Use a token manager class with a mutex/lock pattern: if a refresh is in progress, queue pending requests until the new token is available.

### 3.13 Unvalidated Facility Coordinates in Access Score
**File:** `deploy/cloudflare-worker/src/services/access-score.ts`
**Issue:** Facility coordinates (lat/lng for ethanol plants, elevators, etc.) are used in distance calculations without validation. Invalid coordinates (0,0 or out of CONUS range) produce nonsensical proximity scores.
**Fix:** Validate coordinates fall within reasonable CONUS bounds (lat 24-50, lng -125 to -66). Skip invalid facilities with a logged warning.

### 3.14 No Catastrophic Error Recovery in Bulk Ingest
**File:** `deploy/cloudflare-worker/scripts/backfill-nass-bulk.mjs`
**Issue:** If the bulk file parsing crashes mid-stream (corrupt file, memory pressure), partially ingested data is committed but there's no record of which rows made it.
**Fix:** Ingest in batches with progress checkpoints. On failure, log the last successful batch so the next run can resume.

### 3.15 No Retry/Backoff Logic for External API Calls
**File:** `deploy/cloudflare-worker/src/services/ingest.ts`
**Issue:** Calls to NASS and FRED APIs fail immediately on first error without retry. Rate-limit responses (429) aren't handled with appropriate backoff.
**Fix:** Implement exponential backoff with jitter for retryable status codes (429, 502, 503, 504). Max 3 retries.

---

## TIER 4: Address Opportunistically (Low)

1. **No partitioning strategy for data_points table** — as data grows to millions of rows, query performance degrades. Consider yearly partitioning or a materialized view strategy. (schema.sql)
2. **Z-score band thresholds at ±0.5 are arbitrary** — not documented or configurable. (zscore.ts)
3. **Missing loading states for some views** — county detail and scenario results show stale data during fetch. (frontend)
4. **Unvalidated numeric inputs in screener filters** — non-numeric values don't error, they silently produce no results. (frontend)
5. **Console.log statements left in production code** — several debug logs remain in service files. (various)
6. **No rate limiting on API endpoints** — a malicious or buggy client can exhaust D1 read/write quotas. (index.ts)
7. **Ingest admin token auth shares the same middleware path as user auth** — should be a separate middleware for clarity. (index.ts)
8. **Frontend build script lacks source maps** — debugging production issues requires matching minified code to source. (build-frontend.mjs)
9. **No health check for D1 connectivity** — `/api/v1/health` returns 200 even if D1 is unreachable. (index.ts)
10. **Schema migration runs on every cold start** — `CREATE TABLE IF NOT EXISTS` is safe but adds unnecessary overhead on warm workers. (index.ts)

---

## Recommended Action Plan

### Immediate (before next deploy):
1. Parameterize all SQL IN clauses (1.1, 1.6) — 2-3 hours
2. Add zero-guards to all metric engine division operations (1.5) — 1 hour
3. Wrap all JSON.parse calls in try/catch (2.5) — 1 hour

### This week:
4. Disable ALLOW_ANON_SESSIONS once access policy is ready (1.2, 2.11)
5. Add PRAGMA foreign_keys = ON to middleware (1.7) — 30 min
6. Cache DAG topological sort (2.3) — 30 min
7. Optimize dashboard query pattern (2.1) — 4-6 hours
8. Cap sensitivity matrix dimensions (2.2) — 30 min
9. Single-query getTimeseries (2.6) — 30 min
10. Add FK indexes (2.7) — 30 min
11. Sanitize API keys from error logs (2.8) — 30 min
12. Add auth retry backoff + max retries (2.9) — 1 hour

### Next sprint:
13. Frontend AbortController for navigation races (3.5)
14. Token manager class for auth state (3.12)
15. ARIA accessibility pass (3.11)
16. Build verification in CI (2.10)
17. Watchlist rollback on failure (3.6)
18. Gordon Growth boundary warning (2.12)
19. Remove hardcoded default yields (2.13)

---

## Summary Statistics

| Severity | Count | Estimated Fix Time |
|----------|-------|-------------------|
| Critical | 7 | 6-8 hours |
| High | 14 | 12-16 hours |
| Medium | 15 | 16-20 hours |
| Low | 10 | Opportunistic |
| **Total** | **46** | **~36-44 hours** |

Note: The ~80 raw findings from the review agents were deduplicated and consolidated. Several issues appeared in multiple files (e.g., JSON.parse without try/catch, SQL interpolation) — these are counted once with a note to fix everywhere.

---

*Review conducted by Claude (Cowork) on 2026-03-04. Findings based on static analysis of source code — no runtime testing performed.*

---

## ADDENDUM — 2026-03-05 Update

### Items Fixed by Codex Since Original Review

Codex implemented a targeted set of P0/P1 fixes between 2026-03-04 and 2026-03-05 (commits `aa678bb` and subsequent). Status of original findings:

| Finding | Status | Notes |
|---------|--------|-------|
| **1.4** Race condition in upserts | **FIXED** (D-062) | Atomic `INSERT ON CONFLICT DO UPDATE` with unique index on `(series_id, geo_key, as_of_date)`. Includes duplicate cleanup migration. |
| **1.5** Division by zero in DSCR | **PARTIALLY FIXED** (D-061) | Sensitivity bounds added. Codex assessed this as "valid/partial" — the zero-guard exists but may not cover all DAG paths. Needs verification. |
| **2.3** DAG resolution per request | **FIXED** (D-061) | DAG cache implemented — topological sort computed once, reused across requests. |
| **2.5** Unvalidated JSON.parse | **FIXED** (D-061) | try/catch guards added to all JSON.parse calls in query helpers. |
| **2.6** N queries for N years in getTimeseries | **FIXED** (D-061) | Converted to single range query. |
| **2.11** ALLOW_ANON_SESSIONS still enabled | **FIXED** (D-063) | Anon session bootstrap disabled. |

**Items Codex classified as "false/outdated criticals":**

| Finding | Codex Assessment | My Re-assessment |
|---------|-----------------|-----------------|
| **1.1** SQL injection in dynamic IN | Codex says "outdated — screener uses parameterized queries" | **Needs verification.** If Codex refactored the screener routes, this may be resolved. The original finding was based on template literal interpolation patterns — confirm these are gone. |
| **1.6** SQL injection in as-of | Codex says "outdated" | **Same — needs code-level verification.** |
| **1.2** Auth bypass via anon sessions | Resolved by D-063 (anon disabled) | **Confirmed fixed.** The root cause (anon sessions) is eliminated. |

**Remaining open items from the original review** (not addressed by Codex):

- 1.3 Secret store IDs in VCS — still present
- 1.7 FK not enforced — no PRAGMA change observed
- 2.1 N+1 dashboard queries — still present
- 2.2 Unbounded scenario computation — still present
- 2.4 Null propagation in portfolio — still present
- 2.7 Missing FK indexes — still present
- 2.8 API keys in error logs — still present
- 2.9 Auth retry loop (frontend) — still present
- 2.10 Frontend drift risk — still present
- 2.12-2.14 Gordon Growth clamping, hardcoded yields, access score weights — still present
- All Tier 3 and Tier 4 items — still present

### New Finding: Ingestion Architecture (Critical — Architectural)

**This is the single highest-impact finding in the codebase and warrants its own document.** See companion analysis: `INGESTION_ANALYSIS_2026_03_05.md`.

**Summary:** The data ingestion pipeline uses a row-at-a-time write pattern through the Worker HTTP API. All data — whether from NASS API calls or bulk file downloads — flows through `upsertDataPoint()` which executes one D1 prepared statement per row. For ~300K data points, this takes hours.

Codex spent ~2 days building increasingly complex workarounds (API chunking → bash fallback scripts → bulk file downloader → orchestrator with progress ledger → 566-line meta-orchestrator) rather than questioning the underlying architecture. The fundamental issues are:

1. **Row-at-a-time writes** — `upsertDataPoint()` does 1 DB call per row. The "bulk" endpoint is bulk in name only.
2. **D1 is single-threaded** — writes are serialized. 300K individual upserts = hours.
3. **Worker as intermediary** — all writes flow through the Worker HTTP API, adding network overhead and execution time limits.
4. **No use of D1's native bulk import** — `wrangler d1 execute --file` (up to 5GB) and the D1 REST API import pipeline were never explored.
5. **No use of `db.batch()`** — D1 supports batching multiple statements in a single round-trip, reducing overhead by orders of magnitude.

**Recommended fix (Option E — Hybrid):**
- **Backfill:** Modify existing bulk file parser to emit .sql, import via `wrangler d1 execute --file`. Eliminates ~800 lines of orchestration code. Reduces backfill from hours to minutes. ~4 hours effort.
- **Ongoing:** Refactor `ingestBulkDataPoints()` to use `db.batch()`. ~50 line change, ~2 hours effort.

### Revised Summary Statistics

| Severity | Original Count | Fixed by Codex | Remaining | New Findings |
|----------|---------------|---------------|-----------|-------------|
| Critical | 7 | 2 fully, 1 partially | 4-5 | +1 (ingestion architecture) |
| High | 14 | 4 | 10 | — |
| Medium | 15 | 0 | 15 | — |
| Low | 10 | 0 | 10 | — |
| **Total** | **46** | **6-7** | **39-40** | **+1** |

**Revised estimated remaining effort:** ~30-36 hours (down from ~36-44, accounting for Codex fixes).

---

*Addendum by Claude (Cowork) on 2026-03-05.*
