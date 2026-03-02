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

## Notes
- Canonical project root remains `Code/active/farmland-terminal`.
- Canonical web domain: `https://atlas.altiratech.com`
- Legacy domain compatibility: `https://farmland.altiratech.com` (`/api/*` remains active; web routes redirect to canonical)
- Do not commit `node_modules` or `.wrangler` state.
