# Altira Atlas Product Blueprint

Last updated: 2026-03-08 (ET)
Owner: Ryan + Codex + Claude
Status: Operating product blueprint for Atlas execution

## 1) Purpose

Atlas should be built as a decision system for land and geography.

It should help a serious user answer five questions:

1. Where should I focus?
2. What is happening there?
3. What is it worth under different assumptions?
4. What could go wrong?
5. Is this strong enough to pursue, monitor, lend against, or pass on?

Everything in Atlas should support one or more of those questions.

Atlas is not a dashboard-first product, not a listing portal, and not a generic note-taking tool. It is a geographic intelligence, underwriting, modeling, and research platform.

## 2) Wedge and Sequencing

### Current wedge

Atlas remains agriculture-first.

Primary users for the current build:
- farmland investors and funds
- ag lenders and advisors
- independent analysts underwriting counties and target markets

Why this wedge comes first:
- the data is accessible
- the valuation logic is understandable
- the workflow is reusable later for industrial, energy, and risk use cases

### Strategic expansion

Atlas expands later into:
- industrial land and data-center site research
- energy project land scoring
- portfolio and aggregation workflows
- risk and insurance analytics

That expansion should reuse the same workflow spine rather than create disconnected feature silos.

## 3) Core Product Shape

Atlas should be organized by workflow, not by a loose collection of features.

### A. Discover

Purpose:
- find where to spend time

Questions answered:
- where are conditions shifting?
- which counties fit my strategy?
- where is there enough signal to justify deeper work?

Primary product surfaces:
- Dashboard
- Screener
- Saved Views
- Alerts later

### B. Analyze

Purpose:
- understand one geography deeply

Questions answered:
- what is happening in this county or market?
- how strong is the signal?
- how trustworthy is the evidence?

Primary product surfaces:
- County Detail
- Compare
- Map later

### C. Model

Purpose:
- test assumptions and downside

Questions answered:
- what happens if rates, rents, growth, or yields change?
- how sensitive is value?
- how fragile is the thesis?

Primary product surfaces:
- Scenario Lab
- Backtest
- Assumptions

### D. Decide

Purpose:
- turn analysis into conviction

Questions answered:
- what do we believe?
- what are the key risks and catalysts?
- what would make us act or pass?

Primary product surfaces:
- Research Workspace
- Decision Memo View
- Research Queue

### E. Aggregate

Purpose:
- manage multiple targets and exposures

Questions answered:
- what should remain on the radar?
- what are the best alternatives?
- where are we concentrated?

Primary product surfaces:
- Watchlist
- Portfolio
- Future Risk Dashboard

### F. Data

Purpose:
- make outputs explainable and defensible

Questions answered:
- where does this number come from?
- how fresh is it?
- how complete is coverage?

Primary product surfaces:
- Data Sources
- Coverage / Freshness
- Metric Registry
- Lineage glossary later

## 4) Recommended Top-Level Navigation

Atlas should settle into this navigation model:

### Start Here
- Mission
- About
- How to Use Atlas

### Discover
- Dashboard
- Screener
- Saved Views

### Analyze
- County Detail
- Compare
- Map later

### Model
- Scenario Lab
- Backtest
- Assumptions

### Decide
- Research Workspace
- Decision Memo
- Research Queue

### Aggregate
- Watchlist
- Portfolio
- Risk Dashboard later

### Data
- Data Sources
- Coverage
- Freshness
- Metric Registry later

## 5) Ideal Farmland Workflow

The farmland product should prove the core Atlas workflow.

Target workflow:

1. Open Dashboard
2. Identify states or counties worth attention
3. Run Screener
4. Open County Detail
5. Review valuation, history, lineage, and risk context
6. Add county to Research Workspace
7. Run scenarios
8. Save scenario pack and conviction
9. Compare alternatives
10. Move county to Watchlist, Portfolio, or Pass

This is the operating loop Atlas should optimize first.

## 6) Data Architecture

