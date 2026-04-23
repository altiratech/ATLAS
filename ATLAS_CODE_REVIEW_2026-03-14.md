# Atlas Code Review — Full Codebase Audit

**Date:** 2026-03-14
**Reviewer:** Claude (Cowork)
**Scope:** All frontend modules, all backend Worker services, ingestion, deployment config
**Codebase:** `Code/active/farmland-terminal/`

---

## Executive Summary

Atlas is a well-architected farmland analytics platform with a clean separation between a React 18 SPA frontend and a Cloudflare Workers + D1 backend. The metric engine (Gordon Growth Model, 15-metric DAG), acquisition underwriting, credit stress testing, and hierarchical data fallback system are all technically sound and thoughtfully designed.

That said, the codebase has accumulated meaningful technical debt across several dimensions: code duplication, missing error boundaries, performance bottlenecks in the screener pipeline, a security gap in CORS configuration, and a number of UX rough edges. None of these are ship-stoppers, but several will bite in production as usage scales.

**Issue counts by severity:**

| Severity | Count |
|----------|-------|
| Critical (security/data integrity) | 3 |
| High (bugs, correctness) | 8 |
| Medium (UX/UI, performance, maintainability) | 16 |
| Low (code quality, minor polish) | 12 |

---

## 1. Critical Issues

### 1.1 Wide-Open CORS — No Origin Restriction

**File:** `index.ts` line ~30
**Issue:** `app.use('*', cors())` with no origin, methods, or headers restrictions. Any domain can make credentialed requests to the Atlas API.

**Risk:** If session tokens are sent via cookies or headers, any malicious site can exfiltrate data or perform actions on behalf of authenticated users. Even with bearer tokens, the lack of origin restriction means CSRF-adjacent attacks are easier to construct.

**Fix:** Restrict to `atlas.altiratech.com` and `farmland.altiratech.com` origins. In development, allow `localhost`.

### 1.2 Token Comparison Uses String Equality, Not Constant-Time Compare

**File:** `index.ts` line ~953
**Issue:** `hasValidIngestAdminToken` compares `providedToken === configuredToken` using JavaScript's `===` operator, which short-circuits on the first differing byte. This is a timing side-channel.

**Risk:** An attacker making many requests can statistically deduce the ingest admin token byte-by-byte.

**Fix:** Use `crypto.subtle.timingSafeEqual` or a constant-time comparison function.

### 1.3 `stats()` Mutates Input Array

**File:** `index.ts` — `stats()` helper
**Issue:** The `stats()` function calls `.sort()` on the input array, which mutates the original array in place. This function is called from multiple contexts including dashboard aggregation where the original order may matter.

**Risk:** Subtle data corruption bugs. Any caller that reuses the array after calling `stats()` will see it reordered. The effect is currently masked because most callers don't reuse, but it's a latent bug.

**Fix:** Sort a copy: `const sorted = [...arr].sort((a, b) => a - b)`.

---

## 2. High-Severity Issues

### 2.1 Screener Loads All Counties Into Memory, Computes Metrics Per-County

**File:** `index.ts` `/api/v1/screener` route (~line 1941–2188)
**Issue:** The screener fetches all counties, loads a full series window, then iterates every county computing metrics, z-scores, and filters in-process. For ~3,000+ counties × 10-year windows, this is a massive amount of D1 queries and computation in a single Worker invocation.

**Impact:** Cloudflare Workers have a 30-second CPU time limit (paid plan) and 128MB memory. As the county count grows, this endpoint will hit timeouts. The `loadCountySeriesWindow` does batch SQL but still materializes everything.

**Recommendation:** Pre-compute and cache screener results in D1 on a schedule (e.g., after ingestion). Serve the screener from a materialized view rather than computing live.

### 2.2 CSV Export Recomputes Every County Individually

**File:** `index.ts` `/api/v1/export/screener` (~line 3511–3564)
**Issue:** The export endpoint calls `computeCounty()` individually for every county in a serial loop. Unlike the screener (which uses `loadCountySeriesWindow` for batch loading), the export makes N individual `loadSeriesForCounty` calls.

**Impact:** This will almost certainly timeout on production data. Each `computeCounty` call triggers multiple D1 queries.

**Fix:** Use `loadCountySeriesWindow` + `computeCountyFromSeries` like the screener does.

### 2.3 Backtest Endpoint Has Same N+1 Query Pattern

**File:** `index.ts` `/api/v1/run/backtest` (~line 2427–2512)
**Issue:** The backtest iterates all counties, calling `computeCounty()` per county per year. For the flagged subset, it then calls `computeCounty()` again for the end year. This is O(counties × 2) individual metric computations.

**Impact:** Will timeout for large county sets or long eval periods.

### 2.4 `computeMetricZscoresForCounty` Makes N Sequential DB Calls

