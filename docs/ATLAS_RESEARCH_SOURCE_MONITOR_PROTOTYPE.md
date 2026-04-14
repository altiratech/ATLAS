# Atlas Research Source Monitor Prototype

Last updated: 2026-04-10 (ET)
Owner: Ryan + Codex
Status: Proposed prototype memo
Execution detail lives in [ATLAS_RESEARCH_SOURCE_MONITOR_IMPLEMENTATION_PLAN.md](./ATLAS_RESEARCH_SOURCE_MONITOR_IMPLEMENTATION_PLAN.md).

## 1) Purpose

This memo defines the first bounded prototype for improving Atlas research continuity with Cloudflare-native capabilities.

The recommendation is:
- use **Browser Rendering `/crawl`** as the source-capture layer
- use **Workers AI** as a bounded evidence-processing layer
- attach the result to Atlas's existing `research_workspaces` and optionally `research_scenario_runs`

This is not a generic AI research assistant.
This is not a parcel-native diligence workflow.
This is not an agent-first product expansion.

## 2) Why This Prototype Exists

Atlas's current lane is clear:
- geo/opportunity underwriting
- thesis-aware screening
- memo-quality research records
- scenario-linked downside testing

What Atlas still lacks is durable source continuity inside the research workflow.

Today, a user can:
- discover a county
- save it to research
- write a memo
- run a scenario

But Atlas still does not give the user a clean way to:
- track a bounded set of relevant sources over time
- see what changed since the last review
- turn source changes into memo support
- tie source changes back to scenario-linked diligence questions

That is the gap this prototype is meant to close.

## 3) Product Goal

For a selected county in `Research Workspace`, Atlas should let an analyst:
1. add a small list of authoritative URLs
2. crawl and snapshot those sources
3. see what changed
4. get evidence-bound memo support
5. surface scenario-linked diligence questions when a scenario exists

The prototype should make Atlas better at:
- research continuity
- source monitoring
- memo support
- scenario-linked diligence

without widening Atlas into:
- open-ended web search
- a general-purpose AI terminal
- site-native diligence operations

## 4) Best-Fit Cloudflare Features

### A. Best fit now: Browser Rendering `/crawl`

Why it fits Atlas:
- Atlas already has the correct persistence anchor: `research_workspaces`
- `/crawl` is designed for structured rendered web capture and incremental crawling
- Cloudflare's Browser Rendering product and Crawl API support Markdown and JSON output, which maps well to memo support and source-delta workflows

