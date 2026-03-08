# Atlas Industrial Land Post-Sprint Roadmap

Last updated: 2026-03-07 (ET)
Owner: Ryan + Codex + Claude
Status: Execution roadmap for the first industrial-land expansion after the current agriculture sprint

This document converts the industrial-land extension brief into an execution sequence.

It answers four concrete questions:
1. What should Atlas build first for industrial land?
2. Who is the first user for that expansion?
3. What data should come in first?
4. What exact build order creates the most value with the least architectural thrash?

## 1) Executive Summary

The first industrial-land expansion should **not** start with parcels, listings, or a broad industrial marketplace.

It should start with a **data-center and infrastructure-oriented site research workflow** built on top of Atlas's existing research and modeling primitives.

Recommended first industrial build:
- first user: institutional investor / developer / lender evaluating land for data-center or power-intensive industrial use
- first workflow: screen geographies -> review site-intelligence detail -> save research thesis -> run scenarios -> produce a decision view
- first scorecard: `Data Center Site Suitability v1`
- first data stack: public, repeatable, explainable infrastructure and risk layers

This is the best starting point because it is:
- more differentiated than generic industrial search,
- more aligned with the long-term Atlas thesis about land under structural transition,
- better suited to public-data-first execution,
- and reusable later for logistics, manufacturing, and energy-adjacent land.

It also creates a reusable hazard-and-infrastructure layer that can later support adjacent risk-management users such as:
- mid-sized carriers,
- reinsurers,
- MGAs,
- climate-focused risk consultants.

## 2) Why This Should Be the First Industrial Wedge

There are three realistic ways Atlas could enter industrial land:

1. generic industrial-land screener
2. logistics / warehouse site screen
3. data-center / power-intensive site intelligence

The third is the best first wedge.

### Why not generic industrial-land search first?
- too broad
- too easy to become a weak listings product
- not differentiated enough
- encourages shallow map-and-filter behavior instead of research workflow depth

### Why not logistics first?
- valid future lane, but more crowded
- easier to collapse into standard CRE market data and highway proximity screens
- less distinctive relative to Atlas's structural-transition thesis

### Why data-center / power-intensive site intelligence first?
- high-value user set
- strong alignment with infrastructure scarcity and land optionality
- clear gating variables: power, water, fiber, flood risk, parcel scale, entitlement friction
- public data is imperfect but good enough to build a useful first research layer
- the underlying components are reusable for future industrial, manufacturing, and energy workflows

## 3) First User To Build For

### Primary initial user

**Institutional investor, developer, or lender evaluating land for data-center or power-intensive industrial use before the site is fully de-risked.**

This user is trying to answer:
- Is this location worth deeper pursuit?
- What are the gating infrastructure risks?
- Is the upside driven by real evidence or by wishful thinking?
- How does this compare with alternatives?
- What happens to value if key assumptions move?

### Representative use cases

**Investor use case**
- A real-assets or infrastructure investor screens counties and submarkets for land with credible data-center optionality.
- They shortlist candidates, save research notes, and compare upside versus risk.

**Developer use case**
- A developer or capital partner compares possible expansion corridors.
- They need a structured view of power, water, transport, hazard, and permitting friction.

**Lender use case**
- A credit team underwrites land with a future development thesis.
- They need downside analysis if infrastructure or entitlement timing slips.

### Product implication

The first industrial workflow should optimize for **decision support before full diligence**, not final engineering feasibility.

## 4) First User Workflow Atlas Should Support

This should reuse the Atlas agriculture workflow shape rather than creating a separate product shell.

### Step 1: Screen a geography
User screens by:
- electricity price or region proxy
- power infrastructure proximity proxy
- water stress threshold
- flood / hazard exclusions
- highway / rail / airport proximity
- land cost or value proxy
- zoning / entitlement friendliness proxy

### Step 2: Open industrial detail view
The detail experience should show:
- site or geography summary
- use-case fit summary
- gating constraints
- evidence lineage and freshness
- benchmark context versus peer geographies

### Step 3: Save research workspace
The user records:
- target use case
- thesis
- bull / base / bear case
- critical risks
- catalysts and milestones
- go / watch / reject state

### Step 4: Run scenarios
The user compares:
- base industrial case
- upside data-center case
- infrastructure delay case
- entitlement delay / failure case

### Step 5: Generate decision-ready output
The user gets an internal memo view showing:
- why this geography matters
- what is attractive
- what is missing
- what assumptions drive value
- what could break the thesis

That is the first complete industrial workflow Atlas should aim to support.

## 5) First Scorecard / Model To Build

