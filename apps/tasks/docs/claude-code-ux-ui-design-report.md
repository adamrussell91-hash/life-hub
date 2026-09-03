# Tasks Hub UX/UI design report

Filled 2026-08-22 Claude Code run against production (`tasks-api.adam-russell.com`), using the prompt in `docs/claude-code-ux-ui-design-test.md`. Filed here so a later implementer can work defect-by-defect. D17 (production QA leftovers) is data cleanup — do not delete those records without Adam.

- Date: 2026-08-22
- Host + build: production (tasks-api.adam-russell.com — local :5175 was not running)
- Viewport(s): 1440×900 (desktop), 375×812 (mobile). Laptop 1280×800 not separately re-tested beyond desktop findings — see note in Out of scope.
- Kit: used §2 of this prompt
- Surfaces visited: `/` (sign-in), `#/board`, `#/clare`, `#/graph`, `#/maps`, `#/gantt`, `#/orbit`, `#/branch`, `#/constellation`, `#/day`, `#/week`, `#/month`, `#/list`, `#/projects`, `#/excursions`, `#/templates`, `#/stress`, `#/corey`, `#/capacity/<valid-token>`, `#/capacity/<invalid-token>`, `#/search`, `#/definitely-missing` — none skipped.

## User verdict

Running a real day on this hub is workable but not trustworthy. The single worst moment: I added a task from Backlog — the one page whose entire job is "hold tasks with no due date" — and it silently stamped today's date on it and made it disappear from that same page immediately, with no way to refresh and check. I only found it again through Search and the raw API. That single bug (a shared quick-add helper that always sets `due_date = today`) quietly breaks Board, Backlog, and indirectly explains why I found three duplicate "Ethics Olympiad" admin-task sets sitting in real project data — someone tried the add again because nothing seemed to happen. Add a native `window.prompt()` that still marks a task **done** even when you hit Cancel, a Sign Out button with no icon in it, a Refresh control that doesn't exist anywhere, and a phone layout where Board and Week just run 1450px off the right edge of a 375px screen, and this doesn't yet feel like the same trustworthy family as Teaching/Life/Knowledge. The single highest-leverage fix: stop `renderQuickAdd`'s helper from defaulting `due_date` to today, and give every long page a working Refresh button — those two together would have prevented four of the sharpest defects below.

## IA recommendation

Fold the 18 flat rail items into the kit's own `.hub-rail__section` groups:

- **Home** — Board
- **Plan** — Clare, Templates
- **Views** — Today, Week, Month, Backlog, Graph, Gantt (all lenses over the same task data — Day/Week/Month/List already behave like modes of one view)
- **Work** — Projects, Excursions
- **Network** — Network (StressFlags), Corey
- **Tools** — Maps, Search

Orbit, Branch, and Sky are genuinely stretch — don't delete them, but they don't earn a top-level rail slot each. Graph already proves the pattern (`.hub-pills` for Blockers/Workstreams): fold Orbit/Branch/Sky in as three more pills on the same Graph page ("Blockers / Workstreams / Orbit / Branch / Sky"), filed under Views. That drops the rail from 18 flat items to 6 sections containing ~14 destinations, and stops the rail from scrolling on laptop width. No new colours, no new rail width.

## Defects

