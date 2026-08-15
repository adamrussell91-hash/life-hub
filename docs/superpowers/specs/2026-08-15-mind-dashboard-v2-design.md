# Mind dashboard v2 — design spec

**Date:** 2026-08-15  
**Status:** Approved (brainstorm + user review). Implementation plan: `docs/superpowers/plans/2026-08-15-mind-dashboard-v2.md`.  
**Supersedes (dashboard UI only):** `2026-08-13-mind-dashboard-design.md`, `2026-08-14-mind-dashboard-visual-design.md`  
**Does not supersede:** `2026-08-13-mind-session-memory-design.md` (conversation-first logging, Vera auto-write, Penelope confirm, privacy rules for prompts). This spec extends those records and the Mind tab read surface.  
**Pointer, not source of truth:** the Claude “Mind dashboard v2” chart catalogue. Use its questions and chart types; do not invent a parallel `DiaryEntry` table or slot its layout in as-is.

## Goal

Rebuild the Mind tab as an analysis dashboard on conversational data. Entry is still Vera and Penelope, never a form. The page should feel like Body/Bloods (Clinical Glass) and pack like a Pinterest board (masonry). Every tile answers a question, has a one-line legend, load-in animation, and hover/click that reveals a real number or a thread of entries.

## Locked decisions

| Topic | Choice |
|---|---|
| Job of the tab | Analysis + Clinical Glass hybrid. Rich chart suite, conversation at the top, insights high |
| Agent writes | Extend `diary` / `mind_session` / Mind Insight fields so charts are honest |
| Density | Masonry 2/3/4 columns; mixed tile heights; ~12px gutters; no grid holes; no full-width card stack |
| Visual language | Clinical Glass tokens and `chart-kit` motion. Masonry is packing only |
| Hero vs deeper | One masonry board. Launchers + insights + current charts + factor + streak + cadence sit toward the top; heavier analysis tiles follow. Not two different design systems |
| Chart volume | Build the full set now. Sparse data still draws, with an honest caption |
| Import | One-shot into `data/mind/`: Session Database, structured diary, Historical/era pages as `mind_session` (`session_type: historical`) and Insights when the page is a synthesis. Vera intake → prompt context only, never chart points |
| Click | Overlay sheet (thread + excerpts + continue with agent). Does not insert a full-width row into the masonry |
| Logging | Still no form. Range control Weekly / Monthly / 6M unchanged |

## Out of scope

- Reading the Downloads folder or Notion at runtime in the PWA  
- Dumping 1,928 Day One entries as fake daily `diary` files from the intake prose  
- Auto-detected lexical terms (watchlist is explicit and short)  
- Changing Vera auto-write vs Penelope confirm  
- Quoting diary prose into Vera/Hammond prompts (privacy from session-memory still holds). The dashboard may show Adam his own excerpts in the overlay sheet  

---

## Page architecture

`#mind-dashboard` remains the Mind section. Same heading/kicker language as other tabs. Range control stays `.body-range`. Ambient line (`[data-mind="ambient"]`) stays current-state (last diary, last Vera, last Penelope), not range-clipped.

**Masonry:** a small JS packer (not CSS `columns`, which cannot span, and not sparse CSS grid). 12px gaps. Column count: 2 narrow, 3 default desktop, 4 when the Mind pane is actually wide. Height = content (question + title + legend + chart + hint). Short tiles (tension, Cross-Agent) pack under their column neighbour.

**Width span:** mood arc, stream, radial year, horizon, and insights may occupy two columns when the packer can place a neighbour without a hole. Otherwise they stay one column and grow taller. The packer never leaves an empty cell.

**Tile chrome (every chart tile):**

1. Question kicker (uppercase, `--wave`-mixed muted)  
2. Title  
3. One-line legend (what size, colour, or axis means)  
4. Chart host  
5. Hint: hover vs click  

**Entry tiles:** Talk with Vera / Talk with Penelope move to the top of the board (pair of tiles). Each shows agent name, relative time since last `mind_session` or `diary`, and a one-line outcome (`mood lifted` / `mood eased` / `mood held` from open→close, or the session title / “logged” for diary). Tap opens that agent’s chat. These are launchers, not reports.

**Silence:** dual-gap ≥7 days still a notice chip (`mind-silence`), Vera tone: notice, don’t alarm. Cadence already shows the holes.

