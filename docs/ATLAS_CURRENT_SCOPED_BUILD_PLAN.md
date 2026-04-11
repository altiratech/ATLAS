# Atlas Current Scoped Build Plan

Last updated: 2026-03-21 (ET)
Owner: Ryan + Codex + Claude
Status: Canonical active implementation scope for Atlas

This document defines what Atlas is actively building now.

Use this when the question is:
- what is in current scope
- what is explicitly deferred
- what order we are building in
- how current work maps back to the Atlas north star

For the long-term vision, use [ATLAS_NORTH_STAR.md](./ATLAS_NORTH_STAR.md).
For desirable future capabilities outside current scope, use [ATLAS_EXPANSION_MAP.md](./ATLAS_EXPANSION_MAP.md).
For near-term usability corrections derived from the live product walkthrough, use [ATLAS_UX_CORRECTION_PLAN.md](./ATLAS_UX_CORRECTION_PLAN.md).
For the recovered post-UX-5 browser validation findings, use [ATLAS_BROWSER_VALIDATION_2026_03_21.md](./ATLAS_BROWSER_VALIDATION_2026_03_21.md).

## 1) Current Product Focus

Atlas is currently focused on:
- the farmland-first wedge
- geo/opportunity underwriting
- thesis-layer support on top of that wedge
- stronger working surfaces for serious analysts

Current guardrails:
- county / market / region first
- no parcel-native site-operations drift
- no dashboard-first product expression
- no fake thesis inputs
- no broad workflow-object expansion before core workflow proof

## 2) In Scope Now

### Core product direction
- thesis-driven geo/opportunity workflow
- launcher-first Atlas Home and perspective homes
- perspective + thesis-lens context carried through shared tools

### Active workflow surfaces
- Screener
- County Detail
- Scenario Lab
- Research Workspace
- Portfolio
- Data Sources / coverage / freshness context

### Current build emphasis
- Screener-first DataGrid foundation
- saved views as richer working-state objects
- research / scenario / portfolio continuity
- clearer thesis-aware reads in discovery and memo surfaces
- honest lineage / freshness / coverage context on active surfaces
- first-time-user workflow legibility across Home, Perspective Home, Screener, and downstream decision pages
- Screener progressive disclosure so the first-run path reads as screen -> filter -> run -> open county instead of exposing Atlas internals too early
- downstream empty-state guidance so Watchlist, Comparison, Workspace, Scenario Lab, Portfolio, and Backtest no longer feel like dead ends on first use
- clearer county -> research -> scenario sequencing so discovery turns into memo work before Atlas asks the user to model downside cases
- secondary-surface demotion so Backtest, Assumptions, and Data Sources read as support tools after the main Atlas flow rather than equal first-run destinations
- browser-validated first-run reliability and workflow closure, especially:
  - recommended Screener starter paths that actually return live counties
  - Scenario Lab results that persist cleanly back into Research
  - `Back To Research Memo` returning cleanly with saved scenario context visible in Research
- one remaining UX question after the browser loop closed:
  - whether the refined `Research Workspace` mode split is now simple enough for first-time use, or still needs one more browser-verified pass
- one bounded substance prototype under evaluation after workflow closure:
  - Research Source Monitor using Browser Rendering `/crawl` plus Workers AI as evidence-bound memo support attached to `research_workspaces`

## 3) Explicitly Deferred

These are not part of the active scoped build right now.

- kanban view in Screener
- gallery/card view in Screener
- Research drag/drop kanban workflow
- opportunity pipeline as a first-class object
- custom fields and generic database-builder behavior
- fully asset-class-agnostic county pages across all domains
- broad multi-model Scenario Lab subtabs beyond what current proof/data supports
- full universal metric registry across every future domain
- parcel-native site diligence / infrastructure-truth workflow

## 4) Current Build Sequence

| Sequence | Current build block | Why it is in scope now | North star linkage |
| --- | --- | --- | --- |
| `S1` | Screener-first DataGrid foundation | Improve the highest-value analytical surface without changing Atlas's product center | `NS-1`, `NS-6`, `NS-8` |
| `S2` | Saved-view state deepening | Preserve analyst working context so Atlas behaves like a real terminal instead of a disposable filter page | `NS-1`, `NS-8` |
| `S3` | Thesis-aware county and research reads | Make Atlas more useful for real investigation without pretending new data exists | `NS-2`, `NS-4`, `NS-7` |
| `S4` | Research / Scenario / Portfolio continuity | Tighten the path from discovery to decision to exposure | `NS-3`, `NS-4`, `NS-5` |
| `S5` | Data lineage / freshness / basis clarity | Keep outputs defensible while the product deepens | `NS-6` |
| `S6` | First honest non-farmland expansion factors where data is real | Expand Atlas carefully by perspective without breaking the geo/opportunity lane | `NS-1`, `NS-2`, `NS-7` |
| `S7` | First-time-user workflow correction | Make Atlas easier to understand and use by guiding one strong path instead of exposing product mechanics too early | `NS-1`, `NS-4`, `NS-8` |

## 5) Implementation Rule

A current Atlas feature belongs in scoped build only if it does one of two things:
- adds a real capability needed for `S1` through `S6`, or
- removes a blocker that prevents Atlas from reaching one of the linked north-star capabilities

If it does not do that, it belongs in [ATLAS_EXPANSION_MAP.md](./ATLAS_EXPANSION_MAP.md), not in active scope.
