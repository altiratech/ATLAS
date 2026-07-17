# Atlas RyanJameson Domain Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Altira Atlas canonically at `https://atlas.ryanjameson.me` without breaking its Worker API, D1 data, Secrets Store bindings, cron, or existing hostnames, then update the personal portfolio link.

**Architecture:** Use a two-release Worker cutover. The compatibility release adds the personal custom domain while leaving `atlas.altiratech.com` canonical; after live proof, the canonicalization release makes the personal hostname canonical and treats both existing AltiraTech hostnames as web-only legacy redirect origins while preserving `/api/*` on all three routes. The portfolio moves only after the canonical release passes live verification.

**Tech Stack:** Cloudflare Workers, Wrangler custom domains, Hono, D1, Workers Assets, TypeScript, React, Node test runner, Astro portfolio, Vitest, Playwright.

## Global Constraints

- Do not change Worker name `farmland-terminal`, D1 database ID `3090091d-6beb-47dc-b5e5-f8f8c2fb7df0`, Secrets Store IDs/names, cron `0 6 * * *`, API paths, or anonymous-session posture.
- Preserve `https://atlas.altiratech.com` and `https://farmland.altiratech.com` throughout deployment and observation.
- Before canonicalization, the new hostname must return HTTPS 200, API health 200, and pass a complete browser workflow.
- After canonicalization, both legacy roots must return 308 to `https://atlas.ryanjameson.me` with path/query preserved; legacy `/api/*` endpoints must remain active.
- Keep browser API traffic same-origin. Do not introduce a separate API hostname.
- Preserve the current CORS policy in this domain-only slice; CORS hardening requires a separately scoped compatibility review.
- Do not change product positioning, visual design, data, or application functionality beyond factual hostname references and the existing migration notice.
- Keep the last pre-change Worker version `d2f12abd-6afe-4c01-b3ce-95ef9ffc23fd` available for emergency rollback.

---

### Task 1: Add the personal hostname as a compatibility route

**Files:**
- Create: `deploy/cloudflare-worker/tests/domain-contract.test.mjs`
- Modify: `deploy/cloudflare-worker/package.json`
- Modify: `deploy/cloudflare-worker/wrangler.toml`

**Interfaces:**
- Consumes: the existing `farmland-terminal` Worker and its two custom domains.
- Produces: an additive third custom-domain route while `CANONICAL_HOST` remains `atlas.altiratech.com`.

- [x] **Step 1: Write the failing compatibility-route contract**

Create a Node test that reads `wrangler.toml` and asserts all three `custom_domain = true` routes exist, `CANONICAL_HOST = "atlas.altiratech.com"`, and `LEGACY_HOST = "farmland.altiratech.com"` remain unchanged.

- [x] **Step 2: Verify RED**

Run: `node --test tests/domain-contract.test.mjs`

Expected: FAIL because `atlas.ryanjameson.me` is absent.

- [x] **Step 3: Add the route and test command**

Add `{ pattern = "atlas.ryanjameson.me", custom_domain = true }` to `routes` without changing bindings or variables. Add `"test:domain": "node --test tests/domain-contract.test.mjs"` to `package.json`.

- [x] **Step 4: Verify GREEN and build integrity**

Run: `npm run test:domain && npm run typecheck && npm run build:frontend && npx wrangler deploy --dry-run`

Expected: domain contract passes, TypeScript exits 0, frontend builds, and Wrangler validates all bindings/routes without deployment.

- [x] **Step 5: Commit, publish, merge, and verify compatibility deployment**

Commit only the plan, contract, package, and Wrangler changes. Push the branch, open a PR, verify the diff, merge it, and wait for the main deployment workflow. Then run:

```bash
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://atlas.ryanjameson.me/
curl -sS https://atlas.ryanjameson.me/api/v1/health
ATLAS_BASE_URL=https://atlas.ryanjameson.me ./scripts/smoke-release.sh
```

Expected: `200 0`, health JSON with `status: ok`, and every smoke check passes while `atlas.altiratech.com` still returns its own 200 root.