Atlas data should be built in layers.

### Layer 1: Core valuation inputs

Mandatory:
- county cash rent
- county/state land value
- county crop yields
- treasury / base rates
- commodity price baseline
- operating-cost assumptions

Why:
- this is the minimum needed for valuation, fair value, cap rate, rent multiple, and lender-style metrics

### Layer 2: Historical context

Mandatory:
- multi-year history
- z-scores
- percentiles
- regime bands
- state and national benchmarks

Why:
- users should never read a raw number in isolation

### Layer 3: Explainability and trust

Mandatory:
- lineage
- fallback level
- as-of year
- freshness
- coverage
- missingness

Why:
- institutional users need to know whether a number is county-observed, proxy-derived, or state fallback

### Layer 4: Land quality and physical context

Farmland-relevant:
- SSURGO / soil productivity
- irrigation and water stress
- drought and precipitation trends
- flood risk
- slope / buildability where relevant
- climate normals and climate drift

### Layer 5: Infrastructure and access

Farmland-relevant:
- elevators
- processors
- rail
- highways
- logistics nodes

Cross-asset extension later:
- substations
- transmission
- metro adjacency
- fiber

### Layer 6: Policy and market structure

Later / selective:
- crop insurance context
- county tax burden
- subsidy context where decision-relevant
- zoning / land-use constraints later
- interconnection / utility context later

## 7) Modeling Architecture

Atlas should support several explicit model types.

### 1. Market Value / Fair Value Model

Purpose:
- estimate whether county land is cheap or expensive

Inputs:
- cash rent
- cost ratio
- base rate
- risk premium
- long-run growth
- productivity factor
- benchmark value

Outputs:
- NOI / acre
- implied cap rate
- fair value
- spread to benchmark
- payback period
- rate sensitivity

This is the current core model and should remain central.

### 2. Lender / Credit View

Purpose:
- assess underwriting risk for debt

Inputs:
- LTV
- loan rate
- amortization
- rent stress
- operating stress

Outputs:
- DSCR
- debt yield later
- break-even rent
- refinance sensitivity later
- downside cushion

Part of this exists today. It should become an explicit mode instead of being buried inside general metrics.

### 3. Acquisition Underwriting

Purpose:
- evaluate whether to buy at a given price

Inputs:
- entry price
- acres
- expected rent path
- hold period
- capex assumptions
- exit assumptions

Outputs:
- IRR
- MOIC
- annual cash yield
- downside / base / upside

This is not complete yet and should be added after workflow closure.

### 4. Scenario Pack Compare

Purpose:
- compare best/base/worst cleanly

Inputs:
- saved packs
- assumption deltas

Outputs:
- side-by-side fair value
- cap rate
- NOI
- delta vs base
- driver decomposition

This exists in meaningful form today and should become more central.

### 5. Backtest / Strategy Evaluation

Purpose:
- validate whether a screen or thesis would have held up historically

Inputs:
- saved screen
- start year
- evaluation horizon
- assumptions

Outputs:
- flagged counties
- value change
- rent change
- simple total return estimate

This should be presented as screen validation, not as a full institutional performance engine.

### 6. Optionality / Alternate Use

Purpose:
- estimate value under non-farm alternative use cases

Initial later forms:
- data-center suitability
- solar / wind suitability
- industrial adjacency

This is a strategic extension and should reuse the same evidence + modeling structure.

## 8) Screening Architecture

The Screener should become one of the central Atlas surfaces.

### What users need from screening

Users should be able to filter on:
- valuation
- quality
- productivity
- lender / leverage metrics
- historical context
- physical risk later
- infrastructure later
- optionality later

### How screening should evolve

The screener should move toward:
- presets
- grouped metrics
- saved views
- eventually composable metric registry

### Farmland presets

Atlas should eventually ship presets such as:
- Farmland Fundamentals
- High Yield Counties
- Cheap vs History
- Lender Defensive
- Rate Shock Resilient
- Productivity Advantage
- Water Stress Watch

