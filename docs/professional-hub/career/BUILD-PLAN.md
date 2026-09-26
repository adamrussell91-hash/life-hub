# Career page: build plan

## Outcome

Merge **Applications** and **Career** into one **Career** page (`#/career`).
Evidence builds up every week, but applications only come a few times a year,
so the page is built around evidence:

1. **The career river.** It runs full width and zooms. Adam's past is one
   trunk. At Now it forks into a branch for each future role he's weighing.
2. **Futures.** Each target role has:
   - criteria;
   - a readiness %;
   - stepping stones, live-linked to Tasks;
   - people who already got there.
3. **Skills scan.** Every week Ann reads the hubs and proposes skill cards.
   Nothing is saved until Adam keeps it.
4. **Skills ledger.** Every kept card. Each card is **live-linked** to the
   projects, goals, tasks, lessons, units, pages, meetings and events it came
   from.
5. **Applications.** Each has a **Criteria Mirror**, referee ranking and
   briefings, and keeps the panel's feedback.
6. **What if.** Try a move and watch every future react.
7. **Ann spotted a future.** A branch Adam didn't plan, suggested from his
   evidence.

The design reference is `mockups/career-river.html`. Open it in a browser;
it's interactive. Where the mockup and this plan disagree, **this plan wins**.
Known differences:
- The mockup says "harvest". The UI copy is **Skills scan** and **Skills ledger**.
- The mockup's river has no zoom and sits inside a padded card. The real river
  is full width and zooms (Phase 3).
- All the mockup's people, schools and numbers are placeholders.

**Acceptance case (run live on real data, D3/P3):**

> Adam opens Career. The river runs edge to edge. He pinches (or presses +) to
> zoom into the last two years and the next three. The dots on the trunk spread
> apart, and a cluster bubble "4" splits into four dots.
>
> He hovers **Head of Gifted Education**. The trunk dots that support it light up
> pink, including the real record for the **gifted education policy** (a
> project, goal or task; Phase 0 finds and names it).
>
> In **Skills scan** he keeps the card Ann drafted from that record. Its chips
> read *Project · Gifted Education Policy* and *Meeting · Exec 22/09/26*, and
> clicking a chip opens that record in its own hub. A new dot pulses on the
> trunk at Sep 2026.
>
> Head of Gifted Education's readiness rises. In the open application's
> **Criteria Mirror**, criterion 3 turns green. When he later marks the linked
> task done in Tasks and reloads Career, the stepping stone shows as complete.
> Nobody copied anything.

**Read first:**
- `mockups/career-river.html` and `mockups/README.md`
- `docs/CURSOR-UI-FAILURES.md` and `.cursor/rules/ui-failure-register.mdc`
- `.cursor/rules/first-pass-correctness.mdc`
- `.cursor/rules/hub-design-kit.mdc`
- `.cursor/rules/agent-context-integrity.mdc` (Ann prompts, Phases 5, 8, 9)
- `.cursor/rules/ponytail-project-guardrails.mdc`
- `docs/universal-links/` (the ref and link rules this plan relies on)
- `apps/life/js/app/medical-strip.js` (the zoom model to copy; see Phase 3)

## One PR, not one per phase

**The whole build ships as a single PR.** Every PR costs Adam money.

- **One branch.** `cursor/career-river`, cut from fresh `main` (P2). Open it
  as a **draft PR once**, after the Phase 0 commit, and push every later phase to it.
  - No PR per phase.
  - No closing and reopening.
  - No follow-up "fix" PRs.
- **Phases are commits, in order.** Title them `feat(career): Phase N — …`.
  Every phase commit leaves `#/career` working. A later phase only fills a slot
  that an earlier phase left with an honest empty state (I3).
- **One progress ledger.** `docs/professional-hub/career/PROGRESS.md` has one
  section per phase. For each ticked item it records:
  - the failure-register IDs checked;
  - the named test that goes through the real entry point (W2);
  - "diff vs mockup: none", or the listed deviations (P1).
- **Mark ready for review once**, when every phase is ticked.
- **Scope check:** `git diff --stat origin/main...HEAD` touches only the files
  this plan names, plus tests, docs, the ledger and screenshots.

## Ground rules

- **Screenshots** at 1440 and 390 on **real data** (D3), taken per phase, in
  `docs/professional-hub/career/screens/phase-N/`, with a written diff against
  the mockup (P1).
- **Before ticking a phase**, state Must / Must-not / Verify
  (`first-pass-correctness.mdc`).
- **API calls** go through `apiGet`/`apiPost` + `getApiBaseUrl()` (W1).
- **Dates.**
  - Use `formatDisplayDate` (dd/mm/yy), or relative text (D5).
  - A month-precision date renders as "Sep 2026". A year-precision date renders as "2021" (D1).
  - School terms render as "T3 2026". Compute them from the hub-prefs school
    terms (`packages/design-kit/js/school-time.js`), not from month maths.
  - Estimated dates carry a tilde: "~T1 2030" (D1).
