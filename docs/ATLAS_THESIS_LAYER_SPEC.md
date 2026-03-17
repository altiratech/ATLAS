# Altira Atlas Thesis Layer Spec

Last updated: 2026-03-17 (ET)
Owner: Ryan + Codex + Claude
Status: Canonical product note for thesis-driven Atlas work

## 1) Purpose

Atlas should support **theme- and thesis-driven investigation** without turning into an agtech product, a parcel-native site tool, or a dashboard of generic county medians.

The thesis layer exists so an analyst can ask a sharper question of the same geography/opportunity engine.

Examples:
- Where could agricultural transition stress create land repricing?
- Which counties look like durable production bases under physical risk?
- Where could power, logistics, and production density create a stronger ag-processing opportunity later?

The product rule:
- **Perspective** defines the default universe and workflow.
- **Thesis lens** defines the investment question applied to that universe.
- **Opportunity** is the concrete county/market candidate the analyst chooses to work on.

## 2) Why This Layer Exists

Atlas already has useful geo/opportunity plumbing:
- valuation and fair-value context
- drought, flood, irrigation, and soil evidence
- screening, research, scenario, and portfolio workflow

What Atlas lacked was a way to express:
- why an analyst is looking at a universe
- what cross-cutting question they are trying to answer
- which parts of that question Atlas can support today
- which parts remain missing and should not be faked

The thesis layer solves that problem.

## 3) Product Structure

Atlas should now be understood as:

1. `Perspective`
- example today: `Farmland Income`
- defines default universe, units, and baseline workflow

2. `Thesis Lens`
- example today: `Ag Transition Thesis`
- defines the question and starter framing

3. `Shared Tools`
- Screener
- County Detail
- Scenario Lab
- Research Workspace
- Portfolio

4. `Opportunity`
- the county/market record the analyst is actively underwriting or researching

## 4) Current Live Thesis Lenses

### A. Ag Transition Thesis

Question:
- Where could labor pressure, automation, consolidation, and policy shifts create enough stress or adaptation demand to move land, infrastructure, or underwriting outcomes?

Atlas uses now:
- valuation pressure via benchmark/fair-value spread and cap rate
- productive base via NRCS farmland share, AWS 100cm, and irrigation footprint
- physical fragility via drought and flood burden
- access and limited infrastructure proxies where available

Important honesty rule:
- Atlas does **not** yet have direct labor scarcity, H-2A, wage, broadband, or robotics-adoption data live.
- This lens is a transition-thesis workflow built from current land and infrastructure proxies, not a direct labor-market model.

### B. Resilient Production Base

Question:
- Which counties look like durable agricultural production bases once soil, water, and physical risk are weighed together?

Atlas uses now:
- NRCS farmland share
- AWS 100cm
- irrigated acreage
- drought and flood burden
- valuation and income context

Important honesty rule:
- Atlas does **not** yet have direct groundwater-depletion, labor, or farm-tech adoption signal wired into this lens.

### C. Powered Ag Processing

Status:
- In Build

Purpose:
- reserve room for a future lens where agricultural production, access, power, and processing context converge

Important honesty rule:
- this is not a live claim about Atlas capability today

## 5) What AI Should Eventually Do

AI should help the analyst:
- translate a thesis into a screen
- explain why counties surfaced
- propose additional variables or missing diligence questions
- draft memo language tied to visible evidence

AI should **not**:
- generate opaque composite scores
- fabricate missing labor/policy/robotics data
- replace explicit observed-vs-modeled boundaries

## 6) Near-Term Product Implications

Atlas should now prioritize:
- perspective + thesis-lens aware entry flow
- thesis-aware screening and saved views
- research records that preserve thesis context
- opportunity-centric memo and scenario workflow

Atlas should avoid:
- hardcoding the product around asset-type tabs alone
- pretending every thesis has a complete direct-data model
- adding more dashboard-like summary surfaces before the workflow is clear

## 7) Boundary Reminder

This thesis layer belongs inside Atlas because Atlas is the geo/opportunity underwriting module.

It does **not** change Atlas into:
- an agtech product
- a parcel-native infrastructure truth engine
- a site-optionalty operating system

It makes Atlas better at supporting analysts whose investment theses sit at the intersection of:
- land
- physical infrastructure
- policy
- climate
- automation
- real-assets repricing
