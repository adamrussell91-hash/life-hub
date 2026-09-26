# Goals v2: finish it (build brief for Cursor)

**Why this exists.** Goals redesign v1 shipped in #469 and #476, but it left out features, took out things Adam had before, and some parts only half worked. This brief builds **everything that is still missing, in one go**. It closes with a verified, deployed, screenshotted result and a progress ledger at 100%. Adam should never have to ask "what else was left out?"

Branch: `goals/v2-complete` (from `main`). One draft PR for the whole build. Adam merges it himself.

---

## 0. Rules of engagement (read first, follow exactly)

### 0.1 Scope is locked
- The **Item list (§3)** is the complete scope: 46 items, G-01 … G-46. Build **all** of them.
- You may **not** defer, stub, skip or "leave for a follow-up" any item. If an item turns out impossible as written, **stop and ask Adam**, and explain what you found and what options he has.
- If you discover something *new* that's needed (a bug, a missing helper, a broken dependency), add it to the ledger's **Discovered** section, then do one of these:
  - Fix it now, if it's needed for an item to work.
  - Ask Adam, if it's genuinely separate work.
  Never mention it for the first time in the final summary.
- Anything not in §3 is out of scope. Don't gold-plate.

### 0.2 Progress is always visible
1. **First commit:** create `docs/superpowers/progress/goals-v2.md`. It's the ledger: every item G-01…G-46 as an unticked checkbox, grouped by milestone, plus empty **Discovered** and **Deviations** sections. The header is `Progress: 0/46 (0%)`.
2. Open a **draft PR** straight away with `gh pr create --draft`. Its body is the same checklist.
3. After **each item**:
   - Tick it in the ledger and add the commit SHA.
   - Update the header count and %.
   - Commit the change.
4. After **each milestone**:
   - Update the PR body to match the ledger (`gh pr edit --body-file`).
   - Post one line in chat: `M<n> done — <done>/46 (<pct>%) — next: M<n+1> <name>`.
5. At the end, the ledger must read `Progress: 46/46 (100%)`. Discovered items must each be fixed or explicitly answered by Adam.

### 0.3 Definition of Done
**For each item**, all of these must be true:
- **Tests:** there's a test that failed before and passes now.
- **UI:** any UI change was checked in the browser at 1440px and 375px.
- **Motion:** where the item has one, it follows §4.
- **Kit rules:** tokens only, dd/mm/yy dates, confirm-first for agents.
- **Committed:** with a conventional message.

**For the whole build**, all of these must be true:
- **Root tests:** `npm test` shows 0 failures.
- **Tasks Hub:** `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` is **≤ 33**, and vitest failures are **≤ 4**. Those are the pre-existing ones (auth, page-editor ×3, task-relationships).
- **Screenshots in the PR:**
  - Landing: Term, Year, Plan-next-term and Direction
  - Goal page: all 5 structures
  - Hammond panel with proposals
  - Sunday check-in
  - Weekly review Goals stage
  - Phone views
  - Reduced-motion
- **Live check after Adam merges:**
  - `https://api.adam-russell.com/api/goal-reads` returns 401 (signed-out), which shows the endpoint is deployed.
  - The live Tasks bundle contains the new strings.
  - Check that the Netlify deploy isn't frozen. It was once, from 2026-09-05 to 2026-09-24, so confirm the latest deploy timestamp is after the merge.
- **Ledger:** at 100%.

