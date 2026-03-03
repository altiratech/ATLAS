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
3. Trigger workflow: `Actions` -> `Backfill Top-20 Atlas Data` -> `Run workflow`.
4. Optional local operator run:
   - `ATLAS_INGEST_ADMIN_TOKEN=\"<token>\" ./scripts/backfill-top20.sh 2005 2026 5`

## Ingest Endpoint Auth Modes
- Session mode (existing): `Authorization: Bearer <atlas_session_token>`
- Admin mode (new): `X-Atlas-Ingest-Token: <INGEST_ADMIN_TOKEN>`
- If the admin secret is not configured, the endpoint stays session-only.

## Notes
- Canonical project root remains `Code/active/farmland-terminal`.
- Canonical web domain: `https://atlas.altiratech.com`
- Legacy domain compatibility: `https://farmland.altiratech.com` (`/api/*` remains active; web routes redirect to canonical)
- Do not commit `node_modules` or `.wrangler` state.
