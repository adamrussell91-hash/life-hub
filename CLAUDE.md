# Life Hub — Claude Code entry

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
