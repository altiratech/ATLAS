# Atlas UX Correction Plan

Last updated: 2026-03-20 (ET)  
Owner: Ryan + Codex + Claude  
Status: Near-term correction plan derived from live first-time-user walkthrough

This document converts the live Atlas walkthrough into a concrete usability correction plan.

Use this when the question is:
- why Atlas still feels hard to use for a first-time user
- what should change on each major surface
- what sequence should guide the next implementation pass

This is not a replacement for:
- [ATLAS_NORTH_STAR.md](./ATLAS_NORTH_STAR.md)
- [ATLAS_CURRENT_SCOPED_BUILD_PLAN.md](./ATLAS_CURRENT_SCOPED_BUILD_PLAN.md)

It is a focused correction layer that helps the current scoped build become legible to a new user.

## 1) Core Diagnosis

Atlas is in a better structural state than before, but it still does not guide a first-time user strongly enough.

The main problem is not broken pages. The main problem is workflow discoverability.

Today Atlas often does this:
- explains the platform
- exposes the tools
- shows the internal concepts

Before the user clearly understands:
- where to start
- what to click next
- what success looks like

The result is that Atlas can feel impressive but hard to use optimally.

## 2) Correction Goal

Atlas should guide a first-time user through one obvious successful path:

1. choose a perspective
2. launch one starter screen
3. run the screen
4. open one county
5. save one research record
6. optionally run one scenario

If Atlas makes that path obvious, the rest of the product becomes much easier to learn.

## 3) Product Rule

For the next UX correction phase, Atlas should optimize for:
- one strong first-run path
- progressive disclosure
- fewer exposed internal mechanics up front
- concrete next actions on empty pages

Atlas should not optimize for:
- explaining every product concept on first contact
- exposing every advanced control immediately
- making all surfaces feel equally primary

## 4) Surface-By-Surface Corrections

### 4.1 Atlas Home

Current issue:
- Home introduces Atlas better than before, but it still presents multiple plausible next actions.
- Some resume-work concepts still overlap.

Correction:
- Make one primary CTA path dominant:
  - `Choose Perspective`
  - then `Launch Starter Screen`
- Keep `Open Screener` and `Open Workspace` available, but visually secondary.
- Reduce duplication between `Workbench` and lower resume sections.
- Treat Home as:
  - platform orientation
  - perspective selection
  - resume live work

Home should answer:
- what Atlas is
- what perspective is live
- what I should do first

### 4.2 Perspective Home

Current issue:
- This page is close, but it still carries more context than a launcher needs.

Correction:
- Keep this page launcher-first.
- Top half should emphasize:
  - active lens
  - strongest starter screens
  - reopen live work
- Keep reference context below the fold and collapsed by default.
- Avoid reintroducing dense market-monitor behavior into the top half.

Perspective Home should answer:
- what this perspective is for
- what lens is active
- how I should begin work here

### 4.3 Screener

Current issue:
- This is the biggest remaining usability bottleneck.
- A first-time user still sees too much internal product machinery too early.

Correction:
- Make the top state simpler and more progressive:
  - `Starter Screen`
  - `Basic Filters`
  - `Run Screen`
  - only then `Refine`
- Collapse or hide advanced controls by default.
- Treat reusable core filters as an advanced durability layer, not the first thing a new user must understand.
- Move `Save View + Backtest` lower in the hierarchy until results exist.
- Emphasize results and county-opening more strongly once a screen has run.

Screener should answer:
- what screen am I running
- what are the top counties
- what should I open next

### 4.4 County Detail

Current issue:
- County is part of the intended core flow, but Atlas still does not frame it strongly enough as the judgment page after Screener.

Correction:
- Treat County Detail as the main interpretation surface after discovery.
- Make the page answer:
  - why this county surfaced
  - what is directly observed vs proxied vs modeled
  - what I should do next:
    - save to research
    - compare
    - run scenario
- Reduce anything that feels like a static metric catalog without decision framing.

### 4.5 Research Workspace

Current issue:
- Workspace is cleaner now, but a first-time user may still not know when to use the queue versus the memo editor.

Correction:
- Keep queue first and active record second.
- If no record exists:
  - strongly suggest opening a county from Screener or County Detail first
  - do not make the empty memo editor feel like the main default path
- Clarify that research is the decision-record stage, not a generic notes page.

Workspace should answer:
- what record am I working on
- what decision am I trying to capture
- what evidence is already tied to it

### 4.6 Scenario Lab

Current issue:
- Scenario Lab is understandable, but too context-dependent to feel natural for a new user.

