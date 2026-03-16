# Atlas Identity And Billing Alignment

Last updated: 2026-03-16 (ET)
Owner: Ryan + Codex + Claude
Status: Local compatibility note for Atlas implementation decisions

## Purpose

This note keeps Atlas aligned with the shared Altira identity and billing direction without forcing a rewrite or a premature shared-platform implementation inside this repo.

## Current Atlas State

Atlas currently uses:
- module-local session auth via `/api/v1/auth/bootstrap`
- bearer-token sessions persisted in the frontend
- optional edge identity headers in protected environments
- demo-mode anonymous bootstrap when `ALLOW_ANON_SESSIONS=1`
- per-user ownership on personal records such as research, watchlist, notes, and portfolios

Atlas does **not** currently implement:
- shared Altira accounts
- workspace membership
- suite roles
- module entitlements
- subscriptions or billing
- enterprise SSO as the core product auth model

## Alignment To D-179

Atlas should remain compatible with this shared model:
- one account per person
- one or more workspaces per account
- one subscription per workspace
- simple visible roles: `user`, `manager`, `admin`
- workspace-based entitlements
- Stripe for self-serve billing later
- enterprise SSO layered on later, not assumed by default

## What Should Change Now

Do now:
- keep Atlas auth session-based and lightweight
- treat edge identity as optional bootstrap input, not as the product's long-term identity model
- avoid adding any product-local billing system
- avoid adding product-local entitlement logic
- avoid adding a custom Atlas-only role taxonomy
- keep personal data ownership checks in place until shared workspace auth exists

## What Should Change Later

Do later, in a shared Altira layer rather than inside Atlas alone:
- shared user account model
- workspace model
- membership model
- visible roles: `user`, `manager`, `admin`
- workspace subscriptions and plan state
- workspace module entitlements
- invites
- Stripe checkout / billing portal
- enterprise SSO and related enterprise controls

## Implementation Rule For Atlas

Until shared Altira identity exists:
- Atlas may keep module-local sessions
- Atlas should not build its own billing
- Atlas should not invent extra visible roles
- Atlas should not assume enterprise SSO is the normal login path

When shared Altira identity arrives:
- Atlas should consume workspace role and entitlement state
- Atlas should keep product-specific powers as capabilities only if real workflows require them
