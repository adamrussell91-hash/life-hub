# Goals redesign: Term Runway, goal pages, Hammond as contributor

Status: agreed with Adam on 26/09/26. The build plan is `docs/superpowers/plans/2026-09-26-goals-redesign.md`.
Visual reference (the signed-off mockups): `docs/proposals/goals-reference/landing-runway.png` and `goal-page.png`.

## Why

Before this change, `#/goals` was an Area → Goal → Project card list. A goal had only a title, a description, tags and a Life Wall. The page also crashed on every goal created in the app (`goal.tags` was never written). Goals sat between Someday and Projects but did no work of their own. There was no finish condition, no measure and no signal, and no agent looked at them.

A goal in Adam's words: **short to medium term, often grown from a Someday dream, hosts several projects and tasks, and is life, work or professional.**

## What we're building

| Surface | Source | Summary |
|---|---|---|
| `#/goals`, the landing page | Mockup A | **Term Runway**: three lanes (Life, Work, Professional), one row per active goal, one cell per school week showing whether the lead measure was hit. "This week's one move" for each goal. A Hammond strip on top. |
| `#/goal/:id`, the goal page | Mockup B | A big goal card whose shape follows the goal's **structure** (WOOP, SMARTER, OKR, Lead/lag, Floor·target·stretch). The if-then trigger and the 2-minute start. The projects, tasks and milestones the goal hosts, plus its @ tags. Hammond's panel on the right. |
| Hammond | The Hammond parts of Mockup C | Reads each goal once a day and again whenever the goal or its hosted work changes. He writes a short verdict and proposes changes as **ghosts**. Nothing is written until Adam confirms. |

Out of scope in v1 — **done in Goals v2** (`docs/superpowers/plans/2026-09-26-goals-v2-complete.md`):

- ~~`protect_block` proposals ("block Tue P5").~~ **Done — G-30** (calendar slots → `protect_block` ghost).
- ~~A Haiku rewrite of Hammond's verdict, and content-aware step splits.~~ **Done — G-32** (model verdict + split steps; deterministic fallback).
- ~~The Sunday check-in flow, and the "Ask Hammond about this goal…" chat box.~~ **Done — G-36 / G-37** (check-in) and **G-35** (Ask Hammond deep link).

## Data model

### Goal (`tasks-hub-content`, `goals/<id>`)

`schema_version` stays 1. Every new field is optional with a default, so the goals already stored are still valid.

| Field | Type | Default | Notes |
|---|---|---|---|
| `sphere` | `'life' \| 'work' \| 'professional'` | `'life'` | The lane. This isn't the Term River's identity lanes. Goals use Adam's three spheres by his choice. |
| `status` | `'active' \| 'parked' \| 'achieved' \| 'dropped' \| 'archived'` | `'active'` | `archived` is kept for old records. |
| `structure` | `'woop' \| 'smarter' \| 'okr' \| 'lead_lag' \| 'floor_target_stretch'` | `'woop'` | Chooses which part of `frame` the card shows. |
| `frame` | object (below) | `{}` | Every structure's fields live side by side. Switching structure never deletes anything. |
| `lead_measure` | `{ label: string, per_week: int ≥ 1 } \| null` | `null` | The weekly action Adam controls. It drives the runway cells. |
| `week_log` | `Record<MondayKey, { manual: int ≥ 0 }>` | `{}` | Manual "+1" taps, added to the automatic counts. |
| `rest_weeks` | `MondayKey[]` | `[]` | Planned rest weeks. They draw dashed, never as a miss. |
| `if_then` | `{ cue: string, action: string, obstacle: string } \| null` | `null` | The implementation intention. |
| `next_start` | `string \| null` | `null` | The 2-minute start. |
| `due_date` | `YYYY-MM-DD \| null` | `null` | |
| `milestones` | `{ id, title, due_date: YYYY-MM-DD \| null, status: 'open' \| 'done' }[]` | `[]` | |
| `tags` | `string[]` | `[]` | Plain labels. The server now always writes this (the crash fix). |
| existing fields | `parent_area_id`, `parent_someday_id`, `life_wall`, `description` | — | Unchanged. |

`frame` has one optional part per structure:

```
woop:                 { wish, outcome, obstacle, plan }
smarter:              { specific, measurable, achievable, relevant, time_bound, evaluate, readjust }
okr:                  { objective, key_results: [{ id, label, target: number|null, current: number|null }] }
lead_lag:             { lag }                      // the lead is `lead_measure`
floor_target_stretch: { unit, floor, target, stretch, current }   // numbers; unit e.g. "standards"
```

Every string field defaults to `''`. The server cleans `frame` (known keys only, strings trimmed, numbers finite) and ignores anything else.

`MondayKey` is the `YYYY-MM-DD` of that week's Monday (`mondayOf` in `school-time.ts`).

### Task

A new field, `parent_goal_id: string | null` (default `null`). A task can sit under a goal directly or under one of the goal's projects. `POST /api/tasks` now accepts `parent_goal_id`, `parent_task_id`, `kind: 'step'`, `step_order` and `tags` (cleaned with `normalizeTags`). Before this change, POST silently dropped all of them.

### Project

No change. `parent_goal_id` already exists. The goal page can link and unlink projects by setting it.

### What a goal "hosts"

- **Projects:** `project.parent_goal_id === goal.id`, excluding archived projects.
- **Tasks:** `task.parent_goal_id === goal.id`, plus the tasks of hosted projects (`parent_project_id ∈ hosted projects`). Someday items are excluded.
- **Tags:** anything @-tagged to `tasks:goal:<id>` through the generic `tagged_with` link.

Hosting means ownership: it sets the parent id and feeds progress. An @ tag is an association: it's shown on the page but counts toward nothing.

## @ tagging

Goals become a Universal Link entity kind, the same way projects are:

- `entity-ref.mjs` adds `goal` to the `tasks` namespace.
- A new resolver, `resolveTasksGoal`, goes in `knowledge-universal-links.mjs` and is registered in `RESOLVER_SLOTS['tasks:goal']`.
- `relationship-registry.mjs` adds `tasks:goal` to `ALL_TAGGABLE_KINDS`, so `tagged_with` works from and to goals.
- `hub-ref.mjs` gains `hrefForHubRef({hub:'tasks',kind:'goal'})` = `/tasks/#/goal/<id>` and a label.
- `entity-search.mjs` supports the `goal` kind **and** the `project` kind. Projects could be tagged before this change but not found by @ search.
- Tasks Hub's `TAGGABLE_KINDS` adds `goal,project`. The goal page mounts `mountTagAnythingSection(host, 'tasks:goal:<id>')`, so any page, task, unit, person or meeting can be @-tagged onto a goal, and goals can be @-tagged from those.

## Landing page: Term Runway (`#/goals`)

