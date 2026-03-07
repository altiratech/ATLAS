# Atlas Industrial Land Research and Modeling Brief

Last updated: 2026-03-07 (ET)
Owner: Ryan + Codex + Claude
Status: Strategic extension brief for post-sprint execution planning

This document clarifies how industrial land research and modeling fit into Atlas without changing the current sprint scope.

It exists to answer five questions:
1. Who is the industrial-land user for Atlas?
2. What decisions are they actually trying to make?
3. What data must Atlas assemble to be useful?
4. What models make Atlas more valuable than a listings or map product?
5. How should this extension reuse the current Atlas product architecture?

## 1) Positioning

Atlas should not approach industrial land as "another property search vertical."

The better framing is:
- Atlas is a decision-support and underwriting platform for land under structural transition.
- Farmland is the first wedge.
- Industrial land is a major follow-on lane because the same land can be repriced by logistics, data-center, manufacturing, and energy demand.

Industrial land in Atlas should therefore mean:
- site intelligence,
- conversion and optionality analysis,
- scenario-based underwriting,
- structured research memory.

It should not initially mean:
- broker marketplace,
- listing syndication,
- transaction execution,
- generic commercial real estate search.

## 2) Primary Users

### Primary user set

**Institutional land and infrastructure investors**
- private equity and real asset investors evaluating industrial land or conversion plays
- infrastructure investors evaluating land for data center, logistics, and energy-adjacent use
- developers and capital partners evaluating pipeline sites before they are fully entitled

**Lenders and credit teams**
- banks and private credit teams underwriting land loans or predevelopment risk
- teams that need a defensible view of downside, timeline risk, and infrastructure dependency

**Site selection and strategy teams**
- internal strategy teams at developers, operators, or portfolio companies
- groups comparing multiple candidate markets or sites under different infrastructure assumptions

### Secondary user set

**Advisors and intermediaries**
- consultants, appraisers, land advisors, and independent analysts preparing site memos or investment recommendations

### Anti-ICP for early industrial expansion

Atlas should not initially optimize for:
- small retail land buyers browsing listings
- brokers looking mainly for CRM or listing exposure
- municipalities seeking public-facing economic development portals

Those can come later. The near-term value is institutional research and decision support.

## 3) Core Jobs To Be Done

Industrial-land users are trying to answer questions like:

1. Is this land strategically advantaged or constrained for a target use?
2. What is the highest-probability use case: logistics, data center, manufacturing, energy support, or hold?
3. What are the gating risks: power, water, zoning, floodplain, topography, entitlement timeline, environmental burden?
4. How does this site compare with alternatives in the same region or across markets?
5. What is the value of this land under different future states?
6. How defensible is the upside thesis, and what evidence supports it?

That is a research-and-modeling workflow, not a simple search workflow.

## 4) Why This Matters For Atlas

Atlas already has the right underlying product shape:
- dense screener,
- geographic detail page,
- research workspace,
- scenario compare,
- saved assumptions,
- explainability and lineage.

Those are reusable across asset classes.

The long-term Atlas advantage is not that it can show a parcel on a map. Many products can do that.

The advantage is that Atlas can unify:
- land valuation context,
- infrastructure readiness,
- environmental constraints,
- use-case-specific scenario modeling,
- and structured investment reasoning

in one workflow.

That is the gap between listings tools and an actual intelligence platform.

## 5) Industrial Land Product Thesis

Atlas industrial land should answer three layers of analysis.

### Layer A: Can this site work?

This is feasibility and gating risk.

Core questions:
- Is there enough power nearby?
- Is water available and affordable?
- Is the parcel configuration usable?
- Is the terrain buildable?
- Are there flood, wetlands, seismic, or remediation risks?
- Are zoning and entitlement likely to be straightforward or painful?
- Is there transport access appropriate to the intended use?

### Layer B: What is this site best suited for?

This is use-case fit.

Candidate use types:
- data center site
- logistics / warehouse / distribution
- light industrial / manufacturing
- energy-adjacent industrial support
- land bank / hold for future conversion

The point is not to say every parcel is good for everything.
The point is to determine which thesis has the strongest evidence and where the disqualifiers sit.

### Layer C: What is it worth under different futures?

This is underwriting and scenario modeling.

Examples:
- What is the value if power arrives in 24 months versus 48 months?
- What happens if water upgrades are required?
- What happens if entitlement is delayed by one year?
- What is the upside if a site shifts from generic industrial to data center viable?
- What is the downside if infrastructure assumptions fail?

This is where Atlas becomes more useful than a map overlay tool.

## 6) Data Domains Atlas Will Need

Industrial land should be built as a layered evidence stack.

### A. Parcel and ownership foundation
- parcel boundaries
- acreage and shape metrics
- ownership and transaction history
- assessed value and tax records
- subdivision or assemblage indicators

Likely sources:
- Regrid
- county assessor / GIS sources
- state parcel repositories where available

### B. Power and utility readiness
- transmission line proximity
- substation proximity and known capacity where available
- utility territory
- wholesale and retail electricity pricing
- interconnection queue context
- outage / reliability proxies where obtainable

Likely sources:
- EIA
- FERC
- ISO / RTO data
- state utility commission filings
- utility maps and tariffs

### C. Water and wastewater
- water source proximity
- groundwater and surface-water context
- water stress / scarcity indicators
- municipal water and wastewater access
- cooling-risk implications for data-center use

Likely sources:
- USGS
- state water agencies
- local utility districts
- EPA / local wastewater infrastructure records

### D. Connectivity and transport
- fiber backbone or carrier hotel proximity
- highway access
- rail access where relevant
- port / inland terminal proximity where relevant
- airport cargo proximity for selected use cases

