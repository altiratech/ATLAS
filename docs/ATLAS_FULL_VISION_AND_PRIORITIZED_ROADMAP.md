# Altira Atlas — Full Vision & Prioritized Implementation Roadmap

**Created:** 2026-03-02 (ET)
**Owner:** Ryan + Claude + Codex
**Status:** Living document — canonical north star + execution priority stack

This document has two purposes:
1. **Preserve the complete product vision** so it never gets lost in sprint plumbing.
2. **Prioritize every feature** by (UX impact × implementation ease), highest first.

---

## Part 1: The North Star Vision

### What Atlas Becomes

Altira Atlas is the **single pane of glass for agriculture intelligence** — a Bloomberg-grade research terminal purpose-built for farmland investors, ag lenders, agtech venture capitalists, and farm operators who need to understand where opportunity and risk are shifting across the entire agriculture ecosystem.

The platform unifies data that today lives in 15+ disconnected sources (USDA-NASS, FRED, CME, county assessor records, PitchBook, Crunchbase, broker PDFs, SSURGO, NOAA) into one dense, keyboard-navigable interface with a core UX principle borrowed from CurrentMarketValuation.com: **every metric tells you where it sits relative to its own history** — z-scores, percentile gauges, standard deviation bands — so a user can glance at any number and instantly know whether it's historically cheap, expensive, or normal.

### Who It Serves (Named Targets)

