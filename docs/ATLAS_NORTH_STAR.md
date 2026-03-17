# Atlas North Star

Last updated: 2026-03-17 (ET)
Owner: Ryan + Codex + Claude
Status: Canonical long-term product vision for Atlas

This document defines what Atlas is ultimately trying to become.

Use this when the question is:
- what Atlas is for
- who Atlas is for
- what the mature product should feel like
- which future capabilities belong in the long-term vision

Do not use this document as the current implementation plan.
For active execution scope, use [ATLAS_CURRENT_SCOPED_BUILD_PLAN.md](./ATLAS_CURRENT_SCOPED_BUILD_PLAN.md).
For future-but-not-current capabilities, use [ATLAS_EXPANSION_MAP.md](./ATLAS_EXPANSION_MAP.md).

## 1) Product Thesis

Altira Atlas is a thesis-driven geo-level underwriting and intelligence platform for location-sensitive real assets.

Atlas helps institutional investors, lenders, advisors, deal teams, and serious analysts answer:
1. Where should we focus?
2. What is happening in this geography?
3. What is it worth under different assumptions?
4. What could go wrong?
5. Is this strong enough to pursue, monitor, lend against, compare, or pass on?

Atlas is not:
- a parcel-native site diligence engine
- a listings marketplace
- a generic GIS browser
- a dashboard-first stats product

Atlas is the geo/opportunity layer inside the broader Altira suite.

## 2) Core Workflow Families

These are the mature workflow families Atlas should support.

| ID | Workflow Family | Mature job Atlas should do |
| --- | --- | --- |
| `NS-1` | Discover | Screen and filter a geography-level universe with thesis-aware views and reusable configurations. |
| `NS-2` | Analyze | Explain one county/market deeply across valuation, productivity, hazards, water, infrastructure, and cross-domain evidence. |
| `NS-3` | Model | Run scenario-driven underwriting with assumption sets, sensitivities, and credit/downside logic. |
| `NS-4` | Decide | Capture structured investment research, thesis, risks, catalysts, and conviction as formal decision records. |
| `NS-5` | Aggregate | Compare opportunities and manage holdings/portfolio exposure with rollups and concentration analysis. |
| `NS-6` | Data | Make every metric explainable through freshness, coverage, lineage, and quality context. |
| `NS-7` | Multi-Perspective Insight | Apply different perspectives and thesis lenses to the same geography without forking Atlas into separate apps. |
| `NS-8` | Operator UX | Feel like a dense, keyboard-first institutional terminal rather than a consumer dashboard. |

## 3) Who Atlas Is For

Primary audience:
- institutional investors
- lenders and advisors
- deal teams
- portfolio managers
- independent analysts doing serious location-sensitive underwriting

Current wedge:
- farmland investors and lenders

Future audience expansion inside the same lane:
- industrial land and logistics investors
- powered-land / data-center market analysts
- energy / renewables land investors
- development-oriented land and infrastructure investors

## 4) What the Mature Product Should Feel Like

Atlas should feel like:
- one shared geo/opportunity workbench
- multiple workflow families connected by shared context
- dense but legible information design
- keyboard-first, saved-view-driven navigation
- explicit observed vs proxy vs modeled boundaries
- memo-quality outputs instead of disconnected analytics

A mature Atlas user should be able to:
- discover a geography
- understand why it matters
- model downside and upside
- capture a formal decision record
- compare it with alternatives
- understand how it fits inside a broader portfolio

## 5) Long-Term Capability Set

These capabilities belong in Atlas's long-term vision, even if they are not all current scope.

### Discovery and interaction
- universal metric registry
- composable metric presets
- richer saved-view objects
- cross-surface object linking
- record expansion panels everywhere they help
- historically-aware metric context as a default experience

### Geo/opportunity intelligence
- asset-class-agnostic county detail over time
- cross-domain county sections where the same geography can be evaluated through farmland, industrial, energy, and powered-land lenses
- perspective-aware and thesis-aware evidence synthesis

### Modeling and decisions
- model-type subtabs where structurally different engines are needed
- linked scenarios, research records, and portfolio context
- eventual opportunity object if product proof shows a real need for it

### Operator experience
- dense IBM Plex terminal aesthetic
- keyboard-first navigation and command surfaces
- fast grid-based scanning with saved working state

## 6) Traceability Rule

The current scoped build should always point back to one or more of `NS-1` through `NS-8`.

If a future feature is described here, it must either:
- appear later in [ATLAS_EXPANSION_MAP.md](./ATLAS_EXPANSION_MAP.md), or
- remain explicitly unsequenced until more product proof exists.