Likely sources:
- FCC broadband / infrastructure datasets
- state DOT and freight datasets
- commercial fiber datasets later if needed

### E. Physical and environmental constraints
- topography / slope
- floodplain
- wetlands
- wildfire, seismic, and other natural hazard overlays
- contamination / remediation signals
- endangered-species or protected-land conflicts where relevant

Likely sources:
- FEMA
- USGS
- EPA
- NOAA
- state environmental agencies

### F. Zoning and entitlement context
- current zoning
- future land use category where available
- adjacency / compatibility constraints
- permitting and entitlement complexity proxies

Likely sources:
- county and municipal planning departments
- zoning maps and planning documents
- local development codes

### G. Market and demand context
- industrial rent and land pricing benchmarks
- absorption and vacancy context
- data-center market growth indicators
- manufacturing / logistics demand proxies
- labor and population context where relevant

Likely sources:
- public economic data first
- selected commercial sources later if needed

## 7) Core Industrial Models Atlas Should Eventually Support

### Model 1: Site Readiness Score
A weighted score that answers whether a site is physically and infrastructurally viable for a specific use.

Example factors:
- power access
- water access
- parcel geometry
- transport proximity
- environmental burden
- entitlement complexity

This should always be transparent and decomposed, not a black-box score.

### Model 2: Use-Case Fit Model
A classifier-style scoring model that ranks suitability for:
- logistics
- data center
- light industrial
- manufacturing
- energy support / related industrial
- hold / optionality

The important output is not one label. It is:
- strongest candidate use
- second-best use
- disqualifiers
- missing information

### Model 3: Residual Land Value / Optionality Model
A scenario model for what the land could be worth under different future infrastructure and entitlement outcomes.

Example variables:
- time to power
- utility upgrade cost
- entitlement timeline
- site-prep cost
- lease-rate assumptions
- stabilization timing
- discount rate

### Model 4: Infrastructure Timing Risk Model
A decision-support model that highlights how fragile the thesis is to delays in:
- power delivery
- water / wastewater upgrades
- road access improvements
- entitlement / permitting

### Model 5: Comparable Market Context Model
A benchmarking layer that answers:
- how this site compares to peer sites
- how this county / submarket compares to peer markets
- whether land pricing is ahead of or behind infrastructure reality

## 8) Atlas Workflow For Industrial Land

The workflow should remain consistent with the agriculture product.

### Step 1: Screen
User screens counties, submarkets, or parcels by:
- power adjacency
- transport access
- zoning fit
- hazard exclusions
- pricing / valuation ranges
- readiness score or sub-score thresholds

### Step 2: Review detail
User opens a site or geography and sees:
- current evidence stack
- use-case fit summary
- key constraints
- benchmark context
- lineage / freshness / coverage notes

### Step 3: Save research
User saves:
- thesis
- target use case
- bull / base / bear assumptions
- risks
- catalyst milestones
- go / hold / reject state

### Step 4: Run scenarios
User compares scenarios such as:
- base industrial development
- upside data-center conversion
- delayed infrastructure case
- entitlement failure / lower-density fallback

### Step 5: Produce decision output
User generates an internal memo or decision view with:
- why the site matters
- what assumptions drive value
- what could break the thesis
- what evidence is weak or stale

That continuity is more important than adding a separate industrial-only UX shell.

## 9) Differentiation

Atlas industrial land should be differentiated by:

### A. Optionality framing
Most tools describe what a site is.
Atlas should describe what a site could become and how credible each path is.

### B. Decision orientation
Most tools stop at map layers and comps.
Atlas should continue into scenario modeling and research persistence.

### C. Explainability
Every score should explain:
- source data,
- freshness,
- missing fields,
- confidence level,
- and what assumptions matter most.

### D. Cross-asset thinking
Atlas can evaluate the same geography across multiple competing land theses:
- agriculture
- industrial
- data center
- energy

That is strategically stronger than a siloed vertical tool.

## 10) Build Sequence Recommendation

This should not displace the current Atlas sprint.

### Current sprint remains
- agriculture data foundation
- research workflow coherence
- scenario continuity
- decision-ready outputs

### First post-sprint industrial block
Build only enough to validate the industrial thesis.

Recommended Phase 1:
1. industrial-land extension brief and ICP alignment
2. power / energy pricing foundation
3. generic site-intelligence metric registry
4. one use-case-specific scorecard: data center site suitability
5. research workspace fields that support non-ag use cases

### Phase 2
1. parcel and ownership layer
2. environmental / hazard overlays
3. logistics / light-industrial scorecard
4. industrial scenario templates

### Phase 3
1. broader market benchmarks
2. deeper utility and entitlement intelligence
3. optional parcel-level compare and memo outputs

## 11) Immediate Implication For Current Atlas Work

The current agriculture sprint should build product primitives that survive the extension.

That means prioritizing:
- screener -> research workspace linkage
- scenario compare / save / reload
- structured conviction fields
- decision-ready outputs
- metric lineage / freshness / explainability

Those make Atlas stronger now and remain reusable when industrial land is added.

What should not happen:
- hard-coding Atlas more deeply into crop-specific UX assumptions
- treating industrial land as a separate future product
- spending too much time polishing the tail end of agriculture coverage while the core research workflow is still incomplete

## 12) Bottom-Line Product Rule

Atlas should be built as:
- a research system,
- an underwriting system,
- and a modeling system

for land under structural transition.

Farmland proves the workflow.
Industrial land expands the market.
The product architecture should be designed so that expansion feels native rather than bolted on.
