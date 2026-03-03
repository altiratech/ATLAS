# Altira Atlas Cloudflare Deploy Profile

Cloudflare Workers deployment profile for Altira Atlas.

## Purpose
- Host API + static frontend on Cloudflare Workers/D1.
- Keep deployment-specific config isolated from desktop/local app runtime.

## Commands
- Install deps: `npm install`
- Local dev: `npm run dev`
- Deploy: `npm run deploy`
- Domain migration check: `./scripts/check-domain-migration.sh`
- Production smoke checks: `./scripts/smoke-release.sh`
- Top-20 backfill: `./scripts/backfill-top20.sh [start_year] [end_year] [chunk_size]`

## Production Backfill Setup
1. Configure an ingest admin secret on the Worker (never commit this in `wrangler.toml`):
   - `npx wrangler secret put INGEST_ADMIN_TOKEN`
2. Add the same value to GitHub repo secret `ATLAS_INGEST_ADMIN_TOKEN` (repo: `altiratech/ATLAS`).
3. If Cloudflare Access is enabled at the edge for Atlas routes, create a service token in the Access app and add GitHub secrets:
   - `ATLAS_CF_ACCESS_CLIENT_ID`
   - `ATLAS_CF_ACCESS_CLIENT_SECRET`
4. Trigger workflow: `Actions` -> `Backfill Top-20 Atlas Data` -> `Run workflow`.
5. Optional local operator run:
   - `ATLAS_INGEST_ADMIN_TOKEN=\"<token>\" ATLAS_CF_ACCESS_CLIENT_ID=\"<id>\" ATLAS_CF_ACCESS_CLIENT_SECRET=\"<secret>\" ATLAS_BACKFILL_STATES=\"IA,IL,IN\" ./scripts/backfill-top20.sh 2005 2026 1`
6. Recommended default is `chunk_size=1` plus state-by-state orchestration (script now calls one state per request) to avoid long-run request failures.

## Ingest Endpoint Auth Modes
- Session mode (existing): `Authorization: Bearer <atlas_session_token>`
- Admin mode (new): `X-Atlas-Ingest-Token: <INGEST_ADMIN_TOKEN>`
- If the admin secret is not configured, the endpoint stays session-only.
- If Cloudflare Access protects the hostname, include service token headers (`CF-Access-Client-Id`, `CF-Access-Client-Secret`) for automation.
- Ingest supports optional query scoping for backfill orchestration:
  - `states=IA,IL`
  - `include_nass=0|1`
  - `include_fred=0|1`
  - `include_ag_index=0|1`

## Notes
- Canonical project root remains `Code/active/farmland-terminal`.
- Canonical web domain: `https://atlas.altiratech.com`
- Legacy domain compatibility: `https://farmland.altiratech.com` (`/api/*` remains active; web routes redirect to canonical)
- Do not commit `node_modules` or `.wrangler` state.
