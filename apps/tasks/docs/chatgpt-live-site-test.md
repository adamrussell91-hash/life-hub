# Tasks Hub — ChatGPT Live site test

**How to use:** copy everything below the line into ChatGPT Live (or any computer-use agent that can click the site). Paste the finished report back to the coding agent.

---

# Prompt — exhaustive Tasks Hub live test

You are a senior QA + frontend debugger running a **full-site UI, UX, and functional test** of **Tasks Hub**.

Your job is not a happy-path demo. Walk every rail page, every control, every write path, and every empty / error / confirm state. **Hunt for errors, failures, dead ends, broken routes, silent no-ops, and visual/UX defects.** When something fails, gather the technical evidence a coding agent needs to fix it without reproducing the session.

Do not stop after the first bug. Finish the full script. Record every finding as you go.

---

## 1. Mission

1. Open the live site, sign in, and systematically test **every view and function**.
2. Treat the site as production data. Use the safety rules in §4.
3. For every defect, capture **technical evidence** (§5).
4. Deliver one **fix-ready report** using the exact template in §11.

Pass/fail every numbered step. A step fails if:

- the UI errors, hangs, or goes blank
- a control does nothing
- a write does not persist after reload / navigation
- the wrong view loads
- an API call fails (4xx / 5xx / CORS / JSON parse)
- the console throws
- layout, contrast, overflow, or keyboard access is broken
- a confirm card is skipped on a write (silent apply)
- copy, labels, or chrome violate the design rules in §7

---

## 2. Site, auth, stack (read this first)

| Surface | URL | What it is |
|---|---|---|
| App (GitHub Pages) | `https://tasks-hub.adam-russell.com` | Static SPA. API calls go cross-origin to the Functions host. |
| App + API (preferred) | `https://tasks-api.adam-russell.com` | Same SPA, same-origin `/api/*`. **Use this first**, especially in Safari. |
| Temp Netlify host | `https://artasks-hub.netlify.app` | Same Functions site. Only if the custom host is down. |

- **Passphrase:** `tasks-hub-local` (not `teaching-hub-local`).
- Stack: Vite + TypeScript vanilla DOM SPA. No React. Hash router (`#/board`, `#/clare`, …).
- Production API: Netlify Functions + Blobs store `tasks-hub-content`.
- Cookie: `tasks_hub_session`, `SameSite=Lax`, `credentials: 'include'` on every fetch.
- API envelope: `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code", "message", "details?" } }`.
- Local mock (only if you are told to use it): `http://localhost:5175` — in-memory, resets on server restart. **Default is production.**

If `tasks-hub.adam-russell.com` shows “Not Secure” or sign-in fails with a cookie / CORS message, switch to `https://tasks-api.adam-russell.com` and record both results.

Safari note: if the session cookie is blocked after a successful `/api/auth`, the UI should say to open `https://tasks-api.adam-russell.com`. Confirm that message appears; then continue on the API host.

---

## 3. Product map (what “done” looks like)

This is **not** a simple to-do list. It is Clare DeMind’s task/project hub. Same Cotton Glass chrome as Teaching / Life / Knowledge hubs.

**Left rail (top → bottom). Click every item. Brand “Tasks Hub” always returns to Board.**