**Overlay sheet:** one shared `#mind-thread-sheet`. Triggered by click/keyboard on a mark. Contains theme or factor label, chronological rows (date, title, short excerpt from diary body / session insight or observation), Continue with Vera or Penelope when `source_agent` is set. Esc / scrim / close. Focus trap. Does not live in the masonry.

---

## Data model

No new record `type`. Extend validation in `js/core/validate.js` and `chat-schema.mjs` together.

### `diary`

Keep: `mood`, `moods[]` (1–3), `mood_score` (1–10), `energy`, `tags`, `highlights`, `challenges`, `system_note`, `cross_agent_note`, markdown body.

Add optional: `source_agent`: `penelope` | `import`.

### `mind_session`

Keep: `theme` (legacy singular), `closing_question`, `insight`, `mood_at_open`, `mood_at_close`, `cross_agent_note`.

Add optional:

| Field | Rule |
|---|---|
| `title` | Session title string |
| `themes` | Array of strings; if present, non-empty. Legacy `theme` still counts as a theme when `themes` is absent |
| `pattern_tags` | Array of strings |
| `session_type` | `check-in` \| `deep-dive` \| `pattern-review` \| `historical` |
| `framework` | Optional string. Stored for Vera; not a dashboard badge in v2 |
| `observation` | Optional string (Vera’s observation) |
| `source_agent` | `vera` \| `import` |

Required core (unchanged spirit): at least one of `title`, `theme`, a non-empty `themes`, `insight`, `closing_question`.

Same-day overwrite rule from session-memory stays for live Vera writes. **Import** may write multiple historical files on the same date with distinct slugs (`-session`, `-session-2`, or title slug). Do not smash two imported sessions into one file.

### Mind Insights (Governance Log)

Still `entryType === 'Mind Insight'` via `parseGovernanceEntries`. Add optional body fields, parsed not as a new file type:

```
**Source session:** data/mind/2026/04/2026-04-07-the-filter.md
**Tension:** stated rule — actual behaviour
**Stated:** 0.2
**Revealed:** 0.75
```

`tension` is present only when Vera (or import) actually produced a dialectic. The tension tile renders only then.

### Derived `ThemeCooccurrence`

Computed in `mind-model.js` (and reused by `mind-digest.mjs` if needed). For every in-range `diary.tags` and `mind_session.themes` (+ `pattern_tags`), increment an unordered pair count. Single builder, reused by constellation, chord, bump, and stream. Not written to Git.

### Factor effect inputs

Themes/tags as binary factors on a calendar date (union of diary tags and session themes that day). Additional binaries from existing Life Hub events on that date when present (e.g. a workout record that day). Effect size: `mean(mood_score | factor present) − mean(mood_score | absent)`. Show a factor only with ≥3 days with and ≥3 without. Colour: `--fill-success` / `--fill-danger` plus a textual +/− so colour is not the only signal.

---

## Import

One Node script (tests first), input = the Notion export folder Adam pointed at (and later a Mood Tracker / Day One CSV if provided). Output = `data/mind/YYYY/MM/YYYY-MM-DD-<slug>.md` plus Governance Log insight appends for synthesis pages.

| Source | Destination |
|---|---|
| Vera Session Database CSV + dated session markdown | `mind_session`, `source_agent: import`, map Primary/Follow-up themes → `themes`, Pattern Tags → `pattern_tags`, Session Type → `session_type`, Framework → `framework`, Mood at Opening/Close → `mood_at_open`/`mood_at_close`, Key Insight → `insight`, Vera's Observation → `observation`, Closing Question → `closing_question`, Session Title → `title` |
| Daily Diary pages (`Mood`, `Mood Score`, `Energy`, `Tags`, body) | `diary`, `source_agent: import`. Map Mood list → `mood` + `moods[]`. Mood Score as stored (Notion 1–10 stays 1–10) |
| Historical / era narrative pages | `mind_session` with `session_type: historical`. If the page is a synthesis (pattern review, era portrait), also append a Mind Insight |
| Adam — Psychological Baseline (Vera Intake) | Not records. Keep/load as Vera protocol context (existing “do not bulk-copy into the repo” sensitivity still applies; link or a bounded excerpt in `config/` only if Adam confirms at import time) |

Do not invent daily mood points from intake paragraphs. Radial year / Sankey / stream stay honest if daily files are thin; session-heavy tiles (constellation, butterfly, tension, cadence Vera row) populate from the ~24 sessions in the CSV.

Idempotent import: skip if `id` already exists. `source: notion_import`.

---

## `buildMindModel` additions

