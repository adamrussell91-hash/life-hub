# Tasks Graph: visual contract (round 2)

Put this folder at `docs/proposals/graph-reference/`. It is the design spec for the Graph page. It overrides the look described in the round 1 prompt. The round 1 behaviour and wiring still stand.

## Why this round exists

The `cursor/graph-redesign-8dfd` branch has the logic but not the design:

- Stations in Lines have no names.
- Every SVG label is 11px navy because of one shared CSS rule.
- The tracks are thin navy strokes rather than the line colour.
- The terminus is plain text.
- None of the entrance motion is implemented.

Adam signed off on the mockups, and this build doesn't look like them. From now on, **the reference files are the design.** Port them. Don't reinterpret them.

## What's in this folder

| File | What it is |
|---|---|
| `lines.html`, `branch.html`, `orbit.html` | Working reference prototypes with exact geometry, type, colour and motion. Open them in a browser: they animate and respond to hover and click. Each has "reference controls" (replay, trace, complete) that aren't part of the product. |
| `golden/*.png` | Target screenshots at 1280px and 390px, 2× scale, taken after the entrance motion has finished. |
| `fixture.json` | The data behind the golden images. Seed it and freeze the clock to 2026-09-22 09:00 Sydney time, and your build should reproduce them. |
| `graph-visual.spec.mjs` | Playwright visual contract. Goes in `apps/tasks/tests/browser/` and is registered in `test:browser`. |
| `compare.html` | Puts your screenshots (`compare/`) next to the golden images, side by side or as a difference overlay. |

## Rules

1. **Port the constants verbatim.**
   - Each reference has a `G` or `O` constants block and marks it "port exactly". Move those numbers into the chart-kit scene builders (`transit-lines.js`, `flowchart-lanes.js` and `orbit-radar.js`) as named exports.
   - Views read them from there. There are no magic numbers in the views.
2. **Replace literals with tokens.** The references inline token values so they can run standalone. In the hub, every literal maps to its `var()`, as shown in the table at the end.
3. **Domain colours come from Properties.** The fixture sets teaching `#376fb7`, professional `#5d4e70`, life `#2f7a4f` and health `#f68620`.
4. **Delete the shared 11px rule in `graph.css`.** It currently sets `.graph-ghost__label, .graph-terminus, .or-ring__label, .fl-lane__label, .fl-box__title, .fl-box__sub, .fl-box__badge { font-size: 11px }`. Each text role gets its own class with the type from the tables below.
5. **Never tear down and redraw on data change.** Update in place, keyed by id. `host.replaceChildren()` is only allowed on first mount.
6. **Every SVG element that scales or rotates** gets `transform-box: fill-box; transform-origin: center`. Without it, the breathing ring and the pop-ins pivot around the SVG origin.
7. **Add `data-part` attributes** exactly as `graph-visual.spec.mjs` expects. Don't edit the spec to fit the build. If you believe an assertion is wrong, explain why in the PR.

## Process (loop until it matches)

1. Seed `fixture.json` and freeze the clock, then run `npx playwright test apps/tasks/tests/browser/graph-visual.spec.mjs`.
2. Open `docs/proposals/graph-reference/compare.html` and check every pair side by side, then with the difference overlay.
3. Fix whatever is different and repeat.
4. You're done when every assertion passes **and** the pairs only differ in anti-aliasing. Attach the six compare screenshots to the PR.

Also watch each reference animate in a real browser and match the motion by eye, frame for frame, using the motion table below. Record a short screen capture of your build's entrance for each view and attach it to the PR.

---

## Gap list: what's wrong on the current branch

**Lines (`views/graph-lines.ts`, `styles/graph.css`)**

- Station titles and statuses are never rendered (they only exist as `aria-label`). **This is the biggest miss.**
- The track is one 4px path. It needs to be two paths, travelled and ahead, at 7px, with the travelled part fading to 0.32.
- Stations are drawn with a navy stroke at width 2, done stations are filled with `currentColor`, and there's no white halo. They should use the line colour, with the fill and stroke taken from the table below.
- The "you are here" ring uses Wave instead of the line colour, has r 14 instead of 18, and has no `transform-box`, so it breathes around the corner of the SVG.
- The blocked barrier is a 16×4 bar floating above the station. It should be a 7×30 vertical bar through the track, with a white stroke.
- The ghost snaps to a whole station. It should sit at a fractional position, with a dashed leader and a 12px label.
- The terminus is 11px text. It should be a filled pill.
- The "+" glyph is always visible. It should only appear when hovering over the gap between stations.
- Branches (`parent_task_id` children) aren't drawn at all.
- Waiting glyphs and Clare's suggested stations are missing.
- Service pills are glass with a coloured border. They should be tinted fills with a dot and a bold name.
- The Clare alert is a dashed glass button full of text. It should be a tinted card with an avatar, a bold headline, and primary and ghost buttons.
- There's no vertical layout at 390px.

