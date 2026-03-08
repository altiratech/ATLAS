# Atlas Portfolio Risk Dashboard v1 PRD

Last updated: 2026-03-08 (ET)
Owner: Ryan + Codex + Claude
Status: Implementation PRD
Decision refs: D-105, D-107
Related docs:
- `docs/ATLAS_RISK_AND_INSURANCE_EXPANSION_BRIEF.md`
- `docs/ATLAS_INDUSTRIAL_LAND_RESEARCH_AND_MODELING_BRIEF.md`
- `docs/ATLAS_INDUSTRIAL_LAND_POST_SPRINT_ROADMAP.md`
- `docs/ATLAS_CANONICAL_SCOPE_AND_3_WEEK_PLAN.md`

This document defines the first build-ready risk and insurance module for Atlas.

The goal is to ship a credible, explainable, geography-first portfolio risk workflow that reuses the Atlas evidence stack without repositioning Atlas into a full CAT-modeling or carrier-core platform.

---

## 1) Product Goal

Ship the first dedicated risk aggregation module inside Atlas:

**Portfolio Risk Dashboard v1**

This module helps a user understand where geographic concentration, hazard exposure, and infrastructure dependency are building across a portfolio or book.

It is a risk-intelligence and decision-support tool.
It is not a CAT-model replacement, an actuarial pricing engine, or a claims system.

---

## 2) Why This Should Be The First Risk Build

This is the right first insurance and risk module because it:
- matches how insurers, reinsurers, MGAs, and consultants actually evaluate exposure,
- makes reusable Atlas hazard and dependency layers operationally useful,
- can be built from public-data-first geography and evidence layers,
- and creates a distinct workflow without forcing Atlas to abandon its underwriting-first wedge.

The user should be able to do this in one product flow:
1. upload or map a portfolio,
2. inspect concentration by geography,
3. overlay hazard and dependency context,
4. identify the highest-risk clusters,
5. run simple stress scenarios,
6. produce a decision-ready output.

---

## 3) Target User

### Primary users

**Mid-sized property carriers**
- teams needing a better view of geographic accumulation, hazard mix, and dependency concentration

**MGAs**
- teams evaluating whether a book is over-concentrated in fragile geographies or infrastructure-sensitive regions

**Reinsurers**
- teams assessing aggregate risk, tail concentration, and geographic overlap across a ceded or target book

**Climate and resilience consultants**
- teams building explainable dashboards and market-level risk views for clients

### User questions

They are trying to answer:
- Where is risk concentration building?
- Which counties, corridors, or regional clusters dominate the portfolio?
- Which hazards or dependencies are most material?
- Where do flood, power, and infrastructure weakness overlap with exposure?
- What happens if a stress assumption changes?

### V1 workflow target

The first implementation target is **portfolio-to-geography risk aggregation**, not policy-system integration and not parcel-level risk engineering.

That means the v1 object of analysis is a portfolio normalized to county geography, with optional later rollups to metro, corridor, or custom watch-zone views.

---

## 4) V1 Scope

### In scope

- portfolio upload via CSV
- county-level exposure normalization
- county and state concentration summaries
- flood and infrastructure dependency overlays
- explainable hotspot ranking
- simple stress and scenario panels
- risk-oriented research summary or memo-ready output
- compatibility with later portfolio scenario history

### Out of scope

- full carrier or MGA system integration
- policy administration workflows
- actuarial pricing model replacement
- claims workflows
- parcel-level engineering assessments
- black-box loss estimates presented as ground truth

### V1 product rule

If Atlas lacks direct evidence for a hazard or dependency layer, it must disclose the missingness clearly.
The dashboard must never imply actuarial-grade certainty that the evidence stack cannot support.

---

## 5) V1 User Experience

### A. Portfolio upload entry

Atlas should add a `Portfolio Risk` module in the existing shell.

The user uploads a CSV with exposure mapped by county directly, or by ZIP / state fields that Atlas can normalize to county where possible.

Expected v1 columns:
- county FIPS or county + state
- optional ZIP or region label
- TIV / insured value
- premium
- policy count
- optional segment / product line

### B. Portfolio summary dashboard