| Rail label | Hash | Page header (eyebrow / title) | What it must do |
|---|---|---|---|
| Board | `#/board` | Home / Board | Kanban home. Quick-add. Project scope filter. Start / Done / Reopen. |
| Clare | `#/clare` | Negotiate / Clare DeMind | Propose duration + framework. Confirm card before write. Calibration. |
| Graph | `#/graph` | Structure / Graph | Force graph. Blockers / Workstreams pills. Search. Click node → preview. |
| Maps | `#/maps` | Pathways / Maps | Transit diagram. View/Edit. Zoom. Export. New map. Place line/program/competition. |
| Gantt | `#/gantt` | Schedule / Gantt | One project at a time. Bars, milestones, dependency curves, today line. |
| Orbit | `#/orbit` | Stretch / Orbit | Adam at centre. Urgency = distance. Click planet → preview. |
| Branch | `#/branch` | Stretch / Branch | One project tree. Parent = solid, `depends_on` = dashed. Click node → preview. |
| Sky | `#/constellation` | Stretch / Constellation | Completions light stars. Hover labels. Not a task list. |
| Today | `#/day` | Focus / Today | Adaptive domain focus + due-soon + pinch “shrink this” + quick-add. |
| Week | `#/week` | Shape / Week | 7-day grid, pinch chips, due-soon / shrink. |
| Month | `#/month` | Horizon / Month | Milestones + excursion key dates for the current month. |
| Backlog | `#/list` | Inbox / Backlog | Open tasks with **no due date**. Quick-add. Done / Reopen. |
| Projects | `#/projects` | Arcs / Projects | Stall revive / Frankenstein / bury. Close-with-retrospective. Review log. |
| Excursions | `#/excursions` | Events / Excursions | Create from Ethics Olympiad / Da Vinci templates. Admin tasks + drafts. |
| Network | `#/stress` | Network / StressFlags | Scan pressure patterns. Flags + Hammond inbox. |
| Corey | `#/corey` | Share / Corey capacity | Workload shape + public share URL. Copy / rotate. |
| Templates | `#/templates` | Reuse / Templates | Use task template → Today. Use excursion template → Excursions. |
| Search | `#/search` | Find / Search | Live search of task + project titles/descriptions (min 2 chars). |

**Public (no sign-in):** `#/capacity/<token>` — headlines + day levels only. **Never** task titles.

Seeded content you should see (production may already have extra user data on top):

- Projects: **MindWorks**, **Masters reading notes** (stall candidate), **Ethics Olympiad heat**, **Da Vinci Decathlon heat**, **Term 2 marking wrap** (ready to close).
- Tasks: Finish lesson pack for Year 12; Reply to florist quote; Sort fragrance research notes (backlog); Publish Year 12 pack (blocked by lesson pack); Lock MindWorks term brief (in progress); Showcase rehearsal; pinch/overdue demo tasks.
- Frameworks: Eat the Frog, Timeboxing, Eisenhower matrix.
- Task template: **Marking batch**. Excursion templates: **Ethics Olympiad**, **Da Vinci Decathlon**.

After creating or editing a task on the Board, the app may **re-boot** and show a full-screen spinning 3D cube, then return to the Board. That is expected, not a hang — unless it never returns (>8s) or loses the new task.

---

## 4. Safety rules (production data)

Prefix every task / excursion / map you create with **`[LIVE-TEST]`** so they are easy to find and delete later.

**Do confirm (write) only when the step says so**, and only for `[LIVE-TEST]` items.

**Always Discard / Cancel** on confirm cards that would:

- bury, Frankenstein, or close **MindWorks** or any project you did not create
- delete map stations/ticks you did not just add
- rotate Corey share **if a real person already has the current link** — test **Copy** first; only rotate if you will paste the new URL into the report and not leave Corey with a dead link. If unsure, **skip rotate** and mark the step `SKIPPED — safety`.

Do **not** sign out until the last auth step. Do **not** change the passphrase. Do **not** wipe the store.

If a prompt() or confirm() appears (Today / Backlog Done on a Clare-estimated task asks “how long did it actually take?”), cancel with empty / Escape unless the step is specifically testing actual-duration.

---

## 5. How to gather technical evidence

For **every** failure or suspicious behaviour, collect as much of this as you can. This is the most valuable part of the report.

### 5.1 Always record

- Exact URL including hash (`https://…/#/maps`)
- Viewport width × height
- What you clicked / typed, in order
- What you expected vs what happened
- Whether it is reproducible (do it once more)

### 5.2 DevTools — Console

