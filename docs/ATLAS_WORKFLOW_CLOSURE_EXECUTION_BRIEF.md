# Atlas Workflow Closure Execution Brief

## Purpose

Close the gap between Atlas having credible agricultural data/modeling and Atlas behaving like one decision workflow.

The immediate user problem is not lack of numbers. It is that analysts still have to manually re-create context as they move between county discovery, county diligence, research capture, and scenario modeling.

## Current Product Gap

Atlas is strongest today at:
- screening counties
- inspecting county-level valuation context
- running standalone scenarios

Atlas is weakest today at:
- carrying selected county context into the next step
- preserving momentum from discovery to research
- making the workflow feel continuous during a demo

## Build Objective

Make the agriculture workflow feel like one system:

1. discover a county in `Screener` or `Dashboard`
2. open `County Detail`
3. move directly into `Research Workspace`
4. move directly into `Scenario Lab`
5. keep the county context visible at each step

## Acceptance Criteria

### Slice 1: direct handoff
- `Screener` rows expose explicit `Research` and `Scenario` actions
- `County Detail` exposes explicit `Research Workspace` and `Scenario Lab` actions
- `Research Workspace` auto-selects the carried county and shows workflow context
- `Scenario Lab` auto-selects the carried county and shows workflow context
- user does not need to reselect the county after using the new flow

### Slice 2: continuity polish
- destination pages expose obvious next-step buttons
- workflow context remains visible even if the county picker has not fully loaded yet
- action buttons do not break table row behavior

### Slice 3: follow-on work
- save current screener as a reusable screen
- open backtest from a saved screen
- reduce duplicate county note systems

## User-Facing Scope For This Pass

This pass should be visible in the product and demo-safe:
- new workflow actions
- clearer research/modeling handoff
- less friction moving through the core farmland workflow

This pass should not attempt:
- a research data-model rewrite
- dashboard ranking redesign
- portfolio completion
- deeper industrial workflow work

## Demo Value

If this pass succeeds, a demo can show:
- screening into a county
- a direct handoff into saved research
- a direct handoff into scenario modeling
- the same county carried throughout the workflow

That is materially easier to explain than the current page-by-page product.

## Next Slices After This Pass

1. `Save Screen` from `Screener`
2. launch `Backtest` directly from saved screens
3. unify county notes and research notes
4. tighten dashboard opportunity quality so the first click is more trustworthy