### Task 2: Canonicalize host routing and operational defaults

**Files:**
- Modify: `deploy/cloudflare-worker/tests/domain-contract.test.mjs`
- Modify: `deploy/cloudflare-worker/src/index.ts`
- Modify: `deploy/cloudflare-worker/wrangler.toml`
- Modify: `deploy/cloudflare-worker/scripts/check-domain-migration.sh`
- Modify: `deploy/cloudflare-worker/scripts/smoke-release.sh`
- Modify: `deploy/cloudflare-worker/scripts/backfill-top20.sh`
- Modify: `deploy/cloudflare-worker/scripts/backfill-nass-bulk.mjs`
- Modify: `deploy/cloudflare-worker/scripts/backfill-orchestrator.mjs`
- Modify: `deploy/cloudflare-worker/scripts/ingest-industrial-eia.mjs`
- Modify: `deploy/cloudflare-worker/src/services/ingest.ts`
- Modify: `deploy/cloudflare-worker/README.md`
- Modify: `README.md`
- Modify: `frontend/src/app/shell.jsx`
- Modify: `frontend/src/shared/system.jsx`

**Interfaces:**
- Consumes: the live, already-proven personal custom domain from Task 1.
- Produces: `CANONICAL_HOST = "atlas.ryanjameson.me"` and comma-separated `LEGACY_HOSTS = "atlas.altiratech.com,farmland.altiratech.com"`; non-API legacy requests redirect, API requests remain served in place.

- [x] **Step 1: Rewrite the domain contract for final behavior**

Assert the personal hostname is canonical, both legacy hosts are configured, deprecated single-host configuration is absent, all operational script defaults use the personal hostname, the migration checker validates both legacy hosts, and visible canonical references use `atlas.ryanjameson.me`.

- [x] **Step 2: Verify RED**

Run: `npm run test:domain`

Expected: FAIL on the old canonical host and single legacy-host variable.

- [x] **Step 3: Implement minimal multi-legacy routing**

Add `LEGACY_HOSTS?: string` to Worker bindings. Parse comma-separated legacy hosts into a set, retain optional `LEGACY_HOST` compatibility in code only, and redirect any non-API request whose `Host` is in that set to the canonical host with status 308 and the existing `legacy_redirect=1` marker. Preserve request path/query and leave `/api/*` untouched.

- [x] **Step 4: Update canonical operational and visible references**

Make the personal hostname the first smoke target and default base URL. Make the migration checker loop over both legacy bases. Update the ingestion user agent/data-source reference, README deployment notes, migration banner, and system display. Do not alter historical review documents.

- [x] **Step 5: Verify GREEN, local behavior, and complete suites**

Run:

```bash
npm run test:domain
npm run typecheck
npm run build:frontend
npx wrangler deploy --dry-run
cd ../../backend && python3 -m pytest tests -q
```

Expected: domain contract passes, build/dry-run exit 0, and backend reports 91 passed.

- [x] **Step 6: Commit, publish, merge, and verify canonical deployment**

Push a new branch from updated `origin/main`, open and merge the canonicalization PR, and wait for the main deployment workflow. Verify:

```bash
./scripts/check-domain-migration.sh \
  https://atlas.ryanjameson.me \
  https://atlas.altiratech.com \
  https://farmland.altiratech.com
ATLAS_BASE_URL=https://atlas.ryanjameson.me ./scripts/smoke-release.sh
```

Expected: canonical root/API pass; both old roots redirect 308 with path/query preserved; both old API health endpoints return 200.

### Task 3: Move the portfolio action after live proof

**Files:**
- Modify: `/Users/ryanjameson/Desktop/Lifehub/Code/active/ryanjameson.me/tests/unit/projects-index-contract.test.ts`
- Modify: `/Users/ryanjameson/Desktop/Lifehub/Code/active/ryanjameson.me/src/data/projects.ts`
- Modify: `/Users/ryanjameson/Desktop/Lifehub/Code/active/ryanjameson.me/docs/project-hosting-migration-inventory.md`
- Modify: `/Users/ryanjameson/Desktop/Lifehub/Code/active/ryanjameson.me/CURRENT_STATUS.md`