Open DevTools → Console before you start. Leave it open.

For each error / warning:

- full message
- source file + line (e.g. `shell.ts:185`, `client.ts:40`)
- stack trace (first 8 frames)
- whether it fired on load or on an action

Filter noise (extensions). Only report first-party / `tasks-` / `netlify` / `vite` errors.

### 5.3 DevTools — Network

Watch `/api/*`. For every non-2xx, CORS failure, or `ok: false` body:

| Field | Capture |
|---|---|
| Request URL | full, including query (`/api/tasks?id=…`) |
| Method | GET / POST / PATCH / DELETE |
| Status | HTTP code + status text |
| Request headers | `content-type`, `origin`, `referer`, `cookie` (name only, **not** the cookie value) |
| Request payload | JSON body |
| Response headers | `content-type`, `access-control-allow-origin`, `set-cookie` (names only) |
| Response body | full JSON, especially `error.code` and `error.message` |
| Timing | queued / waiting / download; note >2s |
| Initiator | JS file that called `fetch` |

Also record:

- requests that **never fire** when a button is clicked (silent no-op)
- requests that fire twice
- 404 on a path that the UI clearly expects (`/api/clare`, `/api/stall`, `/api/maps`, `/api/capacity`, `/api/reviews`, `/api/stress-flags`)
- HTML returned instead of JSON (`invalid_response` / “Unexpected response shape”)

### 5.4 DOM / UI

- Control label, role, and a stable selector (`button.btn.btn--primary`, `input.hub-search`, `a.hub-rail__link[href="#/maps"]`)
- `aria-*` that is missing or wrong
- Overflow: clipped rail labels, horizontal page scroll, overlapping header / tiles
- Computed issue if obvious: colour contrast fail, 0×0 hit target, `pointer-events: none`, `disabled` stuck true

### 5.5 Runtime

In the console, if useful and the page is up:

```js
location.href
location.hash
document.documentElement.dataset.hub
document.title
document.querySelector('#app')?.innerHTML.slice(0, 200)
```

Do **not** dump the whole DOM. Do **not** exfiltrate cookie values or passphrase hashes.

### 5.6 Screenshots

Take a screenshot for every **fail** and every **layout/UX** issue. Name them in the report (`board-filter-empty.png`). Describe what the image shows in one sentence.

### 5.7 Known API surface (so you can tell a missing route from a UI bug)

| Method | Path | Used by |
|---|---|---|
| GET | `/api/session` | boot / gate |
| POST | `/api/auth` | sign-in `{ passphrase }` |
| POST | `/api/logout` | sign out |
| GET/POST | `/api/tasks` | list / create |
| GET/PATCH/DELETE | `/api/tasks?id=` | read / update / delete |
| GET/POST | `/api/projects` | list / create |
| GET/PATCH/DELETE | `/api/projects?id=` | read / update / delete |
| GET/POST | `/api/templates` | list; actions `save_task_as_template`, `create_task_from_template`, `create_excursion_from_template` |
| GET/POST | `/api/clare` | calibrations; actions `propose`, `accept`, `record_actual` |
| POST | `/api/stall` | `flag_stalled`, `resolve` |
| GET/POST | `/api/stress-flags` | list / `?inbox=`; actions `scan`, `raise` |
| GET/POST | `/api/capacity` | snapshot; `ensure_share`, `rotate_share`; public `?token=` |
| GET/POST | `/api/reviews` | review log; `close` |
| GET | `/api/search?q=` | Search view |
| GET/POST | `/api/maps` | list / create |
| GET/PATCH/DELETE | `/api/maps?id=` | Maps editor |

A 404 here usually means the Netlify Functions deploy is stale. Say so explicitly — it is a deploy bug, not a CSS bug.

---

## 6. Chrome + UX rules (fail the step if broken)

Design kit is locked. Do not praise “creative” chrome.

**Sign-in**

