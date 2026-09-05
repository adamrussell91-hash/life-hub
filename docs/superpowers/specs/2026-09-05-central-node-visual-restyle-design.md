# Central Node dashboard visual restyle

**Date:** 2026-09-05  
**Status:** Draft (review). Spec only — no implementation in this pass.  
**Does not replace:** `2026-08-09-hammond-central-node-governance-design.md` (CN + Governance Log write contract) or `2026-09-05-hammond-whole-hub-coordination-design.md` (Clare/Ann mailbox, audit contracts, `DOMAIN_PATH`). This spec is the **read surface** only.  
**Chart language:** `2026-07-31-life-hub-design.md` → Charts.  
**Tile chrome / spacing:** `2026-08-16-mind-visual-restyle-design.md` (question kicker, honest empty) and `2026-08-09-tile-spacing-chrome-design.md` (`--space-stack` / `--space-grid` / `--space-tile`). Do not invent a fifth layout convention.  
**Approach:** Restyle in place. Reuse existing `chart-kit` builders. Do not add a new packer, chart type, or palette.

## Goal

Make Central Node look like the same Clinical Glass analysis board Mind already is: packed tiles, kit-token charts, honest empty sentences. Conversation stays in Chat with Hammond. Charts that cannot speak stay as sentences, never fake filled shapes. The eight markdown sections remain the same sections — only how they are packed and drawn changes.

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | Whole `#central-node-dashboard` read surface |
| Layout | Clinical masonry (same packer as Mind). Not a Bloods accordion, not an 8-card stack |
| Packer | `chart-kit/masonry.js` `packMasonry()`. Same numbers as `packMindBoard`: gap `16`, columns `width >= 900 ? 3 : width >= 560 ? 2 : 1`. Host `#cn-board` (mirror `#mind-board`). Filter only `.cn-tile` children — never pack the FABs |
| Colour | `CLINICAL_CHART_SLOTS` only (`clinical-slots.js`). Override `stream.js`’s `WATCHLIST_SLOTS` at paint time. No CN-only hex. No `--high-sea` as body text |
| Sparse charts | **Honest empty:** keep the tile; no SVG blob; one sentence of threshold + count |
| Implementation | CSS + `render-central-node.js` / `central-node-charts.js` / `#central-node-dashboard` markup / tests. Model may grow **derived** series only (see Files) |
| Coordination / audit code | **Do not touch** `persona.mjs`, `hammond-audit.mjs`, `hammond-audit.js`, `CROSS_AGENT_AGENT_NAMES`, chat routing, or any PR #131 mailbox/audit contract |
| Year series cost | **Client-only.** Dashboard `events` are already in `latestResult` from the PWA sync snapshot (Cache Storage, not a CN fetch). Do **not** widen `CN_MODEL_WINDOW_DAYS` / `selectHammondEventEntries` |

### (a) Section → chart-kit mapping

Verified against the live model (`buildCentralNodeModel`), the markdown extractors in `constraints.js`, and each builder’s input shape. **Do not force a builder whose input the section does not have.**