- **Styling.**
  - Kit tokens only (`hub-design-kit.mdc`). No new type sizes or radii.
  - The six branch colours are the one allowed addition. Put them as tokens in
    `apps/professional/src/styles/hub.css` under `--career-branch-1…6`. The
    grey `--career-fading` and the orange `--career-whatif` are also tokens.
- **No new dependencies.** Draw the river in hand-written SVG, like
  `medical-strip.js`, not d3.
- **Model calls** use `_shared/anthropic-client.mjs`. Prompts live in one
  file, `_shared/career-prompts.mjs`, in Ann's voice from
  `_shared/agent-directory.mjs`.
  - Every model output is a **proposal** Adam confirms. The model never writes
    a link or record directly.
- **UI copy.**
  - Plain Australian English.
  - Use: "Skills scan", "Skills ledger", "Futures", "stepping stone",
    "What if…", "People who got there", "Criteria Mirror".
  - Never say "harvest", "evidence pack" or "branch" in UI copy. "Branch" is
    fine in code.

## Existing code this builds on (verified 26/09/26 on `main`)

| Need | Already exists |
|---|---|
| Entity refs | `_shared/entity-ref.mjs`: `ENTITY_REF_KINDS`, `formatEntityRef`, `parseEntityRef`. `professional` currently holds `communication, meeting, event, application` |
| Live resolution (label, href, lifecycle) | `_shared/entity-resolvers.mjs`: `RESOLVER_SLOTS`, `resolveEntity()`. Already resolves `tasks:task/project/goal/program`, `teaching:unit/lesson/class`, `knowledge:page`, `professional:meeting/event/communication/application`, `shared:person/organisation`, `life:decision` |
| Links | `_shared/universal-link-repository.mjs`, `universal-link-schema.mjs`. Declared types live in `_shared/relationship-registry.mjs` (every type is declared there first; `metadataKeys` are allowed) |
| Existing application links | `applies_to` (→ org), `application_contact`, `referee` (role professional/character/academic), `application_action` (task → application) |
| Applications | `_shared/application-schema.mjs` (pipeline statuses, `selection_criteria[]` with `acrit_` ids, `outcome`, `reflection`), `application-repository.mjs`, `netlify/functions/applications.mjs`, `apps/professional/src/api/applications.ts`, `views/applications.ts` |
| Old Career view | `netlify/functions/career.mjs`, `_shared/career-overview.mjs` (`findActiveSelfPerson()`), `views/career.ts`. The view is **replaced**; keep `findActiveSelfPerson()` |
| People's roles over time | `employee_at` / `member_of` / `studied_at` / `placement_at`. All `temporalMode: 'period'` with `optional_text` role. Ghost paths come from these |
| Proposal pattern (confirm before write, never re-propose a decline) | `_shared/link-proposal-schema.mjs` (`proposalEquivalenceHash`), `link-proposal-service.mjs`. `LINK_PROPOSAL_PROPOSERS` already includes `ann` |
| Scheduled pass pattern | `people-remember-tick-scheduled.mjs` (hourly cron, runs at set Sydney hours via `shouldRunRememberNow`), `_shared/remember-service.mjs` (reads Tasks through `tasks-blobs.mjs`) |
| Store | `_shared/professional-blobs.mjs` (`professional-hub-content`, one prefix per record type) |
| APST codes | `_shared/apst-focus.mjs` (`sanitizeApstFocus`); titles are in `apps/tasks/src/domain/apst.ts`. Tasks already carry `apst_focus` |
| Goal statuses | `_shared/goal-record.mjs`: `active, parked, achieved, dropped, archived` |
| Chips and picker | `packages/design-kit/js/entity-chips.js`, `entity-picker.js` (already used in `views/communications.ts`) |
| Create a task from Professional | `apps/professional/src/api/universal-links.ts` → `createTask()` |
| Zoom model with pinch, buttons and Safari gestures | `apps/life/js/app/medical-strip.js` (`ZOOM_SPANS`, `setSpan`, animated span changes, `gesturestart`) |
| Inverse links in other hubs | Tasks: `views/task-relationships.ts`. Knowledge: `_shared/knowledge-universal-links.mjs`. Teaching: **Phase 0 confirms** |
| Communications | `COMMUNICATION_STATUSES = completed, received`. There is **no draft state**, so briefings and coffee notes are copy + "Log as sent" (Phase 6/7) |

---

## Phase 0: Ground truth (no UI)

1. **Find the real acceptance records** and name them in `PROGRESS.md`:
   - the gifted education policy's record (project, goal or task) and its id;
   - one meeting and one PD event that should become evidence;
   - one done task with `apst_focus`;
   - Adam's current `employee_at` role(s).
2. **Inverse link rendering.** Confirm whether Tasks (task, project, goal),
   Teaching (unit, lesson) and Knowledge (page) render incoming Universal Links
   with their inverse label.
   - Record yes/no for each in `PROGRESS.md`.
   - For each "no", Phase 5.6 adds the smallest read-only "Linked from" list
     to that detail view.
