# Altira Atlas — Full Vision & Prioritized Implementation Roadmap

**Created:** 2026-03-02 (ET)
**Revised:** 2026-03-17 (ET) — Geo/opportunity boundary clarification + thesis layer
**Owner:** Ryan + Claude + Codex
**Status:** Living document — canonical north star + execution priority stack

This document has two purposes:
1. **Preserve the complete product vision** so it never gets lost in sprint plumbing.
2. **Prioritize every feature** by (UX impact × implementation ease), highest first.

### Revision Note (2026-03-17)

Atlas is now explicitly defined as the Altira suite's **geo/opportunity underwriting module** for location-sensitive real assets.

That means:
- Atlas owns geography-level opportunity discovery, geo-level evidence, underwriting, research/decision capture, and portfolio exposure.
- Atlas does **not** own parcel-native infrastructure truth, assemblage workflow, entitlement execution, listings/marketplace behavior, or generic GIS browsing as its primary product center.
- Any mention of a future parcel/site-native module in Atlas docs is included only to preserve Atlas boundaries and future suite integration. This document is **not** an authoritative scope spec for that future module.
- Atlas should also support thesis-driven investigation on top of that geo/opportunity layer. Perspectives define the default universe; thesis lenses define the investment question applied to that universe.

### Revision Note (2026-03-16)

Atlas scope expanded from agriculture-only to **real-assets intelligence and underwriting**. Core thesis: the metric engine, z-score framework, scenario lab, and research workspace are reusable across adjacent location-sensitive real-assets workflows. Farmland remains the active proving wedge. Industrial, logistics, data-center, energy, and development-oriented land are the next planned expansion lanes.

Dropped: AgTech Research & Intelligence (Module 5), Farm Operations Dashboard (Module 7).
Reframed: Deal Flow & Investment (Module 6) shifts from agtech/farmland to real-assets investing first, with selected commercial real estate workflows later.
Added: Data Center & Digital Infrastructure Intelligence, Energy & Renewables Land Intelligence, and development-oriented land workflows as future modules.

Explicitly out of scope for now:
- full office, retail, hospitality, and multifamily operating workflows
- lease abstraction
- tenant-credit workflows
- broad property-operations / asset-management systems

The near-term execution plan (3-week sprint ending 2026-03-22) is unchanged — it remains fully focused on the ag data foundation and research workflow. The pivot affects the vision and post-sprint roadmap, not the current sprint.

---

## Part 1: The North Star Vision

### What Atlas Becomes

Altira Atlas is a **real-assets intelligence and underwriting platform** purpose-built for institutional investors, lenders, operators, and analysts who need to understand where opportunity and risk are shifting across location-sensitive real-assets use cases. More specifically, Atlas is the **thesis-driven geo/opportunity underwriting layer** inside that broader real-assets lane. The current live lane starts with farmland. The next planned lanes are industrial, logistics, data-center, energy, and development-oriented land at the geography/opportunity level. Selected commercial real estate workflows come later where site, infrastructure, and location drive value.

The platform unifies data that today lives in 15+ disconnected sources (USDA-NASS, FRED, EIA, state PUCs, NREL, county assessor records, NOAA, SSURGO, and similar public/private geo-level sources) into one dense, keyboard-navigable interface with a core UX principle borrowed from CurrentMarketValuation.com: **every metric tells you where it sits relative to its own history** — z-scores, percentile gauges, standard deviation bands — so a user can glance at any number and instantly know whether it's historically cheap, expensive, or normal.

The unifying insight: land and market value are being repriced by converging forces — agricultural consolidation, logistics buildout, data-center demand, renewable energy deployment, climate risk, and water scarcity. The same county in Iowa might matter as cropland today, as a logistics or energy market tomorrow, and later as a development-oriented real-assets market. Atlas should unify that analytical view without pretending to be a parcel-native site engine or a full-spectrum commercial real estate operating system.

An equally important product rule: Atlas should support **theme-driven investigation**. An analyst should be able to apply a thesis such as agricultural transition stress, resilient production base, or future processing/infrastructure convergence to the same geography/opportunity engine without Atlas pretending it has direct data for every part of that thesis.

### Who It Serves (Named Targets)

Institutional decision-makers first (B2B, per D-016):

