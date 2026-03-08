# Atlas Product Hierarchy and Architecture Rules

Last updated: 2026-03-08 (ET)
Owner: Ryan + Codex + Claude
Status: Operating rules for scope expansion and codebase organization
Related docs:
- `docs/ATLAS_FULL_VISION_AND_PRIORITIZED_ROADMAP.md`
- `docs/ATLAS_CANONICAL_SCOPE_AND_3_WEEK_PLAN.md`
- `docs/ATLAS_INDUSTRIAL_LAND_RESEARCH_AND_MODELING_BRIEF.md`
- `docs/ATLAS_RISK_AND_INSURANCE_EXPANSION_BRIEF.md`
- `docs/ATLAS_PORTFOLIO_RISK_DASHBOARD_V1_PRD.md`
- `docs/CODEX_SPEC_COMPOSABLE_METRICS.md`

This document exists to prevent two failure modes:
1. Atlas product sections getting distorted because new features are forced into the wrong area.
2. Atlas code drifting into a monolithic structure that is hard for humans and LLMs to reason about safely.

The rule is simple:

**Product hierarchy and code hierarchy should mirror each other.**

If a feature does not fit the current section cleanly, the answer is usually to create or refine the section hierarchy, not to cram the feature into an adjacent section until that section loses its meaning.

---

## 1) Clarification of the Product Rule

What Ryan is aiming for is:
- do not pivot an existing section away from its original job just because a new adjacent capability appears,
- instead, add the correct section, subtype, or lens so the information architecture stays legible,
- and organize the code so each product surface has a bounded blast radius.

A useful mental model is:
- Bloomberg added many capabilities over time,
- but it did not turn every screen into one giant mixed workflow,
- it kept adding organized functions, domains, and specialist views.

Atlas should do the same.

---

## 2) Atlas Product Hierarchy

Atlas should be organized in three levels:

### Level 1: Core workflow families

These are the top-level jobs Atlas helps a user do.

**A. Discover**
- screening
- dashboards
- saved views
- watch zones

**B. Analyze**
- county / geography detail
- scorecards
- evidence layers
- history and z-score context

**C. Underwrite / Model**
- scenario lab
- compare mode
- assumption sets
- backtests

**D. Research / Decide**
- research workspace
- thesis, risks, catalysts
- scenario history
- memo-ready output

**E. Portfolio / Aggregate**
- portfolio analytics
- concentration views
- future portfolio risk dashboards
- cross-geography aggregation

### Level 2: Domain lenses

These are not separate products. They are domain-specific views through the same workflow families.

Current and planned domain lenses:
- farmland
- industrial / data center / power-intensive land
- energy / renewables land
- future risk / insurance lens

Important rule:
- a domain lens may change which metrics, scorecards, or models are visible,
- but it should not fork Atlas into a separate application unless the workflow becomes fundamentally different.

### Level 3: Subtypes and presets

Examples:
- Data Center Screening
- Solar Siting
- Farmland Fundamentals
- Portfolio Risk Dashboard
- County Research Memo

These should usually be implemented as:
- presets,
- scorecards,
- scenario templates,
- or dedicated subviews inside the correct workflow family.

They should not automatically become top-level sections.

---

## 3) Product IA Rules

### `Now / Next / Later / Not Atlas` filter

This should be the default scope filter for all Atlas planning and implementation.

**Now**
- agriculture research and modeling workflow
- reusable county/state evidence layers
- industrial/data-center underwriting foundation
- research workspace, scenario continuity, and decision-ready outputs

**Next**
- industrial scorecards and industrial screening depth
- reusable flood, slope, water, telecom, and dependency layers
- portfolio and aggregation primitives that support a later risk module

**Later**
- dedicated portfolio risk dashboard
- broader multi-asset land intelligence expansion
- richer parcel overlays
- consultant and reinsurance-specific workflows

**Not Atlas**
- broker CRM
- generic listings portal
- carrier core system
- claims system
- black-box CAT-model replacement
- features added only because they are adjacent, not because they fit the core Atlas workflow

Important rule:
- anything in `Later` should not quietly distort a `Now` section just because it is strategically interesting
- anything in `Not Atlas` should be treated as a distraction unless the product thesis itself changes

### Rule 1: Do not overload a section beyond its job

If a feature changes what a section fundamentally means, it likely belongs in:
- a new section,
- a new sub-section,
- or a new domain lens.

Examples:
- `Screener` should remain about discovery, not become a research notebook.
- `Research Workspace` should remain about documenting conviction, not become a raw data browser.
- `Scenario Lab` should remain about modeling, not become a generic portfolio dashboard.

### Rule 2: Prefer reusable lenses over duplicated sections

If a new domain uses the same workflow shape, reuse the workflow family and swap the lens.

Examples:
- `Data Center Screening` should be a screener preset or industrial subview, not a totally separate application shell.
- future `Portfolio Risk Dashboard` is a new top-level module because the unit of work changes from county/site to portfolio aggregation.

### Rule 3: Create a new top-level area only when the unit of decision changes

A new top-level area is justified when the user is doing a materially different job.

Examples:
- `Portfolio / Aggregate` is justified because the user is evaluating a portfolio, not one county.
- `Research Workspace` is justified because the user is documenting and revisiting conviction, not only viewing data.

### Rule 4: Keep hierarchy visible in the UI

Atlas should make it obvious whether a user is in:
- discovery,
- analysis,
- modeling,
- research,
- or aggregation.

The UI should not blur these until every screen starts doing everything.

---

## 4) Codebase Architecture Rules

### Current problem