After normalization, Atlas should show:
- total exposure and policy count
- top states and counties by concentration
- concentration share of top 10 geographies
- hazard and dependency coverage status
- key watch zones
- freshness and lineage banner

### C. Hotspot and concentration panels

The dashboard should highlight:
- top counties by exposure
- top states by exposure
- flood-heavy clusters
- power- or dependency-sensitive clusters
- counties with both high exposure and weak evidence quality

### D. Scenario panel

The user should be able to run simple portfolio-level stress views such as:
- flood risk weighting increased
- power fragility weighting increased
- dependency overlay enabled or disabled
- selected states or segments isolated

This is not a full probabilistic CAT model.
It is an explainable scenario layer over geographic evidence.

### E. Decision-ready output

Atlas should present a memo-style in-app summary containing:
- portfolio overview
- top concentrations
- top hazard and dependency clusters
- scenario deltas
- evidence gaps and caveats

---

## 6) Recommended V1 Output Shape

### Summary endpoint

`GET /api/v1/risk/portfolios/:portfolioId/summary?as_of=latest`

Example response shape:

```json
{
  "portfolio_id": "pf_001",
  "as_of": "2025",
  "exposure_totals": {
    "insured_value": 2450000000,
    "premium": 18400000,
    "policy_count": 12200
  },
  "coverage": {
    "county_mapped_pct": 0.93,
    "hazard_loaded_pct": 0.81,
    "dependency_loaded_pct": 0.74
  },
  "top_states": [
    { "state": "TX", "insured_value": 610000000, "share_pct": 24.9 },
    { "state": "FL", "insured_value": 420000000, "share_pct": 17.1 }
  ],
  "top_counties": [
    {
      "geo_key": "48113",
      "county": "Dallas",
      "state": "TX",
      "insured_value": 145000000,
      "flood_risk_score": 63,
      "power_dependency_score": 71,
      "hotspot_score": 76,
      "lineage": "mixed"
    }
  ],
  "watch_zones": [
    "North Texas concentration high relative to flood and power dependency context"
  ],
  "data_gaps": [
    "Flood layer missing for 12% of mapped exposure",
    "Power dependency remains state-level for 38% of mapped exposure"
  ]
}
```

### Hotspots endpoint

`GET /api/v1/risk/portfolios/:portfolioId/hotspots?as_of=latest`

Should return ranked geographies with:
- exposure magnitude
- share of portfolio
- hazard scores
- dependency scores
- combined hotspot rank
- lineage / missingness

### Scenario endpoint

`POST /api/v1/risk/portfolios/:portfolioId/scenario`

Should accept weighted toggles such as:
- `flood_weight`
- `dependency_weight`
- `power_weight`
- `segments[]`
- `states[]`

Should return:
- changed hotspot ranking
- exposure concentration deltas
- scenario summary text
- caveat list

---

## 7) V1 Component Model

### 1. Geographic Concentration

Purpose:
- show where the book is actually concentrated before overlaying hazard logic

Inputs:
- insured value / TIV
- premium
- policy count
- segment and product labels where available

V1 output:
- `state_concentration_score`
- `county_concentration_score`
- top-N concentration shares
- concentration watch flags

### 2. Flood Exposure Context

Purpose:
- identify where exposure overlaps with flood-sensitive geographies

Inputs:
- FEMA flood or National Risk Index county evidence
- county exposure totals

V1 output:
- `flood_risk_score`
- `flood_exposed_value`
- `flood_hotspot_rank`
- `flood_missing_flags[]`

### 3. Infrastructure Dependency Context

Purpose:
- identify where exposure depends on fragile or high-risk infrastructure conditions

Inputs:
- EIA power pricing and grid context
- later power transmission / substation proxies
- later telecom dependency proxies

V1 output:
- `power_dependency_score`
- `dependency_hotspot_rank`
- `dependency_missing_flags[]`

### 4. Explainable Hotspot Ranking

Purpose:
- rank the geographies that deserve review first

Inputs:
- concentration metrics
- hazard metrics
- dependency metrics
- evidence completeness

V1 output:
- `hotspot_score`
- `hotspot_rank`
- `rank_drivers[]`
- `lineage`
- `confidence`

### Ranking rule

The v1 ranking must remain transparent and additive.
It should not be a black-box ML score.

---