Institutional decision-makers first (B2B, per D-016):
- **Gladstone Land** (public farmland REIT) — needs county-level cap rate screening, yield trends, fair value modeling
- **Nuveen Natural Capital** (TIAA's farmland arm) — needs portfolio-level analytics, scenario modeling across holdings
- **CalPERS** (pension fund with farmland allocation) — needs risk metrics, diversification analytics, macro context
- **TPG Rise Climate** (climate-focused PE) — needs agtech deal flow intelligence, carbon/ESG overlay
- **CoBank** (Farm Credit System) — needs lending risk metrics, county credit quality, DSCR analysis
- **S2G Ventures** (food/ag VC) — needs agtech company database, deal flow, market sizing

### The Macro Thesis Behind the Product

Agriculture is entering a structural inflection:
- Family farms declining (2.02M in 2018 → 1.87M in 2025) — consolidation accelerating
- Grain prices at historically low levels when inflation-adjusted — mean reversion likely
- Land prices elevated relative to cash flows — cap rate compression
- Immigration policy tightening farm labor supply — automation demand rising
- AgTech VC investment surging — precision ag, biologicals, AI/robotics, alt protein
- Climate volatility increasing — weather risk becoming a first-class investment variable

The platform that provides structured intelligence across all of these dimensions captures an enormous, underserved market. Nobody is building the unified view. Everyone is a point solution.

### The Seven Modules (Complete End-State)

**Module 1: Land Intelligence** (current core — expand)
County→state→parcel land valuations, cap rates, cash rents, fair value modeling, access scoring, comparable sales, tax analysis. Z-score historical context on every metric.

**Module 2: Commodity & Input Pricing**
Spot/futures commodity prices, basis tracking, input costs (fertilizer, seed, fuel, chemicals), margin calculator, seasonal patterns, sensitivity analysis. Published composite agriculture index tracking 3-4 ETFs + third-party indexes.

**Module 3: Soil & Environmental Intelligence**
SSURGO soil data, productivity indices, climate trends (GDD, drought, precipitation), planting decision engine, 30-year climate projections, Monte Carlo yield simulations.

**Module 4: Water & Mineral Rights**
Water rights registry, aquifer depletion tracking, irrigation allocations, mineral lease data, carbon credit program comparison, renewable energy lease rates.

**Module 5: AgTech Research & Intelligence**
CB Insights-style company database (2,000+ profiles), funding history, market sizing by segment, patent landscape, adoption curves, regulatory pipeline. AI-curated news feed.

**Module 6: Deal Flow & Investment Platform**
Farmland deal listings, agtech startup pipeline, fund performance benchmarks, due diligence templates, portfolio analytics. Tools-first, marketplace later (per D-018).

**Module 7: Farm Operations Dashboard**
Field-level yield mapping, input tracking, crop insurance comparison, marketing plan, cash flow projections. Integration with existing FMS (Granular, Climate FieldView, JD Ops Center).

### Core UX Principles

1. **Industrial terminal aesthetic** — dark palette, sharp edges, data-dense, no rounded cards or SaaS softness. IBM Plex fonts. The current look is correct.
2. **CurrentMarketValuation.com paradigm** — every metric shows a gauge/percentile/z-score indicating where it sits relative to its own history. "Is this cheap or expensive relative to the last 10 years?"
3. **Charts below, stats above** — current dashboard layout stays. Charting section sits in a dedicated area below the existing stat cards.
4. **Keyboard-first** — Cmd+K command palette, vim-like navigation, power-user shortcuts.
5. **No fluff** — every pixel earns its place. Institutional users want density, not whitespace.

---

## Part 2: Prioritized Implementation Stack

Scoring: **(UX Impact: 1-5) × (Implementation Ease: 1-5) = Priority Score**

UX Impact: 5 = transformative user experience, 1 = invisible plumbing
Implementation Ease: 5 = can ship in 1-2 days, 1 = months of work + external dependencies

### Tier 1: Ship This Week (Score 15-25)

These are the features that deliver the most visible product improvement with the least effort.

---

**1.1 — Dashboard Charts Section**
Score: 5 × 5 = 25
UX: Immediately transforms the dashboard from a stat card wall into a real analytical tool.
Build: Add a collapsible chart section below the existing dashboard layout using lightweight inline SVG sparklines or a CDN charting library (Chart.js via CDN, already no-build-step pattern). Show 3-4 key time series: median cap rate trend, median land value trend, median cash rent trend, 10Y Treasury overlay.
Effort: ~1 day. Data already exists in the timeseries API. Frontend-only change.

**1.2 — Z-Score / Percentile Badges on All Metrics**
Score: 5 × 4 = 20
UX: This is the CurrentMarketValuation.com insight — instantly communicates "is this high or low relative to history?" on every number.
Build: Backend: add a `/api/v1/geo/{fips}/zscore` endpoint that computes z-score and percentile for each metric using available historical data points. Frontend: render a small color-coded badge (green = below mean, red = above, amber = within 0.5σ) next to every metric value on county detail and dashboard.
Effort: ~2 days. Metric engine already has historical data access. Z-score is `(x - μ) / σ` on the series.

**1.3 — Data Population: Expand to 20 States + Soybeans/Wheat**
Score: 5 × 4 = 20
UX: Eliminates the "mostly N/A" problem that makes the product feel broken. Core acceptance criterion from the 3-week plan.
Build: Expand NASS ingestion config for soybean yield, wheat yield series. Run historical backfill for the top 20 ag states (IA, IL, IN, NE, KS, MN, OH, WI, MO, SD, ND, TX, CA, WA, OR, ID, MT, CO, MI, PA). Dynamic `as_of` year resolution (already identified in 3-week plan Week 1).
Effort: ~2-3 days. Ingestion infrastructure exists; this is config expansion + running the backfill.

**1.4 — Dynamic "As-Of" Year Resolution**
Score: 4 × 5 = 20
UX: Fixes stale hard-coded year defaults. Every API response uses the latest available data year automatically.
Build: Modify read APIs and frontend to resolve latest-available-year per series/county rather than assuming a fixed year.
Effort: ~1 day. Backend change to query max(year) per series.

**1.5 — Agriculture Composite Index Tracker**
Score: 5 × 4 = 20
UX: Gives users a "how is agriculture doing right now?" signal — the kind of headline number that keeps people coming back daily.
Build: Pull daily closes for 3-4 ETFs (DBA - agriculture commodities, MOO - agribusiness equities, CROP - grains, WEAT - wheat) via free Yahoo Finance / yfinance. Compute a simple equal-weight composite. Display as a prominent card on the dashboard with z-score gauge showing where the composite sits relative to its 3-year history. Add sparkline.
Effort: ~2 days. Free data via yfinance, simple composite math, one new dashboard card + one new API endpoint.

---

### Tier 2: Ship This Sprint / Weeks 1-2 (Score 12-16)

---

**2.1 — County Detail Charts (Full Time Series)**
Score: 4 × 4 = 16
UX: County deep dive becomes a real research tool with visual history.
Build: Add Chart.js time series charts on the county detail page showing all available series (cap rate, fair value, land value, cash rent, yields) with 11-year history. Existing sparklines become full interactive charts. Include z-score bands (±1σ, ±2σ) as shaded regions.
Effort: ~2 days. Data already in timeseries API.

**2.2 — Data Coverage Panel**
Score: 3 × 5 = 15
UX: Users immediately understand data completeness. Builds trust.
Build: Add `/api/v1/coverage` endpoint (rows, years, missingness by series/state/county). Render as a compact panel on Dashboard and Screener showing coverage percentage, last update date, data freshness indicators.
Effort: ~1 day. SQL aggregation query + small frontend component.

**2.3 — Screener with Z-Score Filters**
Score: 4 × 4 = 16
UX: Power users can screen for "counties where cap rate is >1σ above mean" — the kind of query that finds opportunities.
Build: Extend screener API to accept z-score range filters (e.g., `?cap_zscore_min=1.0`). Frontend: add z-score filter controls alongside existing state/cap/sort filters.
Effort: ~2 days. Builds on the z-score computation from 1.2.

**2.4 — AI News Feed (AgFunder RSS + USDA Reports)**
Score: 4 × 3 = 12
UX: Gives the platform a "living" feel — there's always something new to read. Keeps users returning.
Build: Backend: add RSS/Atom parser that pulls AgFunderNews, USDA ERS reports, and 2-3 other ag news sources on a cron schedule. Store headlines + links + dates. AI summarization via Claude API for 1-paragraph digests. Frontend: news feed panel on dashboard sidebar or dedicated News view.
Effort: ~3-4 days. RSS parsing is straightforward; Claude API integration for summaries adds complexity but high value.

**2.5 — Scenario Pack Compare Mode (Best/Base/Worst)**
Score: 4 × 3 = 12
UX: One-view comparison of optimistic/base/pessimistic scenarios — the deliverable institutional investors actually want.
Build: Extend scenario API to accept multiple override sets in one call. Frontend: side-by-side table showing fair value under each scenario with delta columns.
Effort: ~2-3 days. Scenario engine exists; this is a multi-run wrapper + comparison UI.

**2.6 — Decision Memo Export**
Score: 4 × 3 = 12
UX: Users can export a structured research memo (Markdown → download) with county data, scenario results, thesis notes, and assumptions embedded. This is the "close the loop" deliverable.
Build: Backend endpoint that assembles county data + scenario results + research workspace notes into a structured Markdown document. Frontend: "Export Memo" button on county detail and research workspace.
Effort: ~2 days. Data assembly + Markdown templating.

---

### Tier 3: Ship Weeks 2-3 (Score 8-12)

---

**3.1 — Research Workspace Enhancements (Thesis Template, Risk Flags, Catalysts)**
Score: 3 × 3 = 9
UX: Makes the research workspace feel like a real analyst tool instead of a simple notes box.
Build: Add structured fields to research workspace: thesis template (bull case / bear case / key risks / catalysts / timeline), risk flag badges, catalyst date tracking. Schema changes to research tables.
Effort: ~2-3 days. Backend schema + API changes + frontend form updates.

**3.2 — AgTech Company Database (Phase 1: Manual + YC Scrape)**
Score: 4 × 2 = 8
UX: First step toward CB Insights-style intelligence. Even 100-200 curated agtech profiles give the platform unique content.
Build: New database table for agtech companies (name, sector, stage, funding, description, website). Seed with Y Combinator agtech directory scrape (~150-200 companies) + manual entry of top 50 known names. Frontend: dedicated "AgTech Intel" nav section with filterable company list.
Effort: ~3-4 days. New schema, scraper, and frontend view.

**3.3 — Sensitivity Output Quality Upgrade**
Score: 3 × 3 = 9
UX: Sensitivity analysis gets plain-language interpretation ("A 1% increase in discount rate reduces fair value by 12%") and key driver ranking.
Build: Post-process sensitivity matrix to generate ranked driver impact list and natural language summary. Frontend: add interpretation panel below the sensitivity grid.
Effort: ~2 days. Math is simple; copy/template work.

**3.4 — Saved Screen + Research Linkage**
Score: 3 × 3 = 9
UX: Users can go from screener results → open scenario for selected counties → save to research workspace in one flow.
Build: Add "Open in Scenario Lab" and "Add to Research" actions on screener result rows. Wire navigation between views with context preservation.
Effort: ~2 days. Cross-view navigation + state passing.

---

### Tier 4: Post-Sprint / Month 2 (Score 4-8)

---

**4.1 — Commodity Futures Data Integration**
Score: 4 × 2 = 8
UX: Real commodity pricing elevates the platform from land-only to full ag intelligence.
Build: Integrate CME futures data (corn, soybeans, wheat, cattle) — start with end-of-day via free/affordable API. Futures curve visualization. Basis tracking by region.
Effort: ~1-2 weeks. New data pipeline, storage, and frontend module. Free data sources exist (Yahoo Finance for delayed; paid APIs for quality).

**4.2 — Input Cost Tracking (Fertilizer, Seed, Fuel)**
Score: 3 × 2 = 6
UX: Completes the margin picture — users see both revenue (commodity prices) and cost (inputs) side.
Build: Ingest USDA-ERS input cost data (fertilizer prices by type, seed costs, fuel). Margin calculator tool.
Effort: ~1 week. USDA-ERS data is free but requires custom parsing.

**4.3 — Interactive Maps (County Choropleth)**
Score: 4 × 2 = 8
UX: Maps are visually compelling and help users identify geographic patterns instantly.
Build: Mapbox GL JS or Deck.gl choropleth layer showing any metric by county. Color-coded by z-score (red = expensive, green = cheap).
Effort: ~1-2 weeks. Requires GeoJSON county boundaries + map rendering integration.

**4.4 — Published Ag Index Page (Public-Facing)**
Score: 3 × 2 = 6
UX: Creates a public-facing "hook" that drives awareness. People link to and reference the index.
Build: Dedicated public page for the Altira Agriculture Index with methodology, daily level, historical chart, component weights. SEO-optimized.
Effort: ~1 week. Builds on the composite index from 1.5 but adds public presentation layer.

**4.5 — Portfolio Analytics Upgrade (HHI, State Exposure, Unrealized P&L)**
Score: 3 × 2 = 6
UX: Existing portfolio manager gets institutional-grade analytics.
Build: Enhance portfolio detail view with geographic concentration heatmap, crop exposure breakdown, yield attribution, historical portfolio value tracking.
Effort: ~1 week. Portfolio engine exists; this is analytics layer enhancement.

---

### Tier 5: Months 3-6 (Score 2-6)

---

**5.1 — SSURGO Soil Data Layer**
Score: 3 × 1 = 3
UX: Soil productivity data is the gold standard for farmland valuation precision.
Build: Bulk load SSURGO/gSSURGO data for tracked counties. Compute productivity indices (CSR2, PI). Display on county detail.
Effort: ~3-4 weeks. SSURGO data is massive and complex (spatial joins, soil map units).

**5.2 — Climate Risk Layer (NOAA + PRISM)**
Score: 3 × 1 = 3
UX: Climate trends become visible alongside financial metrics — critical for long-term farmland valuation.
Build: Ingest NOAA historical climate data, PRISM growing season metrics, Palmer Drought Index. Integrate into county detail as a "Climate" tab.
Effort: ~3-4 weeks. Multiple data sources with different formats and granularity.

**5.3 — Parcel-Level Data (Regrid Integration)**
Score: 4 × 1 = 4
UX: The "Zillow for farmland" layer — actual parcel boundaries, ownership, sale history.
Build: Regrid API integration for parcel boundaries and ownership data (per D-020). Layer own analytics on top.
Effort: ~4-6 weeks. API integration + data licensing + frontend map rendering.

**5.4 — Natural Language Query (Claude API)**
Score: 5 × 1 = 5
UX: "Show me Iowa counties where corn yields grew >3% annually and cash rents are below state median" — typed in plain English.
Build: Claude API-powered query layer over the full data lake (per D-021). Requires solid data foundation first.
Effort: ~4-8 weeks. Prompt engineering, query-to-SQL translation, result formatting, guardrails.

**5.5 — AgTech VC Deal Flow Database (Paid Sources)**
Score: 3 × 1 = 3
UX: Institutional-grade venture data — full funding rounds, cap tables, investor profiles.
Build: Crunchbase API ($500+/mo) or PitchBook ($25K+/yr) integration. Company enrichment pipeline.
Effort: ~4-6 weeks + ongoing data licensing costs.

**5.6 — Water Rights & Carbon Credit Intelligence**
Score: 2 × 1 = 2
UX: Niche but high-value for specialized investors (western states water, ESG/carbon).
Build: State water rights database integration, carbon credit program comparison engine.
Effort: ~6-8 weeks. Highly fragmented data across 50 state systems.

**5.7 — Farm Operations Dashboard**
Score: 2 × 1 = 2
UX: Serves a different user (the operator, not the investor). Important for long-term TAM expansion but not core to V1 positioning.
Build: Field-level tracking, FMS integrations (Granular, FieldView, JD). Full operational layer.
Effort: ~3-6 months. Requires third-party API partnerships.

**5.8 — Deal Flow Marketplace**
Score: 3 × 1 = 3
UX: The "AngelList for agriculture" layer — listings, deal rooms, investor matching.
Build: Marketplace infrastructure, deal listing workflow, due diligence rooms. Requires securities compliance partnership (per D-019).
Effort: ~6-12 months. Platform infrastructure + legal/compliance partnership.

---

## Part 3: Implementation Phases (Time-Bound)

### Phase 0: This Week (Mar 2-8) — "Make It Real"
Ship: 1.1, 1.2, 1.3, 1.4, 1.5
Goal: Dashboard has charts. Every metric has a z-score badge. Data covers 20 states. Ag index exists.
User test: "Open the dashboard and within 5 seconds understand whether farmland is cheap or expensive right now."

### Phase 1: Weeks 2-3 (Mar 9-22) — "Make It Useful"
Ship: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4
Goal: Full research workflow (discover → analyze → model → export memo). News feed live. AgTech intel seeded.
User test: "Start from the screener, find an interesting county, run 3 scenarios, save a thesis, export a decision memo — all without leaving the app."

### Phase 2: Month 2 (Mar 23 - Apr 22) — "Make It Indispensable"
Ship: 4.1, 4.2, 4.3, 4.4, 4.5
Goal: Commodity data live. Interactive maps. Published ag index page. Portfolio analytics upgraded.
User test: "Check commodity prices, see margin implications for a county, view geographic patterns on a map, share the ag index page with a colleague."

### Phase 3: Months 3-6 — "Make It Dominant"
Ship: 5.1-5.8 based on user feedback priority
Goal: Full-stack agriculture intelligence. Soil, climate, parcels, NLP queries, deal flow.
User test: "Ask a natural language question about any county, get a data-backed answer with sources, parcels, and climate context."

---

## Part 4: Data Source Stack

### Free / Phase 1 ($0/month)
- USDA NASS API — crop production, acreage, yields, cash rents, land values
- FRED API — commodity prices, treasury rates, farm input costs
- Yahoo Finance (yfinance) — ETF closes for composite index (DBA, MOO, CROP, WEAT)
- Y Combinator directory — 150-200 agtech company profiles
- AgFunderNews RSS — deal flow headlines
- USDA ERS reports — farm economics context
- NOAA API — weather/climate data

### Growth / Phase 2 ($150-300/month)
- IEX Cloud ($9/mo) — deeper ETF/company data
- OpenWeatherMap ($30-50/mo) — historical weather depth
- AngelList API ($100-300/mo) — early-stage startup data

### Enterprise / Phase 3 ($500+/month)
- Crunchbase API ($500+/mo) — comprehensive startup data
- Regrid API ($500+/mo) — parcel boundaries and ownership
- PitchBook ($25K+/yr) — institutional-grade cap table/deal data

---

## Part 5: Design Decisions Lock-In

These are resolved. Don't re-litigate.

| Decision | Resolution | Reference |
|---|---|---|
| Dashboard layout | Keep current. Charts go BELOW existing stat cards. | User directive |
| UI aesthetic | Industrial terminal. Dark, sharp, dense. No SaaS softness. | D-022, D-023 |
| Z-score framework | Apply to every metric. CurrentMarketValuation.com paradigm. | User directive |
| Proprietary index | Published. Start with 3-4 ETFs + third-party indexes. | User directive |
| News curation | Algorithmic / AI-powered agentic scanning. Not editorial. | User directive |
| AgTech data | Swim with the current — free sources first, paid when PMF proven. | User directive |
| Target users | B2B institutional first (Gladstone, Nuveen, CalPERS, TPG, CoBank, S2G). | D-016 |
| GTM sequence | Data/tools → listings → transactions (Zillow evolution). | D-018 |
| Parcel data | Partner with Regrid when ready. | D-020 |
| AI layer | Claude API on top of complete data lake. Data first. | D-021 |
| Auth | Session-based, CF Access in production. | D-028, D-033 |
| Deploy | GitHub Actions CI/CD → Cloudflare Workers. | D-036 |

---

*This document is the canonical north star. The 3-week plan in `ATLAS_CANONICAL_SCOPE_AND_3_WEEK_PLAN.md` is the near-term execution slice. Both should be read together. The vision is enormous — the sequencing is disciplined.*
