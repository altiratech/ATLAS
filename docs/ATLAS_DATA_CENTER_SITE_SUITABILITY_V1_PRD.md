# Atlas Data Center Site Suitability v1 PRD

Last updated: 2026-03-07 (ET)
Owner: Ryan + Codex + Claude
Status: Implementation PRD
Decision refs: D-089
Related docs:
- `docs/ATLAS_INDUSTRIAL_LAND_RESEARCH_AND_MODELING_BRIEF.md`
- `docs/ATLAS_INDUSTRIAL_LAND_POST_SPRINT_ROADMAP.md`
- `docs/CODEX_SPEC_COMPOSABLE_METRICS.md`
- `docs/ATLAS_CANONICAL_SCOPE_AND_3_WEEK_PLAN.md`

This document defines the first build-ready industrial-land model for Atlas.

The goal is to ship a credible, explainable, geography-first industrial research lane without creating a second product, a parcel-heavy architecture, or a generic industrial listings experience.

---

## 1) Product Goal

Ship the first industrial scorecard inside Atlas:

**Data Center Site Suitability v1**

This scorecard helps a user decide whether a county or candidate geography is worth deeper investigation for data-center or power-intensive industrial use.

It is a triage and underwriting-support tool.
It is not an engineering certification, a utility study, or a listings marketplace.

---

## 2) Why This Should Be The First Industrial Build

This is the best first industrial model because it:
- aligns with the long-term Atlas thesis around land under structural transition,
- has a high-value user set,
- can be built from a public-data-first evidence stack,
- and reuses the current Atlas workflow instead of forcing a separate industrial app.

The user should be able to do this in one product flow:
1. identify promising geographies,
2. inspect the evidence stack,
3. save a thesis,
4. run a scenario comparison,
5. produce a decision-ready output.

---

## 3) Target User

### Primary user

Institutional investor, developer, or lender evaluating land for future data-center or power-intensive industrial use before the site is fully de-risked.

### User questions

They are trying to answer:
- Is this geography worth deeper diligence?
- What are the gating risks?
- What is the strongest use-case thesis?
- What assumptions matter most?
- What happens if infrastructure timing slips?

### V1 workflow target

The first implementation target is **county-first geographic screening and research**, not parcel-level site certification.

That means the v1 object of analysis is a `geo_county` entry, optionally later enriched with parcel references.

---

## 4) V1 Scope

### In scope

- county-level data-center suitability scorecard
- explainable component scoring
- industrial-ready research workspace fields
- industrial research section in county detail
- industrial screening view or screener preset
- saved research thesis tied to industrial use case
- compatibility with later industrial scenario templates

### Out of scope

- parcel-by-parcel certification
- guaranteed utility capacity claims
- detailed zoning-code parser
- commercial fiber data purchase
- full industrial listings marketplace
- broad multi-use industrial scorecards in the same first pass

### V1 product rule

If the evidence is weak, Atlas should say that clearly.
The product must never imply engineering certainty that the data does not support.

---

## 5) V1 User Experience

### A. Screener entry

Atlas should expose a `Data Center Screening` preset inside the existing screener shell.

The user screens counties by:
- power cost context
- power infrastructure proximity proxy
- water stress threshold
- flood-risk exclusion
- highway / airport / metro adjacency proxy
- connectivity proxy
- suitability score threshold

### B. County detail industrial section

County detail should add a dedicated industrial section showing:
- overall suitability score
- component scores
- major disqualifiers
- missing critical data
- evidence freshness and lineage
- a short plain-language summary

### C. Research workspace

The user should be able to save:
- target use case: `data_center`
- thesis
- bull case
- bear case
- critical dependencies
- missing data notes
- decision state

### D. Scenario compatibility

This PRD does not require the full industrial scenario template to ship at the same time.
But the scorecard output must be structured so a future `data_center_site` scenario template can use it.

---

## 6) Recommended V1 Score Shape

