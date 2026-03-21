# Atlas Browser Validation 2026-03-21

Last updated: 2026-03-21 (ET)  
Owner: Ryan + Codex + Claude  
Status: Recovered live-browser validation memo after session compaction

This document preserves the end-to-end Atlas browser walkthrough that happened after `UX-5`.

Use this when the question is:
- what the live Atlas flow actually felt like to a first-time user after the recent UX correction passes
- which issues are still blocking a credible first-run experience
- what Atlas should fix next before shifting from UX correction into deeper product substance

This is not a replacement for:
- [ATLAS_UX_CORRECTION_PLAN.md](./ATLAS_UX_CORRECTION_PLAN.md)
- [ATLAS_CURRENT_SCOPED_BUILD_PLAN.md](./ATLAS_CURRENT_SCOPED_BUILD_PLAN.md)

It is a validation layer built from a real browser pass against the live product.

## 1) Test Path

The live walkthrough followed the intended Atlas first-run path:

1. `Atlas Home`
2. `Perspective Home`
3. `Screener`
4. `County Detail`
5. `Research Workspace`
6. `Scenario Lab`

The goal was to answer one practical question:

`Can a new user actually complete Atlas's intended discovery -> memo -> scenario workflow without getting lost or blocked?`

## 2) Evidence Artifacts

The screenshot artifacts from the walkthrough are still available locally:

- `output/playwright/perspective-home-2026-03-21.png`
- `output/playwright/screener-first-run-2026-03-21.png`
- `output/playwright/screener-zero-results-2026-03-21.png`
- `output/playwright/screener-results-2026-03-21.png`
- `output/playwright/county-detail-2026-03-21.png`
- `output/playwright/research-workspace-2026-03-21.png`
- `output/playwright/scenario-lab-before-run-2026-03-21.png`
- `output/playwright/scenario-lab-after-run-2026-03-21.png`

These artifacts matter because the original live-browser analysis was partially lost in chat compaction. The screenshots preserve the observable user state.

## 3) What Worked

The browser run confirmed that Atlas is materially more usable than it was before the UX correction sequence.

### 3.1 Home and Perspective flow are now credible

`Atlas Home` and `Perspective Home` are no longer the main blockers.

What worked:
- the platform entry feels calmer
- the active perspective / lens framing is understandable
- the perspective page reads more like a launcher than a dashboard

### 3.2 County -> Research -> Scenario sequencing is much clearer

This was the strongest improvement in the live flow.

What worked:
- `County Detail` now clearly pushes the user toward memo work
- `Research Workspace` reads as the decision-record stage
- `Scenario Lab` reads as downstream pressure testing, not a generic calculator

### 3.3 Scenario Lab is conceptually strong

Once the user reaches it with a selected county, `Scenario Lab` has a clear job:
- pressure test the call
- show downside / acquisition / credit context
- return that work to the memo

This means Atlas is no longer mostly failing at page purpose. The remaining issues are more operational and workflow-specific.

## 4) Highest-Confidence Findings

These findings are ranked by impact on first-run trust and workflow closure.

### 4.1 The recommended first Screener path can dead-end with zero results

Severity: High

The first starter path (`Transition-Ready Counties`) produced `Results (0 counties)` in the live run.

That is a real trust problem because Atlas is explicitly teaching this as the intended entry path. If the recommended first path returns nothing, a new user will reasonably conclude one of three things:
- the app is broken
- the filters are wrong
- they do not know how to use Atlas correctly

Relevant sources:
- `frontend/src/shared/thesis-lenses.js`
- `frontend/src/features/screener.jsx`

### 4.2 Scenario results are not reliably persisting back into Research

Severity: High

After running a live scenario, the browser produced a `400` on the scenario-history writeback path.

Observed failing route:
- `/api/v1/research/workspaces/.../scenario-runs`

This is a major workflow issue because Atlas now correctly teaches:
- save the memo
- then pressure test in Scenario Lab
- then return that scenario context to the decision record

If that writeback fails, Atlas's best downstream workflow is conceptually right but operationally incomplete.

Relevant sources:
- `frontend/src/features/scenario-lab.jsx`
- `frontend/src/features/research-workspace.jsx`

Important implementation note:
- the current `Scenario Lab` source posts to `/research/workspaces/${county}/scenario-runs`
- the `Research Workspace` loader also reads `/research/workspaces/${county}/scenario-runs`
- this should be treated as a likely contract/path issue until verified end to end

### 4.3 `Back To Research Memo` was flaky after a live scenario run

Severity: Medium

The live browser pass hit a timeout when clicking `Back To Research Memo` immediately after running a scenario.

This may be:
- a real button-state issue
- a post-run page interactivity issue
- or a symptom of the same scenario-writeback problem

Relevant source:
- `frontend/src/features/scenario-lab.jsx`

### 4.4 Research is clearer, but still intimidating for a first-time user

Severity: Medium

`Research Workspace` is much better structured than before, but the active record still exposes a very large memo editor immediately.

That means the user is no longer confused about the page's purpose, but may still feel overloaded the first time they land there.

Relevant source:
- `frontend/src/features/research-workspace.jsx`

## 5) What This Means

The main takeaway from this browser validation is:

`Atlas is no longer mostly blocked by surface confusion. It is now blocked by first-run reliability and downstream workflow closure.`

That is an improvement.

The product is closer to a usable operating loop, but the remaining issues are more serious precisely because they now sit inside the main success path:
- starter screen quality
- scenario persistence
- return-path reliability

## 6) Ranked Next Fix List

These are the recommended next Atlas fixes, in order.

### BV-1: Fix the first recommended Screener path so it returns live counties

Why first:
- it is the first major trust break in Atlas's taught workflow
- it affects first-time-user confidence immediately
- it is likely a threshold/preset issue, not a broad product redesign problem

Goal:
- the first recommended starter screen should reliably produce a defendable set of counties

Likely focus:
- `Transition-Ready Counties`
- thesis starter defaults
- default filter thresholds / preset logic

### BV-2: Fix Scenario Lab -> Research scenario-run persistence

Why second:
- this is the most important downstream workflow contract in Atlas right now
- it blocks Atlas from fully closing the loop between memo and modeling

Goal:
- a scenario run created in `Scenario Lab` should reliably appear back in the associated research record

Likely focus:
- scenario-run POST path
- workspace identifier contract
- research scenario-run readback contract

### BV-3: Re-verify the return path from Scenario Lab back to Research

Why third:
- it may be resolved automatically once the persistence bug is fixed
- but it still needs explicit browser validation

Goal:
- after running one scenario, the user can return to the research memo without friction and see updated scenario context

### BV-4: Reduce first-run intimidation inside Research Workspace

Why fourth:
- this matters, but it is no longer the biggest blocker
- Atlas first needs the workflow to work reliably

Goal:
- make the first memo-writing step feel smaller and more guided

Likely focus:
- smaller initial edit state
- clearer progressive disclosure for memo sections
- stronger first memo CTA before showing the full editing burden

## 7) What Should Not Be Next

The browser validation suggests Atlas should not prioritize these next:

- another broad nav reshuffle
- more secondary-surface demotion
- more platform-explainer copy
- new domain expansion factors

Reason:
- the core UX now makes enough sense that the next gains come from fixing the main path, not from another round of general cleanup

## 8) Immediate Recommendation

The next Atlas implementation slice should be:

1. `BV-1` first-run starter reliability
2. `BV-2` scenario persistence back into Research

Only after those are stable should Atlas decide whether to:
- soften the Research editor further, or
- return to deeper product-substance expansion