### 0.4 Guardrails
- Commit only to `goals/v2-complete`. **Never push to main, never merge the PR.**
- Read the kit before any UI work: `packages/design-kit/AGENTS.md`, `TASKS.md`, `MOBILE.md` and `CHARTS.md`, and the header comments of the motion modules named in §4.
- **`glass-tile` does nothing in Tasks Hub** (see #373). Give every card a real surface: `background: var(--glass); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--elev-1)`. See `.runway, .goal-card, .goals-new` in `goals.css`.
- Agent writes follow propose → confirm → apply, through `POST /api/calendar-ghosts { id, decision }` (goal ghosts are `goal-…` ids). The client never builds the write.
- No red for a miss, anywhere.
- Use existing modules; don't write parallel ones. Examples: `school-time` in `packages/design-kit/js/school-time.js`, `capacityForDates` in `apps/life/js/app/capacity-model.js`, `findOpenings` in `packages/design-kit/js/openings.js`, `buildBindingGoal` in `apps/life/js/app/binding-goal.js`, and `createActiveProjectsMeter` in `packages/design-kit/js/agent-productivity-cards.js` with `activeProjectMeter` in `apps/tasks/src/domain/hammond-portfolio.ts`.

---

## 1. Read before coding
- `docs/superpowers/specs/2026-09-26-goals-redesign-design.md`: the v1 spec. Everything there still holds unless §2 changes it.
- `docs/superpowers/plans/2026-09-26-goals-redesign.md`: how v1 was built (file map, patterns).
- The shipped code:
  - `apps/tasks/src/views/goals.ts`, `goal-page.ts`, `goal-frame.ts`, `hammond-goal.ts`, `focus-strip.ts`
  - `apps/tasks/src/domain/goal-*.ts`
  - `netlify/functions/goals.mjs`, `goal-reads.mjs`
  - `netlify/functions/_shared/goal-record.mjs`, `goal-read.mjs`
  - `calendar-ghosts.mjs` (`runGoalGhostDecision`)
  - `apps/life/js/app/ghost-writes.js`
- `docs/proposals/goals-reference/*.png`: the approved look.
- The Term River build (#468) and `docs/proposals/calendar-reference/term-river/VISUAL-SPEC.md`: how a term/year timeline is done in this repo, including its zoom blend and motion engine. The Year view must follow the same approach.

---

## 2. Locked decisions (Adam approved these on 26/09/26)

1. **Goals get a term.**
   - Stored as `term: { year: int, term: 1|2|3|4 } | null`. `null` means **Ongoing**.
   - Add `term_history: Array<{ year, term, outcome: 'carried'|'parked'|'achieved'|'dropped', at: ISO }>`.
   - New goals default to the current term.
   - The runway shows the selected term's goals, plus an **Ongoing** group in each lane, marked as such.
   - The 3-per-lane cap counts **active goals in that term**. Ongoing goals don't count.
2. **Plan next term** is a real review step. It lists every unfinished (`active`) goal in the current term, one at a time, and Adam picks **Carry / Park / Achieved / Drop** for each. Nothing rolls over silently. At the end, show a summary and offer "Add a new goal for Term N+1".
3. **Areas are retired from Goals. Spheres are the top level.**
   - Existing `parent_area_id` values map to a sphere by the area's title:
     - `/teach|school|work|class/i` → work
     - `/career|professional|pd|leader/i` → professional
     - anything else → life
   - The mapping happens at read time in the goals handler, only when a stored goal has no `sphere` field, and is written through on the next write.
   - The Areas API stays for compatibility. `calendar.ts` and `hammond-horizons.ts` switch from area to sphere.
   - **Life** goals get an optional `life_area`: one of the 8 `LIFE_AREAS` ids in `apps/tasks/src/domain/someday.ts`. It's only allowed when `sphere === 'life'`.
4. **Horizons are split across two places.**
   - **Direction:** purpose, principles and vision. It's a slim collapsible strip at the top of the Goals landing page, collapsed to one line by default, using the existing `GET/PATCH /api/planning-direction`.
   - **Chain:** Purpose → Vision → Sphere → Goal → Project → Next action. It's a single breadcrumb line under the goal title on every goal page.

---

## 3. Item list (the whole scope)

The IDs are the ledger IDs. Each milestone ends with its own verification.

### M1: Data and API
- **G-01** Goal schema, in both server `goal-record.mjs` and client `schemas/goal.ts`: add `term`, `term_history` and `life_area` (Life only; stripped otherwise). Existing records stay valid.
- **G-02** Sphere derived from area at read time (§2.3) in `goals.mjs` GET, and written through on PATCH. Idempotent.
- **G-03** Goal delete cascades on the server:
  - hosted projects and tasks get `parent_goal_id: null`
  - `goal_reads/<id>` is deleted
  - the goal is removed from any Someday idea's `linked_goal_ids`

  Add an `onDelete` hook to `tasks-collection.mjs`.
- **G-04** `POST /api/goals/plan-term { from: {year,term}, decisions: [{ goal_id, outcome }] }`. It applies carry, park, achieved and drop in one call:
  - carry: `term` moves to the next term
  - park: `status: 'parked'`
  - achieved: `status: 'achieved'`
  - drop: `status: 'dropped'`

  Every outcome appends to `term_history`. It validates that every goal is in the `from` term, and returns the updated goals.
- **G-05** Hammond's reads get `term` awareness: goals outside the selected term aren't read for the landing page. `GET /api/goal-reads?term=YYYY-N` filters. With no param, the current term plus Ongoing.

### M2: Basic editing on the goal page
- **G-06** Rename: the title in the page header is editable inline, via `enhanceInlineEdit` from `hub-inline-edit.js`. Enter commits, Esc cancels.
- **G-07** Sphere, Status, Term and Life area are closed chips, using `createMorphingClosedFieldPopover` from `morphing-popover.js`. They sit in the meta row. Life area only shows when the sphere is Life.
- **G-08** Due date: a date chip that shows dd/mm/yy and opens a date input. It can be cleared.
- **G-09** Description: `createMorphingNotePopover`, with a two-line preview under the chain.
- **G-10** Tags: `createTagList` from `hub-inline-edit.js`, writing `tags`.
- **G-11** Delete: under the meta row's overflow menu (`renderCardMenu`). There's a confirm step ("Delete ‘X’? Its projects and tasks stay and are unlinked."), then `offerTimedUndo` (5s) **before** the API call. After deleting, it goes back to `#/goals`.
- **G-12** Life Wall editor for the goal, `mountLifeWallEditor`, restored in the meta area. Project milestone Life Walls already live on the Projects page; check they still work.

### M3: Landing page (Term Runway)
- **G-13** The runway filters by the selected term. Each lane has an **Ongoing** group, labelled, with the same row design and a subtle "Ongoing" chip.
- **G-14** The lane cap counts only goals in this term. When a lane is full, **New goal** offers "Park one" (a picker of that lane's goals) or "Add as parked".
- **G-15** The New goal form gains sphere, term (defaulting to the selected term) and life area (Life only). It's closed chips, not a raw `<select>`.
- **G-16** **Plan next term** button → review flow, using the kit card-swipe deck (`createCardSwipe`).
  - There's one card per active goal in the term, showing the title, this term's cells (mini runway) and Hammond's verdict.
  - It has four large choice buttons (Carry / Park / Achieved / Drop) and keyboard keys `1–4`.
  - Choosing a button animates the card off the deck (§4).
  - The summary shows counts per outcome, using count-up from `hub-motion.js`.
  - One **Confirm** at the end calls G-04, then shows a toast and lands on the next term's runway.
  - Nothing is written until that Confirm.
- **G-17** **Year** pill: all four terms of the year on one runway, with holiday gaps. Build it from `buildTimeScale` in `packages/design-kit/js/school-time.js`, like the Term River. Goals sit in their term's span, and carried goals show a continuous row across terms using `term_history`. The Term ↔ Year switch is one zoom blend via `createMotion` from `hub-motion-engine.js`, following the Term River rules: laid out, not scaled, and no re-mount mid-zoom.
- **G-18** **Direction strip** above the Hammond strip, collapsed to one line: "Purpose: … · Vision: …". Expanding it morphs open with `runMorphTransform` into editable purpose, principles (chips) and vision, which save to `/api/planning-direction`. If nothing is set, it shows one prompt: "Set your purpose and vision. Hammond checks goals against them."
- **G-19** Active-projects meter restored: `createActiveProjectsMeter` with `activeProjectMeter(projects, profile)`, small, next to the summary line.
- **G-20** A week's cell count includes Life Hub signals when a goal has `signal` (G-31). Any row with `lead_measure` shows `count/per_week` for this week as a small figure that counts up.

### M4: Goal page
- **G-21** The **chain breadcrumb** under the title: Purpose → Vision → Sphere → Goal → first hosted Project → Next action. Each segment is a link where one exists, and missing links are muted ("Vision not set").
- **G-22** Row → page transition: tapping a runway row runs `morphFromRect` with the title marked `data-hub-morph`, so the title flies into the page header. Back reverses it.
- **G-23** Switching structure animates the card height with `runMorphTransform`. Fields cross-fade. Content from other structures shows in a closed "Details" disclosure (`createDisclosureCard`), so nothing looks lost. Build it now; it's in the v1 spec but not the build.
- **G-24** OKR and Floor·target·stretch "current" values can come from a **linked measure** (G-31) or from a count of hosted completed tasks/steps. There's a small picker: "Where does ‘current’ come from? Typed / Tasks done / Life Hub signal". A typed value stays editable.

### M5: Someday ↔ Goals
- **G-25** Someday's **Promote to goal** opens a small morphing popover that asks for sphere (defaulting to Life, or Professional for `someday_kind: 'career'`), term (defaulting to current) and life area. It no longer silently creates a Life goal.
- **G-26** **Grow a goal from a dream** on the landing page, inside the New goal flow as a second tab. It lists Someday ideas (bucket list, dreams jar, career) not yet linked, and picking one prefills the title and `parent_someday_id`.
- **G-27** The goal page shows the source dream as a gold chip that links to the Someday idea. The Someday card shows "N goals grown", which links back.
- **G-28** Someday's **Life coverage** map (`someday-wheel.ts`) also counts active Life goals by `life_area`, drawn with a distinct mark and a legend line "Goals".

### M6: Retire Areas
- **G-29** `apps/tasks/src/views/calendar.ts` and `apps/tasks/src/domain/hammond-horizons.ts` use sphere, not area, for breadcrumbs and traces. No UI in Tasks Hub creates or edits Areas any more. The API and stored areas are left alone.

### M7: Hammond, the smarter version
- **G-30** **Calendar-aware `protect_block` proposals.**
  - `goal-reads.mjs` opens the Life data repo the way `calendar-ghosts-propose.mjs` does (`githubOpenCommit`, `readEvents`, `capacityForDates`) for the next 14 days, then finds openings with `findOpenings`.
  - Pass `slots` into `buildGoalRead`. When a goal has a lead measure it's behind on this week, propose **one** `protect_block` in the best opening before the week ends. Title it after the next move, with the length of that step (default 45 min).
  - Id `goal-<id>-block-<date>`. It's accepted through the existing `protect_block` path.
  - If GitHub is unavailable, skip this proposal type silently and log it. The read must still return.
- **G-31** **Life Hub signals.**
  - A goal can set `signal: { source: 'binding_goal', row: 'weight'|'fat'|'ratio'|'lift' } | null`, but only Life goals.
  - The server reads Life events like G-30 and runs `buildBindingGoal`.
  - The read shows the row's `detail` in the verdict, marks the goal "binding" when `bindingId` matches, and feeds `current` to the Floor·target·stretch structure when it's linked (G-24).
  - The signal is picked on the goal page from a closed chip.
- **G-32** **Model-written verdict and content-aware splits** (Haiku, `claude-haiku-4-5`; follow the call and key-handling pattern in `netlify/functions/_shared/knowledge-tidy.mjs`).
  - The prompt gets the deterministic read, the goal's structure fields, the if-then, and the next open task titles.
  - It returns strict JSON: `{ verdict: string ≤ 240 chars, split_steps?: string[3..5] }`.
  - Use Hammond's voice from `config/humanizer/voices/hammond.md`.
  - The result is cached inside the read, so there's **one model call per recompute**, not per page view.
  - Timeout 8s. Any failure or invalid JSON falls back to the deterministic verdict and template steps, logged with `reason: 'fallback'` in the read.
  - Mark model-written text in the panel with a tiny "✦" and a title="Written by Hammond (AI)".
- **G-33** **Dismissal learning.** Every accept or dismiss appends `{ kind, outcome, at }` to `goal_reads/_decisions`. If a kind has been dismissed ≥ 3 times in the last 30 days with no accepts, Hammond stops proposing it for 30 days. The panel shows one quiet line: "I've stopped suggesting rest weeks. You kept declining them. Undo". Undo clears that kind's cooldown.
- **G-34** Honest labels in "looked at": rename "Term rhythm" to **"Due-date load"**, and add "Calendar" and "Life Hub" only when G-30/G-31 data was actually read.
- **G-35** **Ask Hammond.**
  - Chat deep link: `#/clare?agent=hammond&prompt=<urlencoded>` selects Hammond and **pre-fills** the composer. It doesn't send.
  - Implement it in the Tasks chat view. Find where the agent picker and composer mount (`src/chat/build-chat-view.ts`, `render-agent-picker.ts`), and cover it with a unit test.
  - The goal page's "Ask Hammond about this goal…" box and Body-double's secondary "Talk it through" use it, with the goal title and next move in the prompt.

### M8: Sunday check-in
- **G-36** A **Sunday check-in** button in the landing's Hammond strip. It's prominent on Sat, Sun and Mon, and quiet otherwise. It opens a 3-step flow using `createStepIndicator` and the card-swipe deck:
  1. **What moved?** This is auto-filled: goals with any count this week, as cells filling in. Adam just taps Next.
  2. **What's stuck, and why?** It shows each cooling or cold goal, with a reason as closed chips: too big · unclear · boring · no time · waiting on someone. Chosen reasons are saved on `goal_reads/<id>.stuck_reason`, and Hammond's next read uses them:
     - too big → split
     - unclear → a SMARTER nudge
     - boring → an if-then nudge
     - no time → a block
  3. **The one move for next week.** Hammond proposes one confirmable ghost per stuck goal, at most 3. Adam confirms or skips each.
- **G-37** The check-in is saved (`goal_checkins/<YYYY-MM-DD>`), so the strip shows "Checked in Sun 27/09 · 2 moves planned" until next Saturday.

### M9: Weekly review
- **G-38** Add a **Goals** stage to the weekly review (`src/domain/weekly-review.ts` stages and its view). It shows each active goal in the term with this week's count against its lead measure, as a row of cells, and the week's Hammond verdict.
- **G-39** In that stage, list **tasks completed this week with no goal** (`parent_goal_id` null and not under a hosted project). Each one gets quick "serves → [goal chips]" buttons, which set `parent_goal_id`. There's also "No goal, that's fine", which dismisses it for the week.
- **G-40** The stage's changes go through the review's existing pending-changes / confirm step (`buildWeeklyPendingChanges`), not straight writes.

### M10: Motion, accessibility and polish (applies everywhere)
- **G-41** Every animation in §4 is implemented, and each one passes a reduced-motion check (`prefers-reduced-motion: reduce` makes everything instant).
- **G-42** Keyboard access:
  - Runway rows can be focused and open with Enter.
  - Chips and popovers work by keyboard.
  - Plan-next-term keys 1–4.
  - Esc closes popovers and the check-in.
  - Focus rings are Wave (`:focus-visible` from `actions.css`).
- **G-43** Phone (< 720px), following `MOBILE.md`:
  - Runway lanes become card lists with only the current-week cell and the move.
  - The goal page is one column, with Hammond's panel after the structure card.
  - Plan next term and the check-in are full-screen sheets.
  - The Year view becomes a list by term.
  - Touch targets are ≥ 44px.
- **G-44** Empty and first-run states, each with one clear next action:
  - no terms set
  - no goals
  - no goals in a lane
  - no Direction set
  - Hammond has no read yet
  - no proposals ("Nothing to change. Keep going.")

### M11: Docs and ship
- **G-45** Update the docs:
  - `apps/tasks/docs/data-model.md`: the goal fields, cascade and plan-term endpoint
  - `packages/design-kit/TASKS.md` Surfaces: Goals, Plan next term, Check-in and Year
  - The v1 spec's "Out of scope" list: mark each item done, with its G-ID
- **G-46** Final verification. Every Definition of Done check in §0.3 passes. Screenshots are attached to the PR, the ledger is at 100%, the PR is marked ready for review, and there's a final summary in chat (§5).

---

## 4. UX, UI and motion direction

**Who it's for.** Adam has ADHD. Every surface needs to answer three things at a glance: *what matters, is it moving, what's the one thing to do now.* Motion is there to show cause and effect, and to reward progress. It isn't decoration.

### 4.1 Principles
1. **One primary action per surface.** Landing: the one move. Goal page: Start now. Check-in: Next.
2. **Progress is visible and rewarding.** Cells fill, numbers count up, and a finished week gets a brief, small celebration.
3. **No shame.** A miss is neutral (dashed or empty), never red. Rest weeks are shown as a choice, not a failure.
4. **Agents propose, Adam decides.** Every Hammond write is a confirm card that shows before → after. Receipts come back as toasts.
5. **Nothing surprising.** Every destructive action gets a confirm plus timed undo. Every state change shows where it came from.
6. **Calm density.** At most 3 proposals, 2 strip chips, and one-line collapsed strips. Long content goes in disclosures.

### 4.2 Motion
There's one system:
- `motion.css` and `startHubMotion()` in `hub-motion.js`: fades, list stagger and count-up.
- `morphing-dialog.js`: `morphFromRect` and `runMorphTransform` for morphs.
- `morphing-popover.js`: popovers.
- `hub-motion-engine.js` `createMotion()`: timeline or SVG geometry, i.e. the Year zoom and runway cell sweeps.

Don't add CSS transitions on SVG attributes, and don't add new easing curves. Use the `EASE` and `OVERSHOOT` from the engine.

| Moment | Motion | Budget |
|---|---|---|
| Runway first mount | Rows stagger in (hub list stagger). Past-week cells fill left → right, one sweep per row. The now-ring pulses once. | ≤ 450ms total, and only on first mount or term switch, never on a data repaint |
| +1 / task done | That cell fills with a small OVERSHOOT scale (0.85 → 1). The row's `count/per_week` counts up. When it reaches `per_week`, the cell gets a one-off shimmer and the toast reads "Week won." | 250ms |
| Term ↔ Year | One zoom blend (`createMotion`, `t` 0 → 1, placers), as in the Term River | 500ms |
| Row → goal page | `morphFromRect`: the title flies to the header, and the rest fades in | 300ms |
| Structure switch | `runMorphTransform` on the card height, with a field cross-fade | 250ms |
| Direction expand | `runMorphTransform` from one line to the editor | 250ms |
| Proposal cell | Dashed orange while pending. On Confirm, dashed turns solid and fills. On Dismiss, it fades out. | 200ms |
| Confirm card accept | The card collapses its height and the receipt toast slides in | 220ms |
| Plan next term choice | The card leaves in its choice's direction (Carry → right, Park ↓, Achieved ↑ with a small burst of the sphere colour, Drop ← and faded), and the next card rises | 280ms |
| Check-in step | The step indicator advances and the content slides | 220ms |
| Delete goal | The row collapses, and there's an undo toast for 5s | 220ms |
| Focus strip | It slides down from the header, and the clock ticks without animating digits | 200ms |

**Reduced motion:** every row above becomes an instant state change. Check it with the browser's reduced-motion emulation, and include it in the screenshots.

### 4.3 Visual rules
- **Lanes:** Life is sage, Work is Wave/blue, Professional is lilac. Proposals are High Sea dashed. Achieved and completed accents use `--success`. Don't introduce any new colours.
- **Chips:** always closed-field popovers, never raw `<select>`s in the finished UI.
- **Hammond:** always the Depth panel with the avatar, a timestamp and the reason. Model-written text carries a tiny ✦.
- **Numbers:** tabular numerals for counts and clocks.
- **Dates:** dd/mm/yy via `format-display-date.js`. Weeks show as `T4 W3`, as in the Term River.

---

## 5. Final summary format (chat, at the end)

```
Goals v2 — 46/46 (100%). PR #<n> ready for review.
Tests: root <pass>/<fail>; tasks tsc <n> (≤33); vitest failed <n> (≤4, pre-existing).
Deviations: <each with G-ID and why, or "none">
Discovered & resolved: <each, or "none">
Needs Adam: <merge PR; anything else explicit, or "merge only">
Live check after merge: <how to verify, 3 bullets>
```

No "follow-ups", "nice-to-haves" or "future work" section. If something belongs there, it should have been raised under §0.1 before you got here.