**File:** `index.ts` (~line 826–886)
**Issue:** For each year in the z-score window (default 10), the function calls `computeCounty()` sequentially. Each `computeCounty` call triggers `loadSeriesForCounty` → 4+ D1 queries. A single county z-score computation = ~40 DB round trips.

**Impact:** The county detail page calls this function, adding 1–2 seconds of latency per county view.

### 2.5 `computeCounty` and `computeCountyFromSeries` Code Duplication

**File:** `index.ts`
**Issue:** These two functions share ~80% identical logic for metric computation, benchmark derivation, productivity calculation, and drought evidence. `computeCounty` loads series from DB then does the same computation as `computeCountyFromSeries`. Any bug fix or feature added to one must be manually replicated in the other.

**Risk:** Metric divergence between single-county and batch-county paths. If one is updated and the other isn't, the screener and county detail page will show different numbers for the same county.

**Fix:** Refactor `computeCounty` to call `loadSeriesForCounty` then delegate to `computeCountyFromSeries`.

### 2.6 Comparison `useEffect` Missing Dependency

**File:** `frontend/src/features/analysis-pages.jsx` (~line 93–95)
**Issue:** The Comparison component's `useEffect` triggers on `activeAssumptionSetId` change and calls `compare()`, but `compare` is not listed in the dependency array. This means the effect captures a stale `compare` closure.

**Impact:** After changing the selected counties, switching assumption sets may compare the wrong set of counties (using the stale county list from the previous closure).

### 2.7 `STable` Uses Array Index as React Key

**File:** `frontend/src/shared/data-ui.jsx`
**Issue:** `STable` renders `<tr key={i}>` using the row index as the React key.

**Impact:** When the table is sorted, React cannot properly reconcile rows. This causes incorrect row recycling, potential animation glitches, and stale hover/selection state. For the screener table with 500+ rows, this is a real UX bug.

**Fix:** Use a unique row identifier (e.g., FIPS code) as the key.

### 2.8 In-Memory Cache Has No Size Bound

**File:** `index.ts` (`RESPONSE_CACHE`)
**Issue:** The `RESPONSE_CACHE` Map grows unbounded. Each unique screener/dashboard URL generates a new cache entry. Entries expire by TTL but are only evicted on read miss.

**Impact:** In a Worker that handles many requests, the Map can grow to consume available memory. Workers are single-threaded but long-lived in some configurations.

**Fix:** Add a max-size eviction (LRU or periodic sweep).

---

## 3. Medium-Severity Issues

### 3.1 No React Error Boundaries

**Impact:** Any uncaught JavaScript error in any component crashes the entire app with a white screen. There's no graceful degradation or error recovery.

**Fix:** Add `<ErrorBoundary>` wrappers around major feature sections (dashboard, screener, county page, scenario lab).

### 3.2 No URL/History-Based Routing

**File:** `frontend/src/main.jsx`
**Issue:** Navigation is driven by a `pg` state variable in a `switch` statement. There is no URL routing, no browser history integration, no deep linking.

**Impact:** Users cannot bookmark pages, share links to specific counties or screens, or use browser back/forward. Refreshing the page always returns to the dashboard.

**Recommendation:** Adopt a lightweight hash router or `history.pushState` integration. This is a significant UX limitation for a professional analytics tool.

### 3.3 CountyPicker Loads All Counties Without Pagination

**File:** `frontend/src/shared/data-ui.jsx`
**Issue:** `CountyPicker` fetches the full county list (`/api/v1/counties`) on first open and renders all results in a dropdown. With 3,000+ counties, this is a large DOM render and a large payload.

**Fix:** Add server-side search (the `/search` endpoint already exists) or at minimum virtualize the dropdown.

### 3.4 Duplicate Functions Across Frontend Files

**Files:** `scenario-lab.jsx` and `research-workspace.jsx`
**Issue:** `formatAcquisitionBasis()` and `formatLeverageMode()` are defined identically in both files.

**Fix:** Extract to a shared utility module (e.g., `formatting.js` or a new `shared/format-utils.js`).

### 3.5 Duplicate `amortizedAnnualDebtService` Across Backend Files

**Files:** `acquisition.ts` and `credit.ts`
**Issue:** Both files define their own `amortizedAnnualDebtService` function with identical logic.

**Fix:** Extract to a shared finance utility.

### 3.6 `asFiniteNumber` Duplicated Across Service Files

**Files:** `industrial.ts`, `drought.ts` — each defines its own `asFiniteNumber`.

**Fix:** Extract to a shared utility.

### 3.7 Dashboard Sequential Load Pattern

**File:** `frontend/src/features/dashboard.jsx`
**Issue:** The dashboard loads data sequentially: first the dashboard endpoint, then (in parallel) coverage + ag-index. The dashboard endpoint itself is heavy (computes all counties). This creates a noticeable loading delay.