## Recommended first scorecard: `Data Center Site Suitability v1`

This should be the first industrial model because it is narrow enough to ship and strategic enough to matter.

### Objective
Produce an explainable score that helps a user decide whether a geography or candidate site merits deeper investigation for data-center or power-intensive industrial use.

### Output shape
The scorecard should return:
- overall suitability score
- component scores
- major disqualifiers
- missing critical data
- confidence / evidence quality
- scenario sensitivity flags

### Initial score components

**1. Power readiness**
- transmission / substation proximity proxy
- electricity cost proxy
- utility territory or region context
- interconnection pressure proxy where available

**2. Water readiness**
- water stress level
- access to municipal or surface-water systems proxy
- cooling burden risk

**3. Connectivity / access**
- broadband / fiber proxy
- highway access
- airport / metro proximity proxy where relevant

**4. Physical suitability**
- acreage / scale suitability
- slope / topography
- floodplain exposure
- wetlands or major environmental conflicts

**5. Entitlement / market friction**
- zoning compatibility proxy
- county / municipal development context
- permitting complexity proxy
- land-cost competitiveness

### V1 rules
- no black-box score
- every component must map to visible evidence
- users must be able to see what is driving the score
- users must be able to see what is missing or stale

### What this score should not claim in v1
- exact utility capacity
- guaranteed fiber availability
- engineering-grade site certification
- parcel-level entitlement certainty

V1 is an **investment research and triage score**, not a replacement for consultants or utility studies.

## 6) First Data Sources To Bring In

The first industrial data layer should be chosen by this rule:
- public or low-friction first
- repeatable ingest
- enough structure to drive useful research outputs
- avoid commercial-data dependency until the workflow proves itself

### Tier A: Must-have first-wave sources

**EIA electricity pricing and power-region context**
- role: energy cost baseline and regional power context
- why first: cheap, public, strategic, reusable across industrial and energy use cases
- likely use: dashboard cards, screener filters, scenario assumptions

**HIFLD / public electric infrastructure layers**
- role: substations, transmission lines, grid-adjacent infrastructure proxies
- why first: site-readiness score needs power adjacency even before exact capacity data exists
- likely use: readiness scoring and map/context overlays later

**FEMA flood hazard layers**
- role: immediate exclusion and risk signal
- why first: important, public, easy to explain, high value in screening
- likely use: exclusion filter and risk component
- secondary long-term use: property CAT aggregation, climate risk dashboards, and geographic accumulation views

**USGS elevation / slope proxies**
- role: physical buildability signal
- why first: simple, public, broadly reusable across use cases
- likely use: physical suitability component

**FCC broadband / connectivity proxies**
- role: early connectivity signal until better fiber data is available
- why first: imperfect but directionally useful for a v1 research workflow
- likely use: connectivity sub-score with explicit confidence caveat

**OpenStreetMap / DOT transport access proxies**
- role: interstate / freight accessibility
- why first: useful for industrial site comparison and cheap to ingest
- likely use: access component for both data-center and logistics extensions

### Tier B: High-value second-wave sources

**USGS / state water stress and supply context**
- role: cooling and long-term water risk
- why second wave: critical for data centers, but some sources are more fragmented

**EPA environmental / remediation layers**
- role: contamination and environmental burden flags
- why second wave: strong underwriting value, but integration may vary by geography

**Local zoning / planning overlays**
- role: entitlement and compatibility context
- why second wave: important but fragmented and labor-intensive

**County assessor / parcel records**
- role: ownership, assessed value, parcel-level thesis refinement
- why second wave: highly valuable, but more operationally complex and often uneven

### Tier C: Later / commercial-enrichment layer

**Regrid parcel dataset**
- role: normalized parcel layer
- why later: likely worth paying for once the workflow is proven

**Commercial fiber / network datasets**
- role: better connectivity and backbone certainty
- why later: expensive and best added after the v1 scorecard proves demand

**Commercial CRE / industrial benchmarking data**
- role: rent, vacancy, absorption, comp depth
- why later: useful, but not necessary to prove the differentiated thesis

## 7) Adjacent Insurance / Risk Lane

This should be treated as a future extension of the same Atlas core, not as a separate product rewrite.

### Future target users
- mid-sized carriers
- MGAs
- reinsurers
- climate and resilience consultants

### Future use cases
- property CAT aggregation
- climate risk dashboards
- cyber infrastructure exposure mapping

### What changes for those users
- the data layer matters even more than the underwriting narrative
- portfolio and aggregation views matter more than single-county investment memos
- hazard, dependency, and concentration reporting become first-class outputs