- Eyebrow/brand: `Tasks Hub`
- Title: `Sign in`
- Field label: `Passphrase`
- Submit: `Sign in`
- Hub tile (`.sign-in__mark`) visible
- **No** supporting / purpose / privacy copy
- **Enter submits** the form (not click-only)
- Wrong passphrase → inline error, not a blank page

**Shell**

- `html[data-hub="tasks"]`
- Left rail **15rem**, depth→marine gradient, **labeled** rows: outline icon + title-case label
- Brand is a link: `Tasks Hub` → `#/board`. Not a logo, not stacked, not a collapse control
- Current page: `aria-current="page"` on the active rail link
- **No** coloured dots on the rail
- Sign out is a **top-right icon button** (`.hub-icon-btn` in `.hub-utilities`), not a labelled pill on the rail
- Hub tile (`.hub-mark`, `icons/tasks.svg`) top-right after utilities
- Page header: uppercase eyebrow → `h1` → optional supporting line → actions
- Font is Inter
- Buttons are `.btn` + `--primary` / `--secondary` / `--ghost` / `--decisive`
- Search fields on List / Graph / Search use `.hub-search`
- Project / scope filters use `.hub-filter` (custom menu), not a raw teaching-hub-looking select where a kit filter exists
- View mode switches use `.hub-pills`
- Agent writes (Clare, pinch shrink, stall, close, excursion create, map delete): **propose → confirm card → apply**. Confirm card has Discard/Cancel and Confirm. Writes must not apply on the first click.

**Visual defects to flag**

- Text overflow / wrap breaking cards
- Kanban columns collapsing or overflowing the canvas
- Graph / Orbit / Gantt / Maps / Sky unreadable, 0-height, or off-canvas
- Rail overlapping canvas, or canvas sliding under the rail
- Focus rings missing or using High Sea orange as a focus colour (focus should be Wave)
- Empty states that look like crashes (“undefined”, raw JSON, `[object Object]`)
- Loading text stuck forever (“Loading board…”, “Clare is thinking…”)

---

## 7. Test script

Work in this order. Mark each step `PASS`, `FAIL`, or `SKIPPED` with one line of evidence.

Open DevTools (Console + Network) first. Start at **`https://tasks-api.adam-russell.com`**.

### A. Gate and shell

1. Cold load `/` with no hash. Expect sign-in if no session, or Board if already signed in.
2. Wrong passphrase `not-the-pass`. Expect inline “Invalid passphrase” (or equivalent). Page stays on the gate. Network: `POST /api/auth` → `ok: false`, code `invalid_credentials`.
3. Empty submit. Expect HTML5 or JS validation; no crash.
4. Correct passphrase `tasks-hub-local`. Submit with **Enter** (not only the button). Expect Board (`#/board`). Network: `POST /api/auth` 200 then `GET /api/session` authenticated.
5. Favicon is the Tasks tile, not a generic globe.
6. Skip-to-content link exists; Tab once from the address bar / body and confirm it appears (“Skip to content”).
7. Rail lists all 18 destinations in §3, in a usable scroll if the viewport is short. None missing, none duplicated.
8. Click brand `Tasks Hub` from a deep page later (do this again from Sky). Must land on Board.
9. Sign-out icon is present top-right. **Do not click yet.**
10. Direct hash `#/not-a-view` should fall back to Board, not a white screen.

### B. Board (`#/board`)

11. Lede shows open-task count, active project count, and today’s date. Not `NaN` / `undefined`.
12. Four columns: **To do**, **In progress**, **Blocked**, **Done**.
13. Seeded **Publish Year 12 pack** (depends on lesson pack) sits in **Blocked** while its dependency is open.
14. **Lock MindWorks term brief** sits in **In progress**.
15. Scope filter (kit `.hub-filter`, labelled like “Board project scope”): All tasks → MindWorks → another project → back to All. Columns update. Empty project shows compact empty state, not a crash.
16. Quick-add: title `[LIVE-TEST] board card`, domain `other`. Submit. Card appears in **To do** (due today). If the cube loader appears, wait; fail if the card is gone after boot.
17. On that card: **Start** → moves to In progress (`PATCH /api/tasks?id=`). **Done** → Done. **Reopen** → To do.
18. Quick-add with empty title: must not create a blank card.
19. Reload. The `[LIVE-TEST] board card` still exists (persistence).

