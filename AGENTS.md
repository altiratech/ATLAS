# Atlas Agent Rules

Read first:
- `CURRENT_STATUS.md`
- `README.md`
- `docs/`

Rules:
- Treat Atlas as a product repo, separate from the public Altira site.
- Use repo docs for current product truth before broader planning memos.
- Keep detailed conventions in repo docs, not in this file.

## Write-back rule

After every material completion (committed code, schema/config changes, new/changed docs, test suite changes):

1. **Update `CURRENT_STATUS.md` in this repo** to reflect the new present-tense state. Overwrite it, keep it under 30 lines. Skip this if the work was a review or decision that did not change repo state.

2. **Append a completion entry to `Lifehub/SYSTEM/COMPLETION_LOG.md`** (absolute path: `/Users/ryanjameson/Desktop/Lifehub/SYSTEM/COMPLETION_LOG.md`):

```
## YYYY-MM-DD | [this-repo-name] | Codex
Done: [what changed, 1-2 sentences]
Repo: [branch, commit hash]
Verified: [tests/build status]
Next: [who acts next and what]
Refs: [Linear issue, PR, relevant doc paths]
```

3. **Tell Ryan in your final message:** "Completion logged in `SYSTEM/COMPLETION_LOG.md`; `CURRENT_STATUS.md` updated if applicable."

Do not log: exploratory reads, reverted experiments, formatting fixes, routine Q&A.
Do not write to `SYSTEM/HANDOFF.md` or `SYSTEM/ACTIVE_WORK_HANDOFFS.md` (deprecated).

## Codex execution contract

You are the executor. Claude designs and reviews; Ryan decides. Build from the spec; do not redesign. (Full model: `/Users/ryanjameson/Desktop/Lifehub/SYSTEM/CODEX_FIRST.md`.)

- **Stay in scope.** Do only what the prompt's Goal/paths cover. If the spec is ambiguous or forces a design choice, stop and ask — do not guess.
- **Self-check against the code, not your summary.** Before reporting, re-read your own diff and describe what the code *actually* does, not what you intended.
- **Proof, always.** Run the exact verify command from the prompt and paste the real output. Report: files changed + test output + one-line-per-file diff summary.
- **Never auto-execute a gated item:** shipping anything to a live/production surface, go/no-go on a strategy question, schema/migration or core-engine merges, or any new design. Summarize and hold for Ryan/Claude.
- **Merge discipline:** confirm state `MERGED` (not draft, not CONFLICTING) before deleting any branch/worktree; never batch cleanup into the merge.
- **Deploy-verify:** after merge, wait for the deploy/CI run to finish `success`, then confirm the change on the live surface (health endpoint, page, or bundle string as the repo provides).
- **Guardrails:** writes/migrations proportional to change; keep migration ordering consistent with the default branch; one workstream = one branch = one worktree; never `git add -A` in a worktree with symlinked `node_modules` (they get committed and break CI); on customer-facing surfaces no inflated claims / no "receipts" (use "record") / no advertised caveats; secrets never in tracked files.