Keep `buildMindModel({ events, date, range, governanceLogMarkdown, centralNodeMarkdown })`. Add (all pure, tested):

- `latestSessionByAgent` / `latestDiary` for launcher copy  
- `consistency` — unique dates with diary or session in last 30 days vs 30; current streak ending `date`  
- `factorEffects` — bars as above  
- `themeCooccurrence` + `themeNodes` (count, mean mood_score on dates the theme appears)  
- `themeWeekly` — counts by ISO week, top 6–8 + `other`  
- `themeRanks` — weekly rank for bump  
- `moodTransitions` — consecutive diary `mood` (primary) pairs  
- `lexicalSeries` — watchlist term counts per week from diary body + session `insight`/`observation`/`closing_question` (not Vera prompt dumps)  
- `butterfly` — per theme, Vera vs Penelope frequency and mean mood delta (`mood_at_close` rank − `mood_at_open` rank for sessions; diary mood_score vs range mean for Penelope)  
- `resurfacing` — themes in the latest diary/session that also appear >7 days earlier; most recent prior excerpt  
- `tensions` — insights with parsed tension  
- `waffle` — one cell per in-range entry (diary + session), mood colour  
- Cadence hits: diary dates, Vera session dates, Penelope diary dates as three rows  

Watchlist default, editable on the lexical tile: `should`, `just`, `fine`, `unfulfilled`, `flake`. Literal word-boundary match, case-insensitive. Stored in `localStorage` key `life-hub-mind-watchlist`.

Resurfacing dismissal: `localStorage` `life-hub-mind-resurfacing-dismissed` (id list).

---

## Tiles (purpose, encoding, interaction, motion)

All charts: `prefers-reduced-motion` → final state, no entrance. Otherwise existing easing `cubic-bezier(.2,.8,.2,1)` via `animateAreaReveal` / `animateRingFill` / stagger 30–50ms. No looping motion.

Hover/focus: tooltip with exact value (keyboard reachable). Click: overlay sheet unless noted.

| Tile | Question | Data | Encoding | Click |
|---|---|---|---|---|
| Vera / Penelope launchers | (invitation) | Latest session / diary | Context strings, agent colour | Open chat |
| Insights + resurfacing | What’s worth carrying? | Governance Mind Insights; resurfacing query | Existing timeline rail; resurfacing is a distinct inner card, not a second insight | Expand full body; continue with agent if `Source session` set |
| Mood arc | How is mood moving? | `moodSeries` | Existing area/line + mood dots + load-in | Point → that day’s entries |
| Mood mix | What’s the mix? | `byMood` | Existing donut | Slice → those days |
| Energy rings | What’s the energy split? | `energyByLevel` | Existing rings | Ring → those days |
| Factor effect | What’s moving my mood? | `factorEffects` | Horizontal bars, +/− colour and label | Factor → sheet of days with that factor; also sets constellation filter |
| Streak + cadence | Am I showing up? | 30-day unique dates; heatmap rows diary / Vera / Penelope | SVG ring (`stroke-dasharray`) + existing heatmap tiles | Tile → that day |
| Constellation | What travels together? | nodes + edges `count >= 2` | Hand layout if <15 themes; `d3-force` vendored if more. Radius = count, fill = mean mood ramp | Node → thread of entries with that theme |
| Tension | Stated vs revealed? | Insights with `tension` | SVG axis, two labelled poles, two markers | Marker → that insight body |
| Stream | What’s swelling? | `themeWeekly` | Stacked areas using vendored `d3-shape` `stackOffsetWiggle`; top 6–8 themes + `other` | Band → filter constellation + sheet |
| Transitions | What follows a Low day? | `moodTransitions` | Sankey-style bands | Node/band → those dates |
| Bump | Who’s rising? | `themeRanks` | Rank lines, y inverted | Line/week → entries that week |
| Chord | Whole network at once? | same matrix as constellation | Chord; toggle with constellation if both would clutter — default show both as separate tiles | Arc → isolate connections + sheet |
| Radial year | Does the year have a season? | day-of-year presence + mood for 365 | SVG arcs/ticks | Day → summary |
| Horizon | Many metrics, one strip? | daily mood_score, energy mapped 1–3, optional workout binary | Thin intensity bands; click expands that metric to a line in the overlay | Band → expanded line + days |
| Butterfly | Vera vs Penelope on a theme? | `butterfly` | Diverging bars, Vera left, Penelope right | Theme → both agents’ entries |
| Lexical | Is the language shifting? | `lexicalSeries` | Multi-line | Point → entries containing the term; settings to add/remove terms |
| Waffle | Volume and quality? | one square per entry | CSS grid, mood colour | Square → that entry |
| Sessions | What did we say? | `sessions` newest first | Existing cards + mood-shift spark | Card → full session fields in sheet |
| Cross-Agent | Who’s handing off? | CN lines | Existing accent strip | Line is the detail (no empty placeholder) |

