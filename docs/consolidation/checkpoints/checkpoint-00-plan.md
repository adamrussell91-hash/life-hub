# Checkpoint 00 — Plan critique #1

**Date:** 2026-09-01  
**Author:** Claude Code (consolidation overseer, observe-only critique pass)  
**Verdict:** PASS WITH NITS — direction OK; plan lacked named invariants and falsifiable gates (addressed in plan.md v2)

## Summary

First Phase A critique identified auth, public student URLs, calendar sequencing, Netlify inventory, fold triggers, design-kit mechanic, and repo-naming blockers. Cursor applied fixes to `plan.md` v2.

## Must-fix items (from critique)

| Risk | Resolution in plan v2 |
|------|------------------------|
| Auth unification asserted not designed | New **Auth unification** section; step 2 blocker |
| Public student URLs not in plan | **Invariants** table + non-goal + step 5 gate |
| Calendar not sequenced | Step 3 stub scope defined; wiring deferred to step 5+ |
| Netlify inventory empty | Still FILL_IN; checkpoint-02 blocked until filled |
| Step 5 fold trigger unfalsifiable | Triggers A/B/C defined |
| Design-kit mechanic unstated | Copy-then-freeze documented |
| Repo naming blocks step 1 | Moved into step 1 decide+record |

## Still blocked on Adam

- OVERSEER.md Netlify inventory (site names, URLs, origins)
- Auth secret strategy choice (new vs retain Life)
- Umbrella repo name + life-hub redirect/rename decision

## Next 3 steps (Cursor only)

1. Adam fills Netlify inventory in OVERSEER.md
2. Adam records auth + repo naming decisions in plan.md
3. Claude critique #2 — stress-test migrate order once blockers cleared