### C. Clare (`#/clare`)

20. Framework library lists Eat the Frog, Timeboxing, Eisenhower with pattern + reasoning text.
21. Checkbox “Just show the framework — skip reasoning” toggles and **survives a reload** (`localStorage` key `tasks-hub-clare-skip-reasoning`). Test both on and off.
22. Form: task, domain, priority, due date, **Ask Clare**.
23. Ask with `[LIVE-TEST] negotiate marking pile`, domain teaching, priority high, due tomorrow. Expect “Clare is thinking…” then a proposal bubble: framework chip, minutes, optional reasoning / calibration note. Network: `POST /api/clare` `{ action: "propose" }`.
24. Change “Your estimate” by ±15 minutes. Change framework in the select. Click **Propose write**. A **confirm card** appears. Text must include the title, minutes, and “Do not apply until Confirm.”
25. **Discard**. Confirm card closes. No `accept` request. No new task.
26. Propose write again → **Confirm**. Network: `POST /api/clare` `{ action: "accept" }`. Success copy. Task exists on Board / Today.
27. Estimate calibration section: if present, domains + sample counts; if empty, page still renders.
28. Ask Clare with empty title: no request, no crash.

### D. Graph (`#/graph`)

29. Default mode **Blockers**. Canvas or empty-state (“No dependency edges yet…”) — not a blank hole.
30. Nodes for the lesson-pack → publish → MindWorks-brief chain should exist. Edges visible.
31. Hover a node: tooltip with title. Click: preview aside (kind, title, domain/id).
32. Pill **Workstreams**: projects as hubs, tasks as spokes. Preview still works.
33. Search `MindWorks` filters nodes. Clear search restores.
34. Search garbage `zzzznope` does not throw; empty or unfiltered fallback is OK if documented in the UI, but it must not freeze.
35. Resize the window slightly. Graph must not throw (`clientWidth` 0, NaN positions).

### E. Maps (`#/maps`) — high risk; this hash **must** open Maps, not Board

36. Click rail **Maps**. URL is `#/maps`. Header eyebrow **Pathways**, title **Maps**. If you land on Board instead, **FAIL this step hard** and still try typing `#/maps` in the address bar.
37. A transit map SVG renders (line letters, station pills, ticks) or a clear empty/new-map state. Not Board tiles.
38. Map `<select>` switches maps if more than one exists.
39. Zoom − / Reset / + and trackpad/wheel zoom. Map stays usable. Reset returns to 1×.
40. **Export** downloads an `.html` file. Open it if the environment allows; it should be a standalone map, not empty.
41. Pills **View** / **Edit**. Edit reveals **+ Line**, **+ Program**, **+ Competition**.
42. **New map** creates “Untitled map” and enters Edit (`POST /api/maps`).
43. In Edit: + Line, click the canvas → a new vertical line. + Program, click a line → station. + Competition, click a station or line → tick. Each persists (`PATCH /api/maps?id=`). Fail if toast “Could not save”.
44. Click a station/tick: preview drawer. Rename to `[LIVE-TEST] station`, Save. Link to a project if the select is populated. Delete → confirm card → **Cancel** (keep your test marks unless you need to clean up).
45. View mode: placing tools gone; clicking still selects preview.

### F. Gantt (`#/gantt`)

