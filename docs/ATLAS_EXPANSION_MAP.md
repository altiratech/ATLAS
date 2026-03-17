# Atlas Expansion Map

Last updated: 2026-03-17 (ET)
Owner: Ryan + Codex + Claude
Status: Future capability map for Atlas outside the active scoped build

This document preserves important future Atlas ideas without treating them as current implementation scope.

Use this when the question is:
- what should Atlas likely do after the current scoped build
- which features are desirable but not active scope
- which ideas depend on better data/models or broader product proof

For the long-term product destination, use [ATLAS_NORTH_STAR.md](./ATLAS_NORTH_STAR.md).
For the active build sequence, use [ATLAS_CURRENT_SCOPED_BUILD_PLAN.md](./ATLAS_CURRENT_SCOPED_BUILD_PLAN.md).

## 1) Likely Next

These are strong candidates once the current scoped build is working well.

| Capability | Why it is promising | North star linkage |
| --- | --- | --- |
| Research grid landing view | Gives Atlas a real browsable research surface before a full pipeline object exists | `NS-4`, `NS-8` |
| Portfolio DataGrid migration | Extends the working-grid model into a second high-value institutional surface | `NS-5`, `NS-8` |
| Composable filter builder | Makes Screener more durable once the grid foundation is stable | `NS-1`, `NS-8` |
| Metric registry v1 | Creates a cleaner foundation for presets and cross-domain extension | `NS-1`, `NS-6`, `NS-7` |
| Composable presets | Makes Atlas faster for recurring use cases without hard-coding rigid silos | `NS-1`, `NS-7` |
| Better linked-object drill-through | Tightens movement between screener, county, research, scenario, and portfolio | `NS-4`, `NS-5`, `NS-8` |

## 2) Later

These belong in Atlas's future, but not until the current workflow feels strong.

| Capability | Why it is later | North star linkage |
| --- | --- | --- |
| Asset-class-agnostic county detail | Valuable, but only after multiple non-farmland evidence layers are real | `NS-2`, `NS-7` |
| Model-type subtabs in Scenario Lab | Useful once Atlas supports multiple structurally different model families honestly | `NS-3`, `NS-7` |
| Map layer at the geography/opportunity level | Helpful, but not more important than discovery/decision workflow closure | `NS-1`, `NS-2`, `NS-8` |
| Decision memo export and richer committee outputs | Important institutional workflow layer after research/scenario closure is stronger | `NS-4`, `NS-8` |
| Benchmark overlays and cross-asset context packs | Valuable for institutional comparison, but secondary to core underwriting usability | `NS-2`, `NS-5`, `NS-6` |

## 3) Dependent On New Data Or Models

These ideas are good, but should only move forward when the evidence and model quality are real enough.

| Capability | Dependency | North star linkage |
| --- | --- | --- |
| Agricultural transition stress with direct labor proxies | Needs real labor / H-2A / wage / farm-structure inputs | `NS-1`, `NS-2`, `NS-7` |
| Powered-land / data-center geography scoring | Needs more complete power, water, fiber, and market context | `NS-1`, `NS-2`, `NS-7` |
| Solar / wind / renewables geography models | Needs domain-specific resource and project-market inputs | `NS-2`, `NS-3`, `NS-7` |
| Deeper water / groundwater / carbon / climate layers | Needs reliable sources and a clear interpretation model | `NS-2`, `NS-6`, `NS-7` |

## 4) Dependent On Broader Product Proof

These are valid ideas, but Atlas should earn them rather than assume them.

| Capability | What must be proven first | North star linkage |
| --- | --- | --- |
| Opportunity object | Need proof that Research + Scenario + Portfolio still leave a real deal-state gap | `NS-4`, `NS-5` |
| Opportunity pipeline / kanban | Need proof that Atlas really needs a formal pipeline instead of stronger research records first | `NS-4`, `NS-8` |
| Gallery / card views | Need proof that they improve analyst speed instead of adding UI surface area | `NS-1`, `NS-8` |
| Custom fields | Need proof that Atlas needs flexible user-owned schema rather than strong defaults and linked records | `NS-4`, `NS-8` |
| Broader alerts / inbox system | Need proof that monitoring is a frequent enough workflow to justify a dedicated layer | `NS-1`, `NS-5`, `NS-6` |

## 5) Rule For Adding New Future Ideas

A future Atlas idea should land here if it is:
- clearly valuable to the Atlas lane, but
- not required for the current scoped build, or
- blocked on better data/models, or
- blocked on broader product proof

If a future idea moves into active scope, it should be copied into [ATLAS_CURRENT_SCOPED_BUILD_PLAN.md](./ATLAS_CURRENT_SCOPED_BUILD_PLAN.md) with explicit north-star linkage.