**Branch (`views/graph-branch.ts`, `chart-kit/flowchart-lanes.js`)**

- `orthogonalPath` routes through the midpoint between source and target with sharp `L` corners. That cuts through boxes when an edge skips a column. Use the reference routing: turn in the channel just before the target column, with corner radius 8 using `Q`.
- There's no port spreading, so several edges pile into the same point.
- Boxes have 11px text. The status stripe is a full-height single-sided edge; it should be an inset rounded pill.
- Lanes have a glass fill with a stroke. They should have a tinted fill, no stroke, and a header with a colour chip plus meta text.
- Every edge is navy. Use the edge colour table below.
- The "Do first" badge is loose text. It should be a pill sitting on the box's top edge.
- The minimap is always drawn. It should only appear when content overflows.
- Milestones aren't visually different from tasks.

**Orbit (`views/graph-orbit.ts`)**

- Bodies have a navy 20% stroke. They should have a 2px white halo.
- There's no "Later" belt and no entrance spiral.
- The trail length is `speed × 0.4`. It should be `min(ω × 2200ms, 1.3 rad)`.
- The side panel is missing (load bars, Clare note cards, legend). There's only a banner line.
- Ring labels are 11px navy. They should be 10px, 600 weight, caps, 0.08em tracking, muted.
- The Pause control is text-only, with no "Now" button and no paused tag.

---

## Lines contract

**Layout (desktop, ≥ 560px canvas)**

| Part | Spec |
|---|---|
| Line block | 22px padding top, 1px `--line` divider between lines (none above the first). Header: 10×10 colour chip (rx 3), name 17px/600 `--ink`, meta 13px `--muted` with the counts in 600 weight. "Behind pace" is `--high-sea-ink`; "no movement" is `--danger`. |
| Station spacing | `step = (width − terminusWidth − 4 − 22 − 44) / (n − 0.5)`. First station at x = 44. Terminus at `lastX + step × 0.5 + 22`. |
| Track y | 40 within the line's SVG, or 52 when labels alternate. |
| Track | Travelled path from the first station to the current station, then an ahead path from the current station to the terminus. Stroke 7, round caps, line colour. Travelled fades to 0.32 after the entrance draw. |
| Station title | 13px/500 `--ink`, centred, baseline at track y − 24. Truncated with an ellipsis to `step − 14` using measured text width. |
| Station status | 12px `--muted`, centred, baseline at track y + 30. Variants: `you are here` in `--wave` 600; blocked or stalled in `--danger` 500; no date or warning in `--high-sea-ink` 500; Clare in `--pastel-lilac-ink` 500. |
| Crowded lines | When `step < 118`, odd-indexed stations put both title and status below the track (y + 30 and y + 46). |
| Done | r 8, filled with the line colour, `#fff` stroke 2.5 (halo). |
| Open | r 8, filled `#fff`, line-colour stroke 3.5. |
| Current | r 11, filled `#fff`, line-colour stroke 4.5. Breathing ring: r 18, line-colour stroke 2, animating between 1 and 1.14 scale and between 0.45 and 0.12 opacity, 2.4s ease-in-out, infinite. |
| Waiting | Open style plus clock hands: path `M x,y−4 V y L x+3,y+2`, stroke 1.6, round caps. |
| Blocked | Open style plus a bar at `x−3.5, y−15`, 7×30, rx 3.5, `--danger`, `#fff` stroke 2. |
| Clare suggests | r 8, filled `#fff`, `--pastel-lilac-ink` stroke 2, dasharray 3 3. |
| Milestone | r 12. |
| Ghost | Circle r 13, `--muted` stroke 1.5, dash 3 3, placed at fractional `ghostAt` between stations. Leader line from y + 15 to y + 38, stroke 1, dash 2 3. Label 12px `--muted` at y + 50: "pace says be here by today" (or "ahead of pace"). |
| Branch | Drops from the parent station to y + 78 with an elbow radius of 16 (`Q`), then runs horizontally. Stroke 4.5 in the line colour. Station spacing `min(step × 0.8, 150)`; branch stations are r 6 with stroke 3. Title 12px/500 `--ink` at by + 22, status 12px at by + 37. The branch name is 12px/600 in the line colour, 12px past the end. The parent's status is right-aligned at x − 14 so the drop line never crosses it. |
| Terminus | Pill of height 30, rx 15, filled with the line colour. Text is "{label} · dd/mm/yy", 13px/600 white, padded 14px each side. |
| Add station | Hidden until hovering over the gap between two stations. Then a 20px `--wave` "+" circle appears at the midpoint, above the track. |
| Service pill | Height 30, radius full, 12px/500, 8px dot in `currentColor`, name in 600 `--ink`. Good: `--success-surface`/`--success`. Minor: `--warning-surface`/`--high-sea-ink`. Major: `--danger-surface`/`--danger`. Suspended: the same as major plus a dashed 35% danger border. Arrived: `--pastel-sage`/`--pastel-sage-ink`. |
| Clare alert | 12×14 padding, `--radius-sm`, tinted to match the line's status (`--warning-surface` with a 18% `--high-sea-ink` border, or the danger version). Contents: a 28px navy circle avatar "C", headline 13px/600, body 13px `--muted`, a primary navy button and a ghost Dismiss. |

