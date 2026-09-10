# Product stress test (Claude Code)

Walk every live hub page the way Adam uses it. Click the controls. Open the cards. Change the range. Switch the view. Look at the charts. Report what is broken or visualising badly.

This is **not** the consolidation overseer. Do not write `docs/consolidation/checkpoints/`. Do not treat a 200 or a green unit test as a pass. A page that loads and still looks wrong is a fail.

**Why this exists:** new features keep shipping and Adam finds the breakage when he goes to use them. The job is to find those before he does.

---

## How to find this file

Claude Code cwd = the `life-hub` git repo root (same folder as root `CLAUDE.md`).

| Location | Path |
|----------|------|
| **Repo-relative** | `docs/STRESS-TEST.md` |
| **Adam’s Mac** | `~/Projects/life-hub/docs/STRESS-TEST.md` |
| **Reports** | `docs/stress-test/reports/YYYY-MM-DD.md` |
| **Kit rules** | `packages/design-kit/AGENTS.md`, `RAIL.md`, `MOBILE.md`, `ICONS.md`, `CHARTS.md` |

`git pull origin main` first.

---

## Paste this into Claude Code

```text
You are running the Life Hub product stress test.

Read and obey, in this order:
  docs/STRESS-TEST.md
  packages/design-kit/AGENTS.md
  packages/design-kit/RAIL.md
  packages/design-kit/MOBILE.md
  packages/design-kit/ICONS.md

Hard rules:
- Do not edit application code, configs, or design-kit files.
- Do not git add / commit / push / open PRs.
- Do not print secret values or ask Adam for the Life passphrase.
- Do not write, publish, dump, schedule, delete, trash, or restore real records.
- Stop at confirm cards. Close them with Discard / Cancel.
- You MAY create exactly one report: docs/stress-test/reports/YYYY-MM-DD.md
  (use today's date; if that file exists, append -2, -3, …).

Task: sign in only if a session is already available on this machine.
Then walk every page and action in STRESS-TEST.md against production:
  https://life-hub.adam-russell.com/
  https://life-hub.adam-russell.com/teaching/
  https://life-hub.adam-russell.com/knowledge/
  https://life-hub.adam-russell.com/tasks/

For every page: desktop (~1280px) then phone (390px).
Click the real controls. Do not screenshot-and-guess.
Record each page PASS / FAIL / BLOCKED with evidence (what you clicked, what you saw).
A blank chart with no fail-visible empty state is FAIL.
A kit chrome violation is FAIL.
A control that does nothing is FAIL.

Write the report using the template at the bottom of STRESS-TEST.md.
If you cannot reach production or are not signed in, write the report as BLOCKED and stop.
```

---

## Role

| You do | You do not |
|--------|------------|
| Click through every listed page and control | Edit product code |
| Look for broken behaviour **and** broken visualisation | Invent new pages or features |
| Write one dated report | “Fix this one file” unless Adam explicitly says so in that turn |
| Mark BLOCKED when a page cannot be reached | Treat “it loaded” as success |
| Distinguish empty-by-design from broken-empty | Ask for the passphrase |

Default stance: **use the product, then write the report, then stop.**

---

## Locked facts

| Fact | Value |
|------|--------|
| Umbrella origin | `https://life-hub.adam-russell.com` |
| Life | `/` |
| Teaching | `/teaching/` |
| Knowledge | `/knowledge/` |
| Tasks | `/tasks/` |
| API | `https://api.adam-russell.com` (do not use `teaching-api` / `tasks-api` / `knowledge-api`) |
| Auth | One Life passphrase session. Cookie `life_hub_session`. Never print it. |
| Student URLs | `/teaching/s/…` stay unauthenticated |
| Dates on screen | `dd/mm/yy` — never `YYYY-MM-DD` as a visible day |
| Title row (every hub) | `h1` only. **No** `.hub-mark` beside any heading |
| Rail | 15rem, brand is a link home, icon + title-case label, no coloured dots |
| Phone | Under 720px: rail hidden, four-slot bottom bar + More sheet |
| Widgets proxy | Out of scope (`jade-melomakarona-ea20fe`) |

If a live link still points at `teaching-hub.adam-russell.com`, `tasks-hub.adam-russell.com`, `knowledge-hub.adam-russell.com`, `teaching-api`, `tasks-api`, or `knowledge-api` as the **primary** href, that is FAIL.

---

## How to run

