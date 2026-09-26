# Goals v2 progress ledger

**Progress: 0/46 (0%)**

Branch: `goals/v2-complete` · Plan: `docs/superpowers/plans/2026-09-26-goals-v2-complete.md`

## Baseline (recorded before any code)

| Check | Value | Limit |
|---|---|---|
| `apps/tasks` tsc errors | 33 | ≤ 33 |
| vitest failures | 4 (auth, page-editor ×3, task-relationships) | ≤ 4 |
| root `npm test` failures | 0 | 0 |

---

## M1: Data and API

- [ ] **G-01** Goal schema: `term`, `term_history`, `life_area` — —
- [ ] **G-02** Sphere derived from area at read time — —
- [ ] **G-03** Goal delete cascades — —
- [ ] **G-04** `POST /api/goals/plan-term` — —
- [ ] **G-05** Hammond reads term-aware — —

## M2: Basic editing on the goal page

- [ ] **G-06** Rename (inline edit) — —
- [ ] **G-07** Sphere / Status / Term / Life area chips — —
- [ ] **G-08** Due date chip — —
- [ ] **G-09** Description popover — —
- [ ] **G-10** Tags — —
- [ ] **G-11** Delete with confirm + undo — —
- [ ] **G-12** Life Wall editor — —

## M3: Landing page (Term Runway)

- [ ] **G-13** Runway filters by term + Ongoing group — —
- [ ] **G-14** Lane cap (term only) + park-one / add-as-parked — —
- [ ] **G-15** New goal form: sphere / term / life area chips — —
- [ ] **G-16** Plan next term (card-swipe) — —
- [ ] **G-17** Year pill + Term↔Year zoom — —
- [ ] **G-18** Direction strip — —
- [ ] **G-19** Active-projects meter — —
- [ ] **G-20** Week cell count + lead measure figure — —

## M4: Goal page

- [ ] **G-21** Chain breadcrumb — —
- [ ] **G-22** Row → page morph — —
- [ ] **G-23** Structure switch morph + Details disclosure — —
- [ ] **G-24** Linked measure for current — —

## M5: Someday ↔ Goals

- [ ] **G-25** Promote to goal popover — —
- [ ] **G-26** Grow a goal from a dream — —
- [ ] **G-27** Source dream chip + N goals grown — —
- [ ] **G-28** Life coverage counts goals by life_area — —

## M6: Retire Areas

- [ ] **G-29** calendar.ts + hammond-horizons.ts use sphere — —

## M7: Hammond, the smarter version

- [ ] **G-30** Calendar-aware protect_block — —
- [ ] **G-31** Life Hub signals — —
- [ ] **G-32** Model-written verdict + splits — —
- [ ] **G-33** Dismissal learning — —
- [ ] **G-34** Honest looked-at labels — —
- [ ] **G-35** Ask Hammond deep link — —

## M8: Sunday check-in

- [ ] **G-36** Sunday check-in 3-step flow — —
- [ ] **G-37** Check-in saved + strip line — —

## M9: Weekly review

- [ ] **G-38** Goals stage — —
- [ ] **G-39** Tasks completed with no goal — —
- [ ] **G-40** Pending changes / confirm — —

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

_(empty)_