### Endpoint output

`GET /api/v1/industrial/scorecard/:geoKey?use_case=data_center&as_of=latest`

Example response shape:

```json
{
  "geo_key": "19153",
  "use_case": "data_center",
  "as_of": "2025",
  "overall_score": 68,
  "confidence": "medium",
  "summary": "Promising power-cost and flood-risk profile, but water stress and missing substation-capacity evidence increase diligence risk.",
  "component_scores": {
    "power_readiness": 74,
    "water_readiness": 42,
    "connectivity_access": 66,
    "physical_suitability": 81,
    "entitlement_market": 58
  },
  "disqualifiers": [
    "Water stress elevated",
    "No direct capacity evidence for nearby substations"
  ],
  "missing_critical_data": [
    "Substation capacity",
    "Parcel-level zoning"
  ],
  "evidence": {
    "power_price_index": { "value": 61, "source": "EIA", "freshness": "2025-12-31" },
    "flood_risk_score": { "value": 89, "source": "FEMA", "freshness": "2026-01-15" }
  },
  "lineage": {
    "power_readiness": "mixed",
    "water_readiness": "state",
    "connectivity_access": "county"
  }
}
```

### Score scale

- 0-100 score
- transparent weighted component model
- every component includes evidence and missingness
- overall confidence is derived from coverage/completeness, not subjective narrative only

### Confidence buckets

- `high`: all core components populated with direct county or stronger evidence
- `medium`: one or more components rely on state / proxy evidence
- `low`: important components missing or largely proxy-driven

---

## 7) V1 Component Model

### 1. Power Readiness

Purpose:
- estimate whether the geography has credible power-side attractiveness for data-center or power-intensive industrial use

Inputs:
- wholesale or retail electricity cost proxy
- utility / grid region context
- transmission proximity proxy
- substation proximity proxy
- known infrastructure-density proxy where available

V1 output:
- `power_readiness_score`
- `power_cost_index`
- `power_proximity_index`
- `power_missing_flags[]`

Important caveat:
- v1 does not claim exact available capacity

### 2. Water Readiness

Purpose:
- estimate water availability and cooling-risk burden

Inputs:
- county or regional water stress proxy
- drought or scarcity indicator
- municipal or surface-water access proxy if available

V1 output:
- `water_readiness_score`
- `water_stress_score`
- `water_missing_flags[]`

### 3. Connectivity and Access

Purpose:
- estimate whether the geography is plausible from a network and access standpoint

Inputs:
- connectivity / broadband proxy
- metro proximity proxy
- interstate / freight access proxy
- airport cargo proximity proxy where relevant

V1 output:
- `connectivity_access_score`
- `connectivity_score`
- `transport_score`

Important caveat:
- FCC / public broadband data is a proxy, not a direct fiber-certainty dataset

### 4. Physical Suitability

Purpose:
- exclude obviously weak physical environments

Inputs:
- slope / topography
- floodplain exposure
- wetlands / environmental conflict proxy where available
- acreage suitability proxy at geography level where possible

V1 output:
- `physical_suitability_score`
- `flood_risk_score`
- `slope_buildability_score`

### 5. Entitlement and Market Friction

Purpose:
- capture whether development friction is likely to be manageable or painful

Inputs:
- zoning compatibility proxy
- county development pattern proxy
- land-cost competitiveness proxy
- population / labor-market adjacency proxy if needed

V1 output:
- `entitlement_market_score`
- `land_cost_index`
- `entitlement_missing_flags[]`

Important caveat:
- true zoning certainty is out of scope for v1 and must be explicitly labeled as missing or proxy-based

---

## 8) Scoring Rules

### Weighting recommendation for v1

- power_readiness: `30%`
- water_readiness: `20%`
- connectivity_access: `20%`
- physical_suitability: `20%`
- entitlement_market: `10%`

