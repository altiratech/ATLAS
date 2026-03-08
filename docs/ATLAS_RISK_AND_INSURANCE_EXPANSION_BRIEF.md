# Atlas Risk and Insurance Expansion Brief

Last updated: 2026-03-08 (ET)
Owner: Ryan + Codex + Claude
Status: Strategic extension brief for future Atlas audience expansion

This document defines how insurers and risk-management users fit into Atlas without changing the current primary wedge.

It answers five questions:
1. Why do insurers and risk teams fit Atlas at all?
2. Who are the right risk users to build for later?
3. What use cases matter most?
4. What product surfaces and data layers would Atlas need?
5. How should this expand without derailing the underwriting-first roadmap?

## 1) Positioning

Atlas should not reposition itself today as an insurance platform.

The correct framing is:
- Atlas remains a land, infrastructure, and underwriting intelligence platform first.
- Over time, the same hazard, dependency, and geographic evidence stack can support a second lens:
  - risk aggregation,
  - climate exposure analysis,
  - infrastructure vulnerability mapping.

That means the insurance/risk opportunity is real, but it is an **adjacent audience expansion**, not the current go-to-market wedge.

## 2) Why This Fits Atlas

Atlas is already moving toward the right data shape:
- geographic screening,
- explainable evidence layers,
- hazard and infrastructure context,
- scenario thinking,
- saved research and decision continuity.

Those same primitives matter to insurers and risk teams.

The main difference is not the evidence stack.
The main difference is the unit of decision:
- underwriting and land users care about a county, site, corridor, or shortlist,
- insurers and reinsurers care about a portfolio, book, program, or accumulation zone.

So Atlas can serve both if it treats hazard and dependency layers as reusable core infrastructure rather than one-off industrial features.

## 3) Target Future Users

### Primary future risk users

**Mid-sized property carriers**
- regional and specialty carriers that need geographic concentration views and better underwriting context

**MGAs**
- teams building or managing books in catastrophe-sensitive or infrastructure-sensitive areas

**Reinsurers**
- teams evaluating aggregate exposure, concentration growth, and portfolio stress

**Climate and resilience consultants**
- advisory teams building dashboards, market scans, and mitigation recommendations for clients

### Secondary future users

**Large insureds / infrastructure operators**
- operators evaluating exposure around facilities, utilities, logistics corridors, or power-dependent assets

## 4) Core Future Use Cases

### A. Property CAT aggregation

Questions:
- Where is our concentration building by county, corridor, or metro edge?
- Which peril layers are driving the accumulation?
- Where are we overexposed relative to risk-adjusted economics?

Needed outputs:
- county and regional aggregation dashboards
- concentration heatmaps
- peril-weighted book summaries
- watch zones and threshold alerts

### B. Climate risk dashboards

Questions:
- Which markets look directionally safer or riskier over time?
- How do flood, heat, wildfire, water stress, or storm-related signals compare across target geographies?
- Where should underwriting posture tighten or loosen?

Needed outputs:
- explainable hazard dashboards
- cross-market comparison views
- trend and scenario panels
- freshness / lineage disclosures for every layer

### C. Cyber and critical-infrastructure exposure mapping

Questions:
- Which insured or target geographies depend on fragile power or telecom infrastructure?
- Where do hazard and infrastructure dependencies overlap?
- What regional failures could cascade across a portfolio?

Needed outputs:
- power / telecom dependency overlays
- concentration around critical nodes
- dependency-adjusted risk views
- scenario stress cases for infrastructure disruption

## 5) Product Rule

Atlas should not try to become a full CAT-model vendor in its first risk expansion.

It should begin with:
- explainable geographic risk intelligence,
- aggregation and dependency views,
- scenario-oriented portfolio analysis,
- and decision-ready dashboards.

It should explicitly avoid, at first:
- claiming engineering-grade or actuarial-grade catastrophe model replacement,
- black-box loss estimates without evidence,
- carrier core-system replacement,
- policy admin or claims workflows.

The right first value is:
- better geographic understanding,
- better accumulation visibility,
- better scenario framing,
- better communication of why a region or portfolio segment looks fragile.

## 6) Reusable Core Data Layers

These layers matter to both underwriting users and future risk users.

### Hazard layers
- FEMA flood
- NOAA severe weather and storm context
- wildfire / drought / heat where relevant
- USGS terrain and water stress

### Infrastructure dependency layers
- EIA power pricing and regional context
- substation / transmission proxies
- telecom and broadband proxies
- transport and corridor exposure context

### Geographic context layers
- county / metro / corridor rollups
- state fallback and national context
- lineage and freshness metadata

### Optional later enrichment
- parcel datasets
- insured asset uploads
- commercial hazard / exposure data
- infrastructure outage / reliability datasets

## 7) First Future Risk Workflow

The first useful insurance/risk workflow should be:

1. Upload or map a portfolio to counties or geographies
2. Overlay hazard and dependency layers
3. Aggregate exposure by geography and peril
4. Highlight concentration and dependency hotspots
5. Run simple stress scenarios
6. Produce a decision-ready dashboard or memo

This is a better first workflow than trying to build direct site intelligence for insurers.

Why:
- insurers care about books and concentrations, not just one county at a time
- portfolio context is what makes the hazard layers operationally useful
- it creates a distinct product lens without discarding the Atlas evidence stack

## 8) First Product Module To Build Later

Recommended first module:

**Portfolio Risk Dashboard v1**

Purpose:
- give risk users a county- and region-level view of hazard, climate, and infrastructure dependency concentration across a portfolio

V1 inputs:
- aggregated CSV upload by county or ZIP-to-county mapped exposure
- insured value, premium, TIV, or count metrics
- optional segment / product labels

V1 outputs:
- county concentration table
- peril concentration breakdown
- flood / dependency hotspot panels
- top-exposure regions
- scenario summary cards

Important constraint:
- do not require a full carrier-system integration in v1
- CSV upload and geographic normalization are enough to prove value

## 9) Build Order For This Lane

### Phase 1: Reusable layers
- continue building flood, slope, power, water, and dependency layers generically
- keep lineage, freshness, and missingness visible

### Phase 2: Aggregation primitives
- geographic rollups
- exposure upload and normalization
- county / corridor concentration summaries

### Phase 3: Risk dashboard
- portfolio view
- peril concentration view
- dependency hotspot view
- stress scenario panel

### Phase 4: Consultant / reinsurance workflows
- exportable dashboards and memos
- comparison across books or markets
- saved watch zones and risk flags

## 10) Strategic Guardrails

1. Do not let the insurance lane replace the underwriting-first wedge too early.
2. Build shared evidence layers once; do not fork separate hazard stacks for each audience.
3. Keep all scores and dashboards explainable.
4. Prefer portfolio and concentration views for risk users over parcel-first workflows.
5. Use flood and dependency layers as cross-audience assets, not single-use features.

## 11) Implication For Current Work

Current Atlas priorities do not need to change.

The practical implication is narrower:
- every new hazard or dependency layer should be built so it can later serve both:
  - land/infrastructure underwriting,
  - and risk/insurance aggregation.

That means:
- consistent geographic keys,
- reusable series definitions,
- transparent lineage,
- clear source freshness,
- and scenario-friendly metrics.

If Atlas does that well now, the insurer/risk lane becomes an extension of the same platform rather than a separate rebuild.