### D1 — Quick-add's due-date-today stamp makes new tasks vanish from the page you added them on
- Severity: S1
- Surface: `#/list` (Backlog) and `#/board`; user job that failed: "add a task and see it where I expect it"
- Seen: On Backlog — whose own lede reads "Open tasks without a due date" — I added "[UX-AUDIT] backlog test". The POST body confirmed `"due_date":"2026-08-22"` (today) even though the form has no date field. The task never appeared on Backlog, not even after a full page reload. The identical thing happened on Board: added "[UX-AUDIT] test task", `due_date` came back as today, the card never rendered in "To do," and the lede stayed at "20 open in scope" instead of 21 — through a hard reload. It only became visible on Board several navigations later.
- Expected: "Quick-add that silently sets due_date to today (so the task never appears on Backlog) is a UX defect." Backlog's own copy promises no-due-date tasks; Board's "All tasks" scope should show a task the instant it's created.
- Actual: `renderQuickAdd`'s shared submit handler always sends today's ISO date regardless of page; the created-row is provably absent from the DOM and from the lede count immediately after (verified via `/api/tasks` — task existed server-side with 23/23 total while only 22 cards rendered).
- Code: `src/views/board.ts` / `src/views/dashboard.ts` `renderQuickAdd` (Board, Backlog, and Clare's form all share the same "always stamp today" defect — see D2 for the missing-Refresh half of this story).
- Fix: Quick-add should omit `due_date` unless the user sets one. Backlog and Board need to re-render (or re-fetch) immediately after the POST resolves, not rely on the next full navigation.

### D2 — No Refresh control exists anywhere in the app
- Severity: S1
- Surface: shell-wide, `.hub-utilities` on every page
- Seen: `.hub-utilities` contains exactly one child: `<button class="hub-icon-btn" aria-label="Sign out" title="Sign out"></button>`. No second icon button exists in the DOM at all.
- Expected: "Refresh and sign out are `.hub-icon-btn` icons inside `.hub-utilities`... A missing Refresh control is a fail."
- Actual: Confirmed via `document.querySelector('.hub-utilities').outerHTML` — one button, no Refresh sibling, on Board and every other page checked.
- Code: shell utilities render (`src/shell/shell.ts`, wherever `.hub-utilities` is built).
- Fix: Add a Refresh `.hub-icon-btn` (kit icon) that re-fetches the current view's data. This is the direct mitigation for D1 — without it, a user who just added a task has no way to confirm it worked short of reloading the whole app.

### D3 — Sign out button is empty; no icon, no visible glyph
- Severity: S2
- Surface: shell-wide, `.hub-utilities`
- Seen: `<button type="button" class="hub-icon-btn" aria-label="Sign out" title="Sign out"></button>` — a 32×32px (2rem) box with nothing inside it. Visually it renders as blank space next to the Tasks Hub mark.
- Expected: "An empty 2rem button with `aria-label="Sign out"` and no SVG is a fail." "Copy `design-kit/snippets/hub-utilities.html`."
- Actual: Confirmed via `outerHTML` — zero child nodes, no `<svg>`.
- Code: shell utilities render, same component as D2.
- Fix: Insert the kit's sign-out SVG per `hub-utilities.html`.

### D4 — Cancelling the native `window.prompt()` on "Done" still completes the task
- Severity: S1
- Surface: `#/day` (Today), "Done" action
- Seen: Clicking Done on a Clare-estimated task opens `window.prompt('How long did "..." actually take? (minutes, estimate was 55)', '55')`. I hit Cancel (prompt returns `null`). The task was marked done anyway: `"status":"done"`, `"completed_at":"2026-08-22T04:29:44.939Z"` set, with `"actual_duration":null`.
- Expected: "If Done opens `window.prompt` for actual minutes (`toggleDone` in dashboard.ts), that is an S2 kit fail." A cancelled native dialog should abort the action, not partially apply it.
- Actual: verified via direct `/api/tasks` fetch before/after; `window.prompt` was patched to confirm it fired and returned `null`, yet the task still transitioned to done.
- Code: `toggleDone` in `src/views/dashboard.ts`.
- Fix: Replace `window.prompt` with a `.confirm-card` (minutes as an inline field, matching the pattern already used elsewhere for confirm/apply). Cancelling must leave `status` unchanged.

### D5 — No task detail/edit surface anywhere in the app
- Severity: S1
- Surface: `#/board`, `#/day`, `#/week`, `#/search`, `#/graph`, `#/gantt` — every place a task appears
- Seen: Every task card/chip/row I found offers only Start/Done/Delete (or Reopen/Delete). Nowhere can title, due date, domain, project, or notes be changed after creation.
- Expected: "A task is not done when the only actions are Start / Done / Delete. Missing open / edit... is a product hole."
- Actual: confirmed across Board cards, Today cards, Week's chip preview (title/due/Done only), Search results, Graph's preview aside — none open an editable form.
- Code: Board card render (`src/views/board.ts`), Today card render (`src/views/dashboard.ts`), Week preview (`src/views/week.ts` or similar) — one shared fix point if a task-detail component is introduced.
- Fix: Add a task-detail/edit surface (even a `.confirm-card`-style inline panel) reachable from every one of these; wire "open"/click-title to it everywhere task titles currently do nothing.

### D6 — Maps "+ Line / + Program / + Competition" produce zero feedback
- Severity: S1
- Surface: `#/maps`, Edit mode; user job "add a line/station" failed entirely
- Seen: Clicking any of the three buttons in Edit mode does nothing observable — no modal, no dialog, no inline form, no new element in the SVG, no toast.
- Expected: "Can a new user add a line / station without a manual?" implies some visible affordance must appear.
- Actual: confirmed via DOM diff (`dialogCount: 0`, no new `<line>`/`<path>` elements, no "Add line" text anywhere) after clicking all three buttons.
- Code: `src/views/maps.ts` (or `src/domain/maps.ts`) edit-mode button handlers.
- Fix: At minimum, open a `.confirm-card`-style inline form for name/lead time before writing; right now the buttons are indistinguishable from disabled.

### D7 — "Close project" is a dead action
- Severity: S2
- Surface: `#/projects`, "Term 2 marking wrap" (status "Finished — due for retrospective")
- Seen: Clicking "Close project" triggers background re-fetches (`POST /api/stall`, `GET /api/projects`, `GET /api/reviews`) but produces no visible retrospective form. `GET /api/reviews` returned `{"reviews":[]}` — nothing was created. The confirm container that should hold this flow is `<div class="stall-confirm"></div>` — present in the DOM, but empty.
- Expected: "Close project + retrospective. Confirm visibility."
- Actual: verified via network log + DOM inspection; project status and Close button were unchanged afterward.
- Code: Projects close/retrospective handler (`src/views/projects.ts`, `.stall-confirm` container).
- Fix: Populate `.stall-confirm` with the retrospective `.confirm-card` (planned-vs-actual, reason) on Close project click; currently it renders empty.

### D8 — Excursion template "Use" doesn't hand off any data
- Severity: S2
- Surface: `#/templates` → Ethics Olympiad excursion template → `#/excursions`
- Seen: Clicking "Use" on the Ethics Olympiad project/excursion template navigates to `#/excursions`, but the "Excursion title" field is empty (`value: ""`) — no template, date, or title carried over.
- Expected: "Excursion `Use` that only hashes to `#/excursions` with no prefill is a broken handoff."
- Actual: confirmed via `location.hash === '#/excursions'` and reading the title input's `.value` immediately after — empty.
- Code: Templates "Use" handler for excursion-type templates (`src/views/templates.ts`).
- Fix: Pass the template's defaults through to the Excursions form (template select + any default lead-time title) instead of a bare hash change. (Task-template "Use" is fine by contrast — it shows a proper `.confirm-card` and lands correctly on `#/day` after confirming.)

### D9 — All 18 rail icons are the exact same glyph
- Severity: S2
- Surface: left rail, every page
- Seen: Every `.hub-rail__link svg` has identical inner markup: `<path d="M4 5h16v14H4zM8 9h8M8 13h6"></path>` (a generic document icon) for Board, Clare, Graph, Maps, Gantt, Orbit, Branch, Sky, Today, Week, Month, Backlog, Projects, Excursions, Network, Corey, Templates, and Search alike.
- Expected: "Every primary destination is `.hub-rail__link`: distinct 18px outline icon + title-case label."
- Actual: confirmed programmatically — 18 links, 1 unique icon path.
- Code: `railIcon()` in `src/shell/shell.ts`.
- Fix: Give `railIcon()` a real per-route icon map instead of one fallback glyph.

### D10 — `.primary-nav` leftover rules fight the rail kit, on desktop and mobile
- Severity: S2
- Surface: left rail (desktop), horizontal nav strip (mobile, <720px)
- Seen: Desktop — every `.hub-rail__link` computes `min-height: 44px` (2.75rem) instead of the kit's 2.5rem, because elements carry both `.primary-nav__link` and `.hub-rail__link`. Mobile (375px) — the same dual-class nav becomes a horizontal scroller where **each link's rendered width equals the full container width**, i.e. one destination fills the whole screen; reaching item 18 means swiping the strip 18 times.
- Expected: "Dual classes `.primary-nav__link.hub-rail__link` plus leftover `.primary-nav` rules in hub.css — report whether they override rail.css (min-height 2.75rem vs kit 2.5rem, extra hover paint)."
- Actual: computed styles confirmed 44px on desktop; mobile link `getBoundingClientRect().width` matched the nav container's full scrollWidth/18.
- Code: `src/styles/hub.css` leftover `.primary-nav` rules vs `src/styles/rail.css`.
- Fix: Delete the leftover `.primary-nav` block; let `.hub-rail__link` alone define both the desktop 2.5rem height and a compact (not full-width) mobile chip.

### D11 — Board and Week don't stack on phone; ~1450px horizontal overflow at 375px
- Severity: S1
- Surface: `#/board`, `#/week`, phone (375×812)
- Seen: At a true 375px CSS viewport (`document.documentElement.clientWidth === 375`), `document.documentElement.scrollWidth` is 1827px on both Board and Week — a 1452px horizontal overflow. Visually, only the "To do"/Mon column is on-screen; Blocked/Done (Board) and Thu–Sun (Week) run off the right edge with no visual hint to scroll.
- Expected: "Do Board columns / Week columns / Gantt become a usable stack?" and the phone section's "views.css `@media (max-width: 960px)`" stacking rule.
- Actual: measured via `clientWidth`/`scrollWidth`, confirmed with screenshots showing clipped "Done" column cards.
- Code: `src/styles/views.css` board/week column layout, missing/ineffective `@media (max-width: 960px)` (or a narrower phone breakpoint) stacking rule.
- Fix: Stack columns to one-per-row under ~720px, matching the rest of the phone treatment already implemented for the shell (`.hub-layout` correctly goes single-column; the board/week grids inside it do not).

### D12 — Kit gate classes (`.sign-in__input` / `.quick-add__select`) reused across the canvas
- Severity: S2
- Surface: Board quick-add, Clare form, Backlog quick-add, Projects stalled-reason field, Excursions title field, Corey share-link field
- Seen: Every one of these fields is a literal `.sign-in__input` or `.quick-add__select` — the same classes as the passphrase gate.
- Expected: "Canvas search, scope, and mode controls use `.hub-search`, `.hub-filter`, `.hub-pills` — not `.sign-in__input` or `.quick-add__select`. AGENTS.md already states this."
- Actual: confirmed via `className` reads at all six call sites (see Kit table below for the full list).
- Code: `src/views/board.ts`, `src/views/clare.ts`, `src/views/dashboard.ts`/list view, `src/views/projects.ts`, `src/views/excursions.ts`, `src/views/corey.ts`.
- Fix: One shared canvas text-field/select component, styled off `.hub-search`/`.hub-filter`, used everywhere instead of the gate classes.

### D13 — Confirm cards render below the viewport fold at 1440×900
- Severity: S2
- Surface: `#/clare` (Propose write → confirm), `#/search` (Delete confirm)
- Seen: Clare's confirm card bottom edge measured at `y: 934` against a 900px-tall viewport (34px overflow); Search's delete confirm measured `y: 935` against the same 900px (35px overflow). Both require a scroll to see the Confirm/Delete button.
- Expected: "Confirm must be visible without hunting (not a card appended below a long board)."
- Actual: measured via `getBoundingClientRect()` on `.confirm-card` in both cases, same ~35px overflow amount on unrelated pages — a systemic placement issue, not a one-off.
- Code: shared `.confirm-card` mount point (renders appended after existing content rather than being scrolled/pinned into view).
- Fix: On confirm-card mount, scroll it into view (`scrollIntoView({block: 'nearest'})`) or place high-stakes destructive confirms (Delete) in a sticky/fixed position.

### D14 — Excursions' confirm card is a bare one-line paragraph, not the kit structure
- Severity: S2
- Surface: `#/excursions`, "Review & create"
- Seen: `<div class="excursion-confirm"><div class="confirm-card"><p>Create "..." ...</p><div class="confirm-card__actions">...</div></div></div>` — just a `<p>`, no eyebrow, no heading. Contrast with Clare's confirm card on the same visit: `<p class="page-header__eyebrow">Proposed write</p><h2 class="clare-confirm__title">...</h2><p class="page-header__supporting">...</p>` — full structure.
- Expected: "Confirm uses kit `.confirm-card` eyebrow + title + supporting, not a one-line custom card (`showConfirm` in excursions.ts)."
- Actual: DOM comparison confirmed, side by side, on the same audit pass.
- Code: `showConfirm` in `src/views/excursions.ts`.
- Fix: Reuse the same eyebrow/title/supporting markup Clare, Templates, and Search's delete-confirm already use.

### D15 — Skip link is non-functional in this hash-routed app
- Severity: S2
- Surface: shell-wide, `.skip-link` → `#hub-main`
- Seen: Tabbing from document start correctly focuses `.skip-link` ("Skip to content", visible on focus, top-left, `z-index: 100` — that part works). Pressing Enter does **not** change `location.hash` at all (it stays on `#/board`) and does not move focus to `#hub-main` (`document.activeElement` is still the skip link afterward, and `#hub-main` has no `tabindex` to receive focus even if it were reached).
- Expected: "`.skip-link` must appear and move focus to `#hub-main`... say which one wins and whether focus works."
- Actual: confirmed via `document.activeElement` and `location.hash` checks before/after pressing Enter on the focused skip link.
- Code: `src/styles/hub.css` / `src/styles/views.css` (two conflicting skip-link rules per the brief) plus the app's hash router, which appears to swallow `#hub-main` as an unrecognized route rather than letting the browser's native anchor-jump behavior fire.
- Fix: Give `#hub-main` `tabindex="-1"` and, since the app hash-routes, handle the skip link with a JS focus() call rather than relying on a plain anchor `href="#hub-main"` colliding with the router.

### D16 — Rail label and page title disagree (pre-existing, confirmed live)
- Severity: S2
- Surface: `#/stress`, `#/corey`
- Seen: Rail says "Network," page renders `<h1>StressFlags</h1>`. Rail says "Corey," page renders `<h1>Corey capacity</h1>`.
- Expected: "Header vs rail names must not fight (examples that already exist: rail Network vs title StressFlags; rail Corey vs title Corey capacity...)."
- Actual: confirmed live on both pages via screenshot + DOM read.
- Code: rail link labels vs page `<h1>` in `src/views/stress.ts`, `src/views/corey.ts`.
- Fix: Rename the rail links to match ("StressFlags," "Corey") or rename the `<h1>`s to match the rail — pick one name per destination.

### D17 — Production data has stray QA/test records mixed into real work
- Severity: S2 (data hygiene, not a UI bug per se — flagged because it actively misleads the daily-use verdict)
- Surface: `#/projects`, `#/stress`
- Seen: Alongside real projects (MindWorks, Da Vinci Decathlon heat, Ethics Olympiad heat), the list also shows "QA REGRESSION 2 — temporary excursion," "QA REGRESSION 2B — network capture," and "[LIVE-TEST] regression ethics" as live "active" projects, and these same three generate real StressFlags on `#/stress`. Separately, exactly two "Ethics Olympiad" admin-task pairs are duplicated three times each (`task_b45ae6b0b046`/`task_1477759f1bcb`/`task_89c771285e41` etc.), created 3 and 35 minutes apart on 2026-08-21 — consistent with someone re-submitting because the first attempt gave no feedback (see D1/D2).
- Expected: n/a (not a locked kit rule) — flagged because it pollutes the "how does the real hub feel" verdict and should be cleaned up separately from this UI pass.
- Actual: confirmed via `/api/projects` and `/api/tasks`.
- Fix: Not a UI fix — recommend a one-time data cleanup pass on production once this report is reviewed. Do not delete without Adam's confirmation (none of this was `[UX-AUDIT]`-prefixed, so it was left untouched per the safety rules).

### D18 — ISO `YYYY-MM-DD` dates leak into ledes, pinch summaries, and StressFlag text
- Severity: S3
- Surface: `#/board` lede, `#/day` lede, `#/day` pinch-card summary, `#/stress` flag body text
- Seen: Board: "Board · 20 open in scope · 8 active projects · **2026-08-22**." Today: "Adaptive focus: life, wedding, health, other · **2026-08-22**." Today's pinch card (`.pinch-card__summary`): "**2026-08-22** is packing up — 3 tasks (~220m)." Network flag body: "...land within the same fortnight (**2026-10-05** / **2026-10-05**)."
- Expected: "Calendar days in the UI are dd/mm/yy via `formatDisplayDate`. YYYY-MM-DD in ledes... pinch summaries, StressFlag text... fails." (Card chips and Gantt/Week/Month axis labels on these same pages are correctly dd/mm/yy, so this is an inconsistency within the same screens, not a global miss.)
- Code: Board/Today lede builders in `src/views/board.ts`/`dashboard.ts`; `.pinch-card__summary` in `dashboard.ts`; flag body text builder in `src/views/stress.ts`.
- Fix: Route all four through `formatDisplayDate` like the chips on the same pages already do.

### D19 — Raw px font sizes outside the type scale
- Severity: S3
- Surface: rail brand, `#/gantt` ticks/row labels, `#/maps` station labels
- Seen: `.hub-rail__brand` computes `font-size: 11px`. `.gantt-tick` computes `11px`, `.gantt-row-label` computes `12px`. Maps SVG `<text>` station labels compute `11px`.
- Expected: "Raw 11px / 12px... in hub CSS fails."
- Actual: confirmed via `getComputedStyle` on all four.
- Fix: Replace with `--text-2xs`/`--text-xs` tokens.

### D20 — Hardcoded hex/rgba colors confirmed live in the shipped bundle
- Severity: S3
- Surface: Graph canvas, general CSS
- Seen: Fetching the live JS bundle directly and scanning for hex literals returned 14 distinct hex colors, including the four named in the brief (`#17375e`, `#376fb7`, `#244f7c`, `#13233a`) plus 10 more (`#2f7a4f`, `#5d4e70`, `#a85a0c`, `#142b51`, `#0a1536`, `#dceafa`, `#294c71`, `#6b7788`, `#fbf8f2`, `#f5f1e9`), plus non-token `rgba(155, 44, 44, .08/.28/.35/.45)` reds. The CSS bundle separately contains 38 hex literals. (Note: the specific `rgba(168, 90, 12, 0.12)` haze value named in the brief was not found in either bundle as currently deployed — either already fixed or moved; do not carry that exact citation forward without re-checking source.)
- Expected: "No new hex... Canvas 2D / export HTML that hard-codes `#17375e` must use the token equivalent."
- Code: `src/views/graph.ts` (canvas fill/stroke colors), general `src/styles/views.css`.
- Fix: Replace with `--navy`/`--wave`/`--ink`/`--danger` etc. token equivalents.

### D21 — Branch node labels are clipped
- Severity: S3
- Surface: `#/branch`
- Seen: Node boxes read "Finish lesson pack for" (missing "Year 12"), "Lock MindWorks term br" (missing "ief"), "Outline MindWorks unit" (missing "s").
- Expected: "Unreadable pile fails" / general node-label legibility bar used elsewhere on Graph/Orbit.
- Code: `src/views/branch.ts` node-box width/truncation logic.
- Fix: Either widen node boxes to fit content or apply a proper ellipsis + full text on hover/focus (matching the alt-list's full text, which is already correct).

### D22 — Empty states render as "—" instead of a sentence
- Severity: S3
- Surface: `#/board` "In progress" column, `#/week` empty days (Thu/Fri/Sun)
- Seen: Board's "In progress" region contains only a plain `—`. Week's empty day columns each show a bare `—`.
- Expected: "Empty state is a real sentence, not `—`, if that reads unfinished."
- Fix: "Nothing in progress right now." / "Nothing due." — one shared empty-state string, used in both places.

### D23 — Backlog lede admits its own filters don't exist yet
- Severity: S3
- Surface: `#/list`
- Seen: Lede reads: "Open tasks without a due date, **filterable later** by domain/tag/priority." No domain/tag/priority filter control exists anywhere on the page — just the quick-add row.
- Expected: "A lede that says 'filterable later' is unfinished product copy... Domain / tag / priority filters belong here (spec §6.1) — missing filters are a defect."
- Code: `src/views/dashboard.ts` (or `list.ts`) Backlog view.
- Fix: Ship the three filters (they already exist as `.hub-filter`/`.hub-pills` patterns on Graph); rewrite the lede once they do.

### D24 — Implementer/spec language leaks into Adam-facing copy (multiple call sites)
- Severity: S3
- Surface: page headers and ledes across most of the app
- Seen, verbatim, live:
  - Board supporting: "Tasks and projects as **Teaching-density tiles**."
  - Graph supporting: "Blockers and workstreams — **Knowledge-style search, select, preview**." Graph lede: "...Search / select / preview **borrowed from Knowledge Hub**."
  - Branch lede: "One project's parent tree and **depends_on edges**."
  - Gantt lede: "...Pick a project — **hub-wide Gantt stays out of scope**."
  - Templates lede: "Start from a template. **Writes go through a confirm card — nothing is created on the first click**."
  - Projects supporting: "**Stall revive / Frankenstein / bury**, or close with planned-vs-actual."
  - Orbit, Branch, and Sky all share the eyebrow literally reading "**Stretch**" — the audit's own internal severity vocabulary, shipped as UI copy.
  - Unknown-route supporting: "Unknown route — **the URL was not rewritten to Board**."
  - Clare's "skip reasoning" note: "**Still learning your overrides — need a couple more negotiations.**"
- Expected: "Supporting copy is for Adam, not for the implementer. 'Teaching-density tiles' and 'depends_on edges' fail" (both confirmed live, plus the additional sites above found by the same pattern).
- Fix: see Copy rewrites table below.

### D25 — Excursion template dropdown clips its own useful detail
- Severity: S3
- Surface: `#/excursions`, Template select
- Seen: Full option text is "Ethics Olympiad (permission −21d · staff −21d · risk −42d · payment −28d)" but the fixed-width `<select>` only ever shows "Ethics Olympiad (permissior..." — the lead-time numbers that make the dropdown useful are never visible without opening it.
- Fix: Either widen the control or move the lead-time detail out of the option label and into the "Will schedule 6 tasks..." preview line that already exists below it.

### D26 — Double-lede header pattern repeated on nearly every page
- Severity: S3
- Surface: shell-wide page headers
- Seen: Most pages stack two near-duplicate explanatory lines: `.page-header__supporting` immediately followed by a separate `.view-lede` saying something similar (e.g., Clare: supporting "Propose duration and framework — confirm before write." then lede "Tell Clare what needs doing. She picks a framework, proposes a time estimate, and learns from your overrides."). This is a structural/IA repetition across the whole app, not a single page's copy bug.
- Fix: Pick one — either the terse header supporting line or the longer lede — per page, not both.

## Kit class / token table

| Location | Current | Should be |
|----------|---------|-----------|
| Board quick-add input (`board.ts` `renderQuickAdd`) | `.sign-in__input` | canvas text field using `.hub-search`/`.hub-filter` pattern |
| Clare task input (`clare.ts`) | `.sign-in__input` | same |
| Backlog quick-add input (`dashboard.ts`/list view) | `.sign-in__input` | same |
| Board/Clare/Excursions domain & priority selects | `.quick-add__select` | kit select styled off `.hub-filter` |
| Projects stalled "Short reason" input (`projects.ts`) | `.sign-in__input` | kit text field |
| Projects Frankenstein "Merge into..." select | `.quick-add__select` | kit select |
| Excursions "Excursion title" input (`excursions.ts`) | `.sign-in__input` | kit text field |
| Corey share-link input (`corey.ts`) | `.sign-in__input` | kit readonly field |
| Sign out button (`.hub-icon-btn`) | no `<svg>` child at all | inline sign-out SVG per `hub-utilities.html` |
| `.hub-utilities` | Sign out only | add Refresh `.hub-icon-btn` with SVG |
| All 18 `.hub-rail__link svg` (`railIcon()` in `shell.ts`) | one shared `<path d="M4 5h16v14H4zM8 9h8M8 13h6">` | distinct 18px outline icon per route |
| `.hub-rail__link` / `.primary-nav__link` dual class | `min-height: 44px` desktop; full-viewport-width on mobile scroller | kit's `2.5rem` (40px); compact mobile chip |
| Excursions confirm (`showConfirm` in `excursions.ts`) | bare `<p>` inside `.confirm-card` | eyebrow + title + supporting, as used in Clare/Templates/Search |
| Projects "Close project" (`.stall-confirm`) | renders empty | populated retrospective `.confirm-card` |
| Rail label "Network" vs `<h1>StressFlags</h1>` | mismatched | pick one name for both |
| Rail label "Corey" vs `<h1>Corey capacity</h1>` | mismatched | pick one name for both |

## Copy rewrites

| Surface | Current | Proposed |
|---------|---------|----------|
| Board supporting | Tasks and projects as Teaching-density tiles. | Everything on your plate, grouped by status. |
| Graph supporting | Blockers and workstreams — Knowledge-style search, select, preview. | See what's blocking what. |
| Graph lede | Dependency and project structure. Search / select / preview borrowed from Knowledge Hub. | Search for a task or project, then click a node to see how it connects. |
| Branch lede | One project's parent tree and depends_on edges. | How one project's tasks link together. |
| Gantt lede | Project-level timeline with dependency lines. Pick a project — hub-wide Gantt stays out of scope. | Pick a project to see its timeline. |
| Backlog lede | Open tasks without a due date, filterable later by domain/tag/priority. | Open tasks with no due date yet. (and ship the filters — see D23) |
| Templates lede | Start from a template. Writes go through a confirm card — nothing is created on the first click. | Start from a template — you'll always confirm before anything's created. |
| Projects supporting | Stall revive / Frankenstein / bury, or close with planned-vs-actual. | Deal with a stalled project, or close out a finished one. |
| Orbit/Branch/Sky eyebrow | Stretch | Explore |
| Unknown-route supporting | Unknown route — the URL was not rewritten to Board. | That page doesn't exist. |
| Clare skip-reasoning note | Still learning your overrides — need a couple more negotiations. | Estimate will get sharper the more you use Clare. |
| Today pinch summary | 2026-08-22 is packing up — 3 tasks (~220m). | Today is packing up — 3 tasks (~220m). |

## Out of scope / later

- Laptop viewport (1280×800) was covered by the same desktop findings above (D9/D10/D13 measured at 1440×900); a dedicated 1280×800 pass to confirm the rail doesn't additionally scroll there is still worth doing once D9/D10 are fixed.
- Graph canvas mouse-click hit target: clicking directly on a canvas node didn't reliably trigger the preview in my testing, while the keyboard `.viz-alt` list did every time. Not confirmed as a hard bug (could be a small hit-radius rather than non-functional), worth a quick follow-up once someone can test with a real mouse rather than injected coordinates.
- D17 (stray QA/test data in production) is a data cleanup task, not a UI change — flagging for Adam to action separately, since none of it was authored by this audit and deleting other people's/system's records wasn't in scope.
- 1-character search producing no feedback (S4) — minor, not blocking, not fixed here.

## [UX-AUDIT] leftovers

None. All test records created during this audit (`[UX-AUDIT] test task`, `[UX-AUDIT] Plan lesson observation feedback`, `[UX-AUDIT] backlog test`, and the un-prefixed "Marking batch" created via the Templates test) were deleted before finishing. Verified via `/api/tasks`: 22 tasks remain, zero matches for `UX-AUDIT` or `Marking batch`. The Excursions confirm-card test ("[UX-AUDIT] test excursion") was Cancelled, not created — nothing to delete there.