- **Header:** eyebrow `Plan`, title `Goals`, then the line "Term N · week W of 10 · this week X of Y moves done". Pills switch terms (Term 1–4 of the current year). Buttons: `New goal` and `Plan next term`.
- **Hammond strip:** his term read (the verdict lines from every goal's read, most urgent first), a timestamp and why he last rescanned, up to two proposal chips with Discard / Confirm, and Rescan. There's no Sunday check-in button in v1.
- **The runway:**
  - Lanes appear in the order Life, Work, Professional. Each lane label shows "N of 3 slots". Three active goals per lane per term is a soft cap: the fourth "New goal" in a full lane asks "Park one first?" and creates the goal as `parked` if Adam goes ahead.
  - Each row shows the title, a structure chip, the lead measure text, and the source dream if it has one.
  - There's one cell per week of the term. Cell states:
    - `done`: count ≥ `per_week`
    - `part`: 0 < count < `per_week`
    - `rest`: a rest week, dashed
    - `missed`: a past week with a count of 0. Neutral and empty, never red.
    - `now`: an orange ring around the current week
    - `future`
    - `proposed`: an orange dashed cell for a pending `goal_rest_weeks` ghost
  - A milestone due that week shows as ◆. Crunch weeks, taken from Hammond's read, are shaded in the header.
  - The **one move** is the first open hosted task, sorted by due date and then priority, or the goal's `next_start` if there isn't one. "Hammond has a proposal" appears when a ghost is pending.
  - Tapping a row goes to `#/goal/:id`.
- **Week count:** the tasks hosted by the goal (steps count too) with `completed_at` in that week, in Sydney time, plus `week_log[monday].manual`.
- **Weeks:** built from Hub Prefs `school_terms` (stored nested by year; the server reads them with `termsFromHubPrefs`) with `termAt` and `mondayOf` from `school-time.ts`. Holidays aren't shown on a term runway. The pills pick a term in the current year. A Year view is a follow-on.
- **Parked, achieved and dropped goals** are listed in a collapsed "Not this term" row under each lane.
- **Phone (< 720px):** each lane is a list of cards. A card shows the title, this week's cell, the move and a count, following the pattern the Term River uses on phones.

## Goal page (`#/goal/:id`)

The rail stays on Goals. The header shows the sphere and term as the eyebrow, the title, the line "From ✦ <dream> · due <dd/mm/yy>", and the buttons `← Runway` and `Give it 25 min now`. That second button starts a 25-minute Pomodoro-style block and creates nothing.

The main column contains, top to bottom:

1. **Structure card.** The pills pick `structure`. The fields for that structure are edited in place (a morphing popover, or inline edit from the kit). The other structures' filled-in fields sit under a closed "Details" disclosure. For each structure:
   - **WOOP:** four tinted quadrants.
   - **SMARTER:** seven labelled rows.
   - **OKR:** the objective and key-result bars (current / target).
   - **Lead/lag:** the lag text, plus the lead measure strip.
   - **Floor·target·stretch:** three tiles, with "you're here" on the highest level reached.

   Every structure shows the lead measure strip, one cell per term week and the same states as the runway, with a "+1 this week" button.
2. **If-then trigger.** "If `cue`, then `action`", with the obstacle it answers. It's editable.
3. **Smallest next start.** `next_start`, with Start now (a 25-minute focus strip), Body-double (a 15-minute focus strip marked "Hammond's with you") and Split it (rescans, so Hammond's `split_task` proposal appears if the task qualifies).
4. **Projects** under this goal. Each has a progress bar (done / all tasks). **+ Link project** picks from the active projects that aren't hosted by another goal and sets `parent_goal_id`. Unlinking sets it back to `null`.
5. **Tasks on this goal.** Tasks the goal hosts directly, sorted by due date, with a checkbox. **+ Add task** creates one with `parent_goal_id`. The domain comes from the sphere: life → `life`, work → `teaching`, professional → `other`. `tasks.mjs` only allows `teaching | life | wedding | health | other`.
6. **Milestones.** Title and date, tickable. **+ Add**.
7. **Tagged.** The tag section from `mountTagAnythingSection`.

The right column is **Hammond's panel**, sticky on desktop and below the main column on phones. It contains:

- his avatar and name, the scan timestamp, why he last rescanned, and a Rescan link
- the verdict paragraph
- chips showing what he looked at
- "Proposals · nothing changes until you confirm", one confirm card per ghost showing the type, the title, why, and a before → after where it applies

## Hammond's goal read

### Computing it

`netlify/functions/_shared/goal-read.mjs` is pure (no I/O):

```
buildGoalRead({ goal, projects, tasks, terms, today, dismissed = [] })
  → { goal_id, computed_on, basis_updated_at, temperature, days_since_movement,
      week: { count, per_week }, crunch_weeks, verdict, looked_at, ghosts }
```

- **`days_since_movement`:** the number of days since the latest of `goal.updated_at` and the `completed_at` / `updated_at` of every task the goal hosts.
- **`temperature`:** warm up to 3 days, cooling up to 8, cold after that.
- **`crunch_weeks`:** the Monday keys of the rest of the current term where all open, non-Someday tasks due that week number at least `max(5, 1.5 × the median weekly load)` for the term.
- **`verdict`:** one or two sentences in Hammond's voice (`config/humanizer/voices/hammond.md`). It comes from templates and says: how the goal is moving, this week's count against the lead measure, and the next crunch if the goal has a lead measure.
- **`ghosts`** (agent `hammond`, each id prefixed `goal-<goalId>-`). The ids are stable, so recomputing the read finds the same ghost again.

| id suffix | kind | When |
|---|---|---|
| `start` | `create_task` (with `goalId`) | No open task under the goal. The title is `next_start` or "First step on “<title>”", due today + 2. |
| `split-<taskId>` | `split_task` | The earliest-due open task under the goal is a `task` with no steps, and `estimated_duration ≥ 45` or it's due within 7 days. The three steps come from a template. |
| `rest-<w1>_<w2>` | `goal_rest_weeks` | The goal has a lead measure and there are crunch weeks ahead that aren't already rest weeks. |
| `move-<taskId>` | `move_task` | An open hosted task is overdue. It moves to the next weekday that isn't in a crunch week. |

  Ids listed in `dismissed` are left out. There are at most 3 ghosts, in the order of the table above.

### Caching and rescans

- **Where it's stored:** in `tasks-hub-content` under `goal_reads/<goalId>`, as `{ read, dismissed: string[], reason }`.
- **`GET /api/goal-reads?goal_id=`** returns the saved read. It recomputes first in any of these cases:
  - there's no saved read
  - `computed_on` isn't today (Sydney time)
  - something the read depends on has changed. This is the max `updated_at` of the goal, its hosted projects and its hosted tasks, compared against `basis_updated_at`.

  `reason` records why it ran: `daily`, `changed: <what>`, or `manual`.
- **`GET /api/goal-reads`** with no id returns the reads for every active goal, using the same rules.
- **`POST /api/goal-reads { goal_id }`** forces a rescan (`reason: 'manual'`).
- There's no scheduled job. The first page open of the day counts as the daily scan, and saved reads keep it cheap.

### Proposals, accept and dismiss

Goal ghosts are **recomputed, not queued**, the same pattern the Almanac uses for its `alm-` ids.

- `POST /api/calendar-ghosts { id: 'goal-…', decision }` goes to a new runner, `runGoalGhostDecision`.
- **Accept:** the runner recomputes the read, finds the ghost by id, and runs `acceptPlan(ghost)`. The shared settle-and-finish path then applies the steps, including the Recent Agent Actions line on Central Node.
- **Dismiss:** the id is added to `goal_reads/<goalId>.dismissed`, so it isn't proposed again, and nothing else is written.
- **The client sends only `{ id, decision }`**, as it does for every other ghost.

There are two new ghost kinds in `apps/life/js/app/ghost-writes.js`:

- **`split_task`** `{ taskId, title, steps: string[1..6], goalId?, domain? }`. On accept it makes one `POST /api/tasks` per step (`kind: 'step'`, `parent_task_id`, `step_order`, `parent_goal_id`, `domain`). Each step gets a stable id: `ghost-<ghostId>-s<n>`.
- **`goal_rest_weeks`** `{ goalId, title, weeks: MondayKey[], rest_weeks: MondayKey[] }`. On accept it makes one `PATCH` to `goals/<goalId>` with `{ rest_weeks }`. The ghost carries the full new array, so the step stays pure.

`create_task` also gains optional `goalId` and `domain` fields, which it passes through as `parent_goal_id` and `domain`.

The calendar code that runs a ghost's task steps, `applyTaskStep` in `calendar-ghosts.mjs`, changes to match:

- It learns a `collection: 'goals'` PATCH.
- POST accepts the new task fields.
- A `suffix` gives each POST its own stable id.

## Rules this build must keep

- Kit tokens and components only (`packages/design-kit/AGENTS.md`, `TASKS.md`). No new hex, rem or shadow values.
- Dates show as `dd/mm/yy` via `format-display-date.js`.
- Agent writes follow propose → confirm → apply. The client never builds a write for a ghost.
- Nothing is red for a miss.
- The tsc error count and the failing-test count must not go up. At the start of this build they were 33 tsc errors in `apps/tasks` and 4 failing vitest tests (auth, page-editor ×3, task-relationships).

## Phases

| # | Phase | Proves it |
|---|---|---|
| 1 | Data model: goal fields, task `parent_goal_id`, server normalisation, crash fix | Integration and unit tests |
| 2 | @ tagging: `tasks:goal` kind, goal and project search | Registry, resolver and search tests |
| 3 | Runway and hosting domain (pure TS) | Unit tests |
| 4 | Landing page and routes | View tests and a browser check |
| 5 | Goal page (no Hammond yet) | View tests and a browser check |
| 6 | Hammond: ghost kinds, goal read, endpoint, accept/dismiss, panel and strip | Unit, integration and view tests, and a browser check |
| 7 | Docs: `apps/tasks/docs/data-model.md` and `packages/design-kit/TASKS.md` surfaces | Review |
