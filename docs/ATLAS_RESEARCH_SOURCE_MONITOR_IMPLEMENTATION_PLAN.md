# Atlas Research Source Monitor Implementation Plan

Last updated: 2026-04-13 (ET)
Owner: Ryan + Codex
Status: Proposed implementation plan

This document converts [ATLAS_RESEARCH_SOURCE_MONITOR_PROTOTYPE.md](./ATLAS_RESEARCH_SOURCE_MONITOR_PROTOTYPE.md) into a concrete Atlas build plan.

Use this when the question is:
- what should we build first
- how the worker schema and API should change
- where the feature should live in `Research Workspace`
- how `/crawl` and Workers AI should be bounded
- what should ship in phase 1 versus later

Do not use this document as a broad Atlas roadmap.
This plan is intentionally narrow.

## 1) Prototype Goal

Add one bounded research-continuity layer to Atlas:
- a user can attach a small set of authoritative URLs to a county research record
- Atlas can crawl those URLs
- Atlas can show what changed
- Atlas can turn those changes into memo support and diligence prompts
- scenario-linked diligence should be possible when a scenario run exists

This should improve:
- research continuity
- source monitoring
- memo support
- scenario-linked diligence

without turning Atlas into:
- a generic AI research terminal
- a broad alerting platform
- a site-native diligence product
- an autonomous agent workflow

## 2) Implementation Rule

Every part of this feature must stay inside Atlas's current lane:
- county / market / geo-opportunity research
- memo-quality decision support
- scenario-linked underwriting support

The implementation should fail review if it introduces:
- arbitrary search across the web
- open-ended agent loops
- parcel-native infrastructure truth claims
- unsupported synthesis without source provenance

## 3) Recommended Build Sequence

### Phase 0: Contracts and storage foundation

Build first:
- D1 schema additions for tracked sources, crawl runs, and generated artifacts
- R2 storage bindings for raw crawl outputs
- route contracts for create/list/run/read flows
- no scheduling yet
- no upload flow yet
- no agent abstraction

Success condition:
- Atlas can store source targets and crawl metadata cleanly without changing the current research/scenario workflow

### Phase 1: Manual source attach + manual crawl

Build next:
- `Tracked Sources` block inside `Research Workspace`
- user can add a source URL and source type
- user can manually trigger a crawl for one source or all sources
- Atlas stores latest crawl result and exposes crawl status
- Atlas shows a minimal human-readable crawl result summary

Success condition:
- an analyst can attach 3 sources to one county and re-open them later with crawl state intact

### Phase 2: Evidence-bound memo support

Build after Phase 1 works:
- Workers AI transforms crawl output into:
  - `What changed`
  - `Why it may matter`
  - `Memo support`
  - `New diligence questions`
- generated outputs must link back to one or more crawl records
- outputs should appear under a dedicated `Source Support` or `Diligence Support` section in `Research Workspace`

Success condition:
- an analyst can use Atlas-generated support inside the memo without losing provenance

### Phase 3: Scenario-linked diligence

Build after Phase 2:
- if a workspace has recent scenario runs, Atlas can generate:
  - `Scenario-linked diligence questions`
  - `Changes that may matter to the latest scenario assumptions`
- keep this tied to one selected recent run, not a broad scenario graph

Success condition:
- Atlas can attach a source change to one existing scenario context without confusing the memo flow

### Phase 4: Deferred layers

Not part of first implementation:
- scheduled background refresh
- R2 Local Uploads for user-supplied files
- Agents SDK
- inbox / alert center
- cross-workspace monitoring dashboard

## 4) Data Model

Atlas already has:
- `research_workspaces`
- `research_notes`
- `research_scenario_runs`

Add the following.

### `research_sources`

Purpose:
- one tracked source attached to one research workspace

Fields:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `workspace_id INTEGER NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE`
- `geo_key TEXT NOT NULL REFERENCES geo_county(fips)`
- `url TEXT NOT NULL`
- `source_type TEXT NOT NULL`
- `title TEXT`
- `status TEXT NOT NULL DEFAULT 'active'`
- `crawl_policy_json TEXT`
- `last_crawled_at TEXT`
- `next_crawl_at TEXT`
- `linked_scenario_run_id INTEGER REFERENCES research_scenario_runs(id) ON DELETE SET NULL`
- `created_at TEXT DEFAULT (datetime('now'))`
- `updated_at TEXT DEFAULT (datetime('now'))`