Official sources:
- [Browser Rendering overview](https://developers.cloudflare.com/browser-rendering/)
- [Browser Rendering `/crawl` API](https://developers.cloudflare.com/api/resources/browser_rendering/subresources/crawl/)
- [Browser Rendering changelog](https://developers.cloudflare.com/changelog/product/browser-rendering/)

### B. Good fit behind crawl: Workers AI large models

Why it fits Atlas:
- Atlas already wants bounded AI assistance tied to visible evidence
- Workers AI can summarize, extract, and propose follow-up questions from captured source material
- This matches Atlas's thesis-layer rule that AI should help draft and explain, but not fabricate missing evidence

Official sources:
- [Workers AI overview](https://developers.cloudflare.com/workers-ai/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Llama 3.3 70B model example](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)

### C. Useful support layer later: R2 Local Uploads

Why it fits later:
- Atlas will likely want analyst-supplied diligence artifacts later: PDFs, screenshots, county packets, broker materials, board agendas, utility docs
- R2 Local Uploads is a good browser-to-storage primitive for that future artifact layer

Official sources:
- [R2 Local Uploads docs](https://developers.cloudflare.com/r2/buckets/local-uploads/)
- [R2 Local Uploads GA changelog](https://developers.cloudflare.com/changelog/post/2026-02-03-r2-local-uploads/)

### D. Later only, not first move: Agents SDK

Why it is later:
- Agents are useful when Atlas needs durable autonomous monitoring behavior, scheduling, tools, and real-time state
- Atlas does not need that abstraction to prove source continuity
- The first value comes from capture + evidence support, not conversational agent identity

Official sources:
- [Agents overview](https://developers.cloudflare.com/agents/)
- [Agents concepts](https://developers.cloudflare.com/agents/concepts/)
- [Using AI Models in Agents](https://developers.cloudflare.com/agents/api-reference/using-ai-models/)

### E. Skip for Atlas now: Dynamic Workers

Why it should be skipped:
- Atlas does not currently need isolated user-authored code execution or dynamic plugin sandboxes
- This is too much architecture for the current product need

Official sources:
- [Dynamic Workers overview](https://developers.cloudflare.com/dynamic-workers/)
- [Dynamic Workers pricing](https://developers.cloudflare.com/dynamic-workers/pricing/)

### F. Skip: EmDash

Why it should be skipped:
- EmDash is interesting as a Cloudflare example, but it is not a natural Atlas feature or product direction
- It does not solve the Atlas research continuity problem directly

Official source:
- [EmDash Cloudflare post](https://blog.cloudflare.com/emdash-wordpress/)

## 5) Now / Later / Skip Recommendation

### Now
- Browser Rendering `/crawl`
- Workers AI, but only behind crawl and only for bounded evidence processing

### Later
- R2 Local Uploads
- Agents SDK

### Skip
- Dynamic Workers
- EmDash

## 6) Concrete User Workflow

### Primary workflow: County-linked source monitoring

1. Analyst opens a county in `Research Workspace`
2. Analyst adds 3-5 authoritative URLs, such as:
   - county economic development page
   - utility or power page
   - state agriculture or water page
   - local planning or zoning page
   - relevant operator/news source
3. Atlas runs `/crawl` on those URLs
4. Atlas stores crawl outputs and change metadata
5. Atlas shows:
   - latest source status
   - what changed
   - why it may matter
   - memo-support bullets
   - new diligence questions
6. If a scenario exists, Atlas also shows:
   - scenario-linked diligence questions
   - source changes that may matter to the scenario assumptions or downside case

### Secondary workflow: Manual refresh before committee or memo update

1. Analyst reopens a research workspace
2. Atlas surfaces stale sources or recent changes
3. Analyst refreshes all sources for that workspace
4. Atlas regenerates a concise update package for the memo

### Later support workflow: Upload analyst-supplied packet

1. Analyst uploads a PDF or screenshot packet directly to R2
2. Atlas links it to the same research workspace
3. Atlas later summarizes or extracts from it in the same evidence-bound pipeline

## 7) Explicit Non-Goals

This prototype should not include:
- open web search
- freeform AI browsing beyond attached sources
- parcel-native infrastructure truth
- entitlement execution workflow
- autonomous agent loops
- generic chat UI for research
- source ingestion for arbitrary broad market feeds

## 8) Architecture Changes Required

Atlas already has the right anchor objects in the Cloudflare worker profile:
- `research_workspaces`
- `research_notes`
- `research_scenario_runs`

The prototype should add a bounded source-monitor layer on top.

### Proposed new D1 tables

#### `research_sources`
- `id`
- `workspace_id`
- `geo_key`
- `url`
- `source_type`
- `title`
- `status`
- `crawl_policy`
- `last_crawled_at`
- `next_crawl_at`
- `linked_scenario_run_id` nullable
- `created_at`
- `updated_at`

#### `research_source_crawls`
- `id`
- `source_id`
- `crawl_job_id`
- `status`
- `fetched_at`
- `output_format`
- `content_hash`
- `http_status`
- `change_summary`
- `markdown_r2_key`
- `json_r2_key`
- `created_at`

#### `research_artifacts`
- `id`
- `workspace_id`
- `source_crawl_id`
- `artifact_type`
- `content_json`
- `created_at`

### Storage split
- **D1** should store metadata, relationships, and summaries
- **R2** should store larger raw crawl artifacts such as Markdown and JSON snapshots

### Proposed new worker routes
- `POST /api/v1/research/workspaces/:geoKey/sources`
- `GET /api/v1/research/workspaces/:geoKey/sources`
- `POST /api/v1/research/workspaces/:geoKey/source-crawls`
- `GET /api/v1/research/workspaces/:geoKey/diligence`

### Scheduling
Use the existing cron-based worker pattern for scheduled refresh later.
Do not make scheduling or autonomous monitoring part of the first prototype.

## 9) Data-Model Rule

Every AI-generated output in this prototype must preserve provenance.

That means:
- each memo-support artifact points back to one or more crawled sources
- each source-delta summary links to the exact crawl snapshot
- scenario-linked diligence notes reference both the source and the linked scenario run where applicable

Atlas should never present an unsupported AI summary without showing where it came from.

## 10) Workers AI Role

Workers AI should do only bounded post-crawl work.

Allowed prototype tasks:
- summarize changes between latest and previous crawl
- extract memo-support bullets
- propose new diligence questions
- produce scenario-linked follow-up questions

Disallowed prototype tasks:
- freeform final investment recommendation
- broad search expansion
- opaque composite scoring
- ungrounded scenario conclusions

## 11) Risks

### Product risks
- Atlas could drift into a generic AI research terminal if sources are not tightly scoped
- The feature could overwhelm memo work if it becomes a feed rather than a support layer

### Data / trust risks
- crawled pages may be noisy or low-signal
- source changes may not be materially important
- model summaries may overstate significance if not grounded carefully

### Operational risks
- `/crawl` is still a beta feature according to current Cloudflare documentation
- crawl jobs may fail, time out, or return low-quality outputs on difficult sites
- `robots.txt` restrictions may limit coverage for some sources

## 12) Cost and Complexity

### Browser Rendering `/crawl`
- Complexity: medium
- Cost posture: moderate usage-based browser cost
- Official pricing source: [Browser Rendering pricing](https://developers.cloudflare.com/browser-rendering/pricing/)

### Workers AI large models
- Complexity: medium
- Cost posture: variable and potentially expensive if used indiscriminately
- Official pricing source: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

### R2 Local Uploads
- Complexity: low to medium
- Cost posture: normal R2 storage and operations; Local Uploads itself has no additional fee per Cloudflare's announcement
- Official source: [R2 Local Uploads changelog](https://developers.cloudflare.com/changelog/post/2026-02-03-r2-local-uploads/)

### Agents SDK
- Complexity: medium to high
- Cost posture: Workers + Durable Objects + AI usage if adopted later
- Official sources:
  - [Agents overview](https://developers.cloudflare.com/agents/)
  - [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## 13) Single Best Prototype To Test First

### Prototype name
`Research Source Monitor`

### Why this should be first
It is the highest-value, lowest-drift use of Cloudflare's newer features for Atlas.

It improves:
- research continuity
- source monitoring
- memo support
- scenario-linked diligence

while staying inside Atlas's current lane:
- geo/opportunity intelligence
- memo-quality research records
- scenario-linked underwriting support

### Prototype success criteria
The prototype succeeds if an analyst can:
1. attach a small source set to a county research record
2. run a crawl and get usable results
3. see a trustworthy source-delta summary
4. reuse the output inside the memo
5. see at least one scenario-linked diligence question when a scenario run exists

The prototype fails if it turns into:
- open-ended AI browsing
- a generic agent experience
- a parcel/site operations workflow
- a noisy research feed with weak memo relevance

## 14) Recommendation

Atlas should prototype:
- **Browser Rendering `/crawl`** for source capture
- **Workers AI** for evidence-bound summarization and diligence support
- attached directly to **`research_workspaces`** and optionally **`research_scenario_runs`**

Atlas should defer:
- R2 Local Uploads until artifact handling is first-class
- Agents SDK until durable autonomous monitoring is truly needed

Atlas should skip for now:
- Dynamic Workers
- EmDash

This is the cleanest Cloudflare-native way to deepen Atlas substance without widening the product prematurely.