**Impact:** Initial dashboard render takes several seconds. The `loadSeqRef` pattern to prevent stale renders adds complexity.

**Recommendation:** Pre-compute dashboard data on ingestion. Serve from a materialized summary table.

### 3.8 Screener Client-Side `basisFilter` Not Sent to API

**File:** `frontend/src/features/screener.jsx`
**Issue:** The `basisFilter` (entry price basis for acquisition underwriting) is applied client-side after fetching results. This means the API returns all matching rows, then the frontend filters further.

**Impact:** Wasted bandwidth and computation when basis filtering is active.

### 3.9 `toast()` Uses `Date.now() + Math.random()` for IDs

**File:** `frontend/src/formatting.js`
**Issue:** Toast IDs are generated as `Date.now() + Math.random()`. While unlikely, this can produce collisions if two toasts fire in rapid succession.

**Impact:** Low practical risk, but `crypto.randomUUID()` or a simple counter would be more correct.

### 3.10 Schema Migrations Run on Every Request

**File:** `index.ts` — `ensureResearchSchema`, `ensureIngestProgressSchema`
**Issue:** These functions run `CREATE TABLE IF NOT EXISTS` and migration checks on nearly every authenticated request. While the `researchSchemaReady` flag prevents repeated execution within a single Worker instance, each cold start re-runs all migrations.

**Impact:** Extra D1 round trips on every cold start. Not catastrophic, but adds latency.

**Recommendation:** Run migrations in a separate deployment step or on a scheduled trigger.

### 3.11 No Input Sanitization on Assumption Set `params`

**File:** `index.ts` `/api/v1/assumptions` POST
**Issue:** The assumption set creation endpoint accepts arbitrary JSON in `body.params` and stores it as `JSON.stringify(body.params)`. There's no validation that the params contain expected keys or reasonable numeric values.

**Impact:** A malformed assumption set could cause NaN propagation through the entire metric engine.

### 3.12 Watchlist is Global, Not Per-User

**File:** `index.ts` `/api/v1/watchlist`
**Issue:** The watchlist table (`watchlist_items`) has no `owner_key` column. All authenticated users share the same watchlist. Adding or removing items affects everyone.

**Impact:** In a multi-user deployment, this is a data isolation bug.

### 3.13 Notes Are Global, Not Per-User

**File:** `index.ts` `/api/v1/notes/:geoKey`
**Issue:** County notes (`county_notes` table) have no user association. Any user can see, add, or delete any note.

**Impact:** Same multi-user data isolation issue as watchlist.

### 3.14 Debug Endpoint Exposes NASS API Key in Non-Production

**File:** `index.ts` `/api/v1/debug/nass`
**Issue:** While the key is redacted in the URL output, the actual API call is made with the real key. If error responses from NASS echo the URL, the key could leak.

**Impact:** Low risk since it's gated to non-production, but worth noting.

### 3.15 No Rate Limiting on Any Endpoint

**Impact:** The ingestion endpoints, auth bootstrap, and screener are all unprotected from abuse. A single client could exhaust Worker CPU allocation or D1 row limits.

### 3.16 Frontend CSS Is All in `index.html` (462 lines)

**File:** `frontend/index.html`
**Issue:** All application styles are defined as inline CSS in the HTML file. There's no CSS modules, no CSS-in-JS, and no external stylesheets. Every class is global.

**Impact:** As the application grows, style conflicts become likely. There's no scoping mechanism.

---

## 4. Low-Severity Issues

### 4.1 Hardcoded Sensitivity Matrix Values

**File:** `index.ts` `/api/v1/geo/:geoKey/sensitivity`
**Issue:** Risk premium values `[2.0, 3.0, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0]` and growth values `[0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04]` are hardcoded inline. These should be configurable or at least named constants.

### 4.2 Mixed `any` Type Usage in Backend

**File:** `index.ts` — multiple locations
**Issue:** Frequent use of `any` type (e.g., `const results: any[] = []`, `const countyData: Record<string, any> = {}`) undermines TypeScript's value.

### 4.3 `ALLOW_ANON_SESSIONS` Defaults to Enabled in Production

**File:** `wrangler.toml`
**Issue:** `ALLOW_ANON_SESSIONS = "1"` is set in the production vars. This means anyone can create anonymous sessions and access all API endpoints.

**Impact:** Acceptable for the current single-user deployment, but should be flipped when multi-user access is enabled.

### 4.4 React 18 Loaded via CDN UMD Bundle

**File:** `frontend/index.html`
**Issue:** React is loaded from `unpkg.com` as a production UMD bundle. This means no tree-shaking, no bundler optimizations, and a runtime dependency on an external CDN.

