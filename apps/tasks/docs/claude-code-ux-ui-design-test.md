# Tasks Hub — Claude Code UX/UI design test

**How to use:** paste everything below the line into Claude Code. The first action is to open the **website**, not to find a git repo. This is a **design / usability audit**, not the functional regression in `docs/chatgpt-live-regression-test.md`.

**Filled run:** [`docs/claude-code-ux-ui-design-report.md`](claude-code-ux-ui-design-report.md) — 2026-08-22 production (`tasks-api`). Use that file to implement; re-run this prompt only for a later pass.

The site has real usability and design problems. The job is to use it as Adam would, collect every specific defect, and return a technically specific report another agent can implement from.

Do not fix anything in the same run unless Adam explicitly asks. Report first.

---

# Prompt — Tasks Hub UX/UI design audit for Claude Code

You are a senior product designer. Critically evaluate **the live Tasks Hub website as a daily user**, then produce a technically specific report that can guide a later improvement pass.

**First action:** open the website in a browser. Sign in. Start using it.

Do **not** locate, clone, or worktree a git repo. Do **not** say the working directory is not a git repo and then search the disk. This prompt is self-contained. Kit rules are in §2. File paths in the report are hints for a later implementer, not a reason to find source now.

- If `http://localhost:5175` already loads Tasks Hub, use that.
- Otherwise use `https://tasks-api.adam-russell.com` (preferred production) or `https://tasks-hub.adam-russell.com`.
- Passphrase: `tasks-hub-local` (not `teaching-hub-local`).
- Never look under `~/Documents` or `~/Desktop`. Never `git clone`. If you later need source and it is not already this session’s cwd, the only allowed existing path is `~/Projects/tasks-hub` — and only after the full site pass. If that folder is missing, skip source and finish the report from the live UI.

Adam is the only user. The hub is a personal task / project manager (Clare DeMind), sibling to Teaching, Life, and Knowledge. It must feel like the same family — Cotton Glass, Teaching-density tiles — not a one-off PM tool.

This is **not** a functional regression (auth, API 404s, hung loaders). Those belong in `docs/chatgpt-live-regression-test.md`. You may note a blocker if a page never paints, then move on. Your job is **use, look, copy, information architecture, interaction, and kit compliance**.

Do not stop at the first problem. Finish every surface. Do not invent a new palette, type scale, rail, or button system in the report. Every fix hint must name an existing kit token, snippet, or class from §2.

## 0. Setup

Open a browser. Go to the site. That is setup.

| Environment | URL | When to use |
|-------------|-----|-------------|
| Local | `http://localhost:5175` | Only if it is already running and shows Sign in / Board |
| Production SPA + API | `https://tasks-api.adam-russell.com` | Default if local is not up |
| Production Pages | `https://tasks-hub.adam-russell.com` | Fallback; same app, API is on tasks-api |

Do not run `npm run dev`, `git status`, or `find` to hunt for the project. If local is down, use production.

Viewports (do all three after sign-in):

1. Desktop — 1440×900
2. Laptop — 1280×800 (rail + 4-column board under pressure)
3. Phone — 390×844

Stay signed in. After creating or editing on Board, a brief full-screen cube load is **current product behaviour** — log it as a UX defect if it feels like a hang, but do not treat it as a crash.

Optional, **after** the rail sweep only, and **only** if this session’s cwd already is the Tasks Hub repo (you can see `design-kit/AGENTS.md` without searching): pin defects to `src/…` files. Otherwise name the likely file from memory of this prompt (`src/shell/shell.ts`, `src/views/board.ts`, …) and skip reading source.

## 1. How to evaluate

For every surface, do this loop:

1. **Arrive as a user.** What is this page for in the next ten seconds? Can you tell without reading supporting copy?
2. **Do the obvious job.** Add, filter, open, complete, delete, search, switch mode. If the job is missing, that is a defect.
3. **Look.** Alignment, density, overflow, clipped labels, identical icons, login-styled fields on the canvas, hex that is not a token, `YYYY-MM-DD` in the UI.
4. **Cross the kit (§2).** If the UI invents a control the kit already has, name the kit class that should replace it.
5. **Pin the defect** with hash, selector, quoted copy, and a likely `src/…` path. Do not leave the website to go find a repository. Read source only if it is already this cwd.

Record defects while they are in front of you. Do not wait until the end and reconstruct from memory.

Severity:

| Grade | Meaning |
|-------|---------|
| **S1** | Blocks the daily job (cannot add / find / complete / leave a page; unusable on phone) |
| **S2** | Wrong chrome or IA that trains the wrong habit (kit violation, missing edit, confirm off-screen, rail unusable) |
| **S3** | Visible polish / consistency (copy, density, date format, duplicate classes) |
| **S4** | Nice-to-have / stretch |

Prefer fewer, sharper defects over a laundry list of taste notes.

## 2. Locked standards (fail if broken)

These are not opinions. They are the kit. Cite the rule in the defect.

### Chrome

- `<html data-hub="tasks">` — Teaching frost, not Knowledge/Life flat glass. Do not retune overlays in hub CSS.
- Page header: uppercase eyebrow → `h1` → optional supporting → actions on the right.
- Supporting copy is for Adam, not for the implementer. “Teaching-density tiles” and “depends_on edges” fail.
- Left rail: `--rail-width: 15rem`. Brand is `<a class="hub-rail__brand" href="#/board">Tasks Hub</a>`, CSS uppercase, `--text-2xs`. Brand click always returns to Board.
- Every primary destination is `.hub-rail__link`: **distinct** 18px outline icon + title-case label. **No** one shared path for every item. **No** coloured dots. **No** `text-transform: uppercase` on item labels.
- Eighteen flat destinations is an IA problem. Kit allows `.hub-rail__section` (Home, Plan, Views, Work, Network, Tools). If the rail scrolls on a laptop, say so and propose a section map — do not propose a narrower rail.
- Refresh and sign out are `.hub-icon-btn` icons inside `.hub-utilities` at the **canvas** top-right, then `.hub-mark` (`icons/tasks.svg`). Copy `design-kit/snippets/hub-utilities.html`. An empty 2rem button with `aria-label="Sign out"` and **no SVG** is a fail. A missing Refresh control is a fail. Labelled pill Sign out / Refresh is a fail.
- Hub tile is **not** on the rail.

### Forms and filters

- Gate only: `.sign-in` / `#sign-in-passphrase` / `.sign-in__input` (see `snippets/sign-in.html`).
- Canvas search, scope, and mode controls use `.hub-search`, `.hub-filter`, `.hub-pills` — **not** `.sign-in__input` or `.quick-add__select`. `AGENTS.md` already states this.
- Buttons: `.btn` + `--primary` / `--secondary` / `--ghost` / `--decisive` only.
- Agent / destructive writes: propose → `.confirm-card` → apply. Confirm must be **visible without hunting** (not a card appended below a long board). `window.prompt` / `window.confirm` / `alert` fail.
- Focus rings are Wave (`--wave`). High Sea is never a focus colour and never body text on orange.

### Dates and type

- Calendar days in the UI are `dd/mm/yy` via `formatDisplayDate`. `YYYY-MM-DD` in ledes, chips, pinch summaries, StressFlag text, or capacity cells fails. Month-only labels and `<input type="date">` values may stay ISO internally.
- Do not call `toLocaleDateString` for a **day**. Weekday-only or month+year labels are allowed.
- Type is Inter 400/500/600/700 and the token scale (`--text-2xs` … `--text-2xl`). Raw `11px` / `12px` / `font-weight: 500` in hub CSS fails. `font-family: Inter, system-ui` fails — use `--font-ui`.
- No new hex, no `rgba(168, 90, 12, …)` when `--high-sea-ink` / `--warning-surface` exist. Canvas 2D / export HTML that hard-codes `#17375e` must use the token equivalent (`--navy`, `--wave`, `--ink`, `--danger`).