### Result row rule

Every result row should show:
- county
- state
- data quality
- benchmark value
- fair value
- spread
- cap rate
- rent multiple
- DSCR
- productivity status
- key reason(s) the county screened in

The screener should explain why a county qualified, not just dump numbers.

## 9) County Detail Architecture

County Detail should be the core analysis surface.

Recommended structure:

### Summary
- county name
- state
- as-of
- status / quick recommendation later
- watch
- add to research

### Valuation
- cash rent
- benchmark value
- fair value
- spread
- cap rate
- required return
- DSCR
- rent multiple

### Historical Context
- multi-year series
- z-scores
- percentile context
- sigma bands

### Explainability
- lineage by metric
- fallback level
- freshness
- missing critical data

### Productivity / Land Quality
- yield basis
- productivity adjustment
- soils later
- water later

### Risk
- flood later
- drought later
- water stress later
- climate context later
- access weak points

### Research
- thesis
- bull / bear
- risks
- catalysts
- decision state
- notes

### Modeling
- scenario summary
- last scenario run
- saved packs
- open in scenario lab

### Optionality later
- solar
- data center
- industrial
- energy

## 10) Research Workspace Architecture

Research Workspace should be the center of conviction, not just a notes page.

It should represent a live investment record for a county.

Required fields:
- status
- conviction
- thesis
- bull case
- bear case
- key risks
- catalysts
- decision state
- next questions later
- missing data
- last scenario run
- linked counties / comps later

### Automatic behavior

When a county is added to research:
- create the workspace record automatically
- carry county context in
- show latest scenario run if one exists
- show latest key metrics snapshot
- show data quality banner

## 11) Watchlist and Portfolio

### Watchlist

Purpose:
- monitor shortlisted counties over time

Should support:
- reason for watch
- changes since last review
- grouped watchlists later
- alerts later

### Portfolio

Purpose:
- represent actual or target exposure

Should support:
- holdings entry
- acreage and cost basis
- current value vs fair value
- concentration
- weighted metrics
- scenario aggregation later
- lender book view later

## 12) Product Rules

Every new Atlas feature should pass these tests:

1. Which of the five core questions does it answer?
2. Which user is it for?
3. Which workflow section does it belong in?
4. Does it improve a real decision, or only add more information?
5. Does it strengthen the farmland wedge now, or is it clearly later?

If it cannot answer those questions clearly, it should not be built yet.

## 13) Current Priority Order

### Phase 1: Make the farmland workflow coherent

Build:
- Screener -> County Detail -> Research Workspace -> Scenario Lab continuity
- `Add to Research` and `Open Scenario` actions from discovery surfaces
- saved screen creation from the screener
- launch backtest from saved screens
- unify research notes into one system
- in-app decision memo view

### Phase 2: Strengthen farmland underwriting

Build:
- explicit lender mode
- acquisition underwriting mode
- better risk layer
- soils / water / climate evidence
- stronger dashboard ranking logic

### Phase 3: Make monitoring and portfolio useful

Build:
- real holdings-entry flow
- better watchlists
- grouped monitoring
- alert center
- portfolio scenario aggregation

### Phase 4: Extend into industrial and energy

Build:
- same workflow spine
- new evidence layers
- new model types
- same research system

### Phase 5: Extend into risk and insurance

Build:
- portfolio normalization
- hazard overlays
- concentration views
- resilience / exposure lens

## 14) What Atlas Is Not

Atlas should not become:
- a generic listing marketplace
- a broker CRM
- a farm-operations dashboard
- a broad “everything about land” encyclopedia
- a collection of disconnected side modules

The product should stay centered on better geographic decisions.

## 15) Bottom Line

Atlas should be built as a geographic intelligence and decision platform for land.

The structure is:
- Discover
- Analyze
- Model
- Decide
- Aggregate
- Data

The first proof point is farmland.
The core value is not the number of features. It is the ability to move from signal to conviction without leaving the system.