46. Project filter is a kit hub-filter. Default project has bars.
47. SVG: task bars, ◆ milestones, today vertical line, curved `depends_on` edges.
48. Switch project (MindWorks vs an excursion vs Term 2 marking wrap). Chart re-lays out. Empty dated project shows empty-state, not a broken SVG.
49. Labels are readable; chart is scrollable if wide. Hover/title on a bar if present.

### G. Stretch visualisations

50. **Orbit** `#/orbit`: Adam at centre, rings, coloured planets. Closest = more urgent. Click / Enter on a planet → preview (kind, title, due, priority). Hover tooltip. Empty-state if no open work (unlikely).
51. **Branch** `#/branch`: defaults toward MindWorks. Filter to another project. Solid parent edges, dashed depends_on. Click node → preview. Keyboard Enter/Space on a focused node.
52. Project with no tasks: empty-state, not a single orphan crash.
53. **Sky** `#/constellation`: star field, headline, fill % / lit / waiting. Hover a star → label. Overdue tasks may add haze. Completing a task elsewhere then returning should change lit count (do this after a Board Done if easy).

### H. Today / Week / Month / Backlog

54. **Today** `#/day`: lede “Adaptive focus: …” with domains. Weekday school days lean teaching; weekends lean life/wedding/health — record what you see and the local weekday.
55. **Negotiate with Clare** jumps to `#/clare`.
56. Due-soon strip and/or pinch cards (“Pinch · watch / overloaded”) or “No pinch points in the next week.”
57. If a pinch card has shrink buttons (defer / delete / etc.): click one → confirm card → **Discard**. Then click again → **Confirm** only if the target task is clearly a demo pinch item (parent email / filing / calls). Record `PATCH` or `DELETE /api/tasks`.
58. Quick-add `[LIVE-TEST] today task` on Today. It should appear if it matches today’s adaptive filter **or** be findable on Board. Record which. Domain teaching is safest on a weekday.
59. Done on a row. If a `prompt()` asks for actual minutes, enter `25`. Network may be `POST /api/clare` `record_actual` instead of a plain status patch.
60. **Week** `#/week`: seven columns, weekday labels, pinch chips on heavy days. Week chips are visible. Pressure strips present.
61. **Month** `#/month`: current month name. MindWorks “Term plan locked” (2026-08-22) should appear in August 2026. Excursion key dates if the seed excursions have them; empty-state is OK if none this month — not a crash.
62. **Backlog** `#/list`: **Sort fragrance research notes** (no due date) listed. Quick-add on Backlog currently **sets due date to today** — so the new task may **not** stay on Backlog. Record that behaviour (product bug if the new card vanishes from this view immediately). Done / Reopen still work on undated rows.

### I. Projects (`#/projects`)

63. On load, `POST /api/stall` `{ action: "flag_stalled" }` may run. 404 = Functions stale.
64. **Masters reading notes** should appear under **Stalled — choose an outcome** (quiet 6+ weeks). If it is still under Active, record that (flagging failed or already resolved).
65. Stalled card: reason required. Click Revive / Frankenstein / Bury with empty reason → “Add a short reason first.” No write.
66. Frankenstein with reason but no merge target → “Pick a merge target…”. No write.
67. Type reason `[LIVE-TEST] discard only`, pick a merge target, click Frankenstein → confirm card → **Discard**. Project stays stalled.
68. **Do not Confirm bury/Frankenstein on seed projects.** If you want a happy path, only revive if you are willing to change seed state; prefer Discard.
69. Active list includes MindWorks, excursions, Term 2 marking wrap. Cards show type, status, milestone count, open tasks, slip vs baseline.
70. **Term 2 marking wrap** should be ready to close (all tasks done). **Close project** → confirm card + retrospective field. Empty Confirm → “Add a retrospective first.” Then **Discard**. Do not close it unless the step is explicitly re-run later.
71. Review log section renders (may be empty). No raw `[object Object]`.

### J. Excursions (`#/excursions`)

