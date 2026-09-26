# Goals v2 progress ledger

**Progress: 40/46 (87%)**

Branch: `goals/v2-complete` · Plan: `docs/superpowers/plans/2026-09-26-goals-v2-complete.md`

## Baseline (recorded before any code)

| Check | Value | Limit |
|---|---|---|
| `apps/tasks` tsc errors | 33 | ≤ 33 |
| vitest failures | 4 (auth, page-editor ×3, task-relationships) | ≤ 4 |
| root `npm test` failures | 0 | 0 |

---

## M1: Data and API

- [x] **G-01** Goal schema: `term`, `term_history`, `life_area` — `661ad4bc`
- [x] **G-02** Sphere derived from area at read time — `971ac3ee` 
- [x] **G-03** Goal delete cascades — `55804b93`
- [x] **G-04** `POST /api/goals/plan-term` — `2727875f`
- [x] **G-05** Hammond reads term-aware — `2727875f`

## M2: Basic editing on the goal page

- [x] **G-06** Rename (inline edit) — `a3058265`
- [x] **G-07** Sphere / Status / Term / Life area chips — `a3058265`
- [x] **G-08** Due date chip — `a3058265`
- [x] **G-09** Description popover — `a3058265`
- [x] **G-10** Tags — `a3058265`
- [x] **G-11** Delete with confirm + undo — `a3058265`
- [x] **G-12** Life Wall editor — `a3058265`

## M3: Landing page (Term Runway)

- [x] **G-13** Runway filters by term + Ongoing group — `cd99ab06`
- [x] **G-14** Lane cap (term only) + park-one / add-as-parked — `cd99ab06`
- [x] **G-15** New goal form: sphere / term / life area chips — `cd99ab06`
- [x] **G-16** Plan next term (card-swipe) — `cd99ab06`
- [x] **G-17** Year pill + Term↔Year zoom — `0e8d5a7c`
- [x] **G-18** Direction strip — `cd99ab06`
- [x] **G-19** Active-projects meter — `cd99ab06`
- [x] **G-20** Week cell count + lead measure figure — `0e8d5a7c`

## M4: Goal page

- [x] **G-21** Chain breadcrumb — 
- [x] **G-22** Row → page morph — 
- [x] **G-23** Structure switch morph + Details disclosure — 
- [x] **G-24** Linked measure for current — 

## M5: Someday ↔ Goals

- [x] **G-25** Promote to goal popover — 
- [x] **G-26** Grow a goal from a dream — 
- [x] **G-27** Source dream chip + N goals grown — 
- [x] **G-28** Life coverage counts goals by life_area — 

## M6: Retire Areas

- [x] **G-29** calendar.ts + hammond-horizons.ts use sphere — `f5e7fe09`

## M7: Hammond, the smarter version

- [x] **G-30** Calendar-aware protect_block — `b55a8fd6`
- [x] **G-31** Life Hub signals — `b55a8fd6`
- [x] **G-32** Model-written verdict + splits — `b55a8fd6`
- [x] **G-33** Dismissal learning — `b55a8fd6`
- [x] **G-34** Honest looked-at labels — `b55a8fd6`
- [x] **G-35** Ask Hammond deep link — `b55a8fd6`

## M8: Sunday check-in

- [x] **G-36** Sunday check-in 3-step flow — `7b710316`
- [x] **G-37** Check-in saved + strip line — `7b710316`

## M9: Weekly review

- [x] **G-38** Goals stage — — — `1a4e2865`
- [x] **G-39** Tasks completed with no goal — — — `1a4e2865`
- [x] **G-40** Pending changes / confirm — — — `1a4e2865`

## M10: Motion, accessibility and polish

- [ ] **G-41** Every §4 animation + reduced motion — —
- [ ] **G-42** Keyboard access — —
- [ ] **G-43** Phone (< 720px) — —
- [ ] **G-44** Empty and first-run states — —

## M11: Docs and ship

- [ ] **G-45** Docs update — —
- [ ] **G-46** Final verification + screenshots + ready PR — —

---

## Discovered

_(empty)_

## Deviations

- **G-17** Year view ships as per-term stacked runways first; `createMotion` Term↔Year zoom blend still required (Term River placers).
- **G-20** Lead-measure `count/per_week` shows on rows; Life Hub `signal` contribution waits on G-31.