3. **Route references.** List every place that links to `#/applications` or
   `#/application/<id>`: the shell rail, Home, search `href`s, resolvers, and
   `resolveApplication` in `entity-resolvers.mjs`. Phase 2 redirects all of them.
4. Commit the ledger and open the draft PR.

## Phase 1: Data layer

**1.1 New entity kinds.** Add these to `ENTITY_REF_KINDS.professional`, with
resolvers in `RESOLVER_SLOTS`:

| Kind | What it is | Id | Resolver label / href |
|---|---|---|---|
| `achievement` | One skill card in the Skills ledger | `achievement_<uuid>` | title / `#/career/card/<id>` |
| `future` | A target role (a branch) | `future_<uuid>` | title / `#/career/future/<id>` |
| `stepping_stone` | A step toward one or more futures | `stone_<uuid>` | label / `#/career/future/<first future id>?stone=<id>` |

Follow `application-schema.mjs`:
- operation ids for idempotent writes;
- bounded strings;
- `parseXRecord` returns `null` on unknown keys.

The rule from Applications holds: **refs to other entities live only as
Universal Links, never inside the record JSON.**

**1.2 Record shapes.**

`achievement`:
```
{ schema_version, id, title, occurred_on, date_precision: 'day'|'month'|'year',
  star: { situation, task, action, result } (each ≤ 2000, nullable),
  skills: string[] (≤ 12, each ≤ 60, trimmed, de-duplicated case-insensitively),
  apst: string[] (sanitizeApstFocus),
  origin: 'scan'|'manual'|'import', lifecycle_status: 'active'|'archived',
  created_at, updated_at }
```

`future`:
```
{ schema_version, id, title, where (≤ 200, nullable), aliases: string[] (≤ 8; role
  titles used to match people's employee_at roles),
  criteria: [{ id: 'fcrit_<uuid>', text (≤ 500), order, source: 'ad'|'ann'|'adam' }] (≤ 20),
  target_date (nullable, ISO date; Adam's own target), status: 'active'|'parked'|'suggested'|'dismissed',
  suggested_reason (nullable, ≤ 1000), dismissed_until (nullable ISO),
  lane_order (int), colour_slot (1–6), created_at, updated_at }
```

`stepping_stone`:
```
{ schema_version, id, label (≤ 200), target_term_start (ISO date, nullable),
  status_override: null|'done'|'dropped', origin: 'ann'|'adam'|'gap'|'feedback'|'move',
  created_at, updated_at }
```

**1.3 New relationship types** in `relationship-registry.mjs`. Each one gets a
schema test.

| Key | Source → target | Temporal | Metadata | Inverse label |
|---|---|---|---|---|
| `evidenced_by` | `professional:achievement` → any kind in `ALL_TAGGABLE_KINDS` | timeless | `role`: `source` \| `supporting` | `career_evidence_for` |
| `witnessed_by` | `professional:achievement` → `shared:person` | timeless | none | `witnessed` |
| `supports_future` | `professional:achievement` → `professional:future` | timeless | `criterion_ids: string[]`, `strength: 'strong'\|'some'` | `supported_by` |
| `answers_criterion` | `professional:achievement` → `professional:application` | timeless | `criterion_id` (acrit), `strength` | `answered_by` |
| `probe_of` | `professional:application` → `professional:future` | timeless | none | `has_probe` |
| `stone_for` | `professional:stepping_stone` → `professional:future` | timeless | none | `has_stone` |
| `stone_action` | `tasks:task` \| `tasks:project` \| `tasks:goal` \| `tasks:program` → `professional:stepping_stone` | timeless | none | `has_stone_action` |

`stone_for` is many-to-many. **A stone linked to 2+ futures is a shared step.**
That's what makes the fork move (Phase 3).

**1.4 Live status, derived and never stored.**
- A stone is **done** when `status_override === 'done'`, or any `stone_action`
  target resolves as complete:
  - task `status === 'done'`;
  - goal `achieved`;
  - project or program closed. Phase 0 names the exact field.
- An achievement's source chips come from `evidenced_by` targets resolved on
  read through `resolveEntity()`. They show the target's current label,
  lifecycle and `href`.
  - A deleted target resolves not-found. It renders as a muted "Removed
    record" chip, never a crash (I3).

**1.5 Store prefixes** in `professional-blobs.mjs`:
- `career/achievements/records/`
- `career/futures/records/`
- `career/stones/records/`
- `career/scan-proposals/records/`
- `career/scan-proposals/by-hash/`
- `career/moves/records/`
- `career/scan-state` (a single key)

