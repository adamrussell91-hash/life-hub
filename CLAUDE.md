# Life Hub — Claude Code entry

## Before any PR (mandatory)

Run and pass `npm run pre-pr-check` (or `node scripts/pre-pr-check.mjs`) from the repo root before opening or updating any life-hub PR. Exit 0 required. See root `AGENTS.md` and Project store `docs/mandatory-pre-pr-check.md`.

**Exception: idea docs.** Edits that only touch `docs/future-build-ideas/` skip this gate and may be committed straight to `main` with no PR. These are concept docs for the what if rounds between Claude Code, Cursor and Codex; nothing builds from them. Pull `main` first, commit, push. If a change touches any file outside that folder, the gate applies as normal.

## Product stress test

When Adam asks you to **stress test**, **click through the hubs**, **find broken pages**, or **hunt visual bugs**, act as the product walker.

Read and obey [`docs/STRESS-TEST.md`](docs/STRESS-TEST.md). Walk every listed page on the live umbrella (`life-hub.adam-russell.com`) at desktop and 390px. Click the real controls. Write one report under `docs/stress-test/reports/`. Do not edit product code and do not ask for the passphrase.

This is not the consolidation overseer. Do not write `docs/consolidation/checkpoints/`.

## Hub consolidation overseer

When Adam asks you to **critique the consolidation plan**, **scope migration**, run a **checkpoint**, or do a **thorough consolidation / post-fold check**, act as the consolidation overseer.

### Files to read first

From **this repo’s root** (`life-hub`):

| File | Purpose |
|------|---------|
| `docs/consolidation/OVERSEER.md` | Your role, scope, inventory, prompts, checkpoint template |
| `docs/consolidation/plan.md` | Architecture source of truth (Cursor maintains) |
| `docs/consolidation/POST-FOLD-AUDIT.md` | Post-fold test-spec (Phase C) — run every check, write `checkpoint-10.md` only |

### Where to write

Checkpoint reports **only**:

`docs/consolidation/checkpoints/checkpoint-NN.md` (01, 02, …)

### Typical path on Adam’s Mac

```text
~/Projects/life-hub/docs/consolidation/OVERSEER.md
~/Projects/life-hub/docs/consolidation/plan.md
```

### If those files are missing

1. Confirm Claude Code’s working directory is the **life-hub** repo root (where this `CLAUDE.md` lives), not a parent folder or another hub repo.
2. Run `git pull origin main` — these docs live on `main` after merge.
3. If still missing, Adam may be on an old branch; check `git branch` and pull latest `main`.

Do not guess the overseer role from chat memory — **read `docs/consolidation/OVERSEER.md` every time** before critiquing or checkpointing.

## Clare / Tasks PA assumptions audit

When Adam asks you to **audit Clare**, **completed-task / Done-column retention**, **proactive PA automation**, **whether Clare should run holistic forecasting across hubs**, or **review Cursor’s proposed build**, read this first:

| File | Purpose |
|------|---------|
| [`docs/CLARE-TASKS-PA-ASSUMPTIONS.md`](docs/CLARE-TASKS-PA-ASSUMPTIONS.md) | Assumption tests, 29 Sep corrections, **detailed build plan** (Docs → Slice A → Slice B) — audit the plan before anyone builds |
| [`docs/AGENT_AUTOMATION_AUDIT.md`](docs/AGENT_AUTOMATION_AUDIT.md) | What already runs, gaps, cheap daily/weekly schedule |

Re-verify claims against current `main`. Challenge the build plan’s Must / Must-not / Verify / Files. Do not invent a daily full-agent Sonnet “PA” cron. Do not implement from the brief alone unless Adam names a step (Docs / Slice A / Slice B item).

## Cursor UI failure register

When you **write a build brief for Cursor** or **review Cursor's UI work**, use [`docs/CURSOR-UI-FAILURES.md`](docs/CURSOR-UI-FAILURES.md):

- Brief: cite the relevant entry IDs in the brief's failure-modes section, each with a feature-specific check.
- Review: every new failure becomes an entry in the same PR; a repeat extends that entry's **Seen** line.

Cursor loads it via `.cursor/rules/ui-failure-register.mdc`.
