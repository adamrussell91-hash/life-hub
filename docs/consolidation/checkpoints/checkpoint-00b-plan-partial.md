# Checkpoint 00b — Plan critique #2 (partial)

**Date:** 2026-09-01  
**Author:** Claude Code (consolidation overseer)  
**Verdict:** PASS WITH NITS — structural only; full execution-readiness blocked on Adam decisions

## Scope of this pass

Stress-tested plan v2 **structure** only. Did not validate Netlify retarget safety against real site secret sets — plan v2 gates forbid that until **Decisions → Auth** and inventory are in `plan.md`.

## Residual gaps (addressed in plan v2.1)

| Gap | Fix in v2.1 |
|-----|-------------|
| Knowledge/Tasks fold lacks Teaching-level detail | Per-hub fold table with Knowledge CF/R2 bindings noted |
| Generic step-5 checkpoint gate | Scoped per hub (Teaching public routes vs Knowledge CF blast radius vs Tasks TBD) |

## Still blocked on Adam (must land in plan.md, not chat)

1. **Decisions → Repo** — reuse `life-hub` vs new repo; rename/redirect/leave
2. **Decisions → Auth** — new umbrella secrets vs retain Life Hub
3. **Netlify site names** (dashboard labels) — public URLs partially filled from committed config

## Public URLs filled from repo (Cursor, not Adam)

| Hub | Functions URL | SITE_ORIGIN |
|-----|---------------|-------------|
| Life | `https://api.adam-russell.com` | `https://life-hub.adam-russell.com` |
| Teaching | `https://teaching-api.adam-russell.com` | `https://teaching-hub.adam-russell.com` |

## Next step

Adam fills **Decisions** in `plan.md` → Claude runs **full** critique #2 (migrate-order execution-readiness).