**1.6 Endpoints.** One Netlify function per resource, same shape as
`applications.mjs`:
- `career-achievements.mjs` (CRUD)
- `career-futures.mjs` (CRUD, plus `POST …/draft`: description or ad text →
  Ann's draft criteria, returned and **not** saved)
- `career-stones.mjs` (CRUD, plus `POST …/task`: creates a task with
  `createTask()` and links it with `stone_action`)
- `career-scan.mjs` (list proposals, keep, edit, bin, run-now)
- `career-moves.mjs`
- `career-overview.mjs`: the **single read** the page renders from (see 1.7)

API clients go in `apps/professional/src/api/career.ts`, replacing the current file.

**1.7 One model (V4).** `apps/professional/src/domain/career-model.ts`
exports `buildCareerModel(overview, { moves })`. It returns everything the page
shows:
- trunk items;
- futures with readiness, arrival, split point and fading;
- shared stones;
- fork;
- ghost paths;
- scan counts;
- the ledger list;
- application match %.

**Every number on the page comes from this one call.** The legend %, the
future panel ring, the river label and the What-if deltas all read it. A test
builds the model once from a fixture and asserts each of those figures against it.

**Formulas (tests pin each one):**
- **Criterion coverage.** 1 if any `supports_future` link names the criterion
  with `strong`, 0.5 if only `some`, else 0.
- **Readiness %** = `round(100 × mean(coverage))` over the future's criteria.
  With no criteria it's `null`, and the UI shows "Add criteria", not 0%.
- **Arrival.** Take the latest `target_term_start` of the open stones, plus one
  term. If no open stone has a date, use `target_date`. If neither exists,
  there's no arrival: the branch ends at a faded "?" cap. It's always labelled
  "~T? YYYY" (D1).
- **Split point** of a future = the latest `target_term_start` among its open
  **shared** stones. With none, it's Now + 6 weeks.
- **Fork** = the latest split point among the visible futures. Its label counts
  the futures whose split is at or after it.
- **Fading.** A future is fading when its newest `supports_future` link is
  older than 183 days, or it has none and was created more than 183 days ago.
- **Application match %** = the mean of `answers_criterion` coverage over the
  application's `selection_criteria`, using the same 1 / 0.5 / 0 rule.

## Phase 2: Page merge, routes, and the Skills ledger

**2.1 Rail and routes.**
- Remove **Applications** from the rail (`shell.ts`). **Career** takes its icon
  slot and uses the branching-river icon from the mockup rail. Add it to
  `shell/icons.ts`.
- `#/applications` → `#/career#applications`
- `#/application/new` → `#/career/application/new`
- `#/application/<id>` → `#/career/application/<id>`

  These redirect with `location.replace`, so Back doesn't loop.
- Update `applicationRoute()` and every reference Phase 0 listed, including
  `resolveApplication`'s `href`, so search and chips land on the new route.

**2.2 Page order (desktop).**
1. Header: eyebrow **Professional**, title **Career**, and a stats line from
   the model: "11 years behind you · 5 futures ahead · 38 skill cards".
2. The river (full width, Phase 3).
3. Two columns:
   - **Future panel** (Phase 4), `minmax(0, 1.25fr)`;
   - **Skills scan** (Phase 5), `minmax(0, 1fr)`.
4. **Applications** (Phase 6).
5. **Skills ledger**.

At < 1100px, the two columns stack. At 390, the order is: header → river →
Skills scan → Future panel → Applications → Skills ledger. The scan comes first
on phone because it's the weekly job.

**2.3 Skills ledger.**
- One row per achievement, sorted by `occurred_on` descending (D2), then
  `created_at` descending.
- **Desktop row:** date · title · source chips · future dots · witness avatars.
- **Phone row:** two lines. Line 1 is date + title. Line 2 is the chips (R3).
- **Source chips.** `renderEntityChips` with `href` set, so each chip opens
  the record in its own hub. Chip text is the kind + the live label, e.g.
  *Project · Gifted Education Policy*. A chip for a done task or achieved goal
  gets a ✓. A removed record shows "Removed record" (1.4).
- **Filters.** One filter row: All, then one chip per future. At < 720px it
  becomes one **Filters** button that opens a sheet (L5).
- **Row click** opens `#/career/card/<id>`. It's an in-page sheet with STAR,
  skills, APST, chips and witnesses. Every field is editable, and chips can be
  added with `createEntityPicker` limited to `ALL_TAGGABLE_KINDS`.
- **Add card** (header action). Pick a source with the entity picker (e.g. a
  project or goal). Ann drafts the title, STAR, skills, APST, witnesses and
  futures from it. Adam edits and saves. Saving writes the achievement plus
  its links in one server operation. A partial failure returns the
  `incomplete_links` shape Applications already uses, with retry.
- **Empty state:** "No skill cards yet. Your first Skills scan runs Sunday
  evening, or add one now." Include a button that works (I3).

## Phase 3: The river (full width, zoom)

**3.1 Full width (L1).**
- The river is its own full-bleed section. It's not inside a padded card
  capped by any `max-width`.
- It spans the whole content area from the rail's right edge to the viewport's
  right edge, minus the page's side gutter (24px desktop, 16px phone).
- The SVG `width` = container width. It re-renders from a `ResizeObserver`.
- **Check:** at 1440 and at 1920, the river's right edge is within 1px of the
  Applications section's right edge. There's no empty band to its right.

**3.2 Geometry.** `apps/professional/src/domain/career-river-geometry.ts` is
pure and tested:
- **Scale.** Time → position is piecewise-linear with a knot at Now:
  - while Now is in view, the past gets **40%** of the length and the future **60%**;
  - when Now is out of view, the scale is plain linear.
- **Orientation.**
  - Horizontal at ≥ 720px: time runs left → right.
  - Vertical below 720px: time runs bottom → top, with the past at the bottom.
  - Re-render on a `matchMedia('(min-width: 720px)')` change (R1).
- **Height (C3).**
  - Horizontal: `max(440, 120 + visibleFutures × 64)`px.
  - Vertical: `max(900, yearsInView × 150)`px, capped at 2400.
- **Lanes.** Futures sit in `lane_order`, spread evenly across ±0.86 of the
  half-height. Up to Now, strands bundle around the centre with a 2.2%
  offset each, and they peel off at their split point with an S-curve.

**3.3 Marks** (every shape gets an explicit fill and stroke, S4):
- **Trunk:** navy, 13px (11px vertical), from the first role to Now.
- **Roles:** a thin band under the trunk with role names from Adam's
  `employee_at` periods. Desktop only.
- **Past applications:** arcs from submitted to outcome, above the trunk.
  Green solid for successful, red dashed for not. Desktop only. On phone they're
  markers on the trunk with tooltips.
- **Skill cards:** dots on the trunk at `occurred_on`.
- **Futures:** each branch is `2 + readiness/100 × 9`px wide and ends at
  arrival, with a cap and a label.
- **Stones:** own stones are diamonds on the branch. Shared stones are circles
  on the bundle, showing the number of futures they serve. A stone is filled
  when done.
- **Last fork:** a marker, labelled on the axis row (not near the branches) as
  "Last fork · T4 2027" / "3 futures share the road until here".
- **Now:** a dashed line labelled "Now · T3 2026". Headers read "What happened"
  and "What could".

**3.4 Zoom and pan.** Copy the model from `medical-strip.js`: one `zoom` state
`{ from, to }` in years, animated.
- **One zoom control (V3).** Preset pills: **Whole career** · **±3 years** ·
  **Next 3 years**, then − and + buttons and **Back to now**.
  - At < 720px the pills collapse into one **Zoom** button that opens a sheet,
    plus the −/+ icon buttons (L5).
- **Gestures (C4):**
  - ⌘/Ctrl + wheel and trackpad pinch: non-passive `wheel` with `ctrlKey`;
  - Safari: `gesturestart` / `gesturechange`;
  - touch: two-pointer pinch with Pointer Events.
  - Zoom anchors on the pointer's time.
  - Plain drag pans (desktop horizontal; on phone, vertical within the river).
  - Plain wheel scrolls the page and never zooms.
- **Limits.** Clamp the span to 1 year minimum, and at most whole career + 1 year.
- **Pills follow zoom (V2).** The active pill comes from the zoom state after
  every change. A pinch that lands exactly on a preset span lights that pill;
  otherwise none is lit.
- **Clusters.** Dots closer than 10px merge into a count bubble. Its tooltip
  lists the titles, and clicking it zooms to fit them. Pin this with a test:
  at Whole career on 1440, the 2026 dots are one bubble; at ±3 years they're
  separate.
- **Labels (C1).**
  - Horizontal: branch labels sit right of the cap (name, then
    "81% ready · ~T4 2027"). Reserve a right gutter of 200px.
  - Vertical: labels sit above the cap. Use the short name ("Gifted") and the %.
  - Run a collision pass: nudge, then shorten to the short name, then hide into
    the tooltip.
  - A `getBBox` DOM test shows no label intersecting another label or the SVG
    edge, at 390 and 1440, at every preset.

**3.5 Interaction.**
- **Hover** a branch or its legend chip (desktop): the other branches drop to
  28% opacity. Trunk dots whose `supports_future` points at it take the
  branch colour and grow. The rest shrink and grey out.
- **Tap** on touch **locks** that highlight. Tapping the same branch or empty
  river unlocks it.
- **Click/tap** selects a future and drives the Future panel. The selection
  lives in the URL as `#/career/future/<id>`.
- **Tooltips** on every mark: title plus a D5-clean detail line
  ("Skill card · Sep 2026", "Stepping stone · Deputy", "Shared step · helps 3 futures").
- **Keyboard.** The legend chips are `<button>`s. Arrow keys move the
  selection and Enter selects (I2).
- **Fading futures** draw at 38% in `--career-fading`, with a legend chip note
  "fading". Parked futures aren't drawn. Their legend chip reads
  "Parked: EdTech · restore".

**3.6 Legend.** One wrapping chip row under the river: colour, short name,
readiness %. A suggested future's chip has a dotted ring.

## Phase 4: Futures

**4.1 Add a future** (header button, opens a sheet with an S3 opaque surface).
1. Adam pastes an ad or describes the role.
2. `POST career-futures/draft` returns Ann's criteria (5–8), aliases and a
   short `where`.
3. Adam edits and saves.

   Ad-sourced criteria get `source: 'ad'`.
4. After saving, a background job matches the existing ledger against the new
   criteria and proposes `supports_future` links. They appear in the Skills
   scan as "Match to *Deputy Principal*" items to confirm.

   Nothing auto-links.

**4.2 Future panel.**
- **Head:** title, where, "ready around ~T1 2030", and a readiness ring.
- **"What this role asks for":** one row per criterion.
  - Dot: green (1), amber (0.5) or red (0).
  - The best two supporting cards as live chips.
  - A red row gets **Make it a stepping stone**, which creates a stone with
    `origin: 'gap'`.
- **"Stepping stones":** sorted by `target_term_start`, undated last (D2).
  Each row shows:
  - the term, e.g. "T2 2028" (D1: undated reads "No date");
  - the label;
  - a **helps N futures** pill for shared stones;
  - a live chip for the linked task, project or goal, with a ✓ when done;
  - an action on **its own line** (I4): **Add to Tasks** (creates a task and
    links it with `stone_action`) or **Link existing…** (entity picker limited
    to task, project, goal, program).

  Marking the linked task done in Tasks makes the stone done here on reload,
  and the river fills the diamond.
- **"People who got there":** Phase 7.
- **Fading banner:** "No new evidence for this future since March 2026. Still
  want it?" with **Keep it** and **Park it**. Keep writes nothing except
  `updated_at`, so the banner stays until new evidence arrives.
- **Edit future:** title, where, aliases, criteria (add, remove, reorder),
  target date, and the colour slot.

## Phase 5: Skills scan (weekly, live-linked)

**5.1 Scheduled pass.**
- `career-scan-tick-scheduled.mjs` runs on an hourly cron. Its
  `shouldRunCareerScanNow` fires **Sunday 17:00 Sydney**, once per ISO week,
  with state in `career/scan-state`. Copy the Remember pattern.
- A **Run scan now** button on the Skills scan panel calls `career-scan` run-now.
  It's rate-limited to once per 10 minutes and shows its running state.

**5.2 What it reads** (the window since the last successful scan, capped at 21 days):

| Hub | Records | Why they count |
|---|---|---|
| Tasks | tasks moved to `done` (with `apst_focus`); projects closed or with 3+ tasks done; goals `achieved`, and goal check-ins | Most skill cards come from here |
| Teaching | units and lessons created or published; programs | Curriculum and program design |
| Knowledge | pages created or substantially edited (by Adam) | Writing, policy, research |
| Professional | meetings (with notes), events (PD, presenting), communications | Leadership, consultation, community |
| Life | decisions | Rarely; only if career-tagged |

Each source item carries its ref, title, date and linked people (from its
existing Universal Links). Those people become **witness candidates**.

**5.3 Drafting.** One model call per scan, using the `career-prompts.mjs`
`skillsScan` prompt. It groups related source items into 3–8 proposals. Each
proposal has:
- title;
- `occurred_on` + precision;
- STAR;
- skills;
- APST codes (sanitised);
- `source_refs` (at least one, all from the input; any ref not in the input is
  dropped);
- witness refs (only from the candidates);
- `future_matches` (`future_id`, `criterion_ids`, `strength`), limited to
  existing futures and criteria;
- a one-line "why this counts".

`agent-context-integrity.mdc` applies: the prompt only ever sees real records,
and the output is validated against the input.

**5.4 Proposal store.**
- `career/scan-proposals/`, status `pending | kept | binned`.
- Dedupe with a hash of the sorted `source_refs`, like `proposalEquivalenceHash`.
- A **binned** hash is never proposed again. A **kept** hash is never proposed
  again either, but new sources can be added to that existing card as
  "Add to *card title*?" items.

**5.5 Panel (Skills scan).**
- Header: "Skills scan · Sun 27 Sep · Ann read your hubs".
- **Proposal card, top to bottom:**
  1. The **live source chips** ("From Project · Gifted Education Policy · Meeting · Exec 22/09/26"). Clicking one opens the record.
  2. The title (editable in place when **Edit** is on).
  3. APST tags and future dots with short names.
  4. A collapsed "STAR answer, drafted".
  5. A witness avatar row with names.
  6. **Keep** · **Edit** · **Bin**.

  At 390, the witness row sits on its own line and the three buttons sit on the
  next (R3, I4).
- **Keep** creates the achievement plus `evidenced_by`, `witnessed_by` and
  `supports_future` links in one server operation. Then, with no reload:
  - the card collapses to "Kept · on the river";
  - the ledger count and stats line update;
  - the new dot pulses three times on the trunk (skipped under
    `prefers-reduced-motion`);
  - readiness and match % re-derive from the model (V4).
- **Bin** marks the proposal binned. The toast says "Binned. Ann won't suggest
  this again."
- **Empty:** "All sorted. Next scan Sun 4 Oct." plus **Run scan now**.

**5.6 Wired both ways.**
- Every kept card's `evidenced_by` links show up **in the source hub**. On the
  task, project, goal, unit, lesson or page, a "Career evidence" item links
  back to `#/career/card/<id>`.
  - Use the existing inverse-link rendering where Phase 0 found it.
  - Where it's missing, add the smallest read-only list to that detail view.
- **Count this as career evidence.** Add this action to the Tasks detail views
  (task, project, goal), next to the existing entity tagger. It creates a
  **pending scan proposal** from that one record, marked "You added". Adam
  finishes it in Career. It doesn't wait for Sunday.

## Phase 6: Applications and the Criteria Mirror

**6.1 List** (Career page section "Applications", anchor `#applications`).
- **Active applications:** avatar, title, org (live `applies_to` chip),
  closing date, pipeline pill, **match %** (from the model), and **Open
  Criteria Mirror**.
- **Past applications:** outcome pill, and the panel feedback
  (`outcome.reason` / `reflection`) quoted. **Turn feedback into a stepping
  stone** creates a stone with `origin: 'feedback'`, linked to the application's
  `probe_of` future, or asks which future.
- **Which future.** An application links to its future with `probe_of`, set
  on create or edit. The river draws submitted applications as small ticks on
  that branch at the submitted date.
- The existing application detail and edit screens keep working under
  `#/career/application/<id>`, with no behaviour change except the route.

**6.2 Criteria Mirror.**
- **Left:** the pasted ad text. **Split into criteria** calls Ann to split it,
  then writes `selection_criteria` on the application after Adam confirms.
  Existing criteria are kept.
- **Right:** one row per criterion:
  - number, text and %;
  - a bar;
  - its best supporting cards as live chips.
- **Matching.** On open, and whenever a card is kept, the server proposes
  `answers_criterion` links. They show inline as "Suggested: *card* ✓ / ✕"
  under the criterion. Accepted links count toward the %.
- **Gap row (0%):** **Make it a stepping stone: *Ann's suggested step*** creates
  a stone on the application's future plus a task due before the closing date.
  The row then reads "Stepping stone added to Gifted · in Tasks, due Mon 5 Oct".
- **Live example (acceptance):** keeping the gifted-policy card in the Skills
  scan moves criterion 3 from amber to green without a reload. The same model
  call feeds both panels (V4).

**6.3 Referees, ranked by what they saw.**
- **Candidates:** people with `witnessed_by` on cards that answer this
  application's criteria, plus any existing `referee` links.
- **Rank:** number of such cards, highest first.
- **Each row:** name, role, "Witnessed **7** of your cards for these criteria",
  and last contact from the latest communication or meeting (relative text,
  D5). A contact older than 6 months shows **warm up first**.
- **Draft briefing** asks Ann for a one-page brief: the role, closing date, the
  three things for them to speak to (each tied to a card they witnessed), and
  a reminder line. It has **Copy**, and **Log as sent**, which creates a
  `completed` communication to that person linked to the application. There's
  no draft state; that's the reason it's copy + log.
- **Set as referee** creates the existing `referee` link.

## Phase 7: People who got there (ghost paths)

- **Who.** People whose **current** `employee_at` role text matches the
  future's title or aliases. Matching is case-insensitive and normalised: "&"
  equals "and", and punctuation is stripped. Take up to 3, preferring warmer
  relationships.
- **Route.** Their `employee_at` / `member_of` periods with a role, sorted by
  `valid_from`, ending at the matching role.
- **Alignment.**
  - Find the earliest role in their route that matches one of Adam's current
    role titles. The path starts from Now at that point, and the years are
    "N years from your stage".
  - If nothing matches, draw the route with its real length but label it
    "Route" with no "from your stage" claim (D5).
  - Periods without dates are left out of the timing; the text notes "some
    dates unknown".
- **River.** A dotted line in the person's colour beside the selected
  future's branch, with hollow waypoints (tooltip: role + year) and an avatar
  cap. Show it only for the selected or hovered future. The "People who got
  there" switch hides all ghost paths.
- **Panel rows:** avatar, name, "Leader of Learning → Acting Deputy → Deputy
  · 4.5 years from your stage", and **Draft a coffee note**. Ann writes a short
  note that names their actual route. It has **Copy** and **Log as sent** (a
  communication).
- **Empty:** "Nobody in your Network holds this role yet."

## Phase 8: Ann spotted a future

- **Run.** This runs inside the weekly scan, after drafting.
  1. Take the cards from the last 18 months.
  2. Find the ones with no `strong` support for any active future.
  3. If 5 or more share a theme, Ann proposes a `future` with
     `status: 'suggested'`: title, where, criteria, and `suggested_reason`
     citing the card count and 2–3 card titles.

  The count in the reason is **computed by code**, not written by the model
  (V4, D5).
- **River.** A dotted, slowly flowing branch (the animation stops under
  reduced motion). Its label is in italic: "Policy adviser?" and "Ann spotted this".
- **Card above the river.** "Ann spotted a path you didn't plan", with the
  computed count sentence and three actions:
  - **Add this future**: status becomes `active`, and the branch turns solid
    with an animation.
  - **Show me the evidence**: locks the highlight on its supporting dots.
  - **Not for me**: `dismissed_until` is set to now + 183 days, and the same
    theme isn't re-proposed until then.
- Show at most one suggestion at a time.

## Phase 9: What if…

- **Suggested moves.** Ann suggests up to 5, built from red and amber
  criteria across the futures (for example "Acting Head of Department, T1 2027").
  They're stored in `career/moves/` as `suggested`.
- **Write your own.** Adam can type a move as free text with a date.
- **Estimating a move.** Ann estimates which criteria it would cover, per
  future (`criterion_ids`, `strength`). This comes back as data, and the
  **model function** applies it as hypothetical coverage. No new maths lives
  in the view (V4).
- **Applying a move.** Drag a move chip onto the river, or tap or press Enter
  on it. The river tweens (750ms, skipped under reduced motion):
  - readiness;
  - arrival;
  - split points and the fork.

  A move whose covered criteria span 2+ futures counts as a shared step, so
  it can move the fork.
- **Result line.** "**Deputy** +9 · 6 months sooner · **Leader** +14 · Fork
  moves to T3 2028". Build it from the difference between the model with and
  without moves.
- **Reset** clears the moves.
- **Make it real** turns a move into a stepping stone (`origin: 'move'`) on the
  futures it affects.
- **Drag on touch.** Uses Pointer Events with a 6px threshold. Tapping always
  works (C4).

---

## Failure modes (from `docs/CURSOR-UI-FAILURES.md`)

`L1 L2 L3 L4 L5 S2 S3 S4 V1 V2 V3 V4 R1 R2 R3 D1 D2 D3 D5 C1 C3 C4 I2 I3 I4 W1 W2 P1 P2 P3`

| ID | Career-specific check |
|---|---|
| L1 | The river's right edge equals the Applications section's right edge ±1px at 1440 and 1920. The two-column row uses `minmax(0, …)` |
| L2 | Skill-scan cards ≤ 260px tall with STAR collapsed. Ledger rows ≤ 56px desktop, ≤ 72px phone |
| L3 | No sticky future panel. Scroll the full page at 1440 and 390 |
| L4 | The rail reaches the bottom of a full-page screenshot |
| L5 | At 390, the river toolbar is Zoom + − + and the ledger filter is one button. Each is ≤ 2 rows |
| S2 | Every new section has an explicit surface. The computed background isn't `transparent` |
| S3 | The Add a future, card and Zoom sheets are opaque |
| S4 | No `#000` computed fill on any river shape |
| V1 | Every `[hidden]`-toggled element with a `display` rule has `.x[hidden]{display:none}`. Hidden elements have `offsetHeight === 0` |
| V2 | Pinch to the ±3 years span lights that pill. The URL future id and the legend chip's pressed state follow a river click |
| V3 | Exactly one zoom control set on screen |
| V4 | `career-model.test.ts` asserts that the legend %, panel ring, river label, match % and What-if deltas all come from one `buildCareerModel` result |
| R1 | Resize 390 → 1440 → 390 without reload. The river switches orientation both ways |
| R2 | `scrollWidth === innerWidth` at 390 with the river zoomed in |
| R3 | 390 screenshots of a scan card, ledger row, criterion row, stone row, referee row and ghost row |
| D1 | Fixtures for day, month and year precision cards, undated stones and estimated arrivals assert "12/09/26", "Sep 2026", "2021", "No date" and "~T1 2030" |
| D2 | Tests pin the sort keys: ledger by `occurred_on` desc, stones by `target_term_start` asc with undated last, applications by closing date asc then submitted desc |
| D3 | Screenshots show the real gifted-policy record and Adam's real futures |
| D5 | Read every generated string aloud. "N years from your stage" never appears without alignment |
| C1 | The `getBBox` label test at every preset, 390 and 1440 |
| C3 | River height matches the 3.2 formula |
| C4 | Pinch tested in Safari macOS, Chrome and iOS Safari. The buttons work everywhere |
| I2 | Branches are selectable from the keyboard via the legend. Chips are `<a href>` |
| I3 | Run with an empty store: every section shows its empty state and its action works |
| I4 | Stone and criterion actions sit on their own line. Titles don't wrap because of buttons |
| W1 | `grep -n "fetch('/" apps/professional/src` finds nothing new |
| W2 | Named tests go through the real handlers: `career-scan` keep → achievement + links; stone done derived from a real task record; `career-overview` → model |
| P1–P3 | As the register says. P3's scenario is the acceptance case at the top of this plan, run live |

## Out of scope

- Job-board vacancy matching.
- Interview practice or a panel simulator.
- Year-in-review replays.
- Editing another hub's records from Career. Chips link out; they never edit
  in place.