**Impact:** If unpkg goes down, Atlas is down. Also prevents using React features that require a bundler (e.g., React Server Components, Suspense for data fetching).

### 4.5 No Loading Skeletons — Only Spinners

**Impact:** Every loading state shows the same generic spinner. For a premium analytics tool, skeleton screens or shimmer effects would feel significantly more polished.

### 4.6 Screener Filter Inputs Lack Debounce

**File:** `frontend/src/features/screener.jsx`
**Issue:** Filter changes trigger immediate API calls. Rapid typing in text filters or slider adjustments could fire many redundant requests.

### 4.7 No Responsive Mobile Layout

**File:** `frontend/index.html`
**Issue:** The CSS has minimal responsive breakpoints (only sidebar width adjustment at 980px). The sidebar-based layout doesn't collapse on mobile.

**Impact:** Atlas is unusable on mobile devices. Acceptable if the target audience is desktop-only, but worth documenting as a known limitation.

### 4.8 Metric Engine Default Assumptions Duplicated

**File:** `metric-engine.ts`
**Issue:** Default assumption values (risk_premium=2.0, long_run_growth=0.025, etc.) are defined both as constants in the metric engine and implicitly in the assumption set system. If the DB has no default set, the engine uses its hardcoded values, which could diverge from the DB-stored defaults.

### 4.9 `ag-index` Background Refresh Fire-and-Forget

**File:** `index.ts` `/api/v1/ag-index`
**Issue:** If the ag-index table is empty, the endpoint triggers `refreshAgCompositeIndex` via `waitUntil` and returns a "check back shortly" response. There's no retry mechanism or error reporting beyond console.error.

### 4.10 Portfolio Delete Missing Auth Check Consistency

**File:** `index.ts` — portfolio delete endpoint
**Issue:** Portfolio deletion doesn't verify the user owns the portfolio. Any authenticated user can delete any portfolio.

### 4.11 Scenario Lab Date Validation Regex May Not Match Runtime

**File:** `index.ts` — `/api/v1/research/workspaces/:geoKey/scenario-runs` POST
**Issue:** The regex `^\\d{4}(-\\d{2}-\\d{2})?$` in the source code has double-escaped backslashes. Depending on how the TypeScript is compiled, this may not match correctly. (It should be `/^\d{4}(-\d{2}-\d{2})?$/`.)

### 4.12 No Favicon or PWA Manifest

**Impact:** Minor polish issue. The browser shows a default icon and there's no installable PWA support.

---

## 5. Architecture Observations (Not Bugs)

These aren't issues per se, but design choices worth being aware of:

**Monolithic index.ts (~4,100+ lines).** The main worker file contains all route handlers, auth logic, schema migrations, caching, helpers, and type definitions. This is manageable now but will become painful to navigate. Consider splitting into route modules.

**Single-file SPA with no build-time type checking.** The frontend is plain JSX (not TSX) with no TypeScript, no prop types, and no linting. This means type errors are only caught at runtime.

**D1 as sole datastore.** All data, auth, sessions, research workspaces, portfolio holdings, ingestion state, and cached metrics live in a single D1 database. D1 is SQLite-based with 10GB max and 25K row read limits per query. At scale, the screener's batch queries may hit these limits.

**No test suite.** There are no unit tests, integration tests, or end-to-end tests anywhere in the codebase. The metric engine, acquisition model, and credit stress calculations are all untested. Given that these produce financial outputs, this is the single highest-priority gap to close.

---

## 6. Prioritized Remediation Roadmap

### Immediate (this sprint)

1. **Fix CORS** — restrict to production origins
2. **Fix timing-safe token comparison** — `hasValidIngestAdminToken`
3. **Fix `stats()` array mutation** — sort a copy
4. **Add React Error Boundaries** — prevent white-screen crashes
5. **Fix STable key prop** — use unique identifiers

### Short-term (next 2 sprints)

6. **Refactor `computeCounty` to delegate to `computeCountyFromSeries`** — eliminate duplication
7. **Fix CSV export to use batch loading** — prevent timeout
8. **Add per-user scoping to watchlist and notes** — add `owner_key` column
9. **Extract duplicate functions** — `formatAcquisitionBasis`, `amortizedAnnualDebtService`, `asFiniteNumber`
10. **Fix Comparison `useEffect` dependency** — add `compare` to deps array
11. **Add URL routing** — hash router at minimum

### Medium-term (next quarter)

12. **Pre-compute screener/dashboard results** — materialized views updated on ingestion
13. **Add unit tests for metric engine, acquisition model, and credit stress**
14. **Add input validation for assumption set params**
15. **Implement rate limiting** — at least on auth and ingestion endpoints
16. **Split `index.ts` into route modules**
17. **Bound the in-memory response cache**

---

*End of review.*
