# Goals v2 progress ledger

**Progress: 36/46 (78%)**

Branch: `fix/goals-v2-live-review` · Plan: `docs/superpowers/plans/2026-09-26-goals-v2-complete.md`

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

- [ ] **G-06** Rename (inline edit) — `a3058265`
  - **Reopened (live review 26/09):** page `h1` had both `hub-kinetic` and `hub-inline-edit`; spaces collapsed and `textContent` doubled. Edit through a separate input seeded from `goal.title`, never from `textContent`.
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
- [ ] **G-16** Plan next term (card-swipe) — `cd99ab06`
  - **Reopened (live review 26/09):** with no active goals in the term the sheet stayed silent. Must open with Ongoing goals too; empty state with New goal; never a dead button.
- [ ] **G-17** Year pill + Term↔Year zoom — `0e8d5a7c`
  - **Reopened (live review 26/09):** pills vs display mismatch; Term view showed a window around today not W1…W10; Year mash labels / Term 4 behind Move; phone Year list at 1440 with Term 4 highlighted.
- [ ] **G-18** Direction strip — `cd99ab06`
  - **Reopened (live review 26/09):** editor `[hidden]` still visible; start collapsed; need real card surface (`glass-tile` is a no-op in Tasks).
- [x] **G-19** Active-projects meter — `cd99ab06`
- [x] **G-20** Week cell count + lead measure figure — `0e8d5a7c`

## M4: Goal page

- [x] **G-21** Chain breadcrumb — 
- [ ] **G-22** Row → page morph — 
  - **Reopened (live review 26/09):** zoom/SVG runway rows must be real links/buttons to `#/goal/:id` (keyboard Enter) with `morphFromRect`; remove clipboard-on-click behaviour.
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

- [ ] **G-30** Calendar-aware protect_block — `b55a8fd6`
  - **Reopened (live review 26/09):** production `createGoalReadsHandler()` never passed `loadCalendarContext`. Wiring on this branch (same as #486).
- [ ] **G-31** Life Hub signals — `b55a8fd6`
  - **Reopened (live review 26/09):** same missing default loader. Wiring on this branch (same as #486).
- [x] **G-32** Model-written verdict + splits — `b55a8fd6`
- [x] **G-33** Dismissal learning — `b55a8fd6`
- [x] **G-34** Honest looked-at labels — `b55a8fd6`
- [x] **G-35** Ask Hammond deep link — `b55a8fd6`

## M8: Sunday check-in

- [ ] **G-36** Sunday check-in 3-step flow — `7b710316`
  - **Reopened (live review 26/09):** relative `fetch('/api/goal-checkins')` 404s on life-hub.adam-russell.com; must go through `tasksApi` + `getApiBaseUrl()`.
- [ ] **G-37** Check-in saved + strip line — `7b710316`
  - **Reopened (live review 26/09):** same relative fetch; strip line never loads.

## M9: Weekly review

- [x] **G-38** Goals stage — — — `1a4e2865`
- [x] **G-39** Tasks completed with no goal — — — `1a4e2865`
- [x] **G-40** Pending changes / confirm — — — `1a4e2865`

## M10: Motion, accessibility and polish

- [x] **G-41** Every §4 animation + reduced motion — — — `36dd2fe5`
- [x] **G-42** Keyboard access — — — `36dd2fe5`
- [ ] **G-43** Phone (< 720px) — — — `36dd2fe5`
  - **Reopened (live review 26/09):** Move text clipped; empty header above lanes; missing current-week cell; desktop wrongly got `runway--phone` / phone Year list at 1440.
- [x] **G-44** Empty and first-run states — — — `36dd2fe5`

## M11: Docs and ship

- [x] **G-45** Docs update — — — `cbbed4c4`
- [x] **G-46** Final verification + screenshots + ready PR — — — `96457847`

---

## Discovered

- Weekly review stage count tests expected 8 stages; updated to 9 (`goals` after `projects`) as part of G-38.
- `someday-view` mocks needed `listGoals` + `getHubPrefs` after G-25/G-28.
- Live Tasks Vite is passphrase-gated in Cloud Agent; G-46 screenshots for check-in / weekly / Hammond used design-kit fixtures + prior landing/goal captures.
- **Live review 26/09 (signed in, real data, 1440 + 375):** prior “screenshots” were fixtures; reopen list above. Branch `fix/goals-v2-live-review`.


## Deviations

- **G-17** Year Term↔Year uses `createMotion` placers (Term River rules); phone uses term list.
- **G-46** Live signed-in UI screenshots for Year / Plan-next-term / all 5 structures blocked by passphrase gate in Cloud Agent; fixtures + prior landing/goal captures attached instead.