Reasoning:
- power is the main gating factor
- water is a material but variable gating factor
- access and physical conditions are major screen-level constraints
- entitlement matters, but v1 evidence will be weakest here

### Guardrails

- do not produce a score if fewer than 3 of 5 major components are populated
- if power readiness is missing entirely, overall score must be suppressed or clearly marked low-confidence
- if flood or slope crosses a hard-exclusion threshold, include a disqualifier even if the overall score remains non-zero
- explain each component in plain language in the response payload

---

## 9) Data Model and Schema Changes

The key implementation rule is to reuse the current Atlas architecture wherever possible.

### A. Reuse existing `data_sources`, `data_series`, `data_points`

Do not create a separate industrial raw-data store in v1.

Industrial county or state metrics should be added as new `series_key` entries in the existing tables.

Recommended initial `series_key` set:
- `wholesale_power_price`
- `power_cost_index`
- `substation_proximity_score`
- `transmission_proximity_score`
- `water_stress_score`
- `flood_risk_score`
- `slope_buildability_score`
- `connectivity_score`
- `highway_access_score`
- `metro_access_score`
- `industrial_land_cost_index`
- `entitlement_friction_score`

Recommended initial geo levels:
- `county`
- `state`
- `national` for fallback benchmarks where needed

Use `quality_json` to store:
- source name
- source version or snapshot date
- transform notes
- confidence / proxy status

### B. Reuse `research_workspaces.analysis_json`

Do not create a separate industrial research table in v1.

Extend `analysis_json` contract to support these optional fields:

```json
{
  "asset_type": "industrial_land",
  "target_use_case": "data_center",
  "critical_dependencies": ["utility upgrade", "water agreement"],
  "missing_data_notes": ["parcel zoning unknown"],
  "approval_state": "watch"
}
```

These should coexist with the existing fields:
- `bull_case`
- `bear_case`
- `key_risks`
- `catalysts`
- `decision_state`

### C. No dedicated score-result table in v1

Do not persist scorecard outputs into a new table yet.

V1 should compute on read using the same pattern Atlas already uses for county modeling.

If caching becomes necessary, use:
- short TTL response caching first
- a dedicated snapshot table only after the workflow proves useful

### D. Future compatibility

The scorecard output contract should be shaped so it can later feed:
- scenario templates
- screener sort/filter logic
- memo generation
- compare views

---

## 10) Backend Changes

### New service

Add a new Worker service module:
- `deploy/cloudflare-worker/src/services/industrial.ts`

Responsibilities:
- load industrial evidence series by county/state/national fallback
- compute component scores
- compute overall score and confidence
- emit explanation payloads
- emit missingness/disqualifier payloads

### New endpoint

Add:
- `GET /api/v1/industrial/scorecard/:geoKey`

Query params:
- `use_case` default `data_center`
- `as_of` default `latest`

### Optional screening endpoint for lower-risk Phase A

If extending the current screener immediately adds too much risk, add:
- `GET /api/v1/industrial/screener`

This can return county rows with:
- overall score
- component-score summary
- key exclusions
- confidence bucket

Later, this can be merged into the more general screener/metric-registry model.

### Preferred medium-term integration path

Once the composable metric system is active, the industrial lane should migrate into the main screener rather than remain a parallel route.

### Research workspace endpoint changes

No new research endpoint is required for v1.

Required changes:
- broaden `normalizeAnalysisInput()` to accept industrial fields
- ensure frontend workspace editor can save `asset_type`, `target_use_case`, `critical_dependencies`, `missing_data_notes`, and `approval_state`

---

## 11) Frontend Changes

### A. County detail

Add a new section in the existing county detail view:
- title: `DATA CENTER SITE SUITABILITY`
- show:
  - overall score
  - confidence bucket
  - short narrative summary
  - component table
  - disqualifiers
  - missing critical data

### B. Screener

Phase A options:

**Option 1: lower-risk path**
- add a preset switch or dedicated mode inside existing screener shell
- keep the layout but show industrial columns and score

**Option 2: full integration path**
- wait for composable metrics and expose `Data Center Screening` as a built-in preset

Recommended path:
- Option 1 first, then fold into the composable metric system

### C. Research Workspace UI

Add industrial-aware fields to the existing research workspace form:
- target use case
- approval state
- critical dependencies
- missing data notes

Do not create a separate industrial workspace page.

### D. Decision-ready output

No full export system is required here.

But the memo / decision view should be able to include:
- suitability score summary
- component breakdown
- key disqualifiers
- missing-data caveats
- saved industrial thesis fields

---

## 12) First-Wave Data Source Plan

### Wave 1: build the minimum viable evidence stack

Bring in these first:

1. **EIA power pricing / electric region context**
- use for power cost baseline and regional power context

2. **Public electric infrastructure layer**
- substation / transmission proximity proxy

3. **FEMA flood data**
- hard exclusion and risk score input

4. **USGS slope / elevation**
- physical suitability input

5. **FCC connectivity proxy**
- connectivity input with explicit confidence caveat

6. **Transport access proxy**
- highway / metro / airport access signal

### Wave 2: strengthen weak components

7. water-stress and water-availability context
8. EPA contamination / remediation signals
9. land-cost competitiveness and local planning friction proxies

### Wave 3: parcel and premium enrichment

10. parcel / ownership layer
11. zoning and planning overlays
12. commercial fiber / CRE benchmarking data

---

## 13) API and Type Changes

### New endpoint

- `GET /api/v1/industrial/scorecard/:geoKey`

### Optional new endpoint

- `GET /api/v1/industrial/screener`

### Existing endpoint changes

- `PUT /api/v1/research/workspaces/:geoKey`
  - additive support for industrial fields inside `analysis`

- future:
  - `POST /api/v1/run/scenario`
    - support `model_type=data_center_site`
    - not required for this v1 scorecard ship

### Frontend types to add

```ts
interface IndustrialScorecard {
  geo_key: string;
  use_case: 'data_center';
  as_of: string;
  overall_score: number | null;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  component_scores: Record<string, number | null>;
  disqualifiers: string[];
  missing_critical_data: string[];
  evidence: Record<string, unknown>;
  lineage: Record<string, string>;
}
```

---

## 14) Acceptance Criteria

This PRD is successful when:

1. a user can view a county-level `Data Center Site Suitability v1` score inside Atlas
2. the score is decomposed and explainable
3. the UI clearly distinguishes direct evidence from proxy or missing evidence
4. the user can save an industrial use-case thesis in the existing research workspace
5. the industrial lane remains inside the existing Atlas product shell
6. no part of the v1 score implies engineering-grade certainty

---

## 15) Risks and Mitigations

### Risk: weak public connectivity data
Mitigation:
- treat connectivity as a proxy score with explicit low/medium confidence labels

### Risk: no exact utility-capacity data
Mitigation:
- never represent proximity as capacity certainty
- emphasize that power readiness is a screening signal, not a commitment signal

### Risk: zoning evidence is fragmented
Mitigation:
- keep entitlement as a lower-weight component in v1
- explicitly label missingness

### Risk: product sprawl
Mitigation:
- keep v1 county-first
- no parcel workflow yet
- no separate industrial shell

---

## 16) Recommended Build Sequence

### Build block 1
- extend research workspace analysis contract
- add industrial scorecard service skeleton
- ingest wave-1 industrial series
- ship county detail industrial section

### Build block 2
- add industrial screener preset or temporary industrial screener route
- support ranking and filtering by score/confidence/disqualifier flags
- add decision-view inclusion of scorecard summary

### Build block 3
- wire future `data_center_site` scenario template into Scenario Lab
- persist scenario runs using existing research workflow

That sequence keeps the first industrial build disciplined and compatible with the current Atlas architecture.
