# Altira Atlas Canonical Scope and 3-Week Plan

Last updated: 2026-03-17 (ET)
Owner: Ryan + Codex + Claude

This file is the canonical scope statement for Atlas execution.

It supersedes stale wording that still frames this product as "Farmland Terminal" or as a static dashboard-first tool.

## 1) Canonical Product Scope

Altira Atlas is the geo/opportunity underwriting layer for location-sensitive real assets. It is a real-assets intelligence and underwriting platform for decision-makers who need to:
- identify where opportunity/risk is changing,
- model what could happen under different assumptions,
- document conviction with traceable evidence.

Primary users for the current live wedge:
- farmland investors and funds,
- ag lenders and advisors,
- independent analysts and operators doing county-level diligence.

Current positioning:
- farmland first,
- research and underwriting first,
- transaction/network/community layers later.

Boundary clarification:
- Atlas centers on geography/opportunity workflows, not parcel-native site operations.
- Atlas can support industrial, logistics, data-center, energy, and development perspectives at the geography/opportunity layer.
- Atlas should not be treated as the canonical parcel/site-native infrastructure optionality engine.

Near-term expansion after the farmland wedge:
- geography-level industrial land intelligence
- geography-level logistics market intelligence
- geography-level data-center and powered-land market intelligence
- geography-level energy and infrastructure land context
- geography-level development-oriented land intelligence

Later expansion:
- selected commercial real estate workflows where site, infrastructure, and location drive value

Explicitly out of scope for now:
- full office/retail/hospitality/multifamily operating workflows
- lease abstraction
- tenant-credit workflows
- broad property-operations / asset-management systems
- parcel-native infrastructure / assemblage / entitlement operations as Atlas's primary product center

## 2) V1 Boundaries (Target: 2026-03-22)

In scope for the next 3 weeks:
- reliable data foundation that populates core views,
- research workflow (workspace, notes, status, conviction),
- scenario and backtest workflows that produce decision outputs,
- clear "why this tool exists" orientation for non-expert users.

Out of scope for this sprint:
- full marketplace/deal room execution,
- investor syndicate mechanics,
- farm-operations integrations,
- real-time streaming market microstructure,
- full PDF report generation pipeline,
- production email-notification infrastructure.

## 3) Data Foundation Standard (Non-Negotiable)

The product is not "working" if key screens are mostly N/A.

By 2026-03-22, Atlas must have:
- county data populated for tracked states with usable coverage,
- enough historical data to run scenario + backtest credibly,
- dynamic "as_of" behavior (latest available year by default, not hard-coded stale year),
- visible data coverage diagnostics in-product.

Minimum series for research/modeling usefulness:
- cash rent,
- land value,
- corn yield,
- soybean yield,
- wheat yield,
- treasury 10y,
- corn price baseline.

## 4) Compressed 3-Week Execution Plan

Timeline window: Monday 2026-03-02 to Sunday 2026-03-22.

### Week 1 (2026-03-02 to 2026-03-08): Fill the Data Layer

Build:
- remove fixed-year defaults from read APIs and frontend assumptions,
- add latest-available-year resolution per series/county,
- expand ingestion configuration for soybeans and wheat,
- run historical backfill for currently tracked states,
- add data coverage endpoint (rows, years, missingness by series/state/county),
- add a compact "Data Coverage" panel on Dashboard and Screener.

Acceptance:
- Dashboard no longer shows mostly N/A for median cap rate/fair value/cash rent,
- Screener shows computed values (not mostly N/A) for a majority of listed counties,
- every research county can display at least one complete scenario run using live data.

### Week 2 (2026-03-09 to 2026-03-15): Strengthen Research + Modeling Workflow

Build:
- research workspace upgrades: explicit thesis template, risk flags, catalyst dates,
- scenario pack compare mode (best/base/worst in one view),
- sensitivity output quality upgrade (plain-language interpretation + key driver ranking),
- decision memo generator (structured Markdown/in-app output only in sprint),
- saved screen + research linkage (open scenario from selected screen result set).

Stretch only (if Week 1/2 locked items are stable):
- benchmark composite expansion on dashboard (no county-overlay dependency),
- in-app alert center (no email sending),
- composable screener phase A (registry + dynamic UI on existing ag metrics).

Acceptance:
- a user can go from county discovery to saved thesis to scenario output in one pass,
- one-click Markdown/in-app memo output exists with assumptions and model outputs embedded,
- workflow is coherent without external spreadsheets.

### Week 3 (2026-03-16 to 2026-03-22): Product Readiness for Live Usage

Build:
- quality hardening on ingest and scenario/backtest paths,
- baseline instrumentation for user actions (search, save thesis, run scenario, export memo),
- role-based demo data runbook (real data only, no synthetic seed),
- pilot package: 5 target users, scripted walkthrough, feedback capture loop.

Acceptance:
- end-to-end demo works on production with authenticated access,
- at least 5 guided user sessions completed with notes captured,
- top 10 issues triaged into a prioritized post-sprint backlog.

## 5) Delivery Operating Split (Option 2)

Ryan:
- priority calls, user interviews, product direction decisions.

Claude:
- creative UX/content, workflow copy, memo templates, research-framework design, code review.

Codex:
- integration, tests, commits/pushes, CI/CD deploy verification, production checks, continuity docs.

## 6) Ambition After This Sprint (Revised Vision — D-051)

After research/modeling V1 is stable, Atlas expands as a **real-assets intelligence and underwriting platform**. Farmland is the current live lane. The engine is reusable across adjacent location-sensitive real-assets workflows.

Expansion order:
1. Land intelligence deepening at county / market / regional depth for farmland,
2. Industrial, logistics, and data-center market intelligence at the geography/opportunity layer,
3. Energy and infrastructure land scoring at the geography/opportunity layer,
4. Soil/climate and environmental risk layers (cross-asset: ag, industrial, energy, development),
5. Decision workflow, portfolio analytics, and monitoring depth for real-assets underwriting,
6. Selected commercial real estate workflows later where Atlas can stay location- and infrastructure-sensitive,
7. Supporting integrations, exports, and natural-language query layers that reinforce Atlas's geo/opportunity workflow.

Dropped from prior vision: AgTech Research & Intelligence, Farm Operations Dashboard.
Reframed: Atlas deepens the underwriting and portfolio workflow rather than trying to become a parcel/site-native or listings-centric product.

The ambition expanded. The sequencing remains disciplined.