Indexes:
- `(workspace_id, updated_at DESC)`
- `(geo_key)`
- optional unique `(workspace_id, url)` to prevent duplicates

### `research_source_crawls`

Purpose:
- one crawl attempt / result for one tracked source

Fields:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `source_id INTEGER NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE`
- `crawl_job_id TEXT`
- `status TEXT NOT NULL`
- `output_format TEXT NOT NULL`
- `http_status INTEGER`
- `content_hash TEXT`
- `change_summary TEXT`
- `markdown_r2_key TEXT`
- `json_r2_key TEXT`
- `error_text TEXT`
- `fetched_at TEXT`
- `created_at TEXT DEFAULT (datetime('now'))`

Indexes:
- `(source_id, created_at DESC)`
- `(status, created_at DESC)`

### `research_artifacts`

Purpose:
- structured Atlas-generated outputs derived from crawled source content

Fields:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `workspace_id INTEGER NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE`
- `source_crawl_id INTEGER NOT NULL REFERENCES research_source_crawls(id) ON DELETE CASCADE`
- `artifact_type TEXT NOT NULL`
- `content_json TEXT NOT NULL`
- `model_name TEXT`
- `created_at TEXT DEFAULT (datetime('now'))`

Indexes:
- `(workspace_id, created_at DESC)`
- `(artifact_type, created_at DESC)`

## 5) Storage Split

### D1 should store
- source rows
- crawl job metadata
- crawl status
- output hashes
- structured AI artifacts
- scenario linkage metadata

### R2 should store
- raw Markdown crawl outputs
- raw JSON crawl outputs
- later: uploaded diligence files if R2 Local Uploads is adopted

Rule:
- do not store large crawl bodies inline in D1
- D1 should point to R2 keys and keep only the relational metadata Atlas needs for workflow continuity

## 6) Worker Bindings

### Add later when implementation starts
- Browser Rendering binding / credentials required for `/crawl`
- R2 bucket binding for crawl artifacts
- Workers AI binding or API usage path

Rule:
- introduce only the bindings needed for the prototype
- do not add Agents, Dynamic Workers, or extra infra bindings in this first pass

## 7) Route Plan

### Create / list tracked sources
- `POST /api/v1/research/workspaces/:geoKey/sources`
- `GET /api/v1/research/workspaces/:geoKey/sources`

Request fields for create:
- `url`
- `source_type`
- `title` optional
- `linked_scenario_run_id` optional

Response fields:
- source metadata only
- no crawl body inline

### Trigger crawl
- `POST /api/v1/research/workspaces/:geoKey/source-crawls`

Request fields:
- `source_id` optional for one-source crawl
- absent means crawl all active sources for the workspace

Response:
- accepted job summary
- source ids queued

### Read diligence outputs
- `GET /api/v1/research/workspaces/:geoKey/diligence`

Response shape should include:
- `sources`
- `latest_crawls`
- `artifacts`
- `scenario_link_context`

Rule:
- do not over-fragment the read API early
- Atlas should be able to load the full bounded diligence support payload in one request for a workspace

## 8) Crawl Lifecycle

### Phase 1 lifecycle
1. user adds source
2. Atlas stores source row
3. user clicks `Refresh Sources`
4. worker calls `/crawl`
5. worker stores raw output in R2
6. worker stores metadata row in `research_source_crawls`
7. Atlas updates workspace support view

### Change detection rule
For the prototype, change detection should be simple:
- compare `content_hash` to latest prior crawl for the same source
- if unchanged, mark as unchanged
- if changed, generate a short summary

Do not build semantic multi-version diffing in the first pass.

## 9) Workers AI Role and Boundaries

Workers AI should operate only on content already captured by Atlas.

### Allowed tasks
- summarize what changed
- explain why a change may matter to the memo
- extract memo-support bullets
- propose follow-up diligence questions
- generate scenario-linked questions when a scenario run is linked or present