**Mobile (< 560px canvas):** vertical layout.
- The track runs at x = 22 with stroke 6, and stations are spaced 64px apart.
- Title (13px/500) and status (12px) sit at x + 26, at y + 1 and y + 18.
- A branch leaves at y + 26 with a radius-10 elbow to x + 30, then runs down with its stations 52px apart.
- The terminus pill sits at the bottom of the line.
- The alert wraps, with its buttons indented 40px.

## Branch contract

| Part | Spec |
|---|---|
| Canvas | 5 columns × 164px boxes, 44px column gap, 20px lane padding either side. Scales to fit width. Pan and zoom per round 1. |
| Lane | Filled `rgba(23,55,94,.035)` (derive it from `--line`), rx 20, no stroke. Header area 46px tall: 10×10 chip (rx 3) at (20, 17), name 13px/600 `--ink` at (38, 26), meta 12px `--muted` 10px after the name, positioned from the measured name width. Rows are 84px apart and there's 22px of padding at the bottom. Lanes are 14px apart. |
| Box | 164×64, rx 12, filled `#fff`, 1px stroke `rgba(23,55,94,.12)`. Shadow: a copy of the rect offset 1.5px down, filled `rgba(20,35,70,.06)`. On hover the stroke goes to 28%. |
| Status stripe | Inset pill at (10, 14), 4 × (64 − 28), rx 2. Ready or current: `--wave`. Open: `#c9ccd6`. Blocked or stalled: `--danger`. Waiting: `--muted`. Done: `--success`. Clare: `--pastel-lilac-ink`. |
| Text | Title 14px/600 `--ink` at (22, 28). Sub 12px `--muted` at (22, 46), using the same tone variants as Lines. Both truncate to the box. |
| Done | The whole box at 0.45 opacity. |
| Milestone | rx 32, filled with a 90% tint of the lane colour, 2px lane-colour stroke. A 7px diamond glyph at (24, mid) in the lane colour, with the text starting at x 40. |
| Clare box | Stroke `--pastel-lilac-ink` with dash 5 4, fill `#fbf9fd`. |
| Selected | Wave stroke 2 plus a halo rect inset −4 in `rgba(55,111,183,.16)`. |
| Do first badge | Pill at (10, −10), height 20, rx 10, fill `#fff3e6`, 1px `--high-sea-ink` stroke. Text 11px/600 `--high-sea-ink`, "Do first · frees N", padded 9px. |
| Clare chip | Pill of height 20, rx 10, fill `--pastel-lilac`, 11px/600 `--pastel-lilac-ink` text, placed 10px right of the suggested connector at its midpoint. |

**Edge colours**