Correction:
- Make county-selection dependency more explicit.
- If no county is selected, the page should say:
  - choose a county from Screener, County Detail, or Research first
- Keep it framed as downstream underwriting, not a general calculator.

### 4.7 Backtest

Current issue:
- Backtest is simple, but too advanced for its current prominence.

Correction:
- Keep it available, but treat it as a later-stage validation tool.
- Improve empty guidance:
  - select a saved view first
  - explain what backtest is for in one sentence

### 4.8 Watchlist, Comparison, Portfolio

Current issue:
- These pages feel thin or early when empty.

Correction:
- Rewrite empty states to give one concrete action:
  - Watchlist: add counties from Screener or County Detail
  - Comparison: select two counties from Screener or saved research
  - Portfolio: create a model portfolio after you have one or more counties worth tracking
- These should feel like downstream workflow tools, not primary first-run destinations.

### 4.9 Assumptions and Data Sources

Current issue:
- These are useful trust and modeling surfaces, but they expose internal machinery early.

Correction:
- Keep them accessible, but mentally and visually demote them from the first-run path.
- Use them to support trust and power-user work, not to define the product for newcomers.

## 5) Empty-State Rule

Every empty Atlas page should give:
- one sentence explaining what this page is for
- one sentence explaining how to populate it
- one concrete button or route to do that next step

Do not leave empty pages at:
- `No records yet`
- `No county selected`
- `No portfolios yet`

without a direct next action.

## 6) Navigation Priority Rule

Atlas does not need to remove advanced surfaces, but it should stop making them feel equally important to first-time use.

Operational rule:
- primary path:
  - Home
  - Perspective Home
  - Screener
  - County Detail
  - Research Workspace
- secondary path:
  - Comparison
  - Scenario Lab
  - Portfolio
- tertiary / support path:
  - Backtest
  - Assumptions
  - Data Sources

This can be achieved through copy, grouping, empty-state guidance, and CTA emphasis even if the nav structure stays mostly the same.

## 7) Prioritized Implementation Sequence

### UX-1: First-Run Path Tightening

Focus:
- Home
- Perspective Home
- page-to-page CTA hierarchy

Success condition:
- a first-time user can identify one obvious starting path without reading deep explanatory copy

### UX-2: Screener Progressive Disclosure

Focus:
- starter screen flow
- basic vs advanced controls
- result-first hierarchy

Success condition:
- a first-time user can run one useful screen and open one county without needing to understand reusable core filters first

Status update:
- Shipped on 2026-03-20 ET.
- Screener now leads with:
  - `Step 1: Start With A Screen`
  - `Step 2: Set Basic Filters`
  - `Run Screen`
  - optional advanced refinements only after that
- Save / Backtest actions now sit below results, and advanced controls are hidden by default unless the user chooses to refine further.

### UX-3: Empty-State Rewrite Pass

Focus:
- Watchlist
- Comparison
- Workspace
- Scenario Lab
- Portfolio
- Backtest

Success condition:
- empty pages no longer feel like dead ends

Status update:
- Shipped on 2026-03-20 ET.
- Empty downstream pages now explain:
  - what the surface is for
  - how to populate it
  - what to click next
- This now covers:
  - Watchlist
  - Comparison
  - Research queue and scenario-history empties
  - Scenario Lab county-selection dependency
  - Portfolio and holdings
  - Backtest with no saved view selected

### UX-4: County-to-Decision Handoff

Focus:
- County Detail
- Research Workspace
- Scenario Lab handoff clarity

Success condition:
- the user understands when to move from discovery into memo and modeling work

### UX-5: Secondary-Surface Demotion

Focus:
- Backtest
- Assumptions
- Data Sources

Success condition:
- Atlas still feels powerful, but the app no longer teaches its engine room before the user has worked one full example

## 8) Traceability To Current Scope

This correction plan supports the current scoped build, especially:
- `S1` Screener-first DataGrid foundation
- `S2` Saved-view state deepening
- `S4` Research / Scenario / Portfolio continuity
- `NS-1` Discover
- `NS-3` Model
- `NS-4` Decide
- `NS-5` Aggregate
- `NS-8` Operator UX

This plan does not change Atlas's product lane.

It improves:
- workflow legibility
- first-time usability
- transition from discovery to decision

without changing Atlas into a different product.

## 9) Immediate Recommendation

The next implementation slice should be:

1. `UX-4` County-to-Decision Handoff
2. `UX-5` Secondary-Surface Demotion

Reason:
- the biggest first-run dead ends have now been removed
- the next biggest gain is to make downstream movement from discovery into decision work more explicit
- after that, Atlas still needs to keep advanced/secondary surfaces from competing too early with the main workflow