### What does not change
- explainable lineage
- geographic screening
- scenario and stress thinking
- research memory and decision continuity

The implication for current Atlas work:
- build hazard and infrastructure layers generically enough to be reused later,
- but keep the immediate workflow focused on land and infrastructure underwriting first.

## 8) Product Changes Needed Before Industrial Data Lands

Atlas should not wait for every industrial dataset before making a few product-level changes.

### A. Generalize research workspace fields
Add or verify support for:
- `asset_thesis_type`
- `target_use_case`
- `approval_state`
- `critical_dependencies`
- `missing_data_notes`

This keeps the research workspace from feeling crop-specific.

### B. Generalize metric grouping
Current Atlas metric groups should evolve toward domains such as:
- valuation
- infrastructure
- utilities and power
- transport and connectivity
- environmental risk
- water
- permitting and entitlement

### C. Add model-template support
Scenario Lab should support named templates such as:
- farmland valuation
- data-center site
- industrial conversion
- energy-adjacent land

### D. Preserve explainability everywhere
Every industrial metric or score needs:
- lineage
- freshness
- confidence
- missingness disclosure

This matters more in industrial land than in ag because the evidence stack is messier.

## 9) Exact Build Order

## Phase 0: Finish current Atlas sprint
Do not interrupt the current agriculture sprint.

Finish first:
- research workflow closure
- scenario save / compare / reload
- screener -> research linkage
- decision-ready outputs

Those are necessary because industrial land will rely on the same workflow.

## Phase 1: Industrial foundation (first 1-2 weeks post-sprint)

**Goal:** create the first industrial research lane without parcel sprawl.

Build order:
1. make research workspace and scenario templates asset-class aware
2. add power / electricity region data and utility-related metrics
3. add hazard and physical-suitability metrics (flood, slope)
4. add connectivity and transport proxies
5. expose an initial industrial metric registry in Atlas UI

Deliverable:
- industrial-geography detail page state can show evidence and thesis support, even before parcel-level workflows exist

## Phase 2: First scorecard (next 1-2 weeks)

**Goal:** ship `Data Center Site Suitability v1`

Build order:
1. define component weights and explainability schema
2. compute component scores from available public data
3. expose score and component breakdown on detail page
4. add screener filters for score threshold and key exclusions
5. allow saving the scorecard result into the research workspace

Deliverable:
- a user can screen, inspect, and save a data-center suitability thesis with visible evidence and caveats

## Phase 3: First industrial scenario workflow (next 1-2 weeks)

**Goal:** make the industrial lane economically useful, not just descriptive

Build order:
1. create a `data_center_site` scenario template
2. add assumptions for time-to-power, utility-upgrade cost, entitlement delay, water upgrade, and lease-rate case
3. support bull / base / bear compare mode
4. save and reload industrial scenario runs from research workspace
5. include industrial memo view in decision-ready output

Deliverable:
- a user can move from industrial screen result to saved underwriting view in one continuous workflow

## Phase 4: Parcel and market enrichment (after workflow proof)

**Goal:** deepen accuracy after the workflow is already valuable

Build order:
1. parcel and ownership normalization
2. local zoning / planning layers
3. stronger water and wastewater data
4. logistics / light-industrial scorecard
5. market benchmark overlays and peer-market compare

Deliverable:
- Atlas shifts from geography-first industrial intelligence toward parcel-aware underwriting

## 10) Success Criteria For The First Industrial Block

Atlas industrial expansion is successful if a target user can:
1. identify 5-10 interesting candidate geographies
2. understand why Atlas likes or dislikes them
3. save a thesis with explicit risks and missing data
4. run at least one scenario comparison
5. produce a decision-ready internal summary

If Atlas can do that, then parcel enrichment and premium data become easier to justify.

## 11) What To Explicitly Avoid

Do not start with:
- a broad industrial marketplace
- listing ingestion as the primary product motion
- parcel-by-parcel manual enrichment before the workflow exists
- a completely separate industrial UX shell
- a score that implies engineering certainty the data cannot support

The product risk is not "being too narrow."
The product risk is building a wide but shallow industrial layer that looks impressive and is not decision-useful.

## 12) Recommended Immediate Next Action

After the current agriculture sprint is stabilized, the first industrial planning-to-build handoff should be:

1. create an implementation PRD for `Data Center Site Suitability v1`
2. define the exact first-wave public data sources and ingestion schema
3. map the required UI changes into the current Atlas workflow
4. keep all new work inside the existing Atlas product shell

That is the cleanest path from current Atlas to industrial-land Atlas.