Empty/sparse: still mount the tile. Caption names the shortfall (“4 transitions in this range”). Do not hide the chart.

---

## Agent write-path

Conversation-first unchanged.

**Vera** (`config/vera-protocol.md` + `chat-schema.mjs` `mind_session`): at natural close, populate `title`, `themes[]`, `pattern_tags[]`, `session_type`, `mood_at_open`/`mood_at_close`, `insight`, `observation`, `closing_question`. When the session is dialectic, also propose a Mind Insight with Tension/Stated/Revealed lines. Auto-write still applies to `mind_session` only.

**Penelope**: keep confirm gate. Prefer `tags` that match Vera’s theme vocabulary when the day is clearly about an existing thread. `source_agent: penelope`. Multi-mood rules unchanged.

**mind-digest.mjs:** include new fields in the bounded 30-day digest (theme list, last tension, streak, factor names) as metadata — still no raw diary dump to Vera.

---

## Libraries and files

Client stays PWA-friendly. Prefer `js/app/chart-kit/` primitives. For force, sankey, chord, stack-offset-wiggle: **vendor** the small `d3-force` / `d3-sankey` / `d3-chord` / `d3-shape` builds under `js/app/chart-kit/vendor/` and precache them in `service-worker.js` (bump `CACHE_NAME`). Do not load cdnjs at runtime (offline + CSP). Do not add a bundler.

Expected files:

| Path | Role |
|---|---|
| `js/app/mind-model.js` | Derived series, co-occurrence, factors, lexical, butterfly |
| `js/app/render-mind.js` | Masonry hosts, tiles, overlay sheet, animations |
| `js/app/mind-thread-sheet.js` | Overlay sheet (keep `render-mind.js` from growing without bound) |
| `js/app/chart-kit/*` | New builders: bars, sankey-ish, chord, stream, bump, horizon, radial-year, waffle helpers; reuse area-line, pie, ring, heatmap, animate |
| `index.html` | Tile hosts; launchers at top; remove bottom-only agent row |
| `css/app.css` | Masonry, tile chrome, overlay, factor bars; Clinical Glass tokens only |
| `js/core/validate.js` + `chat-schema.mjs` | New fields |
| `config/vera-protocol.md` / `penelope-protocol.md` | Write the new fields |
| `netlify/functions/_shared/mind-digest.mjs` | Surface new metadata |
| `scripts/import-mind-notion.mjs` (or `js/core/` helper + tests) | One-shot import |
| `tests/unit/mind-model.test.js`, `render-mind.test.js`, import tests, `page-headings.test.js` if headings change | |
| `service-worker.js` | Precache new modules + vendor |

---

## Error handling

- Missing new fields on old files: treat as empty arrays / null. Dashboard still renders.  
- Import collision: skip existing `id`.  
- Overlay with no excerpt: show title + date only.  
- Tension tile: hidden (not empty chart) when no insight has tension — exception to “always draw”, because the geometry is meaningless without poles.  
- Factor with insufficient n: omit that bar, keep the tile if any factor qualifies; else caption.  
- `model.empty`: keep a board of launchers + empty captions, not a blank page.

---

## Testing

- Model: co-occurrence pairs, factor threshold 3/3, streak math, weekly ranks, transition pairs, lexical word boundaries, butterfly grouping, resurfacing >7 days, tension parse.  
- Render: launchers copy, masonry hosts present, overlay opens on click and closes on Esc, reduced-motion skips entrance, agent colours via `agentColour()`.  
- Import: CSV row → session record field map; diary page → moods; historical → `session_type: historical`; intake is not a diary file.  
- Validate: new fields optional; invalid `session_type` rejected.  
- Browser: Mind tab smoke with imported fixtures; every chart host exists; load-in class applied.

## Manual check

Masonry has no large holes at 2/3/4 columns. Each tile has question + legend. Hover shows a number. Click opens the sheet. Talk buttons at top. Charts animate once on range change. Clinical Glass still reads as Body/Bloods, not a Pinterest skin.