72. Form: template select (Ethics Olympiad + Da Vinci with lead times), title, event date (default ~+45 days), student group, live preview of scheduled task count + key dates.
73. Changing template or date updates the preview. Invalid/empty date does not throw.
74. Title `[LIVE-TEST] ethics run`, template Ethics Olympiad, group `Year 10 live-test`. **Review & create** → confirm card describing N admin tasks + drafts. **Cancel**. No create.
75. Review & create again → **Create excursion**. Network: `POST /api/templates` `{ action: "create_excursion_from_template" }`. New row appears. Detail shows key dates, scheduled admin tasks (`source` auto), permission note + staff absence email drafts (non-empty text).
76. Click the other seed excursion cards (Ethics Olympiad heat, Da Vinci Decathlon heat). Detail swaps. Keyboard Enter/Space on a focused card works.
77. Seed excursions may lack drafts/key dates — empty-state copy, not a crash.

### K. Network (`#/stress`)

78. Load scans: `POST /api/stress-flags` `{ action: "scan" }` then `GET /api/stress-flags` and `GET /api/stress-flags?inbox=General%20Hammond`.
79. Status line: raised / skipped / none. Not stuck on “Scanning pressure patterns…”.
80. **Scan again** re-runs without duplicating forever (skipped count may rise).
81. Open flags list textured descriptions (e.g. overlapping Ethics + Da Vinci). Chips for Hammond / Penelope / Vera.
82. Hammond inbox section lists routed flags or “Inbox empty.”

### L. Corey (`#/corey`) + public share

83. Headlines + overall level (`slammed` / `busy` / `light` / `free`). 14-day grid with weekday + level.
84. “Your detail (not shared)” may show open counts + minutes. That is Adam-only.
85. Share URL looks like `https://<host>/#/capacity/<token>`. **Copy link** → clipboard or input selected. Button may read “Copied”.
86. Open the share URL in a **new tab** (or the same tab, then return). **No sign-in.** Title/availability only. **Fail if any task title, project title, or MindWorks appears.**
87. Invalid token `#/capacity/not-a-real-token`: “unknown or was rotated”, not a stack trace.
88. Rotate: **skip unless safe** (§4). If you rotate: old URL must fail; new URL must work; record both tokens’ last 4 chars only.

### M. Templates + Search

89. Templates: **Marking batch** → **Use** → hash `#/day` and a new marking task exists (`POST /api/templates` `create_task_from_template`).
90. Project template **Standard term project** is listed (may have no Use button — record that).
91. Excursion template **Use** routes to `#/excursions`.
92. Search `#/search`: `.hub-search`. 1 character → no results flash. 2+ characters `Mind` → MindWorks + related tasks. `fragrance` → backlog task. `zzzznope` → “No matches.”
93. Search results: projects chip “project”; task rows render. Done on a search row is currently a no-op by design — record, do not fail unless it **throws**.
94. API `GET /api/search?q=Mind` should 200; if it 404s, client falls back to local filter — note which path ran (Network tab).

### N. Cross-cutting

95. Click **every remaining rail item** you have not opened in this session (complete the 18). Each sets `aria-current="page"`, correct header, and a painted canvas (not the previous view leftover).
96. Browser Back / Forward through 4 hashes. Views remount correctly.
97. Hard reload on `#/gantt` and `#/clare` (deep link). Session persists; correct view paints.
98. Unknown API outage simulation: DevTools → Network → Offline, click Board. Expect a sign-in fallback or visible error, **not** a permanent white screen. Go online again and recover.
99. Narrow the viewport to ~390px (phone). Rail + canvas: note whether the rail collapses, overflows, or steals the canvas. Screenshot. Then 1280px.
100. Keyboard: Tab through Board filter, quick-add, and one card button. Visible focus. Enter submits quick-add.
101. Console at the end: copy any remaining first-party errors you have not already logged.
102. Sign out (top-right icon). Expect gate. `POST /api/logout`. Hitting `#/board` while signed out must not show task titles. Sign back in with Enter and land on Board.

