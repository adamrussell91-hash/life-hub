# Life Hub UI element audit

**When:** 17 October 2026, 05:02 UTC
**Source:** `adamrussell91-hash/life-hub` `main` at `0852ed85`
**Hubs:** Life, Teaching, Knowledge, Tasks, Professional, Travel
**Author:** source inventory of every routed surface against this design kit

This file is the control catalogue. It records what each hub mounts for the same job. Paint — colour, type, heading size, pills, buttons, radius, shadow, spacing, layers, and motion — is logged rule by rule in `2026-10-17-0527-screen-audit.md` (17 October 2026, 05:27 UTC).

The 5 September 2026 note at `docs/design-kit-compliance.md` scored shared chrome (rail, sign-in, header, buttons, dates) and marked those four original hubs as passing. That score still describes chrome. It does not describe filters, menus, deletion, cards, empty states, motion, type, or where actions sit. Those are the gaps below.

## How to read it

Each row in the matrix is one job. The cell is the control that hub uses for that job on its main surfaces. "Kit" means the locked object in this folder. A local class name means the hub built its own.

Page tables later name the control on every route, including routes that have none.

## What the kit locked

These are the written objects. A hub may omit one when the page has no such job. It may not invent a second skin for the same job.

| Job | Locked object | Written in |
|-----|---------------|------------|
| Overlay | `data-hub` glass and tile density only: teaching, tasks, life, knowledge | `overlays.css`, `AGENTS.md` |
| Sign-in | `snippets/sign-in.html` + `sign-in.css`. Title `Sign in`. No supporting copy. No hub tile | `AGENTS.md` |
| Rail | 15rem, brand is an `<a>` home, icon + title-case label, majors then sections | `RAIL.md` |
| Phone | Bottom bar of three destinations + More. Rail hidden under 720px | `MOBILE.md` |
| Page header | Eyebrow, `h1` only, refresh as the last `.hub-icon-btn` in `.page-header__actions` | `AGENTS.md`, `snippets/hub-utilities.html` |
| Filter | `.hub-filter` dropdown (`snippets/hub-filter.html`) | `filters.css` |
| View switch | `.hub-pills` | `filters.css`, `snippets/hub-pills.html` |
| Search field | `.hub-search` | `filters.css` |
| Command search | Teaching `.search-palette` via `enhanceSearchPalette`. Other hubs `openHubCommandSearch` | `AGENTS.md` |
| Row menu | `createHubMenuButton` / `openHubMenu` (···, hold-to-confirm on destructive items) | `hub-list.css` |
| Built lists | `createHubList` (grip, ···, drag, hold-delete, undo toast) | `AGENTS.md` item 19a |
| Delete of a record | Confirm card for agent writes. User deletes go through the list hold or a confirm card, then undo toast | `actions.css`, `hub-feedback.js` |
| Buttons | `.btn` `--primary` `--secondary` `--ghost` `--decisive` | `actions.css` |
| Toast | `showHubToast`, `showCopyConfirm`, `offerTimedUndo` | `hub-feedback.js` |
| Dates | `dd/mm/yy` via `formatDisplayDate` | `js/format-display-date.js` |
| Motion | `startHubMotion()` once. Opt-in kinetic titles. No second fade language for the same entrance | `motion.css` |
| Chat | `.hub-ai-bar--thread` composer. `.chat-view__who` identity. `chat-prose.css` | `hub-interactions.css` |
| Calendar | `calendar.css`. Tasks Day / Week / Month is the reference paint | `CALENDAR.md` |
| Closed chips | `createMorphingClosedFieldPopover` | `morphing-popover.js` |
| Slider | `.hub-slider` / adaptive slider | `adaptive-slider.css` |
| Map pill | `createViewOnMap` on place-backed cards | `view-on-map.js` |
| Type | Inter 400 / 500 / 600 / 700 only | `tokens.css` |
| Colour | Tokens in `tokens.css`. Nearest token if a step is missing. No new hex for chrome | `AGENTS.md` |

Allowed per hub: which destinations exist, domain lesson blocks, chart series colours, and the four overlay densities. Professional and Travel are not in the overlay table or the rail brand table.

## Verdict

Shared chrome is largely the same kit. The controls on the canvas are not.

Six hubs call `startHubMotion()`. Six hubs use the passphrase gate, a 15rem rail, and `.btn` variants. Five hubs put refresh in `.hub-utilities`. Dates on record rows mostly go through `formatDisplayDate`.

The same job then splits:

| Job | Distinct implementations found |
|-----|-------------------------------|
| Filter | Kit dropdown, kit pills, collapsible filter bar, tag pills, origin pills, custom sheets, segment buttons, chips, native `<select>`, none |
| Search field | `.hub-search`, bare `input.search`, `input.graph-search`, `.people-page__search`, `.schedule-db__search`, `.entity-search__input`, journal search sheet |
| Overflow menu | Kit ··· menu, Teaching `.page-options`, Tasks `.card-menu`, Knowledge hand-built `.hub-menu`, Professional event options, Travel journal More, Life skincare ⋯, none |
| Delete | Confirm card, one-click API delete, `window.confirm`, press-and-hold, two-tap, ghost Delete button, undo toast, none |
| Card | `.hub-card`, `.metric-card`, `.glass-tile`, `.card`, `.backlog-row`, `.pcard`, `.food-card`, `.quiz-card`, `.nb-card`, `.protocol-card`, WebGL stage |
| Empty | `.empty-state`, `.empty`, `.teacher-layout__canvas-status`, `.canvas-status`, inline captions |
| Page title | Kit header on every Teaching index, actions-only header on Teaching class and unit, empty shell title plus a second canvas `h1` on Travel |

Professional has no overlay. Travel sets `data-hub="life"` and then redefines a display face (`--font-fun: Archivo`, weight 800) and a local button skin in `apps/travel/src/styles/travel.css`.

## Element matrix

"Kit" is the locked object. Anything else is local.