### Interaction

- Board / Today / Backlog: a task is not done when the only actions are Start / Done / Delete. Missing **open / edit** (title, due, domain, project, notes) is a product hole — log it.
- Quick-add that silently sets `due_date` to today (so the task never appears on Backlog) is a UX defect. Name `renderQuickAdd` in `src/views/board.ts` / `src/views/dashboard.ts`.
- Full-view remount after every mutation (Saving… then the whole Board rebuilds) is a UX defect if it feels like a reload.
- Unknown hash (`#/nope`) is Page not found, not a silent Board rewrite.

## 3. Full-site script

Prefix any record you create `[UX-AUDIT]`. Discard destructive confirms on real work (MindWorks, Masters). Delete `[UX-AUDIT]` items at the end.

### 3.1 Sign-in (`/`)

Use the locked gate as the reference.

- Structure: tile `.sign-in__mark` (`icons/tasks.svg`) → brand `Tasks Hub` → title `Sign in` → label `Passphrase` → `#sign-in-passphrase` → submit `Sign in`.
- **No** supporting line, purpose copy, privacy note, or extra row.
- Enter submits (`<form novalidate>`, `type="submit"`). Empty → **Enter your passphrase.** Wrong → **Invalid passphrase**.
- Judge the card as a user: wash, glass, focus, keyboard, phone width.

### 3.2 Shell (every signed-in page)

Stay on Board first, then keep judging the chrome as you move.

- Skip link: Tab from the document start. `.skip-link` must appear and move focus to `#hub-main`. Two conflicting skip-link rules live in `src/styles/hub.css` and `src/styles/views.css` — say which one wins and whether focus works.
- Rail: count items, screenshot the full rail including overflow. Are icons identical (`src/shell/shell.ts` `railIcon()`)? Are there sections? Does `aria-current="page"` match the hash?
- Header vs rail names must not fight (examples that already exist: rail **Network** vs title **StressFlags**; rail **Corey** vs title **Corey capacity**; rail **Sky** vs constellation copy).
- Utilities: Refresh present and wired? Sign out has the kit SVG? Tile after utilities?
- Dual classes `.primary-nav__link.hub-rail__link` plus leftover `.primary-nav` rules in `hub.css` — report whether they override `rail.css` (min-height 2.75rem vs kit 2.5rem, extra hover paint).

### 3.3 Board — `#/board` (home)

Daily driver. Be harsh.

- Lede: open-count / project-count / **date format**.
- Scope: `.hub-filter` reads as `Scope` + current value, not `ScopeAll tasks`.
- Quick-add: field class, domain control, whether due is implied, whether the new card is findable.
- Four columns (To do / In progress / Blocked / Done). Empty state is a real sentence, not `—`, if that reads unfinished.
- Card: domain / priority / due chips; Start / Done / Reopen / Delete. Can you open the task? Change the due date? Assign a project?
- Delete: confirm card — Discard then Confirm on `[UX-AUDIT]`. Is the card on screen or below the fold?
- After Add / Start / Done: Saving… feedback, remount, cube load. Time-to-usable.
- 1440 vs 1280 vs 390: do four columns collapse (`views.css` `@media (max-width: 960px)`), or do cards become unreadable strips?

### 3.4 Clare — `#/clare`

- Form: title / domain / priority / due / Ask Clare. Kit fields or sign-in clones?
- Proposal bubble: framework, reasoning, estimate override, Propose write → confirm.
- “Just show the framework” toggle: does it do what it says?
- Framework library + calibration blocks: useful or debug dump?
- Copy voice: Clare should sound like Clare, not a schema comment.

### 3.5 Graph — `#/graph`

- `.hub-pills` Blockers / Workstreams with pressed state (`aria-pressed` + `.is-active`).
- `.hub-search` filter. Select a node. Preview card.
- Canvas: unlabeled dots, hardcoded hex in `src/views/graph.ts` (`#17375e`, `#376fb7`, `#244f7c`, `#13233a`), unreadable pile of labels.
- Keyboard: `.viz-alt` list must reach the same preview as the canvas.

