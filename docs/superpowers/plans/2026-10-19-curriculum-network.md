# Curriculum network: build plan

Spec: `docs/superpowers/specs/2026-10-19-curriculum-network-design.md`
Branch: `claude/curriculum-network`, one PR, a commit per phase.

## Decisions made while planning

- **One layout engine for both zoom levels.** `apps/teaching/src/network/` holds the pure model: rows (lessons or units), the lines through them, gaps (rail stops, gates) and a terminus. It lays out in "along / across" coordinates and maps them to vertical (desktop) or horizontal (phone) at the end, so the phone map is the same map transposed. The unit map block and the year network both call it.
- **v1 blocks render without being saved.** `toNetworkV2(v1, lessons)` converts in memory for display (virtual subject lines from strands, virtual stops from stations). The "Upgrade this map" bar runs the same conversion and writes it: PATCH the subject's `network_lines`, PATCH each lesson's `line_stops`, then save the block as v2.
- **A v1 text station on a train or metro strand** becomes a rail stop on that line (a small stop in the gap), because the spec's rule "becomes a light-rail text stop" needs a light-rail line to sit on. Rail stops on train or metro lines are always kind `stop`; only light rail branches.
- **Lesson titles sit in a left gutter**, level with their pill, so light-rail lines that join a station at its edge never run under a label.
- **The year network's geography** uses the spec's fallback: a fixed zigzag of the trunk between units, with tighter gaps between units that share more lines. Teacher drags a unit to nudge it.
- **Students' year network** gets its own public endpoint, `/api/published/networks/:classId`, so the class page does not pay for it on every load.
- **Week bands** on the teacher unit map come from the class with the most scheduled lessons in the unit. Students' unit map has no bands (the unit page has no class).
- **Subject line list editor** lives on the scope page's Network tab (that is the subject's page) and is also reachable from the unit map editor.

## Phases

1. **Data.** `Subject.network_lines`, `Subject.network_nudges`, `Lesson.line_stops`; `curriculum_lines` content becomes a union of v1 and v2; lesson summaries in `/api/curriculum` carry `line_stops`; `/api/published/units/:id` carries `network_lines` and each lesson's `line_stops`. Regenerate `teaching-block-schema.mjs`. Conversion `toNetworkV2` with tests.
2. **Engine and unit map renderer.** `network/layout.ts` (trunk columns, train detours in nested lanes, straight metro, light-rail lanes alternating right/left, joins at station edges, spurs, loops, gates, nudges, terminus) and `network/draw.ts` (SVG, both orientations). The block renders v1 and v2 through it.
3. **Editors.** Lines list editor; lesson line chips beside the outcome strip; unit map editor (rail stops with lesson/block/text targets, gates, terminus, drag-to-nudge on the preview); upgrade bar.
4. **Year network.** Network tab on the scope page: units as stations, aggregated stops and depth, HSC terminus, class-now dot, tap a unit to open its plan, drag a unit to nudge, outcome coverage panel.
5. **Students.** Published unit map with published lessons only; year network on the class site from the new endpoint.

## Verify

Unit tests for the engine and conversion; browser check of the unit map, editor and Network tab at desktop and 390px on the local dev server; `npm run pre-pr-check`.