| Element | Life | Teaching | Knowledge | Tasks | Professional | Travel |
|---------|------|----------|-----------|-------|--------------|--------|
| `data-hub` | `life` | `teaching` | `knowledge` | `tasks` | `professional` (no overlay rule) | `life` (Life's overlay, own CSS on top) |
| Sign-in | Kit gate | Kit gate | Kit gate | Kit gate | Kit gate, eyebrow Professional Hub | Kit gate, eyebrow Life Hub · Travel |
| Rail brand | `<a>` Life Hub + tagline Private dashboard | `<a>` Teaching Hub | `<a>` Knowledge Hub | Tasks Hub via shell | `<a>` Professional Hub → `#/home` | `<span>` Life Hub · Travel, plus `<a class="hub-rail__back">` ← Life. Brand is not a home link |
| Rail majors | Home, Chat, Calendar | Dashboard, Chat | Archive, Chat | Dashboard, Chat | Home, Calendar. No Chat | Trip, Today, Trips. No majors wrapper, no Chat |
| Rail markers | Majors use `.hub-rail__link`. Domain rows are `.hub-nav-item` without that class, except Food Journal | `.hub-rail__link` plus plain class shortcuts | `.hub-rail__link` | `.hub-rail__link` | `.hub-rail__link` | `.hub-rail__link` |
| Phone bar | Home, Chat, Calendar, More | Dashboard, Chat, Classes, More | Archive, Chat, Graph, More | Dashboard, Chat, Today, More | Home, Log, People, More | Trip, Today, Trips, More. `currentHub: 'travel'` so Life still appears under Hubs |
| Phone More vs rail | Travel is on the desktop rail and absent from More | Feedback is on the rail and absent from More | Matches the rail library | City is a route and absent from the rail and from More | Comms, Meetings, Events, Career are on the rail and absent from More | Add and Public link live only in More |
| Refresh | `.hub-icon-btn` in header utilities | Same, when the page passes `onRefresh` | Same, injected by `hubChrome.ts` | Same | Same. Sign-out control is hardcoded `null` | Same, when refresh is passed |
| Sign out | Not in chrome | Not mounted (`logoutButton` is null) | Listener exists, no control | Not in page chrome | Not mounted | Not mounted |
| Page header | One shared header; title from `SECTION_TITLES`; `h1` is `.hub-kinetic` | Kit header on indexes. Class and unit pages are actions only. Lesson editor uses a context bar, not `.page-header` | `pageHeader()` on most views. Protocols library header omits utilities | `renderPageHeader` on every routed view | Kit header. Person name stays off the shell `h1` on the people list | Shell header often has an empty `h1`. The visible title is a second `.top h1` in the canvas |
| Filter | `.hub-pills` on home, calendar, body, mind, food mode, aesthetics. `.hub-filter` on medical and food-menu only. `.hub-chip` on future map and hub map. `.prop-seg` on property | `.hub-filter` on the lessons library only. Units group-by is pills. Scope zoom is `.scope-timeline__zoom-btn` | No `.hub-filter`. Archive uses `.tag-pill` and `.origin-filters`. Graph uses `.graph-modes`. Quiz uses `.quiz-modes`. Studio uses `.hub-chip`. Protocols past runs use a native `<select>` | `.hub-filter` inside `.hub-filters` on board, backlog, graph, search, projects, excursions, someday, templates. Timeline uses manual pills. Grove, City, properties, term dates, problem solver: none | No `.hub-filter`. People, organisations, and schedule lists use local pills and phone sheets. Career ledger uses `.hub-pills` | No `.hub-filter`. Trip city row is `.chip`. Day bar is `.daybtn` |
| Search field | `.hub-search` on medical. Bare `input.hub-search` on food journal and bloods. Compose inputs borrow `.hub-search__input` | `.hub-search` on lessons library. Rail search is `.rail-search`, not `.hub-rail__search` | `input.search` on archive. `input.graph-search` on graph. `.hub-search` on the shelf only | `.hub-search` via `createHubSearch` on most lists | `.people-page__search`, `.orgs-page__search`, `.schedule-db__search`, `.entity-search__input` | Journal search sheet. No `.hub-search` |
| Command search | `openHubCommandSearch` | `.search-palette` + `enhanceSearchPalette` | `openHubCommandSearch` | Calendar go-to-date command, not the shared palette | None | None |
| View switch | `.hub-pills` (calendar, aesthetics, now, stimulus) | `.hub-pills` (lessons views, templates, scope tabs, units group-by) | `.viewbar` between list and graph. `.graph-modes` elsewhere. Shelf uses `.hub-pills` | `.hub-pills` on graph, archive, goals, projects, excursions, templates, calendar lens | `.hub-pills` via `createPillGroup` on entity tabs, career, meetings. Miniworld uses `.miniworld__seg` | None |
| Overflow menu | Kit ··· on food-menu rows only. Skincare routine uses `.skincare-product-pill__menu`. Most sections have no menu | `.page-options` on classes, units, lessons, resources, templates, trash, lesson editor. Kit ··· inside lesson block editors | Hand-built `.hub-menu` for New note. Shelf narrow tools are a `<details>`. No `createHubMenuButton` | `.card-menu` built from `.hub-menu`, not `createHubMenuButton`. Kit ··· only inside lesson-block editors copied from Teaching | `.hub-menu` on event Options. People sort menu is `.people-page__menu` | `.journal-toolbar__more-menu`. Moment menus are separate |
| Delete | Food visit: ghost Delete inside a morph dialog. Menu dishes: hold-delete. Medical visit: confirm then `.btn--decisive`. Property: two-tap `.prop-remove`. Garage: danger remove plus mailroom undo. Central Node loops: Dismiss / Archive / Close buttons | Archive and trash go through `.confirm-card` (`askConfirmCard`). Block delete uses hold + `offerTimedUndo`. Permanent trash delete uses a confirm card | No delete on archive cards. Shelf remove uses a high-sea confirm button. Tidy is a confirm card, not a delete | Board, search, and excursion cards call `deleteTaskNow`: one click, no confirm card, no undo. Someday, someday odyssey, and goal page call `window.confirm`. Archive restore/delete uses `showConfirmWrite` | Org chart calls `window.confirm`. Career card delete uses `.confirm-card`. Application rows use a ghost Remove with no confirm card. Event delete uses `.confirm-card` | Add-sheet confirm (explicitly not `window.confirm`). Journal trash permanent delete uses `window.confirm`. Moment delete has a quick undo path |
| Archive | Central Node loop action. Not a shared pattern | First-class Trash route and per-card Archive | No trash | Archive view plus backlog "Archive all" | None as a pattern | None |
| Undo toast | `showHubToast` on food, property, garage, check-in. `offerTimedUndo` is unused. Now panel and aesthetics have their own toasts | `showHubToast` and `offerTimedUndo` | `showToast()` wraps `showHubToast` | `offerTimedUndo` on board moves and backlog. Not on card delete | No `showHubToast` | No `showHubToast` |
| Confirm card | Chat proposals, Central Node patches, property next step, food sheets | Lifecycle, AI proposals, compare, palette | Tidy, chat save, stars, studio | Widespread for proposed writes. Not for card delete | Events, career card | Capture-sheet discard bar. Delete sheets are `.sheet` |
| `window.confirm` | None found | None found (`window.alert` on some export and backup failures) | None found | 3 call sites | Org chart (2) and career criteria mirror | Journal trash |
| Buttons | `.btn` plus `.aes-btn`, `.prop-btn--on-dark`, `.btn--high-sea` | `.btn` plus `.icon-plus-btn`, `.create-control` | `.btn` plus alchemist action rows | `.btn` on lists. Grove uses `.grove-icon` | `.btn` | Kit `.btn` on the journal toolbar. `travel.css` restyles `.btn`, `.btn.ghost`, `.btn.city` |
| Cards | `.metric-card`, `.home-sprint-card`, `.food-card`, `.aes-card`, `.prop-tile` | `.glass-tile` / `.entity-cover-tile` on indexes. `.lesson-list__item` on lists | `.card` virtual list, `.quiz-card`, `.nb-card`, `.protocol-card`, `.studio-card` | `.hub-card` / `.hub-row` on the board. `.backlog-row` on the backlog. `.pcard` on projects. `.someday-card`. `.tl-card` is an SVG stage | `.card`, `.people-page__row`, `.orgs-tile`, `.schedule-db__row` | `.card`, `.ticket`, `.journal-day`, scene art |
| Empty | Inline captions and `canvas-status` | `.teacher-layout__canvas-status` or a local empty class per page | `.empty` / `.empty--panel` | `.empty-state` and `.empty-hint` | `.empty-state` plus local empties | `.empty-state` and `.journal-empty` |
| Dates | `formatDisplayDate` on the surfaces that show a day | `formatDisplayDate`, except template meta uses `toLocaleString()` | `formatDisplayDate` on podcast, stars, studio drafts, university timeline. Archive cards show a topic tag, not a date | `formatDisplayDate` | `formatDisplayDate` | `formatDisplayDate` on journal days and trip-list ranges. Trip header uses `formatLongRange` / `formatWeekdayDate` |
| Chat | Full page. Protocol pills. Confirm cards. Who-header from the kit on the transcript | Full page. AI panel pills. No second who-header | Two chats: rail coach thread (`.coach-msg`, `.chat-presence-header`) and floating overlay (`.chat-message`, `.chat-view__who`) | Clare page. Confirm cards. `.chat-view__*` | None | None. A handoff writes local storage and opens Life Mind |
| Calendar | Kit calendar (day, week, month, almanac, term, tide) | Kit calendar | None on a route. University timeline is a separate canvas | Kit calendar is the reference paint. Legacy day-dial and gantt files are unrouted | Kit calendar embed on home and `#/calendar` | None. MapLibre and an SVG world map |
| List builder | Food menu only | Nested lesson blocks and field lists. Root lesson stack is drag plus a menu. Class sequence is Up/Down buttons | Not used | Lesson-block editors only. Properties rows have move buttons | Not used. Career application rows are Up/Down/Remove | Arrival-guide tips only |
| Closed chip | Body and fitness logger use values popovers. Not the closed-field chip | Not used | Not used | Board, task editor, goal page | Event format fields | Not used |
| Slider | Native `input type="range"` on property | None in `src` | Graph tuning sliders | `.hub-slider` on graph orbit only | None | None |
| Map | `createViewOnMap` on medical. Garage and hub map are custom | None | Shelf atlas is custom | Maps view is custom. City is WebGL | `createViewOnMap` on event detail. Network ecology is a canvas world | MapLibre and SVG. No `createViewOnMap` |
| Motion entry | `startHubMotion` plus ~35 local keyframes | `startHubMotion` plus 8 local keyframes | `startHubMotion` plus ~60 local keyframes, mostly shelf | `startHubMotion` plus ~24 local keyframes. Grove and City are WebGL | `startHubMotion`. No local `@keyframes` | `startHubMotion` plus scene keyframes (`fly`, `drive`, `bob`, `shimmer`, `pulse`) |
| Type | Inter | Inter, plus Newsreader / Georgia on literary blocks, monospace on code | Inter | Inter | Inter | Archivo at weight 800 on trip titles, tickets, and scene headings |

Counts are from a scan of each hub's `src` (Life: `js/`, `css/`, `index.html`), excluding tests, the design-kit symlink, and vendor. They count occurrences, not "used correctly".

| Primitive | Life | Teaching | Knowledge | Tasks | Professional | Travel |
|-----------|-----:|---------:|----------:|------:|-------------:|-------:|
| `.hub-filter` | 7 | 1 | 0 | 44 | 0 | 0 |
| `.hub-pills` | 92 | 31 | 33 | 35 | 36 | 0 |
| `.hub-search` | 16 | 1 | 5 | 56 | 0 | 0 |
| `createHubMenuButton` | 2 | 6 | 0 | 4 | 0 | 0 |
| `createHubList` | 3 | 32 | 0 | 13 | 0 | 2 |
| `.confirm-card` | 36 | 19 | 23 | 46 | 8 | 2 |
| `showHubToast` | 16 | 12 | 2 | 10 | 0 | 0 |
| `offerTimedUndo` | 0 | 12 | 0 | 14 | 0 | 2 |
| `window.confirm` | 0 | 0 | 0 | 3 | 3 | 1 |
| `formatDisplayDate` | 248 | 17 | 13 | 119 | 40 | 17 |
| `toLocaleDateString` | 7 | 4 | 6 | 11 | 0 | 10 |
| `startHubMotion` | 2 | 2 | 2 | 2 | 2 | 2 |
| Local `@keyframes` | 35 | 8 | 60 | 24 | 0 | 14 |

`toLocaleDateString` hits include times and month labels, which the kit allows. The templates meta `toLocaleString()` on Teaching is a day-or-datetime label and is the one to treat as drift. `window.confirm` counts are call sites. A Teaching comment and a Travel comment mention the name and are not calls. Travel's one call is permanent delete in `journal/trash-view.ts`. Journal moment delete uses `offerTimedUndo`.

## Same job, six answers

These are the rows worth fixing first if the goal is one control per job. The audit does not choose the winner. It names the split.

### Filter

| Hub | What a person clicks to narrow a list |
|-----|----------------------------------------|
| Tasks board, backlog, projects, search | `.hub-filter` inside a collapsible `.hub-filters` bar in the page toolbar |
| Teaching lessons | Eight `.hub-filter` controls in `.lessons-lib__filters`, under the header, next to `.hub-search` |
| Teaching units | Group-by is `.hub-pills` in the header actions, not a filter dropdown |
| Knowledge archive | `.toolbar` search plus `.origin-filters` and `.tag-pill` |
| Knowledge studio | `.hub-chip[data-filter]` |
| Life medical | A ghost Filters button opens a panel that then hosts `.hub-filter` |
| Life future map | `.hub-chip` group |
| Life property | `.prop-seg` period buttons |
| Professional people | `.people-page__tool` and a phone sheet of `.people-page__field` |
| Professional organisations | `.orgs-page__pill` on desktop, a `<select>` sheet on the phone |
| Travel trip | `.chip` for city, `.daybtn` for day |

### Menu

| Hub | Overflow on a card or page |
|-----|----------------------------|
| Teaching index cards and editors | `.page-options` trigger (a `.hub-icon-btn`) and `.page-options__menu` |
| Tasks board and project cards | `.card-menu` / `.hub-menu.card-menu__panel` |
| Knowledge new note | Hand-built `.hub-menu.new-note__menu` in the header |
| Life food menu rows | `createHubMenuButton` |
| Life skincare products | `.skincare-product-pill__menu` |
| Professional events | `.hub-menu` from `event-options.ts`, mounted into the page-header actions |
| Travel journal | `.journal-toolbar__more-menu` in the canvas toolbar, not the shell header |

### Delete

| Hub | Removing a record |
|-----|-------------------|
| Tasks board card | `deleteTaskNow` — the comment in `card-actions.ts` says one-click, no proposed-write banner |
| Tasks someday / goal | `window.confirm` |
| Tasks archive card | `showConfirmWrite` overlay |
| Teaching class, unit, lesson, resource | `.confirm-card` via `askConfirmCard`, then Trash |
| Teaching lesson block | Menu item with press-and-hold, then `offerTimedUndo` |
| Knowledge shelf book | Remove button, then a high-sea confirm |
| Knowledge archive note | No delete control on the card or the reader |
| Life food visit | Edit/Delete buttons, delete opens a morph dialog |
| Life property entry | Two-tap `.prop-remove` |
| Professional org chart box | `window.confirm` |
| Professional event | `.confirm-card` |
| Travel journal trash | `window.confirm` for permanent delete |

### Where the primary action sits

| Surface | Placement |
|---------|-----------|
| Teaching classes, units, lessons, templates | Create control in `.page-header__actions`, before refresh |
| Teaching lesson editor | Done and publish live in the context bar, not the page header |
| Life home sprints | `.btn--primary` on the card itself |
| Life fitness logger | Docked ‹ Done › bar, full-screen gym mode |
| Life nutrition | A secondary button inside the dashboard pointing at Food Journal |
| Professional people | Add person in the canvas title row, which is not the shell header |
| Professional home | `+ Log PD event` in `.pro-home__actions` |
| Travel trips | New trip in `.top .acts`, beside a canvas `h1`, while the shell `h1` is empty |
| Travel journal | Add is `.btn--primary` in `.journal-toolbar` |
| Tasks board | Quick add in `createHubToolbar`, filters to its left |

### Title placement

| Hub | What the top of the canvas shows |
|-----|----------------------------------|
| Life, Tasks, Professional (most routes) | One `.page-header`: eyebrow, kinetic `h1`, actions |
| Teaching indexes | Same |
| Teaching class and unit | `.page-header` with options only. The entity name is in the banner, not the `h1` |
| Teaching lesson | Context bar title |
| Knowledge | `pageHeader()` including a portrait row on full-page chat |
| Travel trips, trip, journal | Shell header with no title. A second heading in `.top` or `.journal-toolbar` |

## Life — every section

Shell: `apps/life/index.html`. Titles come from `SECTION_TITLES` in `js/app/app-controller.js`. One header serves every section. Refresh is `#refresh-button`.

Rail domain rows under Life are `.hub-nav-item` with an icon. Food Journal is the only one that also has `.hub-rail__link`. Travel is an anchor in that same list and is missing from the phone More sheet.

| Section | File | Filter | Menu | Delete | Actions | Card | Empty | Notes |
|---------|------|--------|------|--------|---------|------|-------|-------|
| Home | `render-home.js`, `now-panel.js`, `render-home-sprints.js` | Stimulus, Now day, and Now tasks use `.hub-pills` | None | None on the home cards | Open Body and sprint CTAs on the cards. Now capture has its own submit | `.metric-card`, `.home-sprint-card`, `.now-day` | Captions and a Checking state | Now capture toast is `.now-capture__toast`, not `showHubToast` |
| Chat | `render-chat.js` | Protocol tools are `.hub-pills` | None | Discard on `.confirm-card` | Send primary, Stop secondary, New and Close ghost | `.chat-messages`, `.confirm-card` | `#chat-empty` | `data-hub-scroll-hide` above the transcript |
| Food Journal | `js/food-journal/view.js` | Mode pills. Menu mode uses `.hub-filter`. Both modes search | Kit ··· on menu rows | Visit Delete opens a morph dialog. Menu rows hold-delete | Add visit primary. Sheet Save primary | `.food-card`, `.food-sheet` | `canvas-status` | Closest Life surface to the kit list |
| Nutrition | `render-nutrition.js` | None | None | None | Secondary link to Food Journal | `.metric-card`, `.creatine-card` | Hidden when empty | Rings use `nutrition-*` keyframes |
| Fitness | `render-fitness.js`, `render-fitness-logger.js` | None | None | Finish session, no archive | Start workout primary. Gym dock for the logger | `.fitness-panel`, `.workout-plan-card` | Goals card hidden when empty | Logger is full screen. Voice pulse and `gym-moment-in` |
| Aesthetics | `render-skincare.js`, `aesthetics/render-aesthetics.js` | `#aes-tabs` pills, plus loose chips | Skincare ⋯ menu, not the kit menu | Remove from routine via that menu | `.aes-btn`, `.aes-btn--primary`, `.aes-btn--ink` | `.aes-card`, `.metric-card` | `#aes-ribbon-empty` | Own toast `#aes-toast`. Own keyframes `aes-ping`, `aes-join-ring` |
| Calendar | `render-calendar.js` | View pills and a planning lens | None | None | Compose submit primary | Kit `.hub-calendar`, `.event-chip` | Kit grid empty | Compose fields use the search input class without the search wrapper |
| Body | `render-body.js` | Range pills | Values popover for weight and composition | None | Popover Save | `.metric-card` | `#body-status` | Chart `area-fade` and `line-draw` |
| Bloods | `render-bloods.js` | Range pills | None | None | Secondary expand. Text button for an appointment | Accordion sections | Marker empty copy | Search is a bare `.hub-search` input. Back row is `.bloods-top`, not the page header |
| Medical | `render-medical.js` | `.hub-search` plus a Filters panel of `.hub-filter`, density pills | None | Delete visit, then decisive confirm | Add primary. Places secondary | Timeline cards, `.medical-sheet` | `#medical-empty` | `createViewOnMap` |
| Mind | `render-mind.js` | Range pills. Presets are ghost buttons | None | None | Watch primary | `.mind-tile`, chart cards | `#mind-empty` and per-tile captions | `mind-dot-in`, `mind-chip-in`, theme breathe and pulse |
| Property | `render-property.js` | `.prop-seg` | None | Two-tap remove | Record primary. Sheet Cancel/Save | `.prop-tile`, `.prop-hero` | Inline ledger copy | Native range inputs. `showHubToast` |
| Garage & Home | `render-garage-home.js` | None | None | Danger remove, mailroom undo | Check mail and Log visit primary | `.gh-section` | Empty places and mailroom | Map title uses `gh-title-read` |
| Future map | `render-future-map.js` | `.hub-chip` | None | None | None | `.shortcuts-item` | Text in the list host | Read-only |
| Hub map | `hub-map-panel.js` | `.hub-chip` status | None | Panel can delete a node | Export, Import, Fit view | `.hub-map__panel` | `#hub-map-error` | Canvas pan and zoom |
| Central Node | `render-central-node.js` | None | None | Dismiss, Archive, Close on loops | Map secondary. Audit button. Patch confirm cards | `.cn-tile`, `.confirm-card` | Loops empty | `.hub-card-swipe` CSS is present. `createCardSwipe` is not called |

Sign-in sits outside the shell and uses the kit card.

Local keyframes in `apps/life/css/app.css`: `meal-detail-reveal`, `breathe`, `area-fade`, `line-draw`, `fitness-card-in` (defined, no reference found), `chadwick-voice-pulse`, `gym-moment-in`, `gym-glow`, `calendar-month-forward`, `calendar-month-back`, `calendar-detail-in`, `protocol-pill-in`, `mind-theme-breathe`, `mind-theme-pulse`, `mind-dot-in`, `mind-slice-in` (defined, no reference found), `mind-chip-in`, `hc-draw`, `hc-grow`, `hc-fade`, `hc-fall`, `hc-drop`, `bc-flip`, `nutrition-sweep`, `nutrition-draw`, `nutrition-fade`, `nutrition-pop`, `nutrition-glow`, `nutrition-grow`, `nutrition-rise`, `nutrition-wipe`. Aesthetics adds `aes-ping`, `aes-join-ring`, `aes-join-mark`. Garage adds `gh-title-read`.

Chrome hex outside the token list shows up as status greens and reds, warning chips, the chat unread badge `#E5484D`, skincare heatmap legend colours, and page washes (`#fffefa`, `#f6f8fb`). Those are product chrome, not chart series.

## Teaching — every route

Shell: `apps/teaching/src/teacher/shell.ts`. Rail search opens the command palette and is classed `.rail-search`. Class shortcuts under Your classes are plain rows. Feedback is on the desktop rail and missing from `mobile-chrome.ts`.

| Route | File | Header | Filter | Menu | Delete | Actions | Card / list | Empty |
|-------|------|--------|--------|------|--------|---------|-------------|-------|
| `/sign-in` | `auth/gate.ts` | Kit gate | None | None | None | Submit primary | None | None |
| `/` Dashboard | `teacher/home.ts` | Eyebrow Teaching Hub, title Dashboard | None | None | None | Create pill grid in the canvas. Calendar link secondary | `.glass-tile.home-class-tile` | `.home-dashboard__empty` |
| `/chat` | `teacher/chat.ts` | Chat | None | None | None | Primary to Lessons when no lesson is open | `.teacher-chat` | Caption plus a primary button |
| `/calendar` | `teacher/hub-calendar.ts` | Calendar, zoom in the supporting line | Kit calendar filter | None | None | Kit quick-add | Kit calendar | Kit |
| `/classes` | `sections/classes.ts` | Classes | None | `.page-options`: Archive, Move to trash | Confirm card | Create in header actions | `.glass-tile` grid | Canvas status |
| `/classes/:id` | `sections/classes.ts` | Actions only | None | Header page options | Confirm card | Secondary on empty regions | `.entity-banner`, sequence rows | `.class-page__empty` |
| `/scope-sequences` | `sections/scope-sequences.ts` | Overall Scope & Sequence | None | None | None | Create in header | `.scope-overview` | Canvas status |
| `/scope-sequences/:id` | `sections/scope-timeline.ts` | Subject title | Timeline / Curriculum pills. Zoom is local buttons | Inspector actions | Confirm card on compare | Add unit primary. Note, compare, today ghost | Timeline bars | Canvas status |
| `/units` | `sections/units.ts` | Units | Group-by pills in the header | `.page-options` | Confirm card | Create in header | `.units-index__tile` | Canvas status |
| `/units/:id` | `sections/units.ts` | Actions only | None | Page options including history and export | Confirm card | Plus button to add a lesson | `.lesson-list`, plan panel | Empty class copy reused |
| `/lessons` | `lessons-library/render.ts` | Lessons | Eight `.hub-filter`s and view pills | `.page-options` and a bulk bar | Confirm card, including bulk | Bulk `.btn` variants. Pin and clear | `.lesson-list__item`, table, map | `.lessons-lib__empty` |
| `/lessons/:id` | `lesson-editor.ts` | Context bar | None | Context-bar page options | Trash via confirm card. Block delete via hold and undo | Done primary in the bar | `.lesson-page__block` | Hub list empty in the palette |
| `/resources` | `sections/resources.ts` | Resource Library | None | Page options: Open, Archive, Trash | Confirm card | Upload, Add URL, Drive, Save URL | `.lesson-list__item` | Canvas status |
| `/templates` | `sections/templates.ts` | Templates | Lesson / Unit pills | Page options | Confirm card, plus text and select cards | Row actions | `.templates-page__row` | Canvas status. Meta date uses `toLocaleString()` |
| `/feedback` | `sections/feedback.ts` | Feedback | None | None | None | New primary. Per card secondary and ghost | `.feedback-page__card` | Hint status |
| `/trash` | `sections/trash.ts` | Trash | None | Header menu for backups | Restore and Delete permanently via confirm card | Row secondary and ghost | `.trash-page__table` | Canvas status |
| Student lesson, unit, class, feedback | `student/*.ts` | `.student-chrome`, brand Teaching Hub | None | None | None | Block controls and lesson links | `.student-panel`, `.student-unit-card` | `.student-status` |

Student surfaces do not mount the rail, the page header, or the phone bar.

List builder split: nested blocks and field editors call `createHubList`. The root lesson stack uses drag and a menu (Move up, Move down, Delete). Class sequence (`unit-sequence.ts`) and scope compare use visible Up/Down buttons. Timetable slots and saved views use a Remove button.

Local keyframes: `activity-shuffle`, `annotation-voice-pinned`, `annotation-ink-draw`, `annotation-ink-band`, `annotation-ink-fade` in `styles/app.css`. Class examples add `cx-fresh`, `cx-pulse`, `cx-shake`.

Type drift that is domain rather than chrome: Newsreader and Georgia on literary blocks, monospace on code. Chrome itself stays on Inter.

## Knowledge — every view

Router: `View` in `apps/knowledge/src/main.ts`. Rail: Archive and Chat as majors, then Bookshelf, Notebooks, Studio, Graph, Timeline, Thinking, Podcast, Quiz. Phone primary is Archive, Chat, Graph.

`wiki/rail.ts` (and the curator cards inside it) is implemented and not mounted by `main.ts`.

| View | File | Filter | Menu | Delete | Actions | Card | Empty | Notes |
|------|------|--------|------|--------|---------|------|-------|-------|
| Archive list | `main.ts` `renderList` | `input.search`, origin pills, tag pills | New-note `.hub-menu` | None | Header new-note and a List/Graph viewbar | `.card` virtual list | `.empty` | No date on the row. Morph into the reader |
| Reader | `main.ts` `renderPage` | None | None | None. Clean up is tidy | Back, Pin, Edit, Clean up, Chat | `.reader` | None | Confirm card for tidy |
| Graph | `main.ts` `renderGraph` | `.graph-modes`. Show-all has grouping and tuning sliders | None | None | Mode toggles | Hover preview | Toolbar meta | `input.graph-search`. Stars and universe are modes of this view |
| Quiz | `quiz/view.ts` | `.quiz-modes` | None | None | Mode bar, reveal, rating buttons | `.quiz-card` | `.empty` under the forms | Dump and map are modes, not routes |
| Podcast | `podcast/rail.ts` | Commission radios and a tag fieldset | None | None | Generate, library rows, player transport | Library rows | Library empty | `formatDisplayDate` on episodes. Player reuses `.coach-msg__who` |
| Chat | `chat/rail.ts` | Hat buttons (`.graph-modes`) and dials | None | Save uses a confirm card | New chat in the header. Composer is `.hub-ai-bar` | `.coach-msg` | Greeting message | Who-header is `.chat-presence-header` |
| Chat overlay | `chat/overlay.ts` | Agent picker and protocol pills | None | Confirm-card tray | Floating button, composer | `.chat-message` | One placeholder message | Who-header is `.chat-view__who`. Second prose stack |
| Compose | `capture/compose.ts` | Tag and origin pickers | None | Remove an attachment only | Voice, Photo, Scan, PDF, Paste. Save in `.compose__savebar` | None | None | `formatDisplayDate` inside appended capture blocks |
| Bookshelf | `shelf/view.ts` | Room, face, and descent pills | `<details>` more on narrow widths | Remove from shelf, then a confirm | Tools bar | Covers, atlas, islands | Load and error strings | Largest private motion set in the product |
| Studio | `studio/view.ts` | View/sort pills and `.hub-chip` filters | None | Discard idea via confirm card | New idea | `.studio-card` | `.studio-empty` | |
| Notebooks | `notebooks/view.ts` | None | None | None | Card opens a morph dialog | `.nb-card` | `.nb-open__empty` | |
| University timeline | `university/timeline/view.ts` | Journal nav plus zoom | None | None | Ghost zoom and fit | SVG lanes | Copy when there are no degrees | `formatDisplayDate` |
| Thinking | `protocols/view.ts` | Native `<select>` on past runs | None | None | Protocol cards, session controls | `.protocol-card`, `.protocol-turn-card` | `.protocol-past__empty` | Library header omits utilities. Dark gold theme in `protocols/style.css` |
| Tidy | `tidy/intakeView.ts` | None | None | Discard or confirm the tidy write | Confirm-card actions | One confirm card | None | Embedded in the reader |
| Origin | `archive/originFilter.ts`, `origin/pills.ts` | Tag pills | None | None | Add origin | Pills | None | Not its own route |

Shelf keyframe families in `shelf/bookshelf.css` and `shelf/wireless.css`: atlas (`atlas-unfold`, `atlas-swell`, `atlas-surf`, `atlas-cloud`, `atlas-flow`, `atlas-pulse`, `atlas-ring`, `atlas-fog`), islands (`isles-flutter`, `isles-beacon`, `isles-name`), book open, about thirty `sl-*` nautical loops (`sl-sail`, `sl-turn`, `sl-rock`, `sl-ripple`, `sl-twinkle`, `sl-gulls`, `sl-rain`, `sl-bolt`, `sl-maelstrom`, `sl-rise`), and wireless (`wl-grain`, `wl-pulse`, `wl-warm`). Stars add `stars-root-in`, `stars-node-twinkle`, `stars-marker-in`, `stars-popover-in`, `stars-gather`. Protocols add `protocol-breathe`, `protocol-turn-in`, `protocol-deal`, `protocol-pill-in`.

Colour drift sits in graph universe washes, quiz and dump blackboard hex, protocol gold on near-black panels, and the shelf's own sea palette. `tokens.css` inside the app also redefines `.glass` on top of the kit.

## Tasks — every view

Shell: `apps/tasks/src/shell/shell.ts`. Header is `renderPageHeader` for every routed view. Most views also mount a `.reminder-card`.

Rail sections: Views (Today, Week, Term, Year, Almanac, Backlog, Graph, Timeline, Grove), Plan (Goals, Someday, Templates), Work (Projects, Excursions, Programs, Archive), Tools (Maps, Problem Solver, Personal line, Search, Properties, Term dates). Majors are Dashboard and Chat.

City (`#/city`, title Metropolis) is routed and not in the rail. `#/month` redirects to week. `#/gantt` redirects to timeline. `#/orbit`, `#/universe`, `#/branch` canonicalize to graph. `views/gantt.ts` and the legacy day dial are unrouted.

| View | File | Filter | Menu | Delete / complete | Card | Empty |
|------|------|--------|------|-------------------|------|-------|
| Dashboard `#/board` | `views/board.ts` | Scope and Domain `.hub-filter`, plus a Running projects button | `.card-menu` | Drag or menu to change status, with undo. Delete is `deleteTaskNow` | `.hub-row` / `.hub-card` in columns | `.empty-hint`, `.empty-state` |
| Chat `#/clare` | `views/clare.ts` | Protocol pills | Chat chrome | Mutations are confirm cards | `.confirm-card` | Chat empty |
| Today, Week, Term, Year, Almanac | `views/hub-calendar.ts` | Planning-lens pills | Kit calendar item menu plus a go-to-date command | Kit item actions | Kit calendar | Kit |
| Backlog `#/list` | `views/backlog.ts` | Domain, Priority, Tag filters | Card menu and row actions | Swipe, checkbox, bulk archive via confirm. Undo toast | `.backlog-row` | `.backlog-empty` |
| Graph | `views/graph.ts` and subviews | Hub and Project filters, search, Lines/Branch/Orbit pills | Drawer tools | Insight writes via confirm | SVG stage, `.graph-drawer` | "No insights" meta |
| Timeline | `views/timeline.ts` | Manual zoom and view pills, critical toggle | Plus and Hammond buttons | Edits go through confirm | `.tl-card` SVG | Load error |
| Grove | `views/grove/view.ts` | None | `.grove-icon` tray | None. Links out to the task | `.grove-card` over WebGL | `.grove-veil` |
| Goals | `views/goals.ts` | Term/year pills. Runway chips are closed-field popovers | Minimal | Hammond proposals are confirm cards | `.runway__row`, `.goal-frame__tile` | `.empty-state` |
| Someday | `views/someday.ts` | Search plus domain, area, bucket | Card menus | `window.confirm` | `.someday-card` | `.empty-state` |
| Templates | `views/dashboard.ts` | Type pills | Per-template actions | Confirm card | Rows in a stack | Loading and error |
| Projects | `views/projects.ts` | Search, filters, group-by pills | Card menu | Complete requires a retrospective confirm card. Delete via card handlers | `.hub-card.pcard` | `.empty-state` |
| Excursions | `views/excursions.ts` | Same pattern as projects | Card menu | Create and complete use confirm cards | `.pcard` | "No excursions match" |
| Programs | `views/programs.ts` | Collapsible filters | Departure extras | `showConfirmWrite` | Catalogue rows | "No programs match" |
| Archive | `views/archive.ts` | Search and type pills | Card menu | Restore and delete via confirm overlay | `.archive-card` | `.empty-state` |
| Maps | `views/maps.ts` | Filter in the inspector. Index search | Hub menu | Edit-mode confirms | Map micro cards morph to `.hub-card` | Toast or inline |
| Personal line | `views/personal-line.ts` | `.pl-chips` | None | None | SVG line | Load error |
| Search | `views/dashboard.ts` | Domain filter and kind pills | Card menus | `deleteTaskNow` and done toggle | `.hub-card-slot` | "No matches" |
| Properties | `views/properties.ts` | None | None | None. Move buttons on rows | `.property-row` | "No entries yet" |
| Term dates | `views/term-dates.ts` | None | None | None | Date fields | Status line |
| Problem Solver | `views/problem-solver/view.ts` | None | Coach actions | Suggestions are confirm cards | `.ps-list__item` | `.ps-empty` |
| City | `views/city/view.ts` | None | Legend HUD | None | WebGL stage | `.city-narrow` |
| Task and project pages | `page-editor.ts` | Hub fields | Kit ··· inside block editors | `deleteTaskNow` | Block canvas | Editor empties |
| Goal page | `goal-page.ts` | Closed-field chips | Page actions | `window.confirm` on the destructive action | Goal frame | |

Board scheduling is not on the card. Due date is a `.date-badge`. Changing the day happens on the backlog, the calendar, the graph drawer, or the task editor.

Local keyframes: `hub-card-reveal`, `daily-dial-pulse`, `graph-breathe`, `graph-pulse`, `graph-flow`, `orbit-drift`, `branch-draw`, `branch-node-in`, `flowScroll`, `line-draw`, `catalog-fade`, `catalog-rise`, `chat-status-pulse`, `backlog-rollback`, `backlog-triage-*`, `activity-shuffle`, `grove-hint`, `grove-pulse`, `grove-card`. Timeline morph uses the kit spring, not a local keyframe.

Grove sky (`#a6dbf2` to `#f5f2e2`) and City weather swatches are their own palettes. Card and graph CSS also use raw white and navy washes for glass.

## Professional — every route

Shell: `apps/professional/src/shell/shell.ts`. Brand links home. Majors are Home and Calendar. Section label is Network. There is no chat.

`data-hub="professional"` matches no rule in `overlays.css`, so the canvas uses the `:root` glass values rather than Teaching, Life, or Knowledge density.

Phone bar is Home, Log, People. More has Organisations, Relationships, Calendar, Network Ecology. The desktop rail also has Comms, Meetings, Events, and Career, and those four are absent from More.

`apps/professional/AGENTS.md` still describes a smaller read-only slice. The routes below are what the shell actually mounts.

| Route | File | Filter | Menu | Delete | Actions | Card | Empty |
|-------|------|--------|------|--------|---------|------|-------|
| `#/home` | `views/home.ts` | None | None | None | Log PD event primary, in the canvas | `.card`, timeline, embedded calendar | "No events yet." |
| `#/calendar` | `calendar/hub-calendar.ts` | Kit calendar | None | None | Three secondary links: Log comm, Meeting, Event | Kit calendar | Kit |
| `#/people` | `views/people.ts` | Local tool and a phone sheet | `.people-page__menu` for sort and group | Dedupe merge, no confirm card | Add person primary in the canvas title row | `.people-page__row` | Pane and directory empties |
| `#/people/ties` | `views/ties-to-confirm.ts` | None | None | Decline is an API call | Confirm primary, Not a tie ghost, per row | `.ties-confirm__row` | "No ties waiting." |
| `#/organisations` | `views/organisations.ts` | Pills on desktop, select sheet on phone | None | None | Add primary | `.orgs-tile` | `.orgs-wall__empty` |
| `#/organisations/compare` | `views/organisations-compare.ts` | None | None | None | Primary link per org | Compare layout | Load error |
| `#/organisations/:id` | `views/organisation-page.ts` | Pane filters | Chart sheets | `window.confirm` on chart boxes | Ghost compare | Chart and timeline | Pane empties |
| `#/relationships` | `views/relationships.ts` | None | None | None | None | None | Status hint. Supporting copy is repeated in the canvas |
| `#/communications` and detail | `components/schedule-db-page.ts`, `comm-page.ts` | `.schedule-db__pill` | None | None on the list | Compose | `.schedule-db__row` | `.schedule-db__empty` |
| `#/meetings` and detail | `meetings.ts`, `meeting-page.ts` | Same list pills. Attendee role is `.hub-pills` | None | Room remove is an icon button | Head actions | `.meeting-page` sections | List empty |
| `#/events` and detail | `events.ts`, `event-page.ts` | List pills | Options `.hub-menu` in the header | Confirm card | Compose footer | `.event-page` | `.empty-state` |
| `#/log` | `views/quick-log.ts` | None. Channel toggles | None | None | Log it primary | `.quick-log` | Validation status |
| `#/career` and satellites | `views/career.ts` | River and ledger pills | None | Career card uses a confirm card. Criteria mirror uses `window.confirm` | River zoom ghost. Sheets for add | River SVG, ledger rows | Several `.empty-state` strings |
| Career application | `views/applications.ts` | None | None | Ghost Remove, no confirm card | Up, Down, Save, Remove on rows | Form rows | `.empty-state` |
| `#/network-ecology` | `views/network-ecology.ts` | `.miniworld__seg` and layer toggles | None | None | Find me secondary | Canvas world | Loading and error |
| Not found | `app/main.ts` | None | None | None | Back to Home | None | `.empty-state` |

`#/person/:id` and `#/applications` redirect. `people-home.ts`, `person-page.ts`, and `person-brief.ts` are still in the tree and are not what the router mounts.

No local `@keyframes`. Hex use is mostly tokens, with literals on the home chips and the ecology canvas. Search never uses `.hub-search`.

## Travel — every route

Shell: `apps/travel/src/shell/shell.ts`. Brand is a span reading Life Hub · Travel. A separate link reads ← Life and points at `/`. `data-hub` is `life`. Public trip pages skip the shell.

`apps/travel/src/styles/travel.css` sets `--font-fun: Archivo` and uses weight 800 and `font-stretch: 125%` on `.top h1`, scene headings, ticket IATA, and map labels. It also restyles `.btn`.

| Route | File | Header | Filter | Menu | Delete | Actions | Card | Empty |
|-------|------|--------|--------|------|--------|---------|------|-------|
| `#/` trips | `views/trips-list.ts` | Shell title empty. Canvas `h1` Trips | None | None | None | New trip and Plan a trip in `.top` | `.trips-list__card`, passport map | `.empty-state` |
| `#/today` | `views/today.ts` | Shell title Today | None | None | None | I'm safe | `.scene`, `.card` | No trip / no city |
| `#/trip/:id` | `views/trip-page.ts` | Shell title empty. Canvas trip title | `.chip` cities, `.daybtn` days | Per-item menus in the day list | In-sheet confirm | Add city ghost, Add, map tools, journal, share | `.ticket`, world map, `.scene` | `.trip-empty-cities` |
| Journal | `journal/render-journal.ts` | Shell title empty. Toolbar `h1` | None. Search is a sheet | Toolbar More menu | Delete sheet. Trash uses `window.confirm`. Moment path can undo | Add primary in the toolbar | `.journal-day` | `.journal-empty` |
| Public `/travel/t/:token` | `views/public-trip.ts` | No shell | None | None | None | None | Map and public day list | Read-only |

Scene motion in `travel.css` includes `fly`, `drive`, `bob`, `shimmer`, `pulse`, and `where-pulse`. Journal sheets use the morph-dialog class. `createHubList` appears only on the arrival-guide tips. `createViewOnMap` is not used.

## Colour

The closed palette is `tokens.css`. These are the drifts that show up as chrome rather than as a chart series:

| Where | What |
|-------|------|
| `overlays.css` | Teaching and Tasks share one glass. Life is flatter. Knowledge is flatter still and has no blur. Professional is missing, so it inherits `:root` |
| Travel `travel.css` | Repeats navy and high-sea as literals and adds Archivo |
| Life `app.css` | Status greens and reds, warning chips, unread `#E5484D`, skincare legend, page washes |
| Knowledge `protocols/style.css` | Gold on a dark room (`#e4c98a` and near-black panels) |
| Knowledge shelf CSS | Sea, atlas, and island palettes with their own motion |
| Tasks grove and city CSS | Sky, tree, and weather swatches |
| Teaching literary blocks | Serif face on poems. Chrome stays Inter |

Chart series hex is called out in the September note as domain colour. It is still domain colour. The rows above are chrome and canvases that a person sees as the product surface.

## Motion

Every hub calls `startHubMotion()` once. That shared layer is fade, count-up, list stagger, and magnet, plus opt-in kinetic titles.

On top of it, each hub plays its own entrances for the same kind of moment (a card appearing, a pill appearing, a panel arriving):

| Moment | Who plays it | Names |
|--------|--------------|-------|
| Card or row entrance | Life, Tasks, Knowledge shelf, Travel scenes | `breathe`, `fitness-card-in`, `hub-card-reveal`, `catalog-rise`, `book-open-dim`, scene `bob` |
| Chart draw | Life, Tasks personal line | `line-draw`, `area-fade`, `hc-draw`, `nutrition-draw` |
| Pill or chip entrance | Life chat, Life mind, Knowledge protocols | `protocol-pill-in`, `mind-chip-in` |
| Panel | Life calendar, Tasks backlog, Knowledge stars | `calendar-detail-in`, `backlog-triage-*`, `stars-popover-in` |
| Ambient loop | Knowledge shelf, Life mind themes, Tasks graph, Grove | `sl-*`, `mind-theme-breathe`, `graph-breathe`, `grove-pulse` |
| None of their own | Professional | Kit motion only |

Reduced motion is handled in some of these sheets (studio, network ecology, mind board) and not established as one shared switch beyond the kit.

## Placement rules the kit already states, and where they slip

| Written rule | Where it slips |
|--------------|----------------|
| Brand is one `<a>` to that hub's home | Travel brand is a span. A second link, ← Life, sits above it |
| Refresh is the last control in the title row | Holds on shells that use `.hub-utilities`. Teaching class, unit, and lesson move the real actions into a context bar or an actions-only header |
| One `h1` | Travel paints a second `h1` in `.top` and in the journal toolbar |
| Phone More lists the rest of the rail | Teaching omits Feedback. Professional omits Comms, Meetings, Events, Career. Life omits Travel. Tasks omits City |
| Filter is `.hub-filter` | Only Tasks (broadly) and Teaching lessons use it. See the filter table |
| Destructive user actions confirm, then can undo | Tasks card delete does neither. Three hubs still call `window.confirm` |
| Inter 400–700 | Travel display type is Archivo 800 |
| Overlay is the only per-hub visual fork | Professional has no overlay. Travel wears Life's overlay and then its own face |

## What this audit did not measure

This is a source inventory of `main` at `0852ed85`. It names the control, the file, and the class. It does not remeasure pixel spacing, contrast, or animation timing in a signed-in browser, and it does not screenshot every route at 1440 and 390. Those checks belong to a change that touches a surface. The September chrome scorecard remains the record that the shared rail, gate, and header were aligned on 5 September 2026 for the four original hubs.

Unrouted files (`people-home.ts`, Teaching `lesson-list.ts`, Tasks `gantt.ts`, Knowledge `wiki/rail.ts`) are listed so they are not mistaken for live UI.