---

## 8. Extra probes (do these if time; still report if skipped)

- Open `https://tasks-hub.adam-russell.com` after the API-host pass. Compare sign-in, cookie, and one Board load. Record CORS / cert / cookie differences.
- Direct `GET https://tasks-api.adam-russell.com/api/session` while signed in (cookie sent) vs signed out.
- Create a task on Board scoped to MindWorks (filter first). Confirm `parent_project_id` by seeing it only in that scope.
- Clare skip-reasoning ON: proposal hides the long reasoning and shows “Framework: …”.
- Maps Export filename is slug of the map title.
- Gantt with MindWorks shows the blocked-publish dependency curve.
- Constellation headline is a sentence, not `undefined`.
- Confirm cards use kit structure (eyebrow “Proposed write”, primary Confirm, ghost Discard/Cancel). Excursion confirm may say “Create excursion” / “Cancel” — still a confirm card, not an instant write.

---

## 9. Severity rubric

| Severity | Meaning |
|---|---|
| **S1 Blocker** | Cannot sign in, blank app, data loss, public Corey leak of task titles, uncaught exception on a primary view |
| **S2 High** | A primary write path fails, a rail route opens the wrong view, API 404 on a shipped feature, confirm card skipped |
| **S3 Medium** | Control no-op, persist fail on a secondary path, layout broken at desktop, a11y fail on a primary control |
| **S4 Low** | Copy, polish, empty-state wording, minor overflow, cosmetic token drift |
| **UX** | Usable but confusing (e.g. Backlog quick-add disappearing because due date is set) |

---

## 10. While you work

- Keep a running log. Do not rely on memory.
- Prefer facts over opinions. “PATCH /api/tasks?id=task_x returned 404 HTML” is useful. “Board feels off” is not.
- If you are blocked (captcha, no DevTools, browser crash), say what you could not collect and continue with other steps.
- Do not try to fix the site. Do not invent API calls that change production beyond the `[LIVE-TEST]` writes in the script.

---

## 11. Report template (return exactly this)

```md
# Tasks Hub live test report

- Tester: ChatGPT Live
- Date (ISO):
- Start URL:
- Browser / OS / viewport:
- Hosts tested: tasks-api / tasks-hub / localhost (list)
- Signed in via: Enter / button
- Seed vs extra data noted:

## Executive summary
- S1 count:
- S2 count:
- S3 count:
- S4 / UX count:
- Can a human use Board + Clare + Search today? (yes/no + one sentence)
- Deploy suspicion (stale Functions / empty Blobs / cookie / CORS): yes/no + why

## Step results
| ID | Area | Result | One-line evidence |
|----|------|--------|-------------------|
| 1  | Gate | PASS/FAIL/SKIP | |

(include every step 1–102)

## Defects (one block per issue)

### D1 — short title
- Severity:
- Steps to reproduce:
- Expected:
- Actual:
- URL + hash:
- Console:
- Network (method, URL, status, request JSON, response JSON):
- DOM selector / screenshot:
- Suspected area (gate / router / view / API / Blobs / CSS / kit):
- Fix hint for the coding agent (file or symbol if obvious, e.g. `parseHashRoute` missing a view id, `/api/maps` 404):

## Technical appendix
- All first-party console errors (full text)
- All failed `/api/*` calls (table)
- `document.documentElement.dataset.hub`:
- Final `location.href`:
- localStorage keys that look task-related (names only):
- `[LIVE-TEST]` records created (titles + ids if visible):
- Writes you confirmed (list):
- Writes you discarded (list):
- Corey tokens: last 4 chars old/new if rotated; otherwise “not rotated”

## UX notes (no crash, still wrong)
- numbered list

## What looked healthy
- short list so the coding agent does not “fix” working paths
```

Return **only** the filled report when you are done. If you must stop early, still return the report with remaining steps marked `SKIPPED`.