| Section | Current draw | Replaces with | Why this builder (or not) |
|---|---|---|---|
| **Today's Status** | Completion ring (`ring.js` via `buildCompletionRing`) + live checklist + markdown prose | **Stays hybrid prose + existing `ring.js`.** Masonry packs the tile (`data-cn-span="2"` on ≥3 columns). No new chart | Ring already is chart-kit. Checklist and Status prose are today’s snapshot, not a series. `buildMetricStrip` / chord / radial do not fit |
| **This Week** | Full-width protein `buildProteinLineChart` (nutrition-charts, not chart-kit) + optional prose | **`horizon.js` `buildHorizonBands()`** for the 7-day `week[].protein_g` series. Prose stays under the strip | `week` is `{ date, protein_g }[]` — exactly `buildHorizonBands([{ key: 'protein', points: [{ date, value }] }])`. **`buildMetricStrip()` does not fit:** that function is mood-score + energy-level ticks (`high` / `medium` / `low`), not grams. Do not invent protein buckets to feed it |
| **This Month** | Markdown (goals / upcoming) + 30-tile logging `.heatmap-grid` | **Stays prose** for the markdown. Logging heatmap **unmounts** and joins the radial-year tile (below). No horizon on this tile | This Month copy is events and goals, not a numeric series. A 0/1 horizon of `loggingMonth` would duplicate the radial logging ring. Do not draw both |
| **Long-Term Trends** | Long markdown + exercise + eating 30-tile heatmaps | **`stream.js` `buildThemeTopography()`** of weekly **Life-domain logging volume**. Exercise / eating heatmaps **unmount** and join the radial-year tile. Prose stays as a short scan (see Prose tiles) | Builder wants `{ weeks, series: [{ key, values[] }] }`. Derive from `events` already in the model: Sydney-week counts for `nutrition`, `fitness`, `diary`, `body`, `skincare`, from 1 Jan of `model.date`’s year through `model.date` (same window as the radial year). **Do not add Tasks / Teaching series** (`DOMAIN_PATH` stays the five Life domains per PR #131). Honest empty if `< 1` weekly band |
| **Governance Log** | `render-governance.js` entry cards with `"Nd open"` text | **`watchlist-heat.js` `buildWatchlistHeat()`** for open-item aging, plus the existing scan list | Builder wants `{ term, points: [{ date, count }] }[]`. Rows = unresolved entries (`openGovernanceEntries`); columns = last 8 Sydney weeks; `count = 1` on every week the item has already been open. Aging reads as a lengthening heat bar. The `"Nd open"` caption still uses `ageDays` from `openGovernanceEntries` (a row of ones will not make `watchlistDelta` meaningful). Resolved entries stay in the list, not the heat. Honest empty if `< 1` open item |
| **Cross-Agent Coordination** | Wall of markdown one-liners | **`chord-layout.js` `buildChordLayout()`** of `Sender→Recipient` pairs. Lines become **detail-on-focus** under the diagram, not a second wall | Builder wants `{ themeA, themeB, count }[]`. Parse `A→B:` (and `A → B:`) from `sections.crossAgentCoordination`. Count directed edges. Cap nodes at 8 (same as Mind). Clare / Ann / Hammond hops are real after PR #131 — they are nodes when present. Drop `Clementine` if a line names her. Honest empty below **3 paired edges** (Mind’s chord threshold). Unparseable lines (no arrow) are omitted from the tile once the chord qualifies — they are not a second wall |
| **Recent Agent Actions** | 48-hour one-liners | **Stays prose** | A rolling 48-hour list is not a series, not a pair matrix, not aging. Masonry packs it |
| **Constraints & Priorities** | Collapsed `<details>` of protocol markdown | **Stays prose**, still a `<details>` tile. Repack masonry on toggle | Medical / dietary rules are reference text. Not a chart |

**Consistency radials (not a ninth markdown section).** The three 30-day heatmap-grids (`#central-node-logging-heatmap`, `#central-node-exercise-heatmap`, `#central-node-eating-heatmap`) currently sit inside This Month and Long-Term Trends. They become **one** new tile on the board:

- **`radial-year.js` `buildRadialYear()`** three times, painted as **three concentric rings** on one SVG (logging inner, exercise mid, eating outer).
- `byDate[date]` is a hit/miss (or null), not a Mind mood string. The builder already treats `byDate` as an opaque payload (`tick.mood`). Colour hits with `CLINICAL_CHART_SLOTS` — do not reuse `--mood-*`.
- Extend the model from 30 days to the **Sydney year of `model.date`** so the year clock is honest. Same completeness / workout / eating helpers already used for the month grids. **No wider sync read:** `buildCentralNodeModel(latestResult)` already receives the app-wide event list. `loadLiveEvents` first-paints 7 days, then backfills doubling windows up to `MAX_LOOKBACK_DAYS` (3652) into Cache Storage (`life-hub-private-v2`). A year is inside that existing walk (covered by the fourth backfill window). Render only filters `latestResult.events` already in memory. Mid-backfill paints stay sparse/honest from whatever days have arrived — same as today’s 30-day grids on first paint. **Do not change** Hammond’s server reuse: `chat.mjs` feeds `buildCentralNodeModel` a separate 30-day blob set (`CN_MODEL_WINDOW_DAYS`). Walking a year of a 30-event array there is fine; widening that bound is not this spec.
- Bloods’ FBC radial (`buildFbcRadial` in `bloods-charts.js`) is a **different** mark (allowance wedges per marker). Do not reuse it. This tile matches **Mind’s** radial-year clock, in the same Clinical Glass family Bloods already uses for colour.
- Honest empty if `< 1` hit day in any ring.

### (b) Future Tasks / Teaching strip

**Do not reserve a visible slot or empty tile.**

PR #131’s follow-up explicitly deferred “a Tasks/Teaching strip on the CN tab” until a second presence-scan exists, and forbade widening `DOMAIN_PATH` / CN heatmaps. This restyle has no client snapshot to draw, and an honest-empty placeholder for a deferred feature is clutter.

Masonry is a packer, not a reserved grid. A later tile `#cn-tile-other-hubs` with `data-cn-span="2"` can drop onto `#cn-board` and pack without a second restyle. Do not fetch `hub-agent-context`, Tasks blobs, or Teaching blobs in this pass.

### (c) Run audit + Hammond chat

**Explicitly out of scope.** `#central-node-audit-button` (`.cn-audit-button`) and `#central-node-chat-button` (`.floating-chat-button`) stay where they are, with the same copy, classes, and fixed position (including the existing `max-width: 720px` offset above `.hub-mobile-nav`). They remain dashboard children but are **not** masonry items and are **not** restyled.

### (d) Mobile (390 px)

`apps/life` already contracts no horizontal overflow at 390 px (README browser suite; `hub-mobile-nav` + More sheet). Central Node is a More destination — the bottom bar stays. Each replaced chart:

| Mark | Below 560 px (includes 390) |
|---|---|
| Masonry | 1 column, tiles full board width, gap `16`. Board is one `.dashboard` child so `--space-stack` still separates heading from board |
| Horizon bands | `buildHorizonBands` default `320×24` (or tile-width) SVG `preserveAspectRatio="xMidYMid meet"`. Ticks compress; no x-scroll |
| Radial year | One SVG scales down; three rings stay concentric (do not split into a row). Month labels keep Mind’s 12-label treatment |
| Stream | `960×480` viewBox scales to tile width. **Hide contour lines below 560** (ribbons only). Week ticks already thin via `weekShows` |
| Chord | Mind-sized viewBox scales. **Focus, not hover-only:** marks are focusable; a caption `[data-cn="chord-detail"]` shows the pair’s lines (touch has no hover). Min 44 px hit area on the tile, not on every ribbon |
| Watchlist heat | Term label + cells wrap inside the tile. Cap visible rows at ~5; remaining open items stay in the prose list |
| Prose tiles | Full width, existing `.prose-section` type. Constraints `<details>` still collapses |
| FABs | Unchanged; already lifted above the 5.5 rem mobile nav |

Reduced motion: reuse `animate.js` once-only reveals already imported. No new looping motion.

## Out of scope

- `persona.mjs`, `hammond-audit.mjs` / `hammond-audit.js`, Clare/Ann mailbox gates, `CROSS_AGENT_AGENT_NAMES`, chat-run path  
- Implementing the deferred Tasks / Teaching strip or any Other-hubs fetch  
- New CN markdown headings, write-path changes, or Governance entry types  
- New chart-kit modules, a second packer, or a CN palette  
- Restyling Run audit / Hammond FAB  
- Bloods FBC radial, Mind overlay sheet, Talk launchers, cadence heatmaps (already gone on Mind)  
- Changing how Status / Week / Month / Trends **prose is authored** — only how it is shown

## Cuts (must unmount)

1. `#central-node-week-chart` and the `buildProteinLineChart` / `nutrition-charts.js` import in `render-central-node.js`. Protein this week becomes a horizon band. The `2026-08-06-layout-polish-design.md` “chart-first protein line” rule is **superseded** for this card only.  
2. `#central-node-logging-heatmap`, `#central-node-exercise-heatmap`, `#central-node-eating-heatmap`, and the `.trend-pair` wrapper that holds the last two.  
3. The eight stacked full-width `.metric-card` column as the only layout. Cards become `#cn-board > .cn-tile` packed by `packMasonry`.  
4. Any leftover CN-only `.heatmap-grid` rules that exist only for those three hosts.

Do not cut the completion ring, live checklist, Status snapshot, prose hosts (`[data-central-node="…"]`), Constraints `<details>`, Governance list, or the two FABs.

## Tile chrome

Every remaining board tile (including prose-only):

1. Question kicker — uppercase, `--wave`. **Reuse** `.mind-tile__question` by extending the selector to `.cn-tile__question` with the same values (do not fork a third kicker).  
2. Short title (existing `.metric-label`).  
3. One-line legend when a chart is shown (`.mind-tile__legend` / `.cn-tile__legend`, same rule).  
4. Chart **or** honest empty sentence.  
5. Caption that focus opens detail, when the mark is interactive (chord ribbons, radial ticks, heat cells).

Honest empty copy names the **threshold** and the **count** (“Need 3 paired handoffs. 1 pair so far.”). Never a solid disc, empty year clock, or blank stream pretending to be a chart.

When a chart **does** qualify: Wave / `CLINICAL_CHART_SLOTS` strokes, no fake fill-for-fill’s-sake. Legends must not be longer than the drawing.

Kickers (locked):

| Tile | Kicker |
|---|---|
| Today's Status | Has today been logged? |
| This Week | How is protein moving? |
| This Month | What’s on the month? |
| Long-Term Trends | Where is attention going? |
| Consistency (radials) | Who showed up this year? |
| Governance Log | What’s still open? |
| Cross-Agent | Who is handing off to whom? |
| Recent Agent Actions | What just happened? |
| Constraints | What still binds? |

## Prose tiles

**Today's Status:** keep the hybrid row (ring + checklist + snapshot + markdown). On 1-column, the existing `@media (max-width: 48rem)` stack already collapses `.status-hybrid` to one column — keep it. Do not put High Sea / orange on Status paragraph body.

**This Week / Long-Term Trends:** chart (or honest empty) first; agent markdown **below**. If prose is empty/missing, omit the prose block (same as the 2026-08-06 protein-card rule). Long-Term Trends body is a **scan**: first three bold domain labels + one line each, then an in-tile **More** that expands the rest and **repacks**. Not a Mind overlay sheet.

**This Month:** prose only (no chart on this tile). Empty host stays omitted, not a “No agent notes” slab.

**Governance Log:** heat strip first when it qualifies; then the existing `.governance-entry` scan (`date — type — Nd open`, title, status, body). `render-governance.js` still owns the list. Do not restyle entry cards beyond what the heat strip needs.

**Cross-Agent:** chord (or honest empty) first; idle caption may show the newest line. Focused ribbon / arc writes the matching `Sender→Recipient:` lines into `[data-cn="chord-detail"]`. Do not keep the full wall visible once the chord qualifies.

**Recent Agent Actions:** list as today, newest first, 48-hour window unchanged.

**Constraints:** collapsed `<details class="metric-card cn-tile constraints-card">`. Opening changes height — call the packer again.

Do not put High Sea / orange on paragraph body. A short quote chip may use `--pastel-peach` / `--pastel-peach-ink` or muted, not a wall of orange.

## Charts that still draw

Keep (when data qualifies): completion ring, week protein horizon, year consistency radials, domain stream, governance aging heat, cross-agent chord.

**Do not draw** until the thresholds above are met. Today’s empty heatmaps-of-grey-squares and a chord of one hop are bugs against this spec.

**Do not draw:** protein area-line on CN, three 10-column heatmap grids, Tasks/Teaching volume, Knowledge / Clementine as a chord node (Clementine stays out per PR #131).

## Files (expected)

Read-surface files named in the brief:

- `apps/life/index.html` — wrap tiles in `#cn-board`; add chart hosts; remove the three heatmap grids and `#central-node-week-chart`; keep FAB markup  
- `apps/life/js/app/render-central-node.js` — import the builders above (not only `animate.js`); pack `#cn-board`; honest empty; stop painting heatmaps and the protein line  
- `apps/life/js/app/central-node-charts.js` — keep `buildCompletionRing`; add small adapters only (horizon metrics from `week`, radial `byDate` maps, chord edges from coordination text, stream weekly from events, watchlist series from open governance). No new chart algorithms  
- `apps/life/css/app.css` — `#cn-board` / `.cn-tile` by extending Mind + tile-spacing rules; drop orphaned CN heatmap rules  

Allowed companions (view-model / tests only — not coordination work):

- `apps/life/js/app/central-node-model.js` — derived series on the existing `events` + markdown + `governanceLogMarkdown` thread. No new record types  
- `apps/life/js/app/app-controller.js` — only if `buildCentralNodeModel` must receive `governanceLogMarkdown` (already loaded). No behavior change  
- `apps/life/js/app/render-governance.js` — list stays; may accept a heat host already in the tile  
- `tests/unit/render-central-node.test.js`, `central-node-charts.test.js`, `central-node-model.test.js`, `render-governance.test.js`  
- `tests/browser/central-node.spec.mjs` — drop “30 heatmap tiles” assertions; assert board tiles, honest empty, ring label, Hammond FAB unchanged  
- `apps/life/service-worker.js` — `CACHE_NAME` bump after shell HTML/CSS/JS change  

**Do not expect changes to:** `persona.mjs`, `hammond-audit.mjs`, `hammond-audit.js`, `validate.js` agent-name lists, `hammond-digest.mjs`, `hub-agent-context.mjs`, chat functions.

## Success

Adam opens Central Node and does not see eight stacked full-width cards, a lone protein line, or three grey 30-day grids. Status still answers “logged today?” at a glance. Week protein is a compact strip. Year consistency is a radial clock. Trends are a stream of domain volume or a sentence. Open governance items age as heat. Cross-agent handoffs are a small chord, with Clare/Ann/Hammond visible when the lines exist. Chat and Run audit are where they were. At 390 px the board is a single column and does not overflow.
