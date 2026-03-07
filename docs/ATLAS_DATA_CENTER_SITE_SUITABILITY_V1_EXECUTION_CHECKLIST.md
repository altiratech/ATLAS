# Atlas Data Center Site Suitability v1 Execution Checklist

Last updated: 2026-03-07 (ET)
Owner: Ryan + Codex + Claude
Status: Execution checklist
Related:
- `docs/ATLAS_DATA_CENTER_SITE_SUITABILITY_V1_PRD.md`
- `docs/ATLAS_INDUSTRIAL_LAND_POST_SPRINT_ROADMAP.md`

This checklist breaks the first industrial Atlas build into concrete execution blocks.

## Block 1: Product and schema scaffolding

- [x] Write implementation PRD for `Data Center Site Suitability v1`
- [x] Add industrial-land post-sprint roadmap
- [x] Extend research workspace contract for industrial fields
- [x] Add industrial scorecard service scaffold in Worker
- [x] Add first industrial scorecard endpoint scaffold
- [x] Register first-wave industrial series definitions in the existing Atlas data catalog
- [x] Add a basic industrial section to county detail using honest missingness / confidence states
- [ ] Validate production render after deploy

## Block 2: First-wave industrial evidence ingest

- [ ] Define exact first-wave source acquisition plan for:
  - [x] EIA power pricing / power region context
  - [ ] public electric infrastructure proxies
  - [ ] FEMA flood
  - [ ] USGS slope / elevation
  - [ ] FCC connectivity proxy
  - [ ] transport access proxy
- [ ] Map each source to specific `series_key` entries and geo levels
- [x] Build ingest scripts / transforms for the first source subset
- [ ] Load first real industrial evidence into D1
- [ ] Validate lineage, freshness, and missingness behavior in the scorecard endpoint

## Block 3: Score quality and detail-page usefulness

- [ ] Replace placeholder missingness-only behavior with real component scoring from ingested data
- [ ] Tune weighting and disqualifier thresholds for v1
- [ ] Add clearer score explanations on county detail
- [ ] Add evidence-level freshness / source labels in the industrial section
- [ ] Confirm the scorecard stays explicit about proxy data and uncertainty

## Block 4: Industrial screening workflow

- [ ] Add a `Data Center Screening` preset or temporary industrial screener mode
- [ ] Support sort/filter by overall score, confidence, and major exclusions
- [ ] Link screened counties directly into the research workspace
- [ ] Ensure industrial use-case fields persist through the workspace flow

## Block 5: Research and decision workflow closure

- [ ] Include industrial scorecard summary in the decision-ready memo view
- [ ] Add industrial scenario template stub (`data_center_site`) in Scenario Lab
- [ ] Support save / reload / compare for industrial scenario runs
- [ ] Validate end-to-end workflow:
  - [ ] screen
  - [ ] review industrial detail
  - [ ] save research thesis
  - [ ] run scenario
  - [ ] produce decision-ready view

## Current recommendation

Do not jump to parcel-heavy expansion yet.

The next highest-value implementation step after the current scaffold is:
1. first-wave industrial evidence ingest,
2. then a usable industrial screener path,
3. then scenario and memo continuity.

That preserves Atlas as a research and modeling platform rather than turning it into a shallow industrial search tool.
