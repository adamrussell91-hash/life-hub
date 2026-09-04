# Hub consolidation — working files

**Repo:** `adamrussell91-hash/life-hub`  
**Folder:** `docs/consolidation/` (from repo root)  
**Claude Code entry:** root [`CLAUDE.md`](../../CLAUDE.md) → [`OVERSEER.md`](./OVERSEER.md)

This folder is the **single working area** for merging Adam’s hubs into one code repo (+ `life-hub-data` unchanged).

## File map

| Path | Owner | Purpose |
|------|--------|---------|
| [`plan.md`](./plan.md) | Cursor (writes/updates) | Source of truth for architecture, migrate order, status |
| [`OVERSEER.md`](./OVERSEER.md) | Human + Cursor (rarely) | Claude Code’s role, scope, inventory blanks, report template |
| [`POST-FOLD-AUDIT.md`](./POST-FOLD-AUDIT.md) | Cursor | Thorough post-consolidation test-spec for Claude Code (Phase C) |
| [`checkpoints/`](./checkpoints/) | Claude Code (reports only) | Observe-only checkpoint reports: `checkpoint-NN.md` |

## Loop

1. **Cursor** designs / updates `plan.md`.
2. **Claude Code** critiques and scopes against `OVERSEER.md` + `plan.md` (may propose plan edits; Cursor applies them).
3. **Cursor local agent** actions the plan (code, moves, deploys).
4. At each checkpoint, **Claude Code** reads the diff + plan, writes `checkpoints/checkpoint-NN.md` only — **no code writes, no file moves, no git commits**.

Do not keep a parallel plan in chat. If reality diverges, update `plan.md`.
