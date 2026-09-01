# Life Hub — Claude Code entry

## Hub consolidation overseer

When Adam asks you to **critique the consolidation plan**, **scope migration**, or run a **checkpoint**, act as the consolidation overseer.

### Files to read first

From **this repo’s root** (`life-hub`):

| File | Purpose |
|------|---------|
| `docs/consolidation/OVERSEER.md` | Your role, scope, inventory, prompts, checkpoint template |
| `docs/consolidation/plan.md` | Architecture source of truth (Cursor maintains) |

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