1. Pull `main`. Read this file. Do not start from chat memory of old routes.
2. Prefer the **live umbrella**. Local `npm run dev` is a last resort and must be labelled in the report.
3. Use a real browser. Keyboard, click, scroll, resize. One static screenshot is not a pass.
4. **Desktop first** at ~1280×800, then **phone** at **390×844** for that same hub before leaving it.
5. On every page run the [Shared page contract](#shared-page-contract) plus the page’s own action list.
6. Stay read-mostly. Prove writers by opening them and stopping at the confirm / discard boundary.
7. If a page is empty because Adam has no data, say **empty-by-design** and still check that the empty state is labelled. A silent blank tile is FAIL.
8. If the first real check fails, do not patch. Record it and keep walking.

Sign-in: if the gate is up and no session exists, **BLOCKED**. Do not guess the passphrase. Student Teaching URLs are the exception — they must work without a session.

---

## Shared page contract

Run this on **every** page before the page-specific list. Fail any item that is true.

### Chrome

- [ ] `html[data-hub]` is the hub you think you are on (`life` / `teaching` / `knowledge` / `tasks`).
- [ ] Rail brand is an `<a>` reading `Life Hub` / `Teaching Hub` / `Knowledge Hub` / `Tasks Hub`. Click it. It returns to that hub’s home (Home / Dashboard / Archive / Board).
- [ ] Primary rail items are icon + title-case label. No coloured dots. No icon-only column. No uppercase item labels.
- [ ] Current page is marked (`aria-current="page"` or `.is-current` / `.is-active`).
- [ ] Refresh and Sign out sit in the canvas header as icon buttons, not labelled pills on the rail.
- [ ] Title is `h1` only. **No** hub tile anywhere: no favicon, no `.sign-in__mark`, no title-row `.hub-mark`.
- [ ] Page header is eyebrow → title → optional supporting. Title is not blank, not `undefined`, not the previous page’s title.
- [ ] Hub switcher / Hubs accordion lists the other three hubs. Expand each preview. Click through to the other hub and back.

### Layout and viz

- [ ] No horizontal page scroll at 1280 or 390.
- [ ] No overlapping text, clipped labels, or tiles stacked on top of each other.
- [ ] Images, avatars, block icons, and muscle maps actually render (no broken-image icon, no empty 0×0 svg).
- [ ] Every visible chart / heatmap / ring / graph has either data or a labelled empty state. A 0-height svg, an all-blank heatmap, or a tile that says nothing is FAIL.
- [ ] Calendar days on screen are `dd/mm/yy`.
- [ ] `Loading…` / skeleton / spinner clears. Infinite load is FAIL. Soft-fail that looks like “you have no data” when the fetch failed is FAIL — that must read unavailable / could not load.

### Interaction

- [ ] Every visible button, pill, tab, filter, search field, and card is clickable and does something observable (navigate, expand, filter, open a sheet, or a labelled disabled/empty reason).
- [ ] Filters and pills change the canvas. A pill that only toggles `aria-pressed` and leaves the same content is FAIL.
- [ ] Dialogs, morphing popovers, sheets, and confirm cards open and close (Discard / Cancel / Escape / click-outside). Nothing stays stuck as a dim overlay.
- [ ] Browser Back returns to the previous canvas in this hub, not a white page or the wrong hub.
- [ ] Direct load of this URL (copy, new tab, refresh) shows the same page, not a bounce to home with a blank canvas.
- [ ] Console has no uncaught exception that correlates with a blank or stuck canvas. Note it if the page still “works.”

### Phone (390px) — every hub, every visit

- [ ] Left rail is gone. No compact top-strip substitute.
- [ ] Bottom bar has exactly four slots. Life: Home, Chat, Calendar, More. Teaching: Dashboard, Classes, Lessons, More. Knowledge: Archive, Graph, Chat, More. Tasks: Dashboard, Chat, Today, More.
- [ ] More opens a sheet: “In this hub” secondaries, then a Hubs list of the other three. Those links work.
- [ ] Header utilities still reachable. Title does not collide with them.
- [ ] Charts and cards reflow. Nothing requires sideways scrolling to read.

---

## Hunt these (Adam keeps finding them)

Call these out by name when they show up.

| Symptom | Fail if |
|---------|---------|
| Feature-shaped blank | Tile / chart / list is present but empty with no caption |
| Yesterday’s chrome | Coloured rail dots, Life title-row tile, supporting copy on sign-in |
| Dead control | Click, nothing, no toast, no error, no navigation |
| Stale host | Link or request still uses a retired `*-api` or old Pages host as the live target |
| ISO date | Visible day shown as `2026-09-06` |
| Overlay trap | Scrim / dialog / popover that cannot be dismissed |
| Title lie | Header still says the previous section |
| Soft-fail emptiness | Failed load rendered as a clean empty archive / empty board |
| Clipped viz | SVG / canvas / map cut off, zero height, or overflowing its tile |
| Confirm skipped | Writer applies without a `.confirm-card` |
| Hash amnesia | Refresh or Back loses the entity / view |
| Mobile rail ghost | Rail or a top icon strip still visible under 720px |

---

## 0. Sign-in and first paint

Start at `https://life-hub.adam-russell.com/`.

- [ ] Gate uses kit sign-in: title `Sign in`, label `Passphrase`, hub tile, no supporting/purpose copy.
- [ ] Enter submits. Wrong passphrase shows an error, does not reload a silent blank.
- [ ] After a valid existing session: shell paints, rail appears, Home is not an infinite spinner.
- [ ] Sign out returns to the gate. Refresh on the gate stays signed out.
- [ ] Repeat the gate check on `/teaching/`, `/knowledge/`, `/tasks/` — same kit, same session, no second passphrase.

Then walk hubs in this order: Life → Teaching → Knowledge → Tasks → cross-hub jumps.

---

## 1. Life Hub — `/`

Home of the umbrella. Brand click → Home.

### 1.1 Home

- [ ] Energy / protein / fat rings show numbers and a fill, or a labelled empty day.
- [ ] Movement card and logging 5-box strip match today’s records (or show none, explicitly).
- [ ] Week strip has seven cells.
- [ ] Hub pulse cards for Teaching / Knowledge / Tasks show a count or a fail-visible status, not `—` forever. Click each card. It opens that hub, not a 404 and not an old host.
- [ ] Dump for Clare: type a few words. Calendar chip expands a date/time row. **Do not Dump or Schedule.** Confirm the primary buttons are present and the date chip shows `dd/mm/yy`. Close the schedule row.
- [ ] Brief opens something readable or a labelled error. Do not apply proposals.
- [ ] Protocol select lists the Clare protocols. Changing it does not navigate away.
- [ ] Hammond line, if shown, is real prose, not `undefined` or raw markdown markers.
- [ ] Refresh reloads Home without wiping the shell.

### 1.2 Chat

Open from the rail **and** from a floating 💬 on another tab (prove both).

- [ ] Agent picker shows portraits: Brisket, Chadwick, Hyaluronica, Penelope, Sara, Vera, Hammond, Ann, Clementine, Clare. Faces render.
- [ ] Selecting an agent updates the “Talking to” name, accent, and empty state. It does not leave the previous agent’s name.
- [ ] Tools / protocol pills appear for agents that have them. They are usable, not a clipped strip.
- [ ] New chat clears the thread. Close returns to the previous Life section, not a blank shell.
- [ ] Attach control opens a file picker. Cancel it. Do not upload private files.
- [ ] Composer accepts text. **Do not send** unless you must prove a dead composer — if you do, send `ping` and Discard any confirm card.
- [ ] Scroll-hide on the picker: scrolling the thread tucks the picker; utilities stay.

Named-agent spot check (picker only — no long chats):

| Agent | Open from | Must |
|-------|-----------|------|
| Brisket | Nutrition 💬 | Picker lands on Brisket |
| Chadwick | Fitness 💬 | Picker lands on Chadwick |
| Hyaluronica | Skincare 💬 | Picker lands on Hyaluronica |
| Sara | Body 💬 | Picker lands on Sara |
| Penelope | Mind (Chat) | Picker can select Penelope |
| Vera | Mind Vera-session tile if present | Sheet / chat does not 404 |
| Hammond | Central Node 💬 | Picker lands on Hammond |
| Clare | Home dump / Chat | Clare is selectable |
| Ann / Clementine | Chat picker | Both selectable |

A floating button that opens Chat on the wrong agent is FAIL.

### 1.3 Nutrition

- [ ] Macro split ring, sodium / calcium / polyphenol tiles, protein-by-meal pie, and meal log all paint or labelled-empty.
- [ ] Meal plan widgets rail: visible widgets or a status line. Not a collapsed zero-height card pretending to be a feature.
- [ ] Challenges list: same rule.
- [ ] 7-day protein / fat / calorie / carb charts have geometry (path or columns), not an empty viewBox.
- [ ] 30-day protein heatmap has 30 cells.
- [ ] 💬 opens Brisket. Close and confirm Nutrition is still the canvas.

### 1.4 Fitness

- [ ] Hero shows last / planned / completed session with exercises, not a blank card titled “Last session”.
- [ ] Muscle maps render actual region shapes. Empty maps need a caption.
- [ ] Start workout is hidden or present for a reason. **Do not start a live session.**
- [ ] Region strength grid, week columns, focus strip, loads, recent, comparisons — open/expand anything that looks expandable.
- [ ] Polar / orbit / radial / bump / stream / pain heat / horizon / donut / gauges / year / rep-mix charts: each either draws or is honestly hidden. A `hidden` tile with no data is fine. A visible empty svg is FAIL.
- [ ] Challenge widgets rail and templates rail: open one template sheet. Maps and exercise list inside the sheet render. Close the sheet. **Do not Use today.**
- [ ] 💬 opens Chadwick.

### 1.5 Body

- [ ] Month / 6M / Year / 5Y pills refill the sections. Content changes.
- [ ] Each body section (weight, composition, measurements, whatever is there) has a chart or a labelled empty.
- [ ] Drill into **Bloods** if a tile/link exists.
  - Back returns to Body.
  - Range pills refill markers.
  - In-range summary and flagged markers are not both blank without a status.
  - Expand all / Collapse all / search filter the list.
  - Appointment summary dialog opens and closes.
- [ ] Drill into **Medical Overview** if present.
  - Search, type, provider filters change the timeline.
  - Weeks / Months / Years density changes the timeline.
  - Places and a visit card open. View on Map, if shown, morphs into a map — not a dead pill.
  - Add opens a writer. **Do not save.** Close it.
  - Detail sheet opens and the × / Back closes it.
- [ ] 💬 opens Sara.

### 1.6 Mind

- [ ] Journal nav moves between entries if more than one exists.
- [ ] Week / Month / 6M / Year pills refill every chart below.
- [ ] Mood radial, Energy Orbit, horizon strip, mood-mix donut, watchlist grid, constellation, bump, theme orbit, Vera session, insights, factor bars, chord, waffle: each draws or labelled-empty.
- [ ] Watchlist Topics / Inner presets change the grid. Adding a term is optional — do not leave a junk term.
- [ ] View as table toggles a real table.
- [ ] Hover/tap a day, streak, or theme. A detail / sheet appears and closes.
- [ ] Cross-Agent signals are readable prose or an explicit empty, not raw JSON.

### 1.7 Skincare

- [ ] AM / PM pills swap the routine cards.
- [ ] Consistency heatmap has AM/PM cells for the last 30 days.
- [ ] Routine cards show products. Open one if it expands.
- [ ] Procedure tile and procedure log render or labelled-empty.
- [ ] 💬 opens Hyaluronica.

### 1.8 Calendar

- [ ] A month/week schedule paints. Days are `dd/mm/yy` or weekday labels, not ISO.
- [ ] Click a day with events. Detail appears.
- [ ] Click an empty day. Composer / empty state appears. **Do not create an event.**
- [ ] Prev/next period changes the grid.

### 1.9 Central Node

- [ ] Today’s Status: completion ring + five live checks + prose. Markdown is rendered, not `**bold**`.
- [ ] This Week horizon has seven cells plus prose.
- [ ] This Month prose is present or labelled empty.
- [ ] Long-term stream chart draws ribbons. More reveals extra prose if present.
- [ ] Year consistency radial draws three rings or a labelled empty.
- [ ] Governance heat has a row per open item, or a labelled empty — not a blank rectangle.
- [ ] Cross-agent chord draws arcs/ribbons. Focusing a mark updates the caption.
- [ ] Recent Agent Actions lists dated lines or empty.
- [ ] Constraints `<details>` expands to real constraints.
- [ ] **Inverse links** tile lists Knowledge pages that cite a Life decision, or a fail-visible unavailable / empty. A silent blank is FAIL.
- [ ] **External URL watch** tile lists watched URLs with a status, or unavailable. Not a search-guess empty.
- [ ] Run audit is visible. Click only if it is clearly read-only; otherwise note SKIP. Do not leave an audit write behind.
- [ ] 💬 opens Hammond.

### 1.10 Shortcuts

- [ ] Promoted list and Catalog list render named shortcuts, or labelled empty.
- [ ] Opening a shortcut shows a confirm card. **Discard it.** Nothing writes.

### 1.11 Life rail previews

- [ ] Expand Teaching / Knowledge / Tasks in the Life rail. Previews show real class / note / task lines or a fail-visible “could not load”, not “Checking …” forever.
- [ ] Those preview rows navigate to the right hub page.

---

## 2. Teaching Hub — `/teaching/`

Brand click → Dashboard (`/teaching/` or `/teaching`).

### 2.1 Shared teacher chrome

- [ ] Rail search opens the command palette. Type a known lesson word. A result appears. Escape closes. Result click opens the lesson.
- [ ] Primary nav: Dashboard, Classes, Scope & Sequences, Units, Lessons, Templates, Resource Library, Trash. Click each list page.
- [ ] Your classes list shows active class codes. `+` New class opens a name modal. **Cancel.**
- [ ] Hub switcher at the bottom of the rail works.

### 2.2 Dashboard `/teaching/`

- [ ] Cover / clock / today’s classes / upcoming scheduled lessons render or labelled empty.
- [ ] Click a scheduled lesson. It opens the class or lesson, not a 404.
- [ ] Compose / schedule on a day: date chip works. **Do not save a new scheduled lesson.**

### 2.3 Classes `/teaching/classes`

- [ ] Cards or list of classes. Open one class `/teaching/classes/:id`.
- [ ] Class calendar: Day/Week/Month if offered. Click a day with a lesson and a day without.
- [ ] Schedule compose card opens. **Cancel.**
- [ ] Class homepage / heading is the year + subject, not a raw id.
- [ ] If a homepage editor exists, open it, confirm blocks render, leave without saving.

### 2.4 Scope & Sequences `/teaching/scope-sequences`

- [ ] Subject list. Open one `/teaching/scope-sequences/:subjectId`.
- [ ] Timeline / week grid renders. Drag handles may exist — **do not drag-save.** Hover is enough to see they are there.
- [ ] Units on the scope are dated `dd/mm/yy` if dates show.

### 2.5 Units `/teaching/units`

- [ ] Unit cards. Open one `/teaching/units/:unitId`.
- [ ] Lesson list inside the unit is ordered. Click a lesson.
- [ ] Compare-order / sequence controls, if present, open and close without writing.

### 2.6 Lessons `/teaching/lessons`

- [ ] Virtual list scrolls and keeps row height. It is not a blank viewport.
- [ ] Search / syllabus / health / duplicate filters change the list.
- [ ] Open a **draft** lesson `/teaching/lessons/:id` (teacher, session required).
- [ ] Open the **public student link** from that lesson (or any published one) in a way that proves `/teaching/s/lessons/:id` works.

### 2.7 Lesson editor (teacher) `/teaching/lessons/:id`

Stay on one real lesson long enough to stress the canvas.

- [ ] Title, outcomes strip, and block canvas render. Raw JSON is FAIL.
- [ ] Insert palette opens with families and icons. Icons are real PNGs, not broken. Close it without inserting.
- [ ] Click existing blocks: rich text focuses, images load, video/embed/audio have players, tables have rows, accordions expand, tabs switch, columns sit side by side, questions/flashcards/cloze/self-check are interactive, charts/diagrams/maps have geometry, card stacks swipe, collections browse, HTML apps do not explode the page.
- [ ] Alchemy Lab opens from the context bar / selection. It can close. **Do not run a live alchemist write.**
- [ ] AI panel: pick Ann, Clementine, Hammond, Clare. Portraits and names match. Composer is there. **Do not send** unless proving a dead composer; Discard any proposal.
- [ ] History / versions panel opens and closes. **Do not restore.**
- [ ] Save / Publish controls are visible. **Do not publish.**
- [ ] A4 preview opens and closes.
- [ ] Page options / cover picker open and cancel.
- [ ] Outcomes picker opens and cancels.
- [ ] Media / Drive / library pickers open and cancel. **Do not upload.**

### 2.8 Templates `/teaching/templates`

- [ ] Template cards render. Open one. Canvas is a lesson-like editor, not a 404.
- [ ] From-template create, if present, is cancellable.

### 2.9 Resource Library `/teaching/resources`

- [ ] Media grid/list renders or labelled empty.
- [ ] Open one file / preview. Close it.
- [ ] Upload / picker chrome exists and cancels.

### 2.10 Trash `/teaching/trash`

- [ ] Trashed items list or labelled empty.
- [ ] Restore / destroy ask a **confirm card**, not `window.confirm`. **Cancel.**

### 2.11 Student (public) — no session required

Use a published id from the teacher list. If none is known, try `/teaching/s/lessons/` (index) and any class code visible on the teacher Classes page.

- [ ] `/teaching/s/lessons/:id` — HTML 200, lesson paints, **no sign-in gate**.
- [ ] `/teaching/s/units/:id` — unit overview, lesson links work.
- [ ] `/teaching/s/classes/:id` — class hub, no gate.
- [ ] `/teaching/s/classes/:id/lessons/:id` — same lesson through the class path.
- [ ] Student blocks that are interactive (questions, flashcards, HTML apps) work without an operator session.
- [ ] Student chrome does not show teacher trash / publish / AI.

A student URL that redirects to sign-in is FAIL.

---

## 3. Knowledge Hub — `/knowledge/`

Brand click → Archive.

### 3.1 Archive (list)

- [ ] List virtual-scrolls. Rows have titles, not empty cards. A total wipe with no “unavailable” is FAIL.
- [ ] Search / keyword / origin filters reduce the list.
- [ ] Due-for-review strip, if present, has Again / Hard / Good / Easy. **Do not rate** unless you are happy to spend a review; prefer inspecting the buttons.
- [ ] Open one note. Hash becomes `#page/<id>`. Refresh keeps the note.
- [ ] Back returns to Archive (or Notebooks if that is where you came from).
- [ ] Pin / unpin if present. Leave pins as you found them.

### 3.2 Note reader / compose

On an existing note:

- [ ] Body is formatted markdown, not a raw JSON dump.
- [ ] Connected / wiki links render. Teaching unit and Tasks project links go to the **umbrella** paths or are clearly labelled. A primary click to `tasks-hub.adam-russell.com` is FAIL.
- [ ] External URL watch section shows statuses or “URL watch is unavailable.” Silent absence on a note that has URLs in the body is worth a FAIL if the tile exists in the template and is empty with no status.
- [ ] Attachments list: download control may need the live API — a labelled limitation is OK; a broken button with no message is FAIL.
- [ ] Edit / compose opens TipTap. Tags / origin picker open and close. **Do not save.**
- [ ] Tidy / intake, if offered, shows a review card. **Discard.**
- [ ] Capture / voice controls exist and can be cancelled. **Do not capture.**
- [ ] Reader review buttons are the kit buttons.

### 3.3 Notebooks

- [ ] Grid of notebooks. Open one. Notes inside are real. Back works.

### 3.4 Graph

- [ ] Canvas paints nodes. It is not a white empty stage with no caption.
- [ ] Switch Constellation / Show all / Universe. Each mode is visually distinct.
- [ ] Search / focus a topic. Unrelated nodes dim or leave.
- [ ] Click a node. Preview card or navigation works. Close / Back returns to the graph.
- [ ] Pan and zoom. The graph does not detach from the canvas or cover the rail.

### 3.5 Timeline

- [ ] University / chronology view paints a timeline or a labelled empty.
- [ ] Zoom / pan if present. Click an item.

### 3.6 Chat (Clementine)

- [ ] Chat rail / view opens. Clementine identity is clear.
- [ ] Composer works. **Do not send** a research query (cost). A dead composer is FAIL.
- [ ] Any overlay / note-edit card discards cleanly.

### 3.7 Podcast

- [ ] Episode list or generate chrome renders.
- [ ] Player, if an episode exists, plays/pauses. Do not generate a new episode.

### 3.8 Quiz

- [ ] Due pages / quiz start chrome renders.
- [ ] If a card is already on screen, flip / rate UI is visible. **Prefer not to rate.**
- [ ] Leaving Quiz and returning does not lose the rail highlight.

---

## 4. Tasks Hub — `/tasks/`

Brand click → Dashboard `#/board`.

Hashes are first-class. Refresh every important hash.

### 4.1 Dashboard `#/board`

- [ ] Overview stats (today / overdue / attention / projects) are numbers that link to the right views (`#/day`, `#/projects`, …).
- [ ] Board columns To do / Doing / Blocked / Done exist. Cards render.
- [ ] Open a card menu: Expand, Full page, Edit. Full page → `#/task/:id`. Back / close returns.
- [ ] Project cards: Full page → `#/project/:id`. Add-task / close-project stay behind confirm. **Cancel.**
- [ ] Refresh icon remounts without a permanent “Loading board…”.

### 4.2 Chat `#/clare`

- [ ] Picker: Clare, Hammond, Penelope, Vera. Portraits load.
- [ ] Protocol pills for Clare (morning sweep, tomorrow, …) and the ADHD set are visible and not clipped.
- [ ] Hammond / Penelope / Vera protocols appear when selected.
- [ ] Composer placeholder matches the agent. **Do not dump.** Discard any leftover confirm card.

### 4.3 Today `#/day`

- [ ] Daily dial / today list renders.
- [ ] Day / Week toggle if present changes the canvas.
- [ ] Completing a task is a write — **do not complete live work.** Opening a task page is enough.

### 4.4 Week `#/week` and Day layout `#/week?layout=day`

- [ ] Week grid paints. `#/week?date=YYYY-MM-DD` loads that week (on-screen labels still `dd/mm/yy`).
- [ ] Switch Day layout. Events sit on hours, not in a heap.
- [ ] Click an event → focus / page. Back keeps the same week.

### 4.5 Month `#/month`

- [ ] Month grid. Next/prev month. Click a day.

### 4.6 Backlog `#/list` (also tolerate `#/backlog` if it still aliases)

- [ ] List + search + pills (All / Tasks / Projects or equivalent) filter the rows.

### 4.7 Graph `#/graph` and `#/graph?mode=workstreams`

- [ ] Blockers mode: nodes and edges. Empty graph needs a caption.
- [ ] Workstreams mode is clustered differently.
- [ ] Stretch pills: Blockers, Workstreams, Universe, Orbit, Branch, Sky. Each hash loads a distinct viz.

### 4.8 Stretch viz

Do all four. These break visually more than they 404.

| Hash | Must |
|------|------|
| `#/universe` | Solar-system scene, key/legend readable, click a body |
| `#/orbit` | Orbit canvas, not a blank tile |
| `#/branch` | Branch/tree geometry |
| `#/constellation` | Sky / constellation, not the blockers graph |

### 4.9 Gantt `#/gantt` and Timeline `#/timeline`

- [ ] Bars / lanes render against dates.
- [ ] Horizontal scroll is inside the chart, not the whole hub.
- [ ] Focus query if present (`focus=task:…`) still highlights after refresh.

### 4.10 Goals `#/goals` and Someday `#/someday`

- [ ] Cards render. Open one. Delete stays behind confirm. **Cancel.**

### 4.11 Templates `#/templates`

- [ ] Task / Project / Excursion pills filter. Open one template. **Do not instantiate** unless you immediately delete a clearly-named test — prefer cancel.

### 4.12 Projects `#/projects`

- [ ] Status / Energy / Goal / Deadline grouping pills change the board.
- [ ] Open a project page. Page blocks (if any) render. Close / delete cancelled.

### 4.13 Excursions `#/excursions` and `#/excursions/new`

- [ ] List existing excursions. Open one project-backed excursion.
- [ ] New excursion page loads a template picker. **Do not create.** Back to the list.

### 4.14 Programs `#/programs`

- [ ] Cards and Table modes. Sort by Name / Month / Organiser / Level / Cost actually reorders.
- [ ] Open a program if one is clickable. View on Map if it has a venue.

### 4.15 Network `#/stress` and Corey `#/corey`

- [ ] Network / stress flags render or labelled empty. “Look with judgment” / scan control, if present, is allowed; do not leave junk flags.
- [ ] Corey page renders. Capacity share `#/capacity/<token>` — if you have no token, load `#/corey` only and note SKIP for the public share.

### 4.16 Maps `#/maps`

- [ ] Map canvas paints lines / stations / events.
- [ ] View / Edit / Export / New / Fullscreen chrome exists. **Do not create a map.**
- [ ] Open a station page `#/maps/:mapId/station/:id` and an event page `#/maps/:mapId/event/:id` from a real map (Mindworks if present).
- [ ] Planning popover / page blocks on a station open and close.

### 4.17 Search `#/search` and Properties `#/properties`

- [ ] Search returns tasks and projects. Result click opens the entity.
- [ ] Properties: domains / priorities / statuses are closed pills, not a colour-picker free-for-all. **Do not rename live properties.**

### 4.18 Entity pages

- [ ] `#/task/:id` — title, properties, page blocks, back to the previous view.
- [ ] `#/project/:id` — same.
- [ ] Unknown hash `#/definitely-missing` — falls back to Board, does not crash, does not silently become Maps.

---

## 5. Cross-hub jumps

From each hub, using rail switcher **and** mobile More → Hubs:

- [ ] Life → Teaching → Knowledge → Tasks → Life. Each landing page is that hub’s home, signed in, correct `data-hub`.
- [ ] A Knowledge connected link to a Teaching unit opens `/teaching/…`, not a retired host.
- [ ] A Knowledge connected link to a Tasks project opens `/tasks/#/project/…`.
- [ ] Life Home hub-pulse cards match those same umbrella paths.
- [ ] After the loop, Back stack is not a trap of blank shells.

Out of scope: widgets on `jade-melomakarona-ea20fe`.

---

## 6. Agent surfaces (cheap)

This is **not** the agent-context-integrity suite. Do not run long protocols. Do prove the surface is alive.

| Surface | Open | Must |
|---------|------|------|
| Life Chat | Picker | All ten portraits; each selection restyles the thread chrome |
| Life domain 💬 | Nutrition / Fitness / Body / Skincare / Central Node | Correct default agent |
| Teaching AI panel | Lesson editor | Ann / Clementine / Hammond / Clare |
| Knowledge Chat | Rail Chat | Clementine shell |
| Tasks Chat | `#/clare` | Clare / Hammond / Penelope / Vera + protocol pills |
| Life Shortcuts | Catalog | Named shortcuts listed |
| Life Home Clare dump | Composer | Date chip + Dump/Schedule present; do not submit |

If a picker is empty, an avatar 404s, or the panel is the previous agent’s colour/name, FAIL.

---

## Evidence rules

- **PASS** — you clicked the action and saw the outcome.
- **FAIL** — broken behaviour or visualisation, with what you clicked and what you saw.
- **BLOCKED** — no session, no network, or the page never appeared. Not a pass.
- **SKIP** — the control does not exist on this build (say so). A control that exists and is blank is FAIL, not SKIP.
- **empty-by-design** — allowed only with a visible empty caption.

Never report `NOT_RUN` as PASS. Never claim a page works from code inspection.

Must / Must-not / Verify for each FAIL:

- **Must** — the user-visible outcome that is missing
- **Must-not** — the “looks done” lie (blank tile, 200, spinner)
- **Verify** — the click path you used

---

## Report template

Save as `docs/stress-test/reports/YYYY-MM-DD.md`:

```markdown
# Stress test — YYYY-MM-DD

## Verdict
CLEAN | ISSUES FOUND | BLOCKED

## Environment
- Origin: https://life-hub.adam-russell.com (or local — say which)
- Signed in: yes/no
- Desktop viewport:
- Phone viewport:
- Commit / `main` SHA:

## Counts
- Pages walked:
- PASS:
- FAIL:
- BLOCKED:
- SKIP:

## Failures (proven)
### F1 — <hub> / <page> / <control>
- Must:
- Must-not:
- Verify: <click path>
- Evidence: <what rendered>
- Screenshot path (optional):

## Empty-by-design (not failures)
-

## Blocked / skipped
-

## Cross-hub
- Switcher loop:
- Stale hosts found:

## Kit chrome
- Any hub still has favicon / `.sign-in__mark` / title-row `.hub-mark` (must be none): yes/no
- Phone rail hidden at 390: yes/no

## Notes for Cursor
1.
2.
3.
```

Do not open a PR. Do not “just fix” a failure unless Adam’s prompt for that turn says to implement fixes.

---

## Inventory (keep this file honest)

If a rail item or hash exists in the product and is missing here, add it in the same report’s Notes and treat the omission as a miss in the sweep.

**Life sections:** Home, Chat, Nutrition, Fitness, Body, Bloods, Medical Overview, Mind, Skincare, Calendar, Central Node, Shortcuts.

**Teaching routes:** `/`, `/sign-in`, `/classes`, `/classes/:id`, `/scope-sequences`, `/scope-sequences/:subjectId`, `/units`, `/units/:unitId`, `/lessons`, `/lessons/:id`, `/templates`, `/resources`, `/trash`, `/s/lessons/:id`, `/s/units/:id`, `/s/classes/:id`, `/s/classes/:id/lessons/:id`.

**Knowledge views:** Archive, Notebooks, Graph (constellation / show-all / universe), Timeline, Chat, Podcast, Quiz, note `#page/:id`, Compose.

**Tasks hashes:** `#/board`, `#/clare`, `#/day`, `#/week`, `#/week?layout=day`, `#/month`, `#/list`, `#/graph`, `#/graph?mode=workstreams`, `#/gantt`, `#/timeline`, `#/universe`, `#/orbit`, `#/branch`, `#/constellation`, `#/goals`, `#/someday`, `#/templates`, `#/projects`, `#/excursions`, `#/excursions/new`, `#/programs`, `#/stress`, `#/corey`, `#/maps`, `#/maps/:mapId/station/:id`, `#/maps/:mapId/event/:id`, `#/search`, `#/properties`, `#/task/:id`, `#/project/:id`, `#/capacity/:token`.