## 8) Data Model and Schema Direction

Atlas should reuse the current generic evidence tables where possible:
- `data_sources`
- `data_series`
- `data_points`

V1 likely needs new portfolio tables:

### `risk_portfolios`
- `id`
- `user_id`
- `name`
- `description`
- `portfolio_type`
- `as_of`
- `created_at`
- `updated_at`

### `risk_portfolio_uploads`
- `id`
- `portfolio_id`
- `source_filename`
- `row_count`
- `mapped_row_count`
- `status`
- `created_at`

### `risk_exposure_rows`
- `id`
- `portfolio_id`
- `upload_id`
- `geo_key`
- `state`
- `county_name`
- `zip`
- `insured_value`
- `premium`
- `policy_count`
- `segment`
- `product_line`
- `mapping_confidence`
- `created_at`

### Optional later table

`risk_scenario_runs`
- stored snapshots of scenario assumptions and output for later comparison

### V1 design rule

Do not over-normalize in the first pass.
The first goal is to make upload, normalization, aggregation, and explainable hotspot ranking work reliably.

---

## 9) API Surface Direction

### New endpoints

- `POST /api/v1/risk/portfolios`
- `GET /api/v1/risk/portfolios`
- `GET /api/v1/risk/portfolios/:portfolioId`
- `POST /api/v1/risk/portfolios/:portfolioId/upload`
- `GET /api/v1/risk/portfolios/:portfolioId/summary`
- `GET /api/v1/risk/portfolios/:portfolioId/concentrations`
- `GET /api/v1/risk/portfolios/:portfolioId/hotspots`
- `POST /api/v1/risk/portfolios/:portfolioId/scenario`

### Additive reuse of existing Atlas APIs

Where useful, Atlas should reuse existing geography and evidence responses instead of forking a parallel hazard API stack.

Examples:
- shared county evidence summary helpers
- shared lineage and freshness helpers
- shared watchlist or research primitives later

---

## 10) UI Surface Direction

### New shell module

`Portfolio Risk`

### Core panels

- upload and normalization status panel
- exposure overview cards
- county concentration table
- state concentration table
- hotspot ranking table
- flood and dependency summary panels
- scenario panel
- memo-style summary panel

### Design rule

This module should use the same industrial Atlas design language:
- dense layout
- high-contrast tables
- explainable metadata
- visible lineage and missingness
- no glossy dashboard abstractions that hide model limits

---

## 11) V1 Acceptance Criteria

Atlas v1 for this lane is successful if a user can:
1. upload a portfolio CSV,
2. normalize most exposure to counties,
3. see state and county concentration clearly,
4. identify top flood and dependency hotspots,
5. run a simple weighted scenario,
6. understand what evidence drives the result,
7. and export or read an in-app decision-ready summary.

### Failure conditions

The module should be considered incomplete if:
- users cannot tell what data is direct vs proxy,
- hotspot rankings cannot be explained,
- upload normalization is too brittle,
- or the interface implies actuarial certainty that the evidence does not support.

---

## 12) Build Order

### Phase 1: Data and portfolio primitives
- portfolio tables
- upload parser
- county normalization
- concentration rollups

### Phase 2: Hazard and dependency overlays
- flood integration
- power dependency integration
- shared lineage and freshness exposure summaries

### Phase 3: Dashboard and ranking
- portfolio risk dashboard UI
- hotspot ranking engine
- simple scenario controls

### Phase 4: Research continuity
- saved scenario history
- memo-ready output
- later cross-portfolio comparison

---

## 13) Strategic Guardrails

1. Atlas should stay underwriting-first in positioning even after this module exists.
2. The risk lane should begin with aggregation and explainability, not synthetic precision.
3. Flood and dependency layers should be built once and reused across underwriting and risk modules.
4. V1 should prefer county-level clarity over fragile parcel-level ambition.
5. No opaque risk scores.
6. No CAT-model replacement claims.

---

## 14) Implication For Current Work

This PRD is a build-ready specification for a later Atlas lane.
It does **not** replace the current priority order.

The implication for current work is narrower:
- continue building reusable hazard and dependency layers,
- keep evidence lineage explicit,
- keep research and scenario workflows generic enough to support both underwriting and future portfolio-risk use cases.