| Kind | Stroke | Width | Other |
|---|---|---|---|
| normal | `--shallow` | 1.5 | |
| critical (healthy project) | lane colour | 2.5 | |
| critical-risk (project at risk) | `--high-sea-ink` | 3 | |
| suggested | `--pastel-lilac-ink` | 1.5 | dash 5 4 |
| traced | `--wave` | 2.5 | plus a white 1.2px overlay with dash 6 6 flowing at −12px per second; everything unrelated dims to 0.18 |

Arrowheads are filled triangles `M1 1 L9 5 L1 9 Z` in the edge's colour, 8px, with `markerUnits="userSpaceOnUse"`.

**Routing**
- An edge leaves the source at its right-middle point.
- If the target is in the same row, it runs straight across.
- Otherwise it runs horizontally at the source row to the channel `targetX − colGap/2`, turns with a `Q` of radius 8, runs vertically, turns again, then enters the target on its left side.
- Edges within the same column go from the bottom-middle of one box to the top-middle of the other.
- **Ports:** the same-row edge enters dead centre. Edges from rows above stack upward in 10px steps, and edges from rows below stack downward.
- ELK layered with orthogonal routing may replace this if its output matches these rules visually.

**Mobile:** one lane at a time, with a lane picker in the toolbar. Boxes keep their 164px size and the canvas pans horizontally.

## Orbit contract

| Part | Spec |
|---|---|
| Layout | Card with a grid of `minmax(0,1fr) 288px` and a 28px gap. Below 760px it stacks into one column. The SVG viewBox is 640 square, centred at (320, 320). |
| Radii | Overdue: `14 + min(daysOverdue, 4) × 3`, inside a core circle of r 30 filled `rgba(155,44,44,.09)`. 1 to 30 days: linear from r0 52 to rMax 262. Later: 292, drawn as a belt of 22px stroke `rgba(23,55,94,.06)`. |
| Rings | 7, 14 and 30 days. Stroke `rgba(23,55,94,.16)`, dash 2 6, round caps. Labels "1 week", "2 weeks", "1 month" and "Later" centred 7px above each ring: 10px/600, uppercase, 0.08em tracking, `--muted`. "Today" is 12px/600 `--navy` at the centre. |
| Speed | `ω = 0.000078 × (262 / max(r,14))^1.35` radians per ms. |
| Heat | `k = clamp(1 − days/14, 0, 1)`; overdue tasks have k = 1. Fill is the linear RGB mix from the domain colour to `--danger` (155,44,44) by k. |
| Body | r 4.5, 6.5 or 9.5 by effort, `#fff` stroke 2. |
| Trail | Arc behind the body of length `min(ω × 2200, 1.3)` rad, in the body colour at opacity 0.22, stroke width `r × 0.8`, round caps. |
| Start angle | FNV-1a of the task id, then multiplied by 2654435761, taken as a fraction of 2π. The previous small hash bunched every task into one quadrant. |
| Selected | Wave ring, stroke 2, at r body + 6, following the body. |
| Collision arc | On the collision day's radius, centred on the circular mean angle of the colliding bodies, ±0.35 rad. `--high-sea-ink`, stroke 7, round caps, opacity pulsing between 0.55 and 0.85 (sine, 480ms period factor). Fixed at 0.75 with reduced motion. |
| Controls | Pause/Play button with a 12px glyph and label, and `aria-pressed`. "Look ahead" label 12px/500 `--muted`, range 0 to 30 with `accent-color: --wave`, output 13px/600 `--navy` ("Today" or "+7 days · Tue 29 Sep"), and a ghost "Now" button. At 390px the slider wraps onto its own line. |
| Paused tag | Top-left pill reading "Paused": 11px/600 caps, white 90% fill, `--line` border. Fades in over 200ms. |
| Tooltip | White, 1px `--line`, radius 12, shadow `0 8px 24px rgba(20,35,70,.12)`. Title 13px/600, then "{Domain} · due in N days" in `--muted`. Rises 4px and fades in over 120ms. |
| Panel | "Load this week" heading (11px/600 caps muted). Rows are a grid of 88px / 1fr / 34px: label 13px, an 8px bar (rx 4) in the domain colour, and the count right-aligned in tabular numerals. Then the Clare note cards (warning, then danger): a 22px avatar, 13px/600 headline, 13px body with the task names in `--muted`, and buttons. Legend dots are 9px. |

## Motion contract

