# Future charts

> ★ **Great graphs for the future.** Designed, liked and deliberately parked. Not in the chart library yet.

These are finished designs that did not fit the job they were drawn for but are worth keeping. They live here as standalone prototypes (sample data, plain SVG, no build step) so the look and the motion are never lost.

**Rule for agents:** do not import or copy these into a hub as they stand. To use one, promote it: port the geometry into `apps/life/js/app/chart-kit/` as a scene builder, add a row to `CHARTS.md`, log it, same PR. See "How to add or change a type" in `CHARTS.md`.

Open a prototype by loading the `.html` file in a browser.

| Id | File | What it shows | Why parked | Good future fit |
|----|------|---------------|------------|-----------------|
| `weight-line` | `weight-line-and-bullseye.html` | Promoted 2026-09-22 to library type `transit-lines` (`apps/life/js/app/chart-kit/transit-lines.js`). Prototype kept for the original look. | Promoted — used by Tasks Graph Lines. | Tasks project lines; any milestone journey toward a destination. |
| `bullseye-rings` | `weight-line-and-bullseye.html` | One ring per period, radius set by value, closing in on a target bullseye. Peak ring dashed, today's ring bold and squeezing in from the peak on load. Hover picks the nearest ring by radius. | Body page weight (Sep 2026): same reason. Rings tighten but nothing moves down. | Convergence stories: variance tightening, time-to-target closing, accuracy drills, hitting a band on repeated attempts. |

## Log

| Date | Id | Change |
|------|----|--------|
| 2026-09-22 | `weight-line` | Promoted to `transit-lines` for Tasks Graph Lines. Prototype file kept. |
| 2026-09-22 | `weight-line`, `bullseye-rings` | Parked from the Body page chart redesign (round one concepts B and C for weight). |
