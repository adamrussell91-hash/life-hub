# Mind dashboard visual restyle

**Date:** 2026-08-16  
**Status:** Approved (implementing).  
**Does not replace:** `2026-08-15-mind-dashboard-v2-design.md` (data model, import, overlay sheet, chart catalogue, conversation-first logging). This spec is the **read surface** only.  
**Chart language:** `2026-07-31-life-hub-design.md` → Charts.  
**Approach:** Restyle in place. Keep `masonry.js`. Do not add a new packer or palette.

## Goal

Make Mind look like Clinical Glass (same family as the Bloods restyle): a calm analysis board. Conversation happens in Chat. Charts that cannot speak stay as honest sentences, never fake filled shapes.

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | Whole Mind board |
| Layout | Clinical masonry (mixed tile heights, ~12px gutters). Not a Bloods-style accordion |
| Cadence | **Cut completely.** Remove Diary / Vera / Penelope heatmap grids (`#mind-cadence` heatmap). Do not replace with another calendar of squares |
| Showing up | Keep the **streak ring** tile only (“Am I showing up?” / last 30 days) |
| Talk launchers | **Remove** Talk with Vera / Talk with Penelope from Mind. Chat tab / chat function is the only door |
| Sparse charts | **Honest empty:** keep the tile; no SVG blob; one sentence of threshold + how many you have |
| Session / insights | **Scan, then sheet:** date + title + one line + mood chip. Full prose only in `#mind-thread-sheet` |
| Themes | Names as kit chips. Do not present a wall of `Theme · 1` as if it were a chart. Caption may say “8 first-seen this month” |
| Colour | Kit tokens only (`--wave`, `--marine`, `--pastel-*`, `--success`). No orange paragraph walls as body text. High Sea is not insight body colour |
| Implementation | CSS + `render-mind.js` / `index.html` / tests. Masonry still packs remaining tiles |

## Out of scope

- Changing Vera auto-write vs Penelope confirm  
- New diary/session fields or a new import  
- Hiding analysis tiles from the catalogue (chord/Sankey/radial stay on the board as honest-empty until they qualify)  
- Rebuilding the overlay sheet’s behaviour (only feed it shorter board chrome)  
- Cadence heatmap “fix” (it is deleted, not restyled)

## Cuts (must unmount)

1. `#mind-launcher-vera`, `#mind-launcher-penelope`, and any duplicate Talk buttons on the Mind section.  
2. The cadence heatmap article (`#mind-heatmap-diary` / `vera` / `penelope` rows and `#mind-cadence` if it exists only for those grids). Recurring themes may stay as their own tile on the masonry board, not paired with the heatmap.

If `#mind-cadence` is only heatmap + themes, split: delete heatmap markup; move themes onto the board as a normal `mind-tile`.

## Tile chrome

Every remaining analysis tile:

1. Question kicker (uppercase, `--wave`)  
2. Short title  
3. One-line legend when a chart is shown  
4. Chart **or** honest empty sentence  
5. Hint that click opens the sheet when the mark is interactive  

Honest empty copy names the **threshold** and the **count** (“Need 3 paired themes. 1 pair so far.”). Never a solid disc, rectangle, or empty radial with month labels and no ticks pretending to be a chart.

When a chart **does** qualify, follow the Life Hub Charts overview: Wave strokes, kit pastels, vertex dots on mood arc, no fake fill-for-fill’s-sake. Legends must not be longer than the drawing.

## Prose tiles

**Latest Vera session** (if present): kicker `DD/MM/YY · Vera`, session title, **one sentence** (insight or observation, truncated), mood chip (`mood lifted` / `eased` / `held` with open→close). Click opens the sheet with the full thread.

**Mind Insights:** list of title + one sentence each (cap visible rows to ~2–3; “more in sheet” if needed). Timeline dots may stay if they fit kit (`--wave`), not a long italic column.

Do not put High Sea / orange on paragraph body. A short quote chip is allowed if it uses `--pastel-peach` / `--pastel-peach-ink` or muted, not a wall of orange.

## Charts that still draw

Keep (when data qualifies): mood arc, mood mix, energy rings, streak ring, factor bars, constellation, tension, stream, transitions, bump, chord, radial year, horizon, butterfly, lexical, waffle, cross-agent, recurring theme names, session/insight scan cards.

**Do not draw** until thresholds in v2 (or this spec’s honest-empty) are met. Today’s solid-blue Sankey/chord and empty radial year are bugs against this spec.

## Files (expected)

- `index.html` — remove launchers and cadence heatmap markup  
- `js/app/render-mind.js` — stop painting heatmaps; clamp session/insight text; honest empty instead of empty SVG hosts; packer input without cadence  
- `css/app.css` — drop unused heatmap rules if orphaned; tile type; no orange insight body  
- `tests/unit/render-mind.test.js` — no Talk buttons; no heatmap hosts required; empty copy; one-line session  

## Success

Adam opens Mind and does not see Talk buttons or a grey cadence grid. Insights scan in one glance. Empty analysis tiles read as sentences. Chat is how you reach Vera and Penelope.