Easing: standard `cubic-bezier(.2,.8,.2,1)` and overshoot `cubic-bezier(.34,1.3,.64,1)`. Line and lane stagger is 90ms per line for Lines and 60ms per lane for Branch. All times are in ms.

| View | Element | Motion | Timing |
|---|---|---|---|
| Lines | Travelled track | Draws in with `stroke-dashoffset`, standard easing | delay = line × 90, 350 |
| Lines | Ahead track | Draws in | starts at 0.9 of the travelled draw, 500 |
| Lines | Travelled track fade | opacity 1 → 0.32 | delay line × 90 + 900, 300 |
| Lines | Station group | Scale 0.6 → 1 and fade in, overshoot | delay = line × 90 + (x − 44)/(terminusX − 44) × 700, 320 |
| Lines | Branch path | Draws in | +760, 420 |
| Lines | Branch stations | Pop in | +900 + j × 80 |
| Lines | Ghost | Pop in | +1000 |
| Lines | Terminus pill | Slides in from −8px, standard easing | +720, 260 |
| Lines | Clare alert | Rises 6px and fades in | +1150, 220 |
| Lines | Complete | Station fills (180), then a mover circle glides to the next station (450, standard easing) | then an in-place update: meta count, pill and ghost |
| Branch | Lane | Fades in | lane × 60, 260 |
| Branch | Box | Rises 8px and fades in | column × 40 + 80, 260 |
| Branch | Edge | Draws in | target column × 40 + 320, 320 |
| Branch | Suggested edge | Fades in only | same + 200, 300 |
| Branch | Badge and chip | Pop in | 700 and edge + 300 |
| Branch | Trace | Dims to 0.18, and the flow dash loops at 1s linear | 180 |
| Orbit | Entrance | Each body moves in from rMax + 40 to its radius, with cubic ease-out and a 12% sine overshoot. Hotter bodies arrive later (progress = ent × 1.4 − k × 0.4). | 700 |
| Orbit | Pause and resume | The speed factor eases to 0 or 1 at a rate of dt/120 per frame (about 200ms) instead of stopping dead | continuous |
| Orbit | Look ahead | Radius and colour tween with cubic ease-out | 250 |
| Orbit | Loop | One `requestAnimationFrame` loop with dt capped at 50. Pauses when the tab is hidden; starts paused with reduced motion. | continuous |

With reduced motion, every row above becomes instant, except fades of 80ms or less.

## Tokens used by the references

| Literal in the references | Token |
|---|---|
| `#fbf8f2` | `--warm-white` / `--paper` |
| `#17375e` | `--navy` |
| `#13233a` | `--ink` |
| `#6b7788` | `--muted` |
| `#376fb7` | `--wave` (and the teaching default) |
| `#a7abb9` | `--shallow` |
| `#a85a0c` | `--high-sea-ink` |
| `#9b2c2c` | `--danger` |
| `#2f7a4f` | `--success` |
| `#5d4e70`, `#e8e0f1` | `--pastel-lilac-ink`, `--pastel-lilac` |
| `rgba(23,55,94,.10)` | `--line` |
| `rgba(246,134,32,.12)` | `--warning-surface` |
| `rgba(155,44,44,.08)` | `--danger-surface` |
| `rgba(47,122,79,.1)` | `--success-surface` |
| `#dfe9e1`, `#3c5949` | `--pastel-sage`, `--pastel-sage-ink` |
| 13px, 12px, 11px, 17px | `--text-sm`, `--text-xs`, `--text-2xs`, `--text-md` |

A few surface literals have no token. These are the lane fill `rgba(23,55,94,.035)`, box shadow `rgba(20,35,70,.06)`, badge fill `#fff3e6`, selected halo `rgba(55,111,183,.16)` and Orbit core `rgba(155,44,44,.09)`. Add each as a named constant in the chart-kit builder with a comment saying which token it derives from, or derive it with `color-mix()` from the token. Don't add new CSS variables to the kit.

## Done when

- `graph-visual.spec.mjs` passes, along with the round 1 specs.
- `compare.html` shows the six pairs as the same design, with differences only in anti-aliasing.
- Screen captures of the three entrances are attached to the PR and match the reference motion.
- `CHARTS.md` rows for `transit-lines`, `flowchart-lanes` and `orbit-radar` link to these reference files as the canonical look.