Atlas still has a backend that is reasonably modular in services, but a frontend that remains too monolithic in practice.

Current reality:
- worker services are split under `deploy/cloudflare-worker/src/services/`
- but the deployed UI still largely flows through a single large frontend surface
- `frontend/src/` is effectively unused right now

That is workable for a prototype.
It is the wrong long-term shape for an LLM-assisted product that will keep expanding.

### Target rule

**Every top-level workflow family should have bounded frontend and backend modules.**

That means:
- separate data loaders,
- separate UI components,
- separate types,
- separate tests,
- separate docs,
- and clear shared primitives.

### Architecture principle

Use this split:

**Shared core**
- metric registry
- API client
- auth/session helpers
- lineage/freshness helpers
- formatting utilities
- shared table/chart primitives

**Workflow modules**
- dashboard / discover
- screener / discover
- county detail / analyze
- scenario lab / model
- research workspace / decide
- portfolio / aggregate
- industrial scorecards / analyze
- future risk dashboard / aggregate

**Domain overlays**
- farmland metrics and presets
- industrial metrics and scorecards
- future risk overlays and hotspot ranking

This keeps Atlas composable without making everything one giant generic abstraction.

---

## 5) LLM-Friendly Organization Rules

Atlas should be organized to reduce context burden for Codex and Claude.

### Rule 1: Keep files small and role-specific

Target:
- avoid giant all-purpose files
- prefer focused modules by workflow and by domain concern

Practical guideline:
- if a frontend file starts mixing discovery, modeling, research, and portfolio logic, it should be split
- if a backend route file keeps accumulating unrelated feature branches, move logic into service modules and route handlers by workflow

### Rule 2: Separate orchestration from business logic

Good pattern:
- route handler parses input and returns output
- service computes the domain result
- query/helper layer loads data

Bad pattern:
- route file contains raw SQL, model math, formatting, and UI-specific output shaping in one place

### Rule 3: Keep the metric registry central, not duplicated

Atlas will increasingly support multiple lenses.
The correct way to scale that is:
- one shared metric registry,
- one shared lineage/freshness model,
- multiple views and presets on top.

Do not create:
- one metric definition system for farmland,
- another for industrial,
- another for risk,
- unless the metric engine is structurally different.

### Rule 4: Prefer additive modules to giant rewrites

When adding a feature:
- add a bounded module,
- add a shared primitive if needed,
- wire it into the shell,
- avoid reworking unrelated screens in the same change.

This matters because LLMs perform better when changes have:
- a clear boundary,
- obvious ownership,
- limited file count,
- and explicit contracts.

### Rule 5: Docs should mirror the code and the product

For every major lane, Atlas should eventually have:
- strategic brief
- PRD
- execution checklist
- implementation files in predictable locations

That pattern is already working well for:
- industrial land
- risk / insurance

Keep using it.

---

## 6) Recommended Target Frontend Shape

Atlas should move toward a real frontend module structure.

Suggested shape:

```text
frontend/src/
  app/
    shell/
    routing/
    state/
  shared/
    api/
    components/
    tables/
    charts/
    formatting/
    lineage/
  features/
    dashboard/
    screener/
    county-detail/
    scenario-lab/
    research-workspace/
    portfolio/
    industrial/
    risk/
  domains/
    farmland/
    industrial/
    risk/
```

Meaning:
- `features/` maps to workflow families and user-facing modules
- `domains/` maps to domain-specific presets, scorecards, and copy
- `shared/` holds reusable primitives only

Important rule:
- do not put everything into `shared/`
- shared code should be truly shared, not a dumping ground for unplaced logic

---

## 7) Recommended Target Backend Shape

The current Worker already has the beginnings of the right split.
It should continue moving toward:

```text
deploy/cloudflare-worker/src/
  routes/
    dashboard.ts
    screener.ts
    county.ts
    scenario.ts
    research.ts
    portfolio.ts
    industrial.ts
    risk.ts
  services/
    asof.ts
    zscore.ts
    metric-engine.ts
    industrial.ts
    risk.ts
    portfolio.ts
  db/
    queries.ts
    schema.sql
  shared/
    auth.ts
    response.ts
    lineage.ts
    coverage.ts
```

Important rule:
- `index.ts` should eventually become a thin composition layer,
- not the place where every feature keeps growing forever.

---

## 8) Rules For Adding New Features

Before adding a feature, ask:

1. What workflow family does this belong to?
2. Is this a new domain lens or just a preset inside an existing family?
3. Does this change the unit of decision?
4. Does it justify a new top-level area, or just a new subview/template?
5. Which files should own this change?
6. Can the implementation be done without touching unrelated modules?

If those answers are fuzzy, the feature is not ready to build.

---

## 9) Immediate Implementation Implication

Atlas should keep the current strategic direction, but adopt these operational moves soon:

1. Formalize the `Now / Next / Later / Not Atlas` hierarchy in a dedicated scope-control doc.
2. Continue building reusable hazard and dependency layers.
3. Avoid forcing future risk workflows into the industrial or county-detail sections when they really belong to `Portfolio / Aggregate`.
4. Prioritize frontend modularization before Atlas grows much further.
5. Keep PRDs and execution checklists per lane so LLM work stays bounded.

---

## 10) Bottom Line

Atlas should expand like a serious information system:
- new capabilities added through the right hierarchy,
- new lenses added without corrupting old workflows,
- and code organized so each feature can be changed without reloading the whole product into one context window.

That is how Atlas avoids becoming:
- a confused product,
- a giant monolith,
- or an LLM-hostile codebase.
