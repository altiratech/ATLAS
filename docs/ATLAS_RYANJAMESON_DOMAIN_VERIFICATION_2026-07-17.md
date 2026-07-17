# Atlas personal-domain verification — 2026-07-17

## Settled result

- Canonical application: `https://atlas.ryanjameson.me`
- Compatibility hosts: `https://atlas.altiratech.com` and `https://farmland.altiratech.com`
- Legacy browser GET requests redirect with HTTP 308 to the personal hostname while preserving path and query and adding `legacy_redirect=1`.
- Legacy `/api/*` requests remain served in place. D1, Secrets Store, anonymous sessions, Worker name, and the daily `0 6 * * *` cron were not changed.

## Releases and rollback

| Stage | Git / deployment evidence | Worker version |
|---|---|---|
| Pre-change rollback | retained production version | `d2f12abd-6afe-4c01-b3ce-95ef9ffc23fd` |
| Add personal compatibility route | PR #1, merge `e6ac0d8e807aa7bb30fb97157ba707f4686ff535`, Actions run `29579056778` | `c2e1f276-187c-4796-956f-f7a89261a501` |
| Make personal host canonical | PR #2, merge `7439bae443fd9badc2c7515bd042796c122b1cd6`, Actions run `29579800756` | `517d8f40-cbb3-426e-939b-bca72d4122f5` |

The canonical release log confirms all three custom-domain routes and the unchanged D1, Secrets Store, assets, and cron bindings. Its production smoke suite passed health, as-of metadata, coverage, freshness, agricultural index, anonymous bootstrap, protected write behavior, and the rendered application shell.

## Live edge matrix

Verified after the canonical release:

| Surface | Result |
|---|---|
| `atlas.ryanjameson.me/` | HTTPS 200, TLS verification 0 |
| `atlas.ryanjameson.me/api/v1/health` | 200, `status: ok`, Worker runtime `0.3.0` |
| `atlas.altiratech.com/path?x=1` | 308 to `https://atlas.ryanjameson.me/path?x=1&legacy_redirect=1` |
| `farmland.altiratech.com/path?x=1` | 308 to `https://atlas.ryanjameson.me/path?x=1&legacy_redirect=1` |
| Both legacy `/api/v1/health` endpoints | 200 |

Cloudflare and Google public resolvers returned `104.21.63.211` and `172.67.150.95`. The local Mac retained a negative DNS cache during terminal verification, so canonical curl proof used public resolver results with `--resolve`; the GitHub runner and Chrome resolved the hostname normally.

The migration checker now uses a browser-equivalent GET instead of HEAD because Cloudflare Workers Assets can answer HEAD requests before the redirect middleware. Its regression contract requires GET semantics.

The corrected migration checker and the complete canonical smoke script both passed again during closeout, including the five read endpoints, anonymous bootstrap, protected-write responses, and rendered shell.

## Portfolio release

- Portfolio commit: `f61e7daba0cc73b95d38c6908c8024e8c08bd30a`
- Production Pages deployment: `b7e53a52-cdb7-479a-80df-ddb1e4f2fe96`
- Production preview URL: `https://b7e53a52.ryanjameson-me.pages.dev`
- The apex and `www` project pages return HTTPS 200 and expose only `https://atlas.ryanjameson.me` for the Atlas action.
- Portfolio quality passed: Astro diagnostics 0/0/0, 23 Vitest tests, production build, and 92 Playwright checks with two existing intentional skips.

Live Chrome at 1440px verified the portfolio action, a successful new-tab load of Atlas, no horizontal overflow, all six project images loaded without failures, and no warning/error console entries on either page. The automated `mobile-chrome` project separately passed the full responsive matrix, including 390x844; the Chrome extension's temporary viewport control did not resize the existing browser window, so no unsupported live-mobile claim is made.

## Observation window

Keep both AltiraTech compatibility routes and the retained pre-change Worker version until API consumers and rollback needs are reviewed deliberately. Do not retire either legacy host as part of this migration closeout.