### Disallowed tasks
- search for new sources autonomously
- widen the research scope beyond attached URLs
- produce final investment conclusions
- create opaque scores
- generate unsupported claims without provenance

### Artifact types
Recommended first artifact types:
- `change_summary`
- `memo_support`
- `diligence_questions`
- `scenario_linked_questions`

## 10) UI Placement In Research Workspace

### New section: `Tracked Sources`
Place near the memo workflow, but below the core memo fields.

Contents:
- source list
- add-source form
- `Refresh Sources` action
- per-source latest status
- last crawl timestamp

### New section: `Source Support`
Collapsed by default until at least one artifact exists.

Contents:
- `What changed`
- `Why it may matter`
- `Memo support`
- `Diligence questions`

### Scenario-linked block
Only show if:
- a scenario run exists
- at least one source is linked to scenario context or Atlas can infer latest run context safely

Rule:
- do not let source support visually overwhelm the memo editor
- memo remains the primary job of `Research Workspace`

## 11) Scenario Link Strategy

The first version should stay simple.

Recommended rule:
- default to the most recent scenario run in the workspace when generating scenario-linked diligence support
- allow explicit source-to-scenario linkage later if needed

Do not build a many-to-many scenario coordination UI in v1.

## 12) Provenance Rules

Every generated artifact must preserve:
- source id
- crawl id
- artifact type
- model name if Workers AI was used
- created timestamp

UI rule:
- Atlas must always allow the user to move from summary -> source record -> underlying crawl metadata

## 13) Safety / Product Guardrails

### Allowed source classes
Start with a narrow source taxonomy such as:
- `county_economic_development`
- `utility_or_power`
- `state_agriculture_or_water`
- `planning_or_zoning`
- `operator_or_news`

### Source count limit
For prototype:
- max 5 active sources per workspace

### Crawl limit
For prototype:
- manual crawl only
- no automatic recurring refresh required

### Robots and failure handling
- respect crawl restrictions
- surface crawl failures honestly
- never hide blocked or failed fetches behind AI summaries

## 14) Phased Acceptance Criteria

### Phase 0 accepted when
- schema is in place
- route contracts are defined
- no current Atlas workflow is broken

### Phase 1 accepted when
- user can add sources
- user can refresh sources
- Atlas stores crawl metadata and raw outputs
- latest crawl state is visible in `Research Workspace`

### Phase 2 accepted when
- Atlas can generate bounded evidence support from crawl outputs
- every support artifact shows provenance
- memo support is useful but not overwhelming

### Phase 3 accepted when
- Atlas can generate at least one scenario-linked diligence artifact from latest run context
- the output helps the user refine diligence rather than replacing the scenario workflow

## 15) Risks And Failure Modes

### Product drift
Risk:
- this becomes a generic monitoring feed

Mitigation:
- keep source count low
- keep UI inside `Research Workspace`
- require explicit source attachment

### AI overreach
Risk:
- model produces more certainty than evidence supports

Mitigation:
- provenance on every artifact
- strict prompt boundaries
- no final recommendation artifacts

### Cost sprawl
Risk:
- crawl and large-model costs rise too quickly

Mitigation:
- manual refresh first
- bounded sources per workspace
- only generate AI artifacts when content changed

### Workflow clutter
Risk:
- source support competes with memo writing

Mitigation:
- keep memo primary
- collapse support sections by default
- treat source support as downstream assistance

## 16) Single Best First Implementation Slice

If we implement only one slice, it should be:

### Slice A
- schema additions
- `Tracked Sources` UI
- add/list sources API
- manual single-workspace crawl trigger
- store raw crawl outputs in R2
- store crawl metadata in D1
- no AI yet

Why this is the best first slice:
- proves the crawl layer before adding model cost or complexity
- gives Atlas visible research continuity value quickly
- reduces the chance that Workers AI is used on a weak evidence foundation

## 17) Recommendation

Proceed in this order:
1. crawl foundation
2. evidence-bound memo support
3. scenario-linked diligence support
4. only then consider scheduling or uploads

Do not start with:
- Agents SDK
- Dynamic Workers
- broad alerting
- generic AI research surfaces

That order keeps Atlas honest, useful, and inside its current product lane.