**Interfaces:**
- Consumes: a verified canonical Atlas hostname.
- Produces: the public portfolio action points only to `https://atlas.ryanjameson.me`; the inventory records the new canonical and both rollback/compatibility paths.

- [x] **Step 1: Create an isolated portfolio worktree**

From the clean portfolio `main`, create `/private/tmp/ryanjameson-me-atlas-domain-2026-07-17` on branch `codex/portfolio-atlas-domain-2026-07-17`, install dependencies, and confirm the focused contract is green before editing.

- [x] **Step 2: Change the approved-action test first**

Replace `https://atlas.altiratech.com` with `https://atlas.ryanjameson.me` in the approved action set.

- [x] **Step 3: Verify RED**

Run: `npm run test -- tests/unit/projects-index-contract.test.ts`

Expected: FAIL because the Atlas project still exposes the old action.

- [x] **Step 4: Update the project action and internal records**

Change only the Atlas action URL in public project data. Mark the Atlas migration complete in the inventory and update the settled portfolio status without promoting Atlas to the homepage.

- [x] **Step 5: Verify GREEN and full portfolio gates**

Run: `ASTRO_TELEMETRY_DISABLED=1 npm run quality` and the complete Playwright command defined by the repository.

Expected: all unit/content/build gates pass and the browser suite retains only intentional skips.

- [x] **Step 6: Land local main, deploy Pages, and verify click-through**

Fast-forward the verified branch into local `main`, deploy `dist` to the existing `ryanjameson-me` Pages project, and verify the live Projects page contains the personal Atlas URL and no old Atlas action. In Chrome, click the Atlas action at desktop and mobile widths and confirm the application loads with no broken images, overflow, console errors, or failed API calls.

### Task 4: Close evidence and workspace state

**Files:**
- Create: `docs/ATLAS_RYANJAMESON_DOMAIN_VERIFICATION_2026-07-17.md`
- Modify: `CURRENT_STATUS.md`
- Modify: `/Users/ryanjameson/Desktop/Lifehub/SYSTEM/COMPLETION_LOG.md`
- Modify: `/Users/ryanjameson/Desktop/Lifehub/SYSTEM/ACTIVE_WORKSTREAMS.md`

**Interfaces:**
- Consumes: merged commits, deployment IDs/runs, DNS/TLS probes, smoke outputs, and browser evidence.
- Produces: concise settled-state records and no stale active-workstream row.

- [x] **Step 1: Record exact deployment and rollback evidence**

Document custom domains, Worker version/deployment, GitHub workflow runs, redirect/API compatibility matrix, portfolio deployment, Chrome widths, and the retained rollback path.

- [x] **Step 2: Update present-tense status under 30 lines**

State the personal canonical hostname, the two compatibility API hosts and web redirects, unchanged bindings/cron, and the next observation-window action.

- [x] **Step 3: Run the final verification matrix fresh**

Re-run Atlas contract/typecheck/build/backend, canonical smoke, legacy redirect/API checks, portfolio quality, public HTTPS/TLS, and live link inspection. Read every exit code before claiming completion.

- [ ] **Step 4: Commit/merge closeout and write workspace records**

Land the Atlas evidence/status update, add newest-first completion entries for Atlas and the portfolio, and remove only this migration's active-workstream row after the branch lands.

## Self-Review

- Spec coverage: additive compatibility release, canonicalization, dual legacy API preservation, unchanged stateful bindings, portfolio-last cutover, rollback, browser proof, and write-back are all assigned to explicit tasks.
- Placeholder scan: no TBD/TODO/implement-later language remains.
- Type consistency: final Worker configuration uses `CANONICAL_HOST` plus `LEGACY_HOSTS`; code alone retains optional `LEGACY_HOST` compatibility, and every verification command uses the same three-host model.
