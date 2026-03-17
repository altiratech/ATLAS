# Altira Atlas Module Boundary and Suite Integration Memo

Last updated: 2026-03-17 (ET)
Owner: Ryan + Codex + Claude
Status: Canonical Atlas boundary memo

This memo defines what Atlas should own inside the Altira suite, what it should stop trying to own, and how it should fit into a future shared Altira home.

Important note:
- This is an **Atlas-only** memo.
- Any mention of a future parcel/site-native module is included **only** to help Atlas avoid overlap and preserve future integration paths.
- This document is **not** a development manual, product brief, or authoritative scope document for that future module.

## 1) Atlas Lane

Altira Atlas is the **geo/opportunity underwriting module** for location-sensitive real assets.

Atlas should help investment teams answer:
1. Where should we focus?
2. What is happening in this market or geography?
3. What does the underwriting say under different assumptions?
4. What are the major risks and constraints at the geography/opportunity level?
5. Is this strong enough to pursue, monitor, lend against, compare, or pass on?

Atlas should also support a second layer of questioning:
- what specific investment thesis are we applying to this geography/opportunity universe?
- which parts of that thesis are supported by current data?
- which parts remain missing and should not be faked?

Atlas owns:
- market / county / region opportunity discovery
- geo-level evidence and explainability
- underwriting and scenario analysis
- decision capture and memo-quality research records
- comparison, watchlist, and portfolio exposure views

Atlas does **not** own:
- parcel-native site diligence as the primary product center
- assemblage workflow as a first-class workflow
- path-to-power / path-to-water / entitlement truth as parcel operations
- listings marketplace behavior
- generic GIS viewer behavior

## 2) Primary User

Atlas is for:
- investment analysts
- deal teams
- lenders and advisors
- portfolio managers

These users are evaluating **location-sensitive real-asset opportunities**, not casually browsing land records.

Current live wedge:
- farmland investors and funds
- ag lenders and advisors
- independent analysts doing county-level diligence

Near-term Atlas expansion should stay in the same lane:
- geography-level industrial land intelligence
- geography-level logistics and data-center market screening
- geography-level energy / infrastructure land opportunity context
- geography-level development-oriented market intelligence

The key rule:
- Atlas may broaden by **perspective**
- Atlas should stay centered on **opportunity/geography underwriting**

## 3) Canonical Atlas Objects

Atlas should center on these objects:

- `perspective`
  - the investment lens or workflow default, such as farmland income
- `thesis_lens`
  - the investment question applied to a perspective, such as ag transition or resilient production base
- `saved_view`
  - a reusable screen/view configuration with filters, sort, and context
- `geo_entity`
  - county, region, market, or another geography-level analysis unit
- `opportunity`
  - the active investment target expressed at Atlas’s geography/opportunity layer
- `underwrite`
  - valuation, downside, leverage, and scenario outputs attached to an opportunity
- `research_record`
  - thesis, risks, catalysts, memo context, and decision state
- `portfolio`
  - grouped exposure, concentration, and risk context across opportunities/holdings

Atlas should not treat `parcel` as its canonical object today.

If parcel/site references appear later inside Atlas, they should be supporting references that help an opportunity record, not a shift in Atlas’s core product center.

## 4) Core Atlas Workflow

Atlas should optimize this loop:

1. discover opportunity
2. open geo/opportunity detail
3. underwrite
4. capture conviction
5. compare, track, and monitor exposure

More explicitly:
- start from perspective-aware discovery
- apply the relevant thesis lens
- move into geography/opportunity detail
- run underwriting and downside analysis
- record memo-quality research and decision state
- compare alternatives and manage exposure at portfolio level

Atlas should not optimize first for:
- parcel browsing
- entitlement workflow operations
- interactive assemblage management
- broker/listings workflows

## 5) What Atlas Owns

Atlas should own these product responsibilities:

- geography-level screening
- county / market opportunity analysis
- evidence quality and lineage context
- benchmark and modeled interpretation
- underwriting, leverage, and scenario work
- decision memo / research record workflow
- portfolio concentration, hazard, and exposure monitoring
- perspective-aware saved views and workflow continuity

This means Atlas should keep getting better at:
- clearer opportunity-centric navigation
- stronger underwrite and memo quality
- more defensible geo-level evidence
- better portfolio and monitoring workflow

## 6) What Atlas Does Not Own

Atlas should explicitly avoid becoming:

- a parcel-native industrial land operating system
- an assemblage management tool
- a power-availability certification product
- an entitlement execution workflow
- a generic GIS viewer
- a listings portal or marketplace

Atlas can consume or link to those contexts later, but it should not reorganize itself around them.

## 7) Future Site-Native Module Note

A future parcel/site-native module may later exist in the Altira suite.

That future module, if it exists, would likely handle questions such as:
- parcel feasibility
- infrastructure readiness
- site optionality
- assemblage complexity
- parcel-level blockers and ground-change monitoring

This note exists **only** so Atlas does not drift into that lane by accident.

This memo should **not** be used as:
- a product brief for that future module
- a scoping document for that future module
- a development manual for that future module

The only point of including it here is to keep Atlas boundaries clean and future integration sane.

## 8) Suite Integration Posture

From Atlas’s point of view, the Altira suite should eventually feel like:
- one shared home / launcher
- one shared identity and workspace model
- one shared billing and entitlement layer
- separate product modules underneath

Atlas should remain a distinct module inside that home.

Future cross-module value should come from:
- shared launcher
- deep linking
- carried context
- shared saved-work or inbox concepts later

Atlas-side examples:
- Atlas opportunity -> future site-native module when the question becomes parcel feasibility or site optionality
- future site-native module -> Atlas when the question becomes underwriting, decision capture, comparison, or portfolio exposure

Atlas should not require:
- one monolithic app
- one monolithic backend
- one universal cross-product domain model

Shared suite layer should stay limited to:
- identity
- workspace
- session
- role
- billing
- entitlement
- launcher and shell conventions

## 9) What This Means For Near-Term Atlas Work

Atlas should keep improving as a **geo/opportunity workbench**.

Prioritize:
- opportunity-centric workflow
- perspective + thesis-lens aware discovery
- underwriting clarity
- memo / decision record quality
- portfolio exposure and monitoring
- perspective-aware discovery and saved views

De-prioritize:
- parcel-native feature creep
- making the homepage/dashboard carry parcel/site workflow burdens
- overextending Atlas into a site-optionality product before a separate lane exists

## 10) Boundary Test

A proposed Atlas feature belongs in Atlas if it primarily helps answer:
- where should we focus?
- what is happening in this geography?
- what does the underwriting say?
- what is the decision state?
- how does it fit with portfolio exposure?

A proposed feature likely does **not** belong in Atlas if it primarily helps answer:
- what can this exact parcel become?
- who owns the adjacent parcels needed for assemblage?
- what is the precise parcel-level path to power / water / entitlement?
- what changed on this exact site this week?

That boundary should guide future Atlas decisions.