### 3.6 Maps — `#/maps`

- Must be Maps (eyebrow **Pathways**), not Board columns.
- Transit SVG vs empty/new-map. View / Edit pills.
- Can a new user add a line / station without a manual? Overlap, tiny type, High Sea used as a selection stroke (allowed as accent, not as body text).

### 3.7 Gantt — `#/gantt`

- Project `.hub-filter`. Axis ticks via `formatTick` / `formatDisplayDate`.
- Row labels clipped? Dependency lines readable? Today marker?
- Raw `font-size: 11px` / `12px` on `.gantt-tick` / `.gantt-row-label` — tokenise or fail S3.

### 3.8 Orbit / Branch / Sky — `#/orbit` `#/branch` `#/constellation`

Stretch, but they are in the rail, so they must be usable.

- Orbit: Adam at centre, urgency = distance, click planet → preview. Labels overlapping? Motion vs `prefers-reduced-motion`?
- Branch: one-project filter, parent tree + `depends_on`. Unreadable pile fails. Preview on click.
- Sky: constellation, **not** a task list. Headline readable? Hardcoded haze `rgba(168, 90, 12, 0.12)` in `views.css`?

### 3.9 Today / Week / Month / Backlog

`#/day` `#/week` `#/month` `#/list`

- Today: adaptive domain lede date format; pinch / due-soon strips; Negotiate with Clare; quick-add; Done. If Done opens `window.prompt` for actual minutes (`toggleDone` in `dashboard.ts`), that is an S2 kit fail — it should be a confirm card or inline field.
- Week: seven columns on desktop, stack on small screens. Pinch outline on overloaded days. **Click a chip** — preview with title, due (`dd/mm/yy`), Done. Dead focus-only chips fail.
- Month: milestones + key dates, not a dead empty state if seed data has dates this month. Is a list acceptable vs a month grid? Say so as IA, not as a kit violation.
- Backlog: open undated tasks. Lede that says “filterable later” is unfinished product copy. Domain / tag / priority filters belong here (spec §6.1) — missing filters are a defect. Quick-add that stamps today as due undermines this page.

### 3.10 Projects / Excursions / Templates

`#/projects` `#/excursions` `#/templates`

- Projects: stalled vs active vs closed. Reason field + Frankenstein select must not look like the login card. Revive / Frankenstein / Bury → confirm. Close project + retrospective. Confirm visibility.
- Excursions: template / title / event date / group. Preview dates `dd/mm/yy` and match the picker. Review & create → confirm (Cancel/Discard first). Drafts readable. Confirm uses kit `.confirm-card` eyebrow + title + supporting, not a one-line custom card (`showConfirm` in `excursions.ts`).
- Templates: Task / Project / Excursion. Use → confirm → land on Today or Projects. Excursion **Use** that only hashes to `#/excursions` with no prefill is a broken handoff.

### 3.11 Network / Corey / Search

`#/stress` `#/corey` `#/search`

- Network: leaves “Scanning…”. Flags have texture, not “things are busy.” Rail label vs page title vs supporting.
- Corey: leaves “Loading capacity…”. Headlines + 14-day grid, no task titles. Share field class. Copy link. Public `#/capacity/<token>` — still no task titles; invalid token is unknown/rotated. **Do not rotate** a production link unless you will record the new URL.
- Search: `.hub-search` (not a naked input missing the snippet label). 1 character: what happens? 2+ `Mind` → MindWorks. `zzzznope` → **No matches.** Done / Delete on a `[UX-AUDIT]` result through confirm.

### 3.12 Unknown route + scroll

- From a long page (Projects), jump to Orbit. Heading must be in view (`window.scrollTo` + canvas scroll reset already exist — verify they work).
- `#/definitely-missing` is Page not found + Back to Board, not Board columns.

### 3.13 Phone (390×844)

