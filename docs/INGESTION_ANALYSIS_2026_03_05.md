# Atlas Data Ingestion — Root Cause Analysis & Alternative Approaches

**Date:** 2026-03-05
**Reviewer:** Claude (Cowork)
**Context:** Codex spent ~2 days (2026-03-02 through 2026-03-04) building increasingly complex workarounds to get USDA NASS data into D1. This document analyzes why it struggled and proposes fundamentally different approaches.

---

## Timeline of the Struggle

| When | What Codex Did | Outcome |
|------|---------------|---------|
| Mar 2, ~14:00 ET | Built API-based ingestion: per-state, per-year chunked HTTP calls to NASS API, each result written to D1 via Worker endpoint | Worked for small runs (1 state, 1 year). Failed at scale — 500 errors, timeouts |
| Mar 3, 14:10 ET | Diagnosed backfill as "primary blocker." Built `backfill-top20.sh` — bash script calling Worker ingest endpoint per state/year chunk with 900s timeout | 5-year chunks failed (500). 1-year chunks succeeded but took hours for 20 states |
| Mar 3, 16:16 ET | Added admin token auth, manual backfill workflow. Tried staged rollout: IL canary → 3-state → 20-state | Canary succeeded. Full 20-state run launched, still running at 2+ hours |
| Mar 3, 16:48 ET | Added `FALLBACK_BY_SERIES` — if a state/year fails, retry one series at a time | Partial improvement. Some states still returned 500s |
| Mar 3, 18:13 ET | **Ryan suggested looking for bulk downloads.** Codex discovered NASS publishes .gz bulk files. Built `backfill-nass-bulk.mjs` — downloads .gz, parses TSV, POSTs to Worker API | Fundamental improvement in data acquisition. But still routes writes through Worker API |
| Mar 3, 19:10 ET | Built `backfill-orchestrator.mjs` — meta-orchestrator with D1-backed progress ledger, resume/retry, per-state-per-year tracking | Third layer of complexity. Spawns child processes. 480-minute GitHub Actions timeout |
| Mar 4, 10:03 ET | Added atomic upserts (INSERT ON CONFLICT DO UPDATE), unique index with duplicate cleanup | Fixed data integrity. Did not fix throughput |

**Pattern:** Each iteration added complexity on top of the same fundamental architecture rather than questioning the architecture itself.

---

## Root Cause Analysis

### Root Cause #1: Row-at-a-Time Writes Through the Worker

This is the single biggest problem. Every data point — whether sourced from the NASS API or the bulk .gz files — flows through the same bottleneck:

```
GitHub Actions → Node.js script → HTTP POST → Worker → upsertDataPoint() → D1
```

The `upsertDataPoint()` function (ingest.ts:308-327) executes one prepared statement per row:

```typescript
const write = await db
  .prepare(`INSERT INTO data_points (series_id, geo_key, as_of_date, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(series_id, geo_key, as_of_date)
     DO UPDATE SET value = excluded.value
     WHERE ABS(COALESCE(data_points.value, 0) - COALESCE(excluded.value, 0)) >= 0.001`)
  .bind(seriesId, geoKey, asOfDate, value)
  .run();
```

The "bulk" endpoint (`ingestBulkDataPoints`, ingest.ts:623-670) is bulk in name only — it still loops through rows and calls `upsertDataPoint()` once per row. For a batch of 500 rows, that's 500 sequential D1 write operations.

**Impact math:** NASS tracks 5 series × 20 states × ~30 years × ~100 counties/state = potentially ~300,000 county-level data points, plus ~3,000 state-level points. At ~5ms per individual upsert, that's ~25 minutes of pure D1 write time — assuming no network overhead, no retries, and no failures. In reality, with the HTTP roundtrips, it takes hours.

### Root Cause #2: D1 is Single-Threaded

From Cloudflare's own docs: "Each individual D1 database is inherently single-threaded, and processes queries one at a time." D1 is backed by a single Durable Object. There is no parallelism for writes.

This means 300K sequential INSERT statements will always be slow regardless of how cleverly you chunk, retry, or orchestrate them. The only way to speed it up is to reduce the number of round-trips — either by batching statements or by bypassing the Worker entirely.

### Root Cause #3: Worker Execution Constraints

Cloudflare Workers have hard limits that constrain throughput:

- **30-second max SQL query duration** — limits batch size
- **1,000 queries per Worker invocation** — hard cap on DB operations per request
- **100KB max SQL statement length** — limits multi-row INSERT sizes
- **CPU time limits** — Worker must serialize results, parse responses, handle errors for each row

The current architecture uses the Worker as a mandatory intermediary for every write operation. The Worker was designed to serve the frontend SPA, not to be a bulk data pipeline.

### Root Cause #4: No Use of D1's Built-In Bulk Import

Cloudflare provides two purpose-built mechanisms for bulk loading data into D1 that were never used:

1. **`wrangler d1 execute --file`** — Accepts a .sql file up to 5GB. Executes directly against D1, bypassing the Worker entirely. Supports multi-row INSERTs, transactions, whatever SQL you want.

2. **D1 REST API Import** — A 4-step pipeline (init → upload to R2 → start ingestion → poll) designed specifically for bulk data. Handles arbitrarily large imports via R2 staging.

Neither was explored. Instead, Codex built three layers of Node.js + bash scripts to push data through the Worker's HTTP API one row at a time.

### Root Cause #5: No Use of `db.batch()`

D1's Worker binding API supports `db.batch()` — which executes multiple prepared statements in a single round-trip. Even if you keep the Worker in the loop, batching 100 upserts into a single `db.batch()` call would reduce round-trips by 100×. The current code never uses this.

---

## Proposed Alternative Approaches

### Option A: Direct SQL Import via Wrangler (Recommended for Backfill)

**Concept:** Skip the Worker entirely. Download NASS bulk files, parse them offline, generate a .sql file, and import directly via `wrangler d1 execute --file`.

**Pipeline:**
```
GitHub Actions → Download .gz files → Parse TSV → Generate .sql file → wrangler d1 execute --file --remote
```

**Implementation sketch:**
1. Download the NASS .gz files (existing `backfill-nass-bulk.mjs` already does this)
2. Parse and filter to relevant series/states/counties (existing code already does this)
3. Instead of POSTing to the Worker, emit SQL statements to a .sql file:
   ```sql
   INSERT INTO data_points (series_id, geo_key, as_of_date, value)
   VALUES (1, '17001', '2020', 215.0)
   ON CONFLICT(series_id, geo_key, as_of_date)
   DO UPDATE SET value = excluded.value
   WHERE ABS(COALESCE(data_points.value, 0) - COALESCE(excluded.value, 0)) >= 0.001;
   ```
4. Run `npx wrangler d1 execute atlas-db --remote --file=backfill.sql`

**Advantages:**
- No Worker in the loop. No HTTP overhead. No execution time limits.
- 5GB file limit is more than enough for this dataset
- Can run as a single GitHub Actions step
- Dead simple. Eliminates the orchestrator, progress ledger, retry logic — all of it.
- Wrangler handles batching and transaction management internally

**Disadvantages:**
- Requires wrangler auth in CI (already have this)
- Need to know the series_id values in advance (can query them first, or hardcode since the catalog is stable)
- No per-row error reporting (but you get transactional consistency instead)

**Estimated effort:** ~4 hours to refactor `backfill-nass-bulk.mjs` to emit .sql instead of HTTP POSTs.

### Option B: D1 REST API Bulk Import (Best for Programmatic Pipelines)

**Concept:** Use Cloudflare's purpose-built bulk import API, which stages data via R2 before ingesting.

**Pipeline:**
```
GitHub Actions → Download .gz → Parse → Generate SQL string → Init upload → Upload to R2 → Start ingestion → Poll until complete
```

This is exactly what the Cloudflare docs tutorial covers. The API handles:
- Uploading arbitrarily large SQL payloads via R2 staging
- Atomic ingestion with rollback on failure
- Progress polling

**Advantages:**
- No Worker in the loop
- Handles very large imports
- Atomic — either all rows import or none do
- Built-in progress tracking via polling

**Disadvantages:**
- More complex than wrangler CLI
- Requires Cloudflare API token with D1 edit permissions (already have this)

**Estimated effort:** ~6 hours.

### Option C: Use `db.batch()` in the Worker (Minimal Change)

**Concept:** Keep the existing Worker-based pipeline but batch writes using D1's batch API.

**Change:** Replace the per-row `upsertDataPoint()` loop with:
```typescript
const statements = rows.map(row =>
  db.prepare(`INSERT INTO data_points ...`).bind(seriesId, geoKey, asOfDate, value)
);
// Execute up to 1000 statements in a single round-trip
const batchSize = 500;
for (let i = 0; i < statements.length; i += batchSize) {
  await db.batch(statements.slice(i, i + batchSize));
}
```

**Advantages:**
- Minimal code change — just wrap existing prepared statements in batch()
- Reduces D1 round-trips by ~500× per request
- Keeps existing auth, logging, error handling

**Disadvantages:**
- Still limited by 1,000 queries per Worker invocation
- Still has Worker CPU time limits
- Doesn't solve the HTTP overhead from GHA → Worker

**Estimated effort:** ~2 hours.

### Option D: R2 as Staging Area + Cron Worker (Best for Ongoing Ingestion)

**Concept:** Decouple data acquisition from data loading. Upload parsed data to R2, then have a scheduled Worker pull from R2 and write to D1 at its own pace.

**Pipeline:**
```
GitHub Actions → Download .gz → Parse → Upload JSON/SQL to R2 bucket
Cron Worker (every hour) → Read from R2 → batch() into D1 → Delete processed file from R2
```

**Advantages:**
- Fully decoupled — download failures don't affect DB writes
- Worker runs on a schedule, no HTTP timeout pressure
- R2 provides durable staging — retries are free
- Can process incrementally across multiple cron invocations

**Disadvantages:**
- More architectural complexity
- Need R2 bucket + Cron Trigger setup
- Two moving pieces instead of one

**Estimated effort:** ~8 hours.

### Option E: Hybrid (Recommended Overall)

**Concept:** Use Option A (wrangler direct import) for the one-time historical backfill, and Option C (db.batch()) for ongoing incremental ingestion.

**Rationale:** The historical backfill is a one-time operation where throughput matters and the Worker adds no value. Ongoing ingestion (new year's data, refreshes) is smaller in volume and benefits from the Worker's auth, logging, and error handling — but should use batched writes.

**Pipeline:**
```
One-time backfill:
  GitHub Actions → Download NASS bulk .gz → Parse → Generate .sql → wrangler d1 execute --file

Ongoing (annual):
  Cron → Worker /api/v1/ingest → ingestNass() with db.batch() → D1
```

**Estimated effort:** ~6 hours total (4 for backfill script, 2 for batch() retrofit).

---

## What to Delete After Implementing

If Option A or E is adopted, the following can be removed or significantly simplified:

| File | Status |
|------|--------|
| `scripts/backfill-orchestrator.mjs` (566 lines) | **Delete** — replaced by wrangler direct import |
| `scripts/backfill-top20.sh` (156 lines) | **Delete** — the API-chunking approach is obsolete |
| `.github/workflows/backfill-orchestrator.yml` | **Delete** or replace with simpler workflow |
| `.github/workflows/backfill-top20.yml` | **Delete** |
| Progress ledger API in Worker (`/api/v1/ingest/progress`) | **Delete** — no longer needed |

**Net effect:** Remove ~800 lines of orchestration complexity and replace with a single script that generates .sql and runs wrangler.

---

## Comparison Matrix

| Criteria | Current Approach | Option A (wrangler) | Option B (REST API) | Option C (batch) | Option D (R2+Cron) | Option E (Hybrid) |
|----------|-----------------|--------------------|--------------------|-----------------|-------------------|------------------|
| Backfill speed | Hours | Minutes | Minutes | ~30 min | ~1 hour | Minutes (backfill) |
| Ongoing speed | Minutes/state | N/A (manual) | N/A (manual) | Seconds | Minutes | Seconds |
| Code complexity | ~1,200 lines across 4 files | ~200 lines | ~300 lines | ~50 line diff | ~400 lines | ~250 lines |
| Worker dependency | Yes | No | No | Yes | Partial | Partial |
| Error granularity | Per-row | Per-file | Per-import | Per-batch | Per-batch | Mixed |
| Resume/retry | Custom progress ledger | Re-run file | Re-run import | Re-run request | R2 staging | Re-run file |
| Setup needed | Already exists | Wrangler in CI | API token + script | Code change | R2 + Cron Trigger | Wrangler in CI |

---

## Recommendation

**Go with Option E (Hybrid).** Two concrete next steps:

1. **Immediate (backfill):** Modify `backfill-nass-bulk.mjs` to write a .sql file instead of POSTing to the Worker. Add a GHA workflow step that runs `wrangler d1 execute --file`. Delete the orchestrator, progress ledger, and bash backfill script.

2. **Follow-up (ongoing ingestion):** Refactor `ingestBulkDataPoints()` in ingest.ts to use `db.batch()` for writes. Group rows into batches of 500, execute as a single batch operation. This makes the incremental Worker-based ingestion ~500× faster with a ~50-line code change.

This eliminates ~800 lines of workaround code, reduces backfill from hours to minutes, and makes ongoing ingestion fast enough that no orchestration layer is needed.
