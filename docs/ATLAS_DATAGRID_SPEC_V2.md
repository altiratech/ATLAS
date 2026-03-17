# Atlas DataGrid Spec V2

Status: Implementation brief
Date: 2026-03-17
Scope: `Code/active/farmland-terminal`
Related: `D-209`, `D-210`, `ATLAS_THESIS_LAYER_SPEC.md`, `ATLAS_PRODUCT_BLUEPRINT.md`
Canonical implementation brief for Atlas DataGrid work

## 1. Purpose

Atlas should absorb the best operator-facing parts of Airtable's data workflow without becoming a generic database builder. The point is not to recreate Airtable. The point is to make Atlas faster and more legible for analysts working through thesis-driven geo/opportunity workflow.

This V2 spec narrows the implementation target so Codex can build the right thing in the right order.

The main change from the earlier draft is discipline:
- tighter V1 cut
- clearer data contract
- explicit migration rules
- stronger alignment with Atlas's current product direction

## 2. Atlas Alignment

The DataGrid work must support Atlas as it exists now:
- Atlas is a thesis-driven geo/opportunity underwriting product.
- Atlas perspective homes are launcher-first, not dashboard-first.
- The primary workflow remains:
  - launch from Home or a perspective
  - screen geographies/opportunities
  - open a record
  - underwrite
  - capture decision
  - monitor portfolio exposure

So DataGrid is **not** the new product identity. It is the interaction layer that improves the deeper workflow surfaces.

### What DataGrid is for
- faster screening
- more flexible saved views
- richer record drill-through
- better cross-surface navigation
- more durable analyst workflow state

### What DataGrid is not for
- replacing the launcher-first entry surfaces
- turning Atlas into a user-defined database platform
- encouraging a model-first or dashboard-first product shape

## 3. Canonical Objects

DataGrid should operate on Atlas's existing domain objects.

### V1 objects
- `saved_view`
- `geo_entity` / Screener row
- `research_record`
- `portfolio_holding`

### Later object
- `opportunity`

### Important object rule
In Atlas, an `opportunity` is an investment-workflow object tied to Atlas research, underwriting, and portfolio context. It is not a parcel-native diligence engine and it should not turn Atlas into the site-feasibility product.

## 4. V1 Cut

This is the most important section.

### V1 must include
1. `grid view` only
- No kanban in the first implementation slice.
- No gallery in the first implementation slice.

2. `column configuration`
- visible columns
- column order
- column width persistence if cheap; otherwise defer width persistence to V1.5

3. `grouping with aggregates`
- collapsible groups
- count + numeric aggregates

4. `record expansion panel`
- right-side panel
- preserve grid scroll state
- support quick actions

5. `composable filter builder`
- reusable field/operator/value model
- persisted into Saved Views

6. `saved view expansion`
- Saved Views become full view-state objects, not just filter presets

7. `Screener migration`
- first production target

### V1 should not include
- kanban
- gallery
- timeline
- drag/drop between status columns
- user-defined custom fields
- opportunity pipeline
- attachments/documents
- formula/editor behavior
- collaboration/multiplayer

### V1.5 candidates
- inline editing for a narrow set of user-owned fields
- Portfolio migration
- better linked-record pills
- keyboard navigation
- width auto-fit

## 5. Surface Sequence

### Phase 1: Screener only
This should be the actual first ship target.

Screener gets:
- DataGrid grid view
- view toolbar
- filter builder
- grouping
- record panel
- saved-view persistence for full view state
- thesis-aware row coloring and quick actions

Success condition:
- an analyst can open Screener, configure a useful working view once, save it, reopen it later, and scan/opportunity-triage without losing context or redoing setup.

### Phase 2: Portfolio
Portfolio should be second because the object model is already real and the grid value is high without needing new ontology.

Portfolio gets:
- DataGrid grid view
- grouping
- record panel
- maybe narrow inline editing for user-owned holding fields if implementation is clean

### Phase 3: Research landing view
Research should get a grid landing page before kanban.

Research gets:
- browse all records
- sort/filter/group by status, conviction, thesis lens, updated_at
- open a record in the panel, then full editor if needed