`chrome.css` stacks `.hub-layout` to one column under 720px. `hub.css` turns `.primary-nav` into a horizontal scroller and **keeps the dark rail visible**.

Judge as a user:

- Can you reach every destination without a 15rem navy slab eating the screen?
- Do Board columns / Week columns / Gantt become a usable stack?
- Are header title + utilities + tile wrapping into a mess?
- 44px targets? Horizontal overflow?

Propose a kit-legal mobile treatment (full-width top bar + horizontal `.hub-rail__link` row, or a disclosed menu). Do **not** propose shrinking `--rail-width`.

## 4. Cross-cutting passes (after the rail sweep)

Walk these once across the whole site:

1. **Information architecture** — which rail items are pages a daily user needs, which are stretch, which should be modes/pills on another page (Board view: Day/Week/Month/List; Graph already does this). Recommend a sectioned rail. Do not delete stretch pages; relocate them.
2. **Task object** — there is no task detail / edit surface. List every place a user would expect to open a task (Board card, Week chip, Search row, Orbit planet, Gantt bar) and what happens instead.
3. **Copy** — header supporting, ledes, empty states, confirm eyebrows. Rewrite examples in Adam’s voice (short, concrete, no schema names).
4. **Kit class misuse** — table of `sign-in__input` / `quick-add__select` / missing `hub-pills` / missing utilities SVG, with file + replacement class.
5. **Token / hex leak** — `src/views/graph.ts`, `src/domain/maps.ts` export HTML, `src/styles/views.css` (orbit/gantt px, constellation haze).
6. **Accessibility** — skip link, focus-visible Wave, icon-only buttons have visible glyphs + `aria-label`, confirm `role="region"`, viz has a keyboard list, contrast on chips and rail.
7. **Motion** — cube boot, orbit spin, constellation twinkle vs `prefers-reduced-motion` (already partially handled in `views.css`).

## 5. Safety

- Prefix new records `[UX-AUDIT]`.
- Discard confirms on real projects. Do not bury MindWorks. Do not rotate Corey in production.
- Delete `[UX-AUDIT]` tasks before you finish.
- Do not commit code, restyle tokens, or “just fix the obvious ones” in this run.

## 6. Report (return only this)

```md
# Tasks Hub UX/UI design report

- Date:
- Host + build (local / tasks-api / tasks-hub):
- Viewport(s):
- Kit: used §2 of this prompt (do not list disk files you went hunting for)
- Surfaces visited: (list hashes; none skipped)

## User verdict
Five to eight sentences. What is it like to run a real day on this hub? What is the first thing that should change?

## IA recommendation
Proposed rail sections and what becomes a pill / filter on an existing page. No new colours.

## Defects
### D1 — short title
- Severity: S1–S4
- Surface: `#/…` + user job that failed
- Seen: what Adam sees (quote the copy / describe the layout)
- Expected: kit rule or spec behaviour (quote the rule)
- Actual: selector + computed issue
- Code: `path/file.ts` symbol or CSS rule
- Fix: one concrete change (class, token, snippet, or interaction). No new palette.

(Continue D2…)

## Kit class / token table
| Location | Current | Should be |
|----------|---------|-----------|
| Board quick-add input | `.sign-in__input` | canvas field using kit search/filter patterns, not the gate |
| … | | |

## Copy rewrites
| Surface | Current | Proposed |
|---------|---------|----------|
| Board supporting | Tasks and projects as Teaching-density tiles. | … |

## Out of scope / later
Stretch or backend items. Do not hide S1/S2 here.

## [UX-AUDIT] leftovers
none / list
```

Rules for the report:

- Every defect is implementable without a design meeting.
- Prefer `design-kit/` classes and tokens over new CSS.
- If two defects share a cause (e.g. `renderQuickAdd` used on Board and Today), write one defect and list the call sites.
- Screenshots optional; selectors are required. File paths may be the likely `src/…` hint from this prompt.
- Return **only** the filled report.