**Multi-asset land investors:**
- **Nuveen Natural Capital** (TIAA's farmland arm) — needs portfolio-level analytics, scenario modeling across farmland holdings, alternative-use optionality assessment
- **CalPERS** (pension fund with farmland + infrastructure allocation) — needs risk metrics, diversification analytics across land types, macro context
- **Brookfield Infrastructure Partners** — needs geography-level powered-land market intelligence, energy project land intelligence, infrastructure pipeline analytics

**Farmland-specific:**
- **Gladstone Land** (public farmland REIT) — needs county-level cap rate screening, yield trends, fair value modeling
- **CoBank** (Farm Credit System) — needs lending risk metrics, county credit quality, DSCR analysis

**Data center & digital infrastructure:**
- **Tract** (25,000+ acre data center land platform, backed by Berkshire Partners/PSP/Permira) — needs market screening, power/water/fiber context, and geography-level diligence triage before parcel-native feasibility work
- **Digital Realty / QTS (Blackstone)** — needs market-level supply/demand intelligence and land cost benchmarking
- **Vantage Data Centers / EdgeCore** — needs greenfield market identification and environmental risk screening

**Energy & renewables:**
- **NextEra Energy Partners** — needs solar/wind resource scoring, interconnection queue analytics, PPA pricing benchmarks
- **TPG Rise Climate** (climate-focused PE) — needs energy project land scoring, carbon/ESG overlay, climate risk integration

**Ag lenders & advisors:**
- Farm credit associations, regional banks with ag lending books, farmland appraisers

### The Macro Thesis Behind the Product

Land is entering a structural repricing driven by converging forces:

**Agriculture transition:**
- Family farms declining (2.02M in 2018 → 1.87M in 2025) — consolidation accelerating
- Grain prices at historically low levels when inflation-adjusted — mean reversion likely
- Land prices elevated relative to cash flows — cap rate compression
- Immigration policy tightening farm labor supply — automation demand rising

**Data center buildout:**
- US data center capacity growing ~25% CAGR driven by AI compute demand
- Land requirements accelerating (hyperscale campuses need 100-500+ acres with specific power/water/fiber characteristics)
- Farmland is being converted — Iowa, Virginia, Texas, Ohio, Georgia are prime examples of the farmland-to-data-center pipeline

**Energy transition:**
- Solar and wind projects require large contiguous land parcels (1,000+ acres for utility-scale)
- Farmers increasingly approached for solar leases ($800-1,500/acre/year vs. $200-400 cash rent)
- Battery storage siting expanding rapidly near urban load centers
- Interconnection queue backlogs creating premium for pre-positioned sites

**Climate & water:**
- Climate volatility increasing — weather risk becoming a first-class investment variable across all land types
- Water scarcity affecting both agriculture and data center cooling costs
- Carbon credit markets creating new revenue streams for landowners

The platform that provides structured intelligence across all of these dimensions captures an enormous, underserved market. Atlas's role in that opportunity is the geography/opportunity underwriting layer, not the parcel-native execution layer.

### The Core Atlas Modules (End-State)

**Module 1: Land Intelligence** (current core — expand across asset classes)
County / state / market land valuations, cap rates, cash rents, fair value modeling, access scoring, comparable sales, and tax analysis. Z-score historical context on every metric. Phase 1 is farmland; later phases add geography-level powered-land readiness signals and energy project land scoring without making Atlas parcel-native.

**Module 2: Commodity, Energy & Input Pricing**
Agricultural: spot/futures commodity prices, basis tracking, input costs (fertilizer, seed, fuel, chemicals), margin calculator, seasonal patterns, sensitivity analysis. Published composite agriculture index tracking 3-4 ETFs + third-party indexes.
Energy: wholesale electricity rates by ISO/RTO region, natural gas pricing, PPA pricing benchmarks by state, renewable energy credit (REC) pricing. Utility tariff comparison for data center site evaluation.

**Module 3: Soil, Environmental & Site Intelligence**
Agricultural: SSURGO soil data, productivity indices, planting decision context.
Cross-asset: climate trends (GDD, drought, precipitation), 30-year climate projections, flood zone mapping, seismic risk, environmental remediation history, brownfield registry. Monte Carlo yield/risk simulations applicable to any land use case.

**Module 4: Water, Carbon & Infrastructure Intelligence**
Water rights registry, aquifer depletion tracking, irrigation allocations, water market pricing — critical for both agriculture and data center cooling economics.
Carbon credit program comparison, renewable energy lease rates, mineral rights data.
Infrastructure overlay: power transmission proximity, substation context, fiber backbone maps, and utility/interconnection context at the geography/opportunity layer. These are inputs to market screening and underwriting, not parcel-native site operations inside Atlas.

**Module 5: News & Market Intelligence**
AI-curated news feed covering farmland markets, data center development, energy project siting, and land transaction activity. Algorithmic scanning of AgFunderNews, utility commission filings, zoning board decisions, FERC/PUC orders, and real estate transaction databases. Claude API-powered summarization.

**Module 6: Decision Workflow & Portfolio Platform**
Real-assets-focused underwriting workflow: fund performance benchmarks (NCREIF farmland, data center REITs, infrastructure funds), due diligence templates by asset class, portfolio analytics with geographic and asset-type diversification, private credit tracking, and decision record continuity.
No agtech startup pipeline, no generic PE-company workflow, and no listings marketplace behavior inside Atlas — this is strictly geo/opportunity underwriting intelligence.

### Core UX Principles

1. **Industrial terminal aesthetic** — dark palette, sharp edges, data-dense, no rounded cards or SaaS softness. IBM Plex fonts. The current look is correct.
2. **CurrentMarketValuation.com paradigm** — every metric shows a gauge/percentile/z-score indicating where it sits relative to its own history. "Is this cheap or expensive relative to the last 10 years?"
3. **Charts below, stats above** — current dashboard layout stays. Charting section sits in a dedicated area below the existing stat cards.
4. **Keyboard-first** — Cmd+K command palette, vim-like navigation, power-user shortcuts.
5. **No fluff** — every pixel earns its place. Institutional users want density, not whitespace.
6. **Composable metrics, not asset-class silos** — the screener, dashboard, and watchlist draw from a universal metric pool grouped by domain (Land & Valuation, Crop & Agriculture, Energy & Power, Infrastructure, Environmental & Climate, Water & Carbon). Users toggle metrics on/off to compose their view rather than switching between rigid asset-class tabs. Saved presets provide quick defaults ("Farmland Fundamentals," "Solar Siting," "Data Center Screening") without locking users in.
7. **Model subtabs for structurally different engines** — the Scenario Lab uses asset-class subtabs (Farmland Valuation, Solar/Wind Project, Powered Land / Data Center Market, Custom) because each model has different inputs, calculations, and outputs. The model subtab is the one place where asset-class context is explicit.
8. **Cross-asset county intelligence** — a county detail page shows all available metrics across domains. If data exists for farmland, solar, and data center suitability, all three appear as sections/tabs on the same county page. This is where the platform's unique value is most visible.

### UI Architecture: Composable Metric System (D-057)

The platform uses a **universal metric registry** rather than asset-class-specific views. Every metric in the system is registered with metadata: name, domain group, unit type, z-score availability, data coverage status by geography, and sort behavior.

**Screener:** Users compose screens by toggling metrics from the registry. The filter builder and results table dynamically render only the selected metrics. A farmland-focused user toggles on cap rate, cash rent, crop yields. A solar-siting user toggles on solar irradiance, interconnection queue, land value. A cross-asset user toggles on metrics from multiple domains simultaneously — finding counties where cap rates are high AND solar irradiance is strong.

**Dashboard:** Configurable headline cards. Default layout ships with current ag metrics (median cap rate, fair value, cash rent, ag composite index). Users can add/remove cards from the metric registry. Saved dashboard layouts persist per user.

**Saved Views / Presets:** Named metric configurations that users can save, share, and reload. Ship with built-in presets: "Farmland Fundamentals" (cap rate, cash rent, yields, fair value), "Solar Siting" (irradiance, interconnection, land cost, flood risk), "Powered Land Screening" (power cost, fiber context, water availability, cooling degree days). Presets serve the orienting function of subtabs without the rigidity.

**Metric Availability Indicators:** Each metric in the toggle panel shows coverage status — available (data populated for selected geography), partial (some coverage gaps), or coming soon (data pipeline not yet built). This replaces "Coming Soon" subtabs with granular per-metric signals.

**Cross-Asset Overlap Flags:** When a user has metrics from multiple domains active, surface interesting intersections: "12 counties in your screen have cap rates >3% AND solar irradiance >5.0 kWh/m²/day." This is the insight no competitor offers.

**Scenario Lab:** Uses model-type subtabs because the underlying calculations are structurally different:
- *Farmland Valuation* — DCF based on cash rent, yield expectations, commodity prices, discount rate
- *Solar/Wind Project* — NPV with irradiance/capacity factor, PPA rate, construction cost, degradation, ITC/PTC
- *Powered Land / Data Center Market* — geography-level scoring with power availability, fiber density, water access, and market context
- *Custom/Generic* — user-defined assumption sets on arbitrary metrics from the registry

Each model subtab has its own input form, sensitivity matrix, and memo export template, but all share the underlying DAG compute engine.

**County Detail Page:** Asset-class-agnostic. Shows all available data for a county organized by domain sections. A county in Iowa might show Farmland metrics, Solar potential, and Data Center suitability — all on the same page. This is where the "same county valued three ways" insight lives.

---

## Part 2: Prioritized Implementation Stack

Scoring: **(UX Impact: 1-5) × (Implementation Ease: 1-5) = Priority Score**

UX Impact: 5 = transformative user experience, 1 = invisible plumbing
Implementation Ease: 5 = can ship in 1-2 days, 1 = months of work + external dependencies

### Tier 1: Ship This Week (Score 15-25)

These are the features that deliver the most visible product improvement with the least effort. All are agriculture-focused — the launched product.

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
Build: Pull daily closes for 3-4 ETFs (DBA - agriculture commodities, MOO - agribusiness equities, CROP - grains, WEAT - wheat) via free Yahoo chart endpoints (or equivalent free EOD source). Compute a simple equal-weight composite. Display as a prominent card on the dashboard with z-score gauge showing where the composite sits relative to its 3-year history. Add sparkline.
Effort: ~2 days. Free EOD data + simple composite math + one new dashboard card + one new API endpoint.
Competitive note: FarmTogether and AcreTrader both reference NCREIF Farmland Index (1,023 properties, $16.1B AUM) for institutional benchmarking. NCREIF data is paywalled, but ETF-based proxies deliver 80% of benchmarking value at zero data cost. This is the gateway — expand to multi-asset benchmarks in 2.7.

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

**2.7 — Benchmark Index Expansion (Multi-Asset Proxies) (D-059)**
Score: 4 × 4 = 16
UX: Institutional investors benchmark everything against an index. Extends the Ag Composite (1.5) to include data center REIT benchmarks (EQIX, DLR), farmland proxy (FPI), infrastructure funds (PAVE, IFRA), and a broad land/real assets composite. Adds a "vs. Benchmark" overlay on county performance — users see whether a county's cap rate trajectory is outpacing or lagging the national index.
Build: (1) Extend existing ETF ingest to pull EQIX, DLR, FPI, PAVE, IFRA daily closes alongside existing ag ETFs. (2) Compute sector-specific composites (ag, data center REIT, infrastructure). (3) Add "vs. benchmark" toggle on county detail charts — overlay the relevant sector index as a dashed line against county-level metrics. (4) Dashboard: add a "Market Pulse" section showing all composites with z-score gauges.
Effort: **Phase A (release): ~1-2 days** for additional composite cards and history. **Phase B (post-release): ~2-3 days** for county-level benchmark overlays + cross-asset mapping logic.
Competitive edge: No land platform provides benchmark context. CoStar users get market-level benchmarks for CRE; farmland/land investors get nothing comparable. This fills the gap.

**2.8 — Saved Search Alerts & Watchlist Notifications (D-059)**
Score: 4 × 4 = 16
UX: Converts Atlas from a research tool into a daily workflow tool. Users define alert criteria ("notify me when cap rates in Story County cross 3.5%" or "alert when new NASS data lands for my watchlist counties") and receive email notifications when conditions are met. This is the #1 lock-in feature across CoStar, LandGate, and Bloomberg — saved alerts keep users returning.
Build: (1) D1 schema: `saved_alerts` table (filter config as JSON, threshold conditions, last_run_hash, email, frequency, enabled). (2) Scheduled Worker (Cloudflare Cron Trigger, daily or weekly cadence): runs each alert's filter against current data, compares result hash to last run, sends email if diff detected. (3) Alert types: threshold breach (metric crosses a value), data refresh (new data available for tracked geography), watchlist change (any metric on a watchlisted county moves >X%). (4) Email delivery via Cloudflare Email Workers or Resend API. (5) Frontend: "Create Alert" button on screener results and watchlist, alert management panel in Settings.
Effort: **Phase A (release): ~1-2 days** for in-app alert rules + dashboard alert center (no email). **Phase B (post-release): ~4-6 days** for email delivery, verification, unsubscribe/compliance, and reliability controls.
Competitive edge: CoStar's stickiest feature is alerts, not data. LandGate sends opportunity notifications. No land analytics platform aimed at institutional investors offers this. Low effort, high retention.

---

### Tier 3: Ship Weeks 2-3 (Score 8-12)

---

**3.1 — Research Workspace Enhancements (Thesis Template, Risk Flags, Catalysts)**
Score: 3 × 3 = 9
UX: Makes the research workspace feel like a real analyst tool instead of a simple notes box.
Build: Add structured fields to research workspace: thesis template (bull case / bear case / key risks / catalysts / timeline), risk flag badges, catalyst date tracking. Schema changes to research tables.
Effort: ~2-3 days. Backend schema + API changes + frontend form updates.

**3.2 — Sensitivity Output Quality Upgrade**
Score: 3 × 3 = 9
UX: Sensitivity analysis gets plain-language interpretation ("A 1% increase in discount rate reduces fair value by 12%") and key driver ranking.
Build: Post-process sensitivity matrix to generate ranked driver impact list and natural language summary. Frontend: add interpretation panel below the sensitivity grid.
Effort: ~2 days. Math is simple; copy/template work.

**3.3 — Metric Registry + Composable Screener Rework (D-057)**
Score: 4 × 3 = 12
UX: Transforms the screener from a hardcoded farmland filter set to a composable metric builder. Users toggle metrics on/off from a domain-grouped pool. Results table and filter inputs render dynamically. Foundation for all future asset-class data integration — every new data source just registers its metrics; no new views needed.
Build: (1) Backend: create `/api/v1/metrics/registry` endpoint returning available metrics with metadata (key, display name, domain group, unit, z-score support, coverage status by state/county). (2) Refactor screener API from fixed filter params to accept arbitrary metric key filters (e.g., `?filter=implied_cap_rate:min:2.0,solar_irradiance:min:5.0`). (3) Frontend: replace hardcoded filter state variables with dynamic metric toggle panel grouped by domain. Results table columns generated from selected metrics. (4) Add saved view persistence — name + metric selection + filter values saved per user. (5) Ship 1-2 built-in presets ("Farmland Fundamentals" with current ag metrics as default).
Effort: ~3-4 days. Heaviest lift is the frontend refactor from fixed to dynamic state management. Backend registry is straightforward (metadata table or config). API refactor is moderate — existing filter logic becomes a loop over registered metrics rather than explicit param parsing.
Dependencies: Builds on 1.2 (z-scores) and 2.3 (z-score filters). Should be implemented before any non-ag data integration to avoid building a second hardcoded screener.

**3.4 — Branded Export Suite: PDF Reports + CSV/XLSX (D-059)**
Score: 4 × 3 = 12
UX: Institutional investors don't make decisions in a browser — they make decisions in committee meetings with printed decks and emailed memos. The ability to export a branded county analysis as PDF, download screener results as CSV/XLSX, and generate scenario memos as formatted documents is a genuine workflow requirement. LandGate sells property reports as PDFs. CoStar exports are a core feature. Green Street and MSCI deliver static PDF research. Atlas needs this to be taken seriously by institutional users.
Build: (1) **CSV/XLSX export** (ship first, trivial): "Download Results" button on screener and watchlist. Server-side or client-side CSV generation from current result set. (2) **Branded PDF county report**: HTML template with Altira branding (dark theme, logo, date) → PDF via Puppeteer in a Cloudflare Browser Rendering Worker or a lightweight HTML-to-PDF library. Content: county summary stats, z-score badges, key charts (cap rate trend, land value trend), scenario results if available, data coverage notes. (3) **Scenario memo PDF**: Extends 2.6 Decision Memo Export from Markdown download to formatted PDF with sensitivity tables, assumption sets, and z-score context. (4) **Watchlist summary PDF**: One-pager showing all watchlisted counties with key metrics and alert status.
Effort: **Release cut:** CSV/XLSX only (~1 day). **Post-release:** PDF pipeline (~4-7 days) once rendering/runtime constraints are validated in production.
Competitive edge: Fills the "last mile" gap. Users currently have no way to share Atlas analysis outside the browser. This converts Atlas from a personal research tool to a team/committee tool.

**3.5 — Saved Screen + Research Linkage**
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

**4.3 — Interactive Maps (County Choropleth) (D-059)**
Score: 4 × 2 = 8
UX: Maps are visually compelling and help users identify geographic patterns instantly. Becomes critical when multiple land types are layered (farmland value + solar irradiance + data center activity in one view).
Build: Mapbox GL JS or Deck.gl choropleth layer showing any metric by county. Color-coded by z-score (red = expensive, green = cheap). Screener-driven: map highlights counties matching current filter criteria. Click-to-drill: clicking a county opens the county detail page.
Effort: ~1-2 weeks. Requires GeoJSON county boundaries (free from Census TIGER/Line) + map rendering integration.
Competitive edge: AcreValue's spatial UX shows how valuable map context can be, but Atlas should keep maps at the county/market layer. The map is a visualization layer on the screener (filter -> highlight -> drill), not the entry point (browse -> click -> research). This preserves the terminal identity while delivering the spatial context institutional users actually need.
Data: Free Census TIGER/Line county boundaries (~3,200 counties). No licensing cost.

**4.4 — Published Ag Index Page (Public-Facing)**
Score: 3 × 2 = 6
UX: Creates a public-facing "hook" that drives awareness. People link to and reference the index.
Build: Dedicated public page for the Altira Agriculture Index with methodology, daily level, historical chart, component weights. SEO-optimized.
Effort: ~1 week. Builds on the composite index from 1.5 but adds public presentation layer.

**4.5 — Portfolio Analytics Upgrade (HHI, Asset-Type Exposure, Unrealized P&L)**
Score: 3 × 2 = 6
UX: Portfolio manager gets institutional-grade analytics. Structured for multi-asset-class diversification once additional land types are added.
Build: Enhance portfolio detail view with geographic concentration heatmap, crop/land-type exposure breakdown, yield attribution, historical portfolio value tracking.
Effort: ~1 week. Portfolio engine exists; this is analytics layer enhancement.

**4.6 — Energy Pricing Integration (Wholesale Electricity, Natural Gas)**
Score: 3 × 2 = 6
UX: First non-ag data feed. Validates the multi-asset thesis with minimal integration cost.
Build: EIA API for wholesale electricity prices by ISO/RTO region + natural gas hub pricing. Display as a new "Energy" section on the dashboard. Z-score treatment identical to ag metrics.
Effort: ~1 week. EIA API is free and well-documented.

---

### Tier 5: Months 3-6 (Score 2-6)

These items define the post-sprint expansion path. Ordered by strategic priority, not just score.

---

**5.1 — Powered Land / Data Center Market Intelligence Layer**
Score: 3 × 1 = 3 (high strategic value, high implementation cost)
UX: A high-value expansion for Atlas's geo/opportunity lane. Score any US county or market for powered-land / data-center market suitability before deeper parcel-native feasibility work begins elsewhere.
Build: Composite scoring model using power infrastructure (EIA transmission data, utility rate maps), fiber/backbone proximity (FCC broadband data), water availability (USGS, state water rights), seismic risk (USGS hazard maps), climate risk (cooling degree days, extreme weather frequency), and zoning friendliness. Display as a geography-level "Powered Land Suitability" overlay on county detail and maps.
Effort: ~4-6 weeks. Multiple government data APIs, each with its own format. Scoring model needs calibration against known data center locations.
Data sources: EIA (power), FCC (broadband), USGS (water, seismic), NOAA (climate), state PUC filings (utility rates), PJM/CAISO/ERCOT (interconnection queues).

**5.2 — Energy Project Land Scoring**
Score: 3 × 1 = 3
UX: Score any county for solar, wind, or battery storage project suitability.
Build: Solar irradiance data (NREL NSRDB), wind capacity factor (NREL Wind Toolkit), grid interconnection queue position (ISO/RTO data), state renewable portfolio standards and incentives, PPA pricing benchmarks. Display alongside farmland metrics for landowners evaluating alternative uses.
Effort: ~4-6 weeks. NREL data is free and high quality; ISO interconnection queue data is fragmented across regions.

**5.3 — SSURGO Soil Data Layer**
Score: 3 × 1 = 3
UX: Soil productivity data is the gold standard for farmland valuation precision. Also relevant for solar siting (slope, drainage, flood risk).
Build: Bulk load SSURGO/gSSURGO data for tracked counties. Compute productivity indices (CSR2, PI). Display on county detail.
Effort: ~3-4 weeks. SSURGO data is massive and complex (spatial joins, soil map units).

**5.4 — Climate Risk Layer (NOAA + PRISM)**
Score: 3 × 1 = 3
UX: Climate trends visible alongside financial metrics — critical for long-term valuation of any land type.
Build: Ingest NOAA historical climate data, PRISM growing season metrics, Palmer Drought Index. Integrate into county detail as a "Climate" tab.
Effort: ~3-4 weeks. Multiple data sources with different formats and granularity.

**5.5 — External Site Reference Handoff**
Score: 2 × 1 = 2
UX: Lets Atlas users jump from a geo/opportunity view into supporting parcel/site references when they need deeper feasibility work, without turning Atlas itself into the site-native product.
Build: Add structured linkouts or handoff hooks for supporting parcel/site references once a separate module or partner path exists. Atlas remains the underwriting and decision layer.
Effort: Deferred until the suite has a clear site-native path.

**5.6 — Natural Language Query (Claude API)**
Score: 5 × 1 = 5
UX: "Show me Iowa counties where corn yields grew >3% annually and solar irradiance exceeds 5.0 kWh/m²/day" — typed in plain English. The cross-asset query is the killer feature.
Build: Claude API-powered query layer over the full data lake (per D-021). Requires solid multi-asset data foundation first.
Effort: ~4-8 weeks. Prompt engineering, query-to-SQL translation, result formatting, guardrails.

**5.7 — Water Rights & Carbon Credit Intelligence**
Score: 2 × 1 = 2
UX: Niche but high-value for specialized investors (western states water, ESG/carbon, data center cooling costs).
Build: State water rights database integration, carbon credit program comparison engine.
Effort: ~6-8 weeks. Highly fragmented data across 50 state systems.

**5.8 — Investment Workflow Extensions**
Score: 3 × 1 = 3
UX: Stronger due diligence templates, benchmark context, portfolio analytics, and memo workflow for real-assets investors without pushing Atlas into listings or transaction facilitation.
Build: Extend due diligence rooms, fund performance tracking (NCREIF Farmland, data center REITs, infrastructure indices), portfolio workflow, and export/memo systems. Selected commercial real estate workflows can follow later where site, infrastructure, and location drive value.
Effort: ~6-12 months. Workflow infrastructure, exports, and cross-view integration.

---

## Part 3: Implementation Phases (Time-Bound)

### Release Cut (Target: 2026-03-22)

**Locked for release (must ship):**
- 1.1, 1.2, 1.3, 1.4, 1.5
- 2.1, 2.2, 2.3, 2.5
- 3.1, 3.2
- 2.6 as Markdown/in-app output only (no PDF dependency)
- 3.3 Phase A: metric registry + composable UI scaffolding on existing agriculture metric set

**Stretch for release (ship only if locked items are complete and stable):**
- 2.7 Phase A: benchmark composites on dashboard (no county overlay)
- 2.8 Phase A: in-app alerts center (no email sending)
- CSV export from 3.4

**Explicitly deferred post-release:**
- 2.8 email notification delivery
- full 3.4 PDF report generation
- full cross-domain composable filters for non-ag "coming soon" metrics

### Phase 0: This Week (Mar 2-8) — "Make It Real"
Ship: 1.1, 1.2, 1.3, 1.4, 1.5
Goal: Dashboard has charts. Every metric has a z-score badge. Data covers 20 states. Ag index exists.
User test: "Open the dashboard and within 5 seconds understand whether farmland is cheap or expensive right now."

### Phase 1: Weeks 2-3 (Mar 9-22) — "Make It Useful"
Ship (locked): 2.1, 2.2, 2.3, 2.5, 2.6 (Markdown/in-app), 3.1, 3.2, 3.3 (Phase A)
Ship (stretch): 2.4, 2.7 (Phase A), 2.8 (Phase A), CSV from 3.4
Goal: End-to-end research workflow that is reliable, explainable, and defensible for analyst use under real data constraints.
User test: "Start from the screener, find an interesting county, run 3 scenarios, save a thesis, and generate a decision-ready writeup without leaving the app."

### Phase 2: Month 2 (Mar 23 - Apr 22) — "Make It Indispensable"
Ship: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
Goal: Commodity data live. Interactive maps. Published ag index page. Portfolio analytics upgraded. First energy data feed (wholesale electricity).
User test: "Check commodity prices, see margin implications for a county, view geographic patterns on a map, compare energy prices across regions."

### Phase 3: Months 3-6 — "Make It Multi-Asset"
Ship: 5.1, 5.2, 5.3, 5.4, 5.5 in priority order based on user feedback
Goal: Powered-land market intelligence and energy project land scoring live. Soil and climate layers integrated. Atlas is clearly multi-perspective at the geography/opportunity layer.
User test: "Look at an Iowa county and see its farmland value, solar lease potential, powered-land market suitability, and climate risk profile — all on one page."

### Phase 4: Months 6-12 — "Make It the Platform"
Ship: 5.6, 5.7, 5.8
Goal: Natural language queries across all asset classes. Water/carbon intelligence. Stronger investment workflow and decision exports.
User test: "Ask a natural language question spanning multiple land types, get a data-backed answer, move it into underwriting, and export a diligence package."

---

## Part 4: Data Source Stack

### Free / Phase 1 ($0/month) — Agriculture Foundation
- USDA NASS API — crop production, acreage, yields, cash rents, land values
- FRED API — commodity prices, treasury rates, farm input costs
- Yahoo Finance chart endpoints (or equivalent free EOD source) — ETF closes for composite index (DBA, MOO, CROP, WEAT)
- AgFunderNews RSS — deal flow headlines
- USDA ERS reports — farm economics context
- NOAA API — weather/climate data

### Growth / Phase 2 ($150-300/month) — Expanding Coverage
- IEX Cloud ($9/mo) — deeper ETF/company data
- OpenWeatherMap ($30-50/mo) — historical weather depth
- EIA API (free) — wholesale electricity prices, natural gas pricing, power plant locations

### Multi-Asset / Phase 3 ($300-1,000/month) — Alternative Land Intelligence
- NREL APIs (free) — solar irradiance (NSRDB), wind capacity factors (Wind Toolkit)
- FCC Broadband Data (free) — fiber/backbone proximity maps
- USGS APIs (free) — water data, seismic hazard maps
- State PUC/ISO data (free but fragmented) — utility rates, interconnection queues
- Deferred partner or separate-module parcel/site references if and when the suite needs them

### Enterprise / Phase 4 ($1,000+/month)
- PJM/CAISO/ERCOT direct feeds — real-time interconnection queue data
- CoStar/Reonomy equivalent for comparable land sales (if needed)
- Claude API usage costs (scales with NL query volume)

---

## Part 5: Design Decisions Lock-In

These are resolved. Don't re-litigate.

| Decision | Resolution | Reference |
|---|---|---|
| Dashboard layout | Keep current. Charts go BELOW existing stat cards. | User directive |
| UI aesthetic | Industrial terminal. Dark, sharp, dense. No SaaS softness. | D-022, D-023 |
| Z-score framework | Apply to every metric, every asset class. CurrentMarketValuation.com paradigm. | User directive |
| Proprietary index | Published. Start with 3-4 ETFs + third-party indexes. | User directive |
| News curation | Algorithmic / AI-powered agentic scanning. Not editorial. | User directive |
| Data sourcing | Swim with the current — free sources first, paid when PMF proven. | User directive |
| Target users | B2B institutional first. Multi-asset mandate investors are ideal. | D-016 |
| GTM sequence | Atlas stays data/tools/workflow first. Listings or transactions are not part of current Atlas scope. | D-018 (historic), boundary memo |
| Parcel data | Parcel/site-native depth is deferred outside Atlas's core scope. Atlas may link out later, but should not reorganize around parcel as its primary object. | D-020 (historic), boundary memo |
| AI layer | Claude API on top of complete data lake. Data first. | D-021 |
| Auth | Session-based, CF Access in production. | D-028, D-033 |
| Deploy | GitHub Actions CI/CD → Cloudflare Workers. | D-036 |
| Asset-class expansion | Farmland first, then industrial/logistics, data centers, energy, and development-oriented land at the geography/opportunity layer. Selected commercial real estate workflows later. | D-051 + boundary memo |
| Dropped modules | AgTech Research & Intelligence, Farm Operations Dashboard. | D-051 |
| Deal flow scope | Real estate and land-based investment only. No agtech startups. | D-051 |
| Screener/Dashboard UX | Composable metric pool with domain grouping, not rigid asset-class subtabs. Users toggle metrics on/off. Saved presets for quick defaults. | D-057 |
| Model UX | Scenario Lab uses model-type subtabs (Farmland, Solar/Wind, Data Center, Custom) because models are structurally different. Only place with explicit asset-class context. | D-057 |
| County detail | Asset-class-agnostic. All available data shown by domain section. Cross-asset view is the platform's unique value. | D-057 |
| Metric registry | Backend maintains universal registry of metrics with metadata (domain, unit, z-score support, coverage). Screener/dashboard render dynamically from registry. | D-057 |
| Pricing / GTM | Transparent, published pricing. No opaque "call for quote" model. Free tier for exploration; paid tier for saved views, alerts, and exports. CoStar's opaque pricing is a top competitor complaint — Atlas exploits this. | D-059 |
| Alerts & retention | Saved search alerts on a cron (daily/weekly). Converts research tool into daily workflow tool. Modeled on CoStar's stickiest feature. | D-059 |
| Export / distribution | Branded PDF reports, CSV/XLSX downloads, scenario memos. Institutional users share analysis in committees, not browsers. | D-059 |
| Benchmarking | Multi-asset benchmark indices via ETF proxies (ag, data center REIT, infrastructure). "vs. Benchmark" overlay on county metrics. No competitor offers this for land. | D-059 |
| Map as visualization layer | County choropleth driven by screener filters, not a browse-first map. Terminal identity preserved. Atlas maps stay geography/opportunity-first. | D-059 + boundary memo |

---

## Part 6: Competitive Positioning Summary (D-059)

### What No Competitor Does (Atlas Unique)
- **Cross-asset county intelligence** — same county evaluated as farmland, solar market, or powered-land opportunity. No platform offers this unified view.
- **Historical distributional context (z-scores)** on every metric — no competitor shows where a data point sits relative to its own history.
- **Investment-grade analytics on land** — Scenario Lab with DCF/NPV models by asset class. LandGate finds sites; Atlas evaluates investments.
- **Composable metric screening** across domains — "cap rates > 3% AND solar irradiance > 5.0" is impossible on any existing platform.

### What Competitors Do Well That Atlas Must Match
- **Saved alerts** (CoStar, LandGate) — #1 retention driver. Added as 2.8.
- **Benchmark indices** (FarmTogether/AcreTrader reference NCREIF) — institutional expectation. Added as 2.7.
- **PDF/export** (LandGate reports, CoStar analytics, Green Street research) — committee workflow requirement. Added as 3.4.
- **Map visualization** (AcreValue's #1 acquisition channel) — added competitive context to 4.3.

### What Competitors Do That Atlas Should NOT Copy
- **Owner contact CRM** (CamoAg, LandGate) — sales tool, not research tool. Wrong user.
- **Lease management / farm ops** (CamoAg) — dropped in D-051. Low-revenue segment.
- **Crowdfunding marketplace** (AcreTrader, FarmTogether) — securities platform, not analytics. Per D-018/D-019.

### Competitor Landscape Reference
- **CoStar** ($40B market cap): CRE monopoly. No raw land coverage. Opaque pricing ($10K-$100K+/seat). Atlas's pricing transparency is a deliberate counter-positioning.
- **CamoAg**: Closest ag competitor. Sales/marketing intelligence for agribusinesses, not investment analytics. Enterprise AVM launched Jan 2025. Targets farm managers and brokerages, not institutional investors.
- **AcreValue**: Parcel-level farmland map + AVM. Limited to ~8 Midwestern states. AVM accuracy 12-56% error vs. appraisals. Consumer UX, not institutional.
- **LandGate**: Closest cross-asset competitor. Energy siting (solar, wind, data centers) + property reports. Developer-focused, not investor-focused. Doesn't connect siting data to financial returns.
- **Regrid/ATTOM**: Data infrastructure layers. Inputs to other products, not end-user research tools.
- **FarmTogether/AcreTrader**: Crowdfunding platforms. Use data internally for deal underwriting but don't provide analytical tools to outside users.

---

*This document is the canonical north star. The 3-week plan in `ATLAS_CANONICAL_SCOPE_AND_3_WEEK_PLAN.md` is the near-term execution slice. Both should be read together. The vision is enormous — the sequencing is disciplined.*