### Phase 4: Kanban / richer views
Only after the grid interaction model is stable.

### Phase 5: Opportunity object
Only after Atlas proves it actually needs a deal-state bridge beyond Research + Scenario + Portfolio.

## 6. Shared DataGrid Contract

## 6.1 Component goal
One reusable component should power Atlas record browsing across domains while allowing each surface to inject domain-specific columns, quick actions, and record-panel content.

## 6.2 Core props
```ts
<DataGrid
  columns={columns}
  rows={rows}
  rowKey="geo_key"
  viewConfig={viewConfig}
  onViewChange={handleViewChange}
  onRowClick={handleRowClick}
  renderRecordPanel={renderRecordPanel}
  rowColorFn={rowColorFn}
  stickyHeader
/>
```

### Required V1 capabilities
- stable row identity
- header sorting
- visible column toggle
- column reorder
- grouping
- aggregate headers
- filter pills + filter editor
- right-side record panel
- surface-owned quick actions

### Deferred capabilities
- drag/drop kanban
- gallery card templates
- inline cell editing in the generic component unless it stays narrow and safe

## 6.3 Column registry rule
Columns should come from a shared registry shape, not ad hoc per table.

Minimum column definition shape:
```ts
{
  key: string,
  label: string,
  type: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'badge' | 'link' | 'spark' | 'select',
  domain?: string,
  sortable?: boolean,
  groupable?: boolean,
  filterable?: boolean,
  aggregateFn?: 'count' | 'sum' | 'avg' | 'weightedAvg' | 'min' | 'max',
  aggregateWeightKey?: string,
  renderCell?: (value, row) => React.ReactNode,
}
```

The important part is consistency:
- one field key
- one formatter story
- one filter story
- one grouping story

## 7. Data Contract

This was under-specified in the earlier draft. It needs to be explicit.

## 7.1 Server vs client responsibilities

### Server should own
- dataset fetch
- metric filtering for large result sets
- canonical sorting where results may be large or paginated
- aggregate computation when it depends on the full filtered dataset rather than the visible page
- record-panel detail fetches when the summary row is insufficient

### Client should own
- column visibility/order
- panel open/close state
- local layout mode
- local grouping collapse state
- rendering of already-fetched linked context
- optimistic UI only for explicitly editable user-owned fields

## 7.2 Filtering contract
For Screener, filtering should remain API-driven.

Why:
- the result set is large
- Atlas already has a filterable API contract
- backtest and saved views already depend on that filter model

So the filter builder UI should compile to the existing filter contract first, not invent a separate client-only query engine.

Rule:
- if a filter can be expressed in the Screener API, it should be sent to the API
- client-only filters should be clearly treated as local refinements and used sparingly

## 7.3 Sorting contract
- primary sorting should be server-driven where possible
- secondary/local sort can exist for already-loaded records, but should not silently diverge from API truth

## 7.4 Grouping contract
Grouping may render on the client once the filtered/sorted dataset is loaded, but aggregate semantics must be explicit.

Use two aggregate modes:
- `page aggregate`
- `full filtered aggregate` only when the backend exposes it cleanly

Do not imply whole-universe aggregates if only the loaded page is available.

## 7.5 Record-panel fetch strategy
Use summary rows in the grid, then lazy-load detail for the panel when needed.

For example:
- Screener row: summary metrics only
- Record panel: county brief, thesis read, linked research, quick actions, maybe latest scenario references

That keeps the grid fast and prevents overfetching.

## 7.6 Performance rules
V1 should assume:
- row virtualization for large tables if needed
- no full client-side refetch on column toggle or group change
- no panel-opening dependency on reloading the whole table
- no giant all-record payloads just to enable a richer grid shell

## 8. Saved View Migration Rules

This needs to be explicit so we do not break live Atlas behavior.

## 8.1 Existing Saved Views
Existing saved views already persist:
- filters
- playbook key
- thesis lens key
- assumption set context
- notes
- some existing view metadata

## 8.2 V2 extension
Additive fields only:
- `view_type`
- `visible_columns`
- `column_order`
- `column_widths` if implemented
- `group_by`
- `row_coloring`

## 8.3 Upgrade rule
Old saved views must continue to open successfully.

Default behavior when fields are absent:
- `view_type = 'grid'`
- `visible_columns = null` meaning use surface defaults
- `column_order = null` meaning use default order
- `group_by = null`
- `row_coloring = 'none'`

## 8.4 Backtest compatibility
Backtest should continue using only the existing reusable filter contract.

Rule:
- DataGrid view-state enrichments improve live workflow reopening
- they do not expand historical replay semantics unless the historical engine explicitly supports them

## 9. Record Panel Contract

The record panel should be the main bridge between browsing and action.

### Screener panel must show
- county/opportunity headline
- decision read / thesis read
- selected key metrics
- linked research state if present
- quick actions:
  - add/open research
  - open scenario lab
  - open full county detail
  - add/remove watchlist where applicable

### Portfolio panel must show
- holding context
- selected county metrics
- risk synthesis context
- linked research and scenario references if available

### Research panel in its first grid version should show
- key memo summary
- status
- conviction
- linked county and latest scenario context
- action into full editor

Rule:
- the panel should speed triage, not replace the deeper page entirely

## 10. Editable Field Discipline

The earlier draft is right that only user-owned fields should be editable. This needs tighter implementation rules.

### Editable in early rollout
- saved-view metadata
- watchlist notes/tags if already supported
- maybe a narrow set of portfolio fields after Screener is stable

### Not editable in the generic component in early rollout
- computed evidence metrics
- county metrics
- scenario outputs
- thesis read outputs
- portfolio rollups

### If inline editing is enabled
it must define:
- optimistic vs non-optimistic save behavior
- validation rules
- error state and rollback behavior
- activity-log behavior where applicable

If that discipline is not ready, defer inline editing rather than shipping a brittle generic editor.

## 11. Design Rules

Keep the Altira Atlas aesthetic intact.

- low-glare dark shell
- IBM Plex family
- dense operator-grade spacing
- subtle accents only
- no Airtable-style light palette
- no oversized kanban cards
- no consumer-app empty-state treatment

The UI should feel like Atlas got more fluent, not like Atlas was wrapped in Airtable.

## 12. What To Build Later

These are good ideas, but they should stay out of the first implementation slice.

### Later, if Phase 1-3 succeeds
- kanban for Research
- kanban for Opportunities
- gallery views where they genuinely help scanning
- custom fields for Research or Opportunities
- Opportunity Pipeline object and page
- attachments/documents
- linked valuations/financing sub-objects
- timeline view

## 13. Explicit Non-Goals

- no generic database builder
- no user-created tables
- no formula language
- no Airtable API compatibility layer
- no collaboration/multiplayer in this phase
- no parcel/site-native CRM masquerading as Atlas workflow

## 14. Acceptance Criteria

### Phase 1 acceptance
- Screener runs on DataGrid grid view
- saved views can persist and reopen full live view state without breaking older views
- grouping works with clear aggregate semantics
- record panel opens without losing table context
- filter builder maps cleanly to the current Screener API contract
- the UX feels faster and more controllable, not heavier

### Phase 2 acceptance
- Portfolio gets the same browsing fluency without introducing data-integrity risk

### Phase 3 acceptance
- Research gets a useful landing grid before any kanban work begins

## 15. Recommended Build Order

1. shared column registry cleanup for Screener
2. DataGrid grid shell
3. filter builder wired to current Screener API
4. saved-view migration + compatibility layer
5. grouping + aggregates
6. record panel
7. Screener production migration
8. Portfolio migration
9. Research landing grid
10. only then decide whether kanban and Opportunities still earn their place

## 16. Bottom Line

The earlier DataGrid ideas were directionally good. The mistake would be trying to build the whole Airtable-inspired future at once.

The right move is:
- build a strong grid foundation
- use Screener as the proving surface
- preserve Atlas's thesis-driven geo/opportunity identity
- keep the launcher-first entry surfaces intact
- defer richer workflow objects until the base interaction model is clearly working
