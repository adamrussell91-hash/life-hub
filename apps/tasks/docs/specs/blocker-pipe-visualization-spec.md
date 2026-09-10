# Blockers mode — illustrated pipe visualization

## Build spec for Cursor

Goal: replace the current flat rounded-rect Blockers graph with a composited
illustration built from hand-painted pipe assets, driven live by the
`depends_on` graph. No dark mode variant — this component renders on a fixed
light card regardless of app theme.

---

## 1. Asset inventory

Place all source assets in `/assets/pipes/`, PNG with transparent
background, at 2x the largest size they'll render at (crisp on retina,
downscale in CSS).

```
/assets/pipes/
  casing-straight.png       # asset 1 — hollow centre, transparent
  casing-elbow.png          # asset 2 — hollow centre, transparent, single orientation
  casing-tjunction.png      # asset 3 — hollow centre, transparent
  coupling-ring.png         # asset 4
  end-cap.png               # asset 5
  valve-closed.png          # asset 6 — same footprint as casing-straight
  valve-open.png            # asset 7 — identical footprint to valve-closed
  water-flow-tile.png       # asset 8 — seamless horizontal tile
  water-dry.png              # asset 9
  water-pressurised.png      # asset 10 — darker/denser variant
  rivet.png                 # asset 11 (optional, decorative only)
  seep-drip.png             # asset 13
```

**Before anything else gets built**: confirm `casing-straight.png` and
`casing-elbow.png` have a genuinely transparent (not white) hollow centre.
If the source generation painted the interior solid, alpha-erase it first.
Nothing else in this spec works until that's true.

Record the exact tube diameter in pixels at native asset resolution as a
constant — every measurement below (`PIPE_DIAMETER`) depends on all assets
sharing it.

---

## 2. Data requirements

Each task needs, at minimum:

```ts
interface Task {
  id: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  depends_on: string[];
  blocked_since: string | null; // ISO timestamp, set when status → blocked
}
```

`blocked_since` must be written at the moment a task's derived Board status
flips into Blocked, not computed retroactively. If this field doesn't exist
yet on the task model, add it as a migration before touching the
visualization — the flow-speed and pressure logic below both depend on it.

---

## 3. Core graph logic

Implement as a pure function, independent of rendering, memoized on the
task list's identity:

```ts
function openAncestors(taskId: string, tasks: Map<string, Task>): Task[] {
  // recursive walk of depends_on, collecting all not-done ancestors
}

function isReadyGate(task: Task, tasks: Map<string, Task>): boolean {
  return task.status !== 'done' &&
    task.depends_on.every(depId => tasks.get(depId)?.status === 'done');
}

// For a task T, classify every ancestor in openAncestors(T) as either
// a ready gate (isReadyGate === true) or queued (blocked transitively).
```

A task with a non-empty `openAncestors` set but zero ready gates indicates
a cycle in `depends_on` — treat as a data validation error, surface a
warning badge, do not attempt to render a pipe for it.

Exclude `in_progress` tasks from gate/valve rendering entirely, per the
existing Board rule that in-progress tasks never show as Blocked.

---

## 4. Component tree

```
<BlockerPipeChain chainId>
  <PipeSegment kind="straight" state="flowing|dry" />
  <PipeElbow orientation={0|90|180|270} state="flowing|dry" />
  <PipeJunction type="merge|split" state="..." />
  <ValveUnit task status="closed|open" daysBlocked />
  <CouplingRing />
</BlockerPipeChain>
```

Layout (rank + x-offset for branches) is computed once per data change and
passed down as pixel positions — components themselves do not compute
layout, they just render at the coordinates they're given. Rank algorithm:

```
rank(task) = longest path length from task to any ready gate, along depends_on edges
```

For the hub-wide view, render one `<BlockerPipeChain>` per connected
component, collapse everything past the head valve into a single "+N
queued" end cap rather than drawing every downstream segment — see
performance notes in section 8.

---

## 5. Compositing a straight segment

Each `<PipeSegment>` is two stacked absolutely-positioned layers inside a
relatively-positioned container sized to the segment's rendered length:

```css
.pipe-segment {
  position: relative;
  height: var(--pipe-diameter);
}
.pipe-segment .water-layer {
  position: absolute;
  inset: 6px 0; /* tune against actual asset padding */
  z-index: 1;
  overflow: hidden;
  border-radius: 999px;
}
.pipe-segment .casing-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: url('/assets/pipes/casing-straight.png') repeat-x;
  background-size: auto 100%;
  pointer-events: none;
}
```

Casing tiles horizontally to fill any segment length (it's a straight
run, so a repeating tile works here even though the water tile is the one
that actually needs to be seamless for animation — a static repeat is
forgiving of small seams the eye won't catch on a non-moving layer, but
still cut the casing tile at a clean vertical edge to be safe).

---

## 6. Water animation

`.water-layer` gets a child div carrying the actual animated background:

```css
.water-fill {
  position: absolute;
  inset: 0;
  background-image: url('/assets/pipes/water-flow-tile.png');
  background-repeat: repeat-x;
  background-size: auto 100%;
  animation: flowScroll var(--flow-duration, 3s) linear infinite;
}
@keyframes flowScroll {
  from { background-position-x: 0; }
  to   { background-position-x: -240px; } /* exact tile width in px */
}
@media (prefers-reduced-motion: reduce) {
  .water-fill { animation: none; }
}
```

Set `--flow-duration` per segment from JS at render time, derived from
`blocked_since` of the nearest downstream valve (not the segment's own
task — flow speed reflects urgency of what it's backed up against):

```ts
const daysBlocked = differenceInDays(new Date(), new Date(valve.blocked_since));
const duration = Math.max(1.5, 6 - Math.sqrt(daysBlocked));
segmentEl.style.setProperty('--flow-duration', `${duration}s`);
```

Segment states, by rendered asset:

| State | Water image | Notes |
|---|---|---|
| Flowing (upstream, resolved path) | `water-flow-tile.png`, animated | normal speed logic above |
| Pressurised (immediately behind a closed valve) | `water-pressurised.png`, animated, slower fixed duration | only the one segment directly touching the valve |
| Dry (queued, past a closed valve) | `water-dry.png`, static, no animation | no `--flow-duration` needed |

---

## 7. Elbows and junctions — no scroll

Do not attempt to animate `background-position` around a curve. Elbows and
T-junctions render as a single static `<img>` with no water layer at all —
their visual busyness (rivets, ink linework) carries the "water is here"
read on its own. Swap between two pre-painted static states instead of
animating:

- `casing-elbow.png` alone, when dry
- if you generated the optional flowing-elbow variant with baked-in
  highlight streaks, swap to it when the path through this elbow is
  upstream of a ready gate

If that optional asset wasn't generated, just leave elbows visually
neutral in both states — this is a deliberate, acceptable simplification,
not a bug.

---

## 8. Valve unit

```
<ValveUnit>
  <img src={status === 'closed' ? 'valve-closed.png' : 'valve-open.png'} />
</ValveUnit>
```

Same footprint for both images, so swapping the `src` on a status
transition requires no layout recalculation. On the transition itself
(task flips to done):

1. Crossfade `valve-closed.png` → `valve-open.png` over ~300ms (`opacity`
   transition between two stacked `<img>`, not a src swap mid-animation).
2. Once the valve's opacity transition completes, the downstream segment's
   water layer swaps from `water-dry.png` to `water-flow-tile.png` and
   animation starts — trigger this off the transition's `onTransitionEnd`,
   not a fixed timeout, so it never fires early on a slow device.
3. The segment that *was* pressurised against this valve switches from
   `water-pressurised.png` to plain `water-flow-tile.png` at the same
   moment — the "backed up" look should resolve exactly when its cause
   does.

The seep flourish (`seep-drip.png`), if used, sits absolutely positioned
just outside the valve's coupling, static, shown only while
`status === 'closed'` — no animation needed, it's a permanent decorative
imperfection, not a state indicator.

---

## 9. Fixed light card, no theming

This component does not read `--surface-*` or `--text-*` tokens and does
not respond to the app's dark mode toggle. Wrap it in a container with an
explicit light background matching the paper tone of the assets:

```css
.blocker-pipe-card {
  background: #f4efe4; /* match asset paper tone, not var(--surface-*) */
  border-radius: 16px;
  padding: 1.5rem;
}
```

Treat it the same as an embedded photo or hand-drawn diagram elsewhere in
the app — fixed presentation regardless of theme. Do not add a dark
variant or attempt to invert/filter the assets at runtime.

---

## 10. Interaction

- Click anywhere on a segment, valve, or coupling opens that task's
  existing Board-style expand drawer.
- Hit target for the valve should be padded beyond its visual bounds
  (~44px minimum) for touch.
- Hover/long-press tooltip shows: task title, days blocked (if
  applicable), and fan-out count (how many downstream tasks are queued
  behind it) — reuse the existing tooltip component from Board if one
  exists rather than building a new one.

---

## 11. Accessibility

Render an `sr-only` summary alongside the illustration, generated from the
same computed graph, never hand-written:

```
"Draft rubric resolved. Moderate assessment is the active bottleneck,
blocked 6 days. Finalise grades and Publish reports are queued behind it."
```

Wrap the whole illustration in `role="img"` with `aria-label` pointing at
that generated string. The illustration itself carries no independent
information a screen reader user needs beyond this summary — don't attempt
to make individual pipe segments separately focusable.

---

## 12. Performance

- Memoize layout computation on the identity of the task list — recompute
  only when a task's `status` or `depends_on` actually changes, not on
  every render.
- For the hub-wide view, cap the number of fully-rendered chains to what's
  in viewport; virtualize the rest. Only the head valve of each chain
  needs full detail — collapse everything queued behind it into a single
  labelled end cap ("+2 queued") rather than mounting every downstream
  segment, coupling, and animation listener up front.
- Each animating water layer is a live CSS animation — on a hub view with
  many chains, this is the thing most likely to hurt scroll performance.
  If it does, throttle: only animate segments currently in viewport,
  freeze `animation-play-state: paused` on the rest.

---

## 13. Acceptance checklist

- [ ] Casing hollow is genuinely transparent, water shows through cleanly
- [ ] Water tile loops with no visible seam at any zoom level
- [ ] Valve swap crossfades, doesn't hard-cut
- [ ] Downstream water only starts flowing after the valve's own
      transition completes, not simultaneously
- [ ] Elbows never attempt to scroll
- [ ] `prefers-reduced-motion` stops all animation, states still readable
- [ ] Flow speed visibly differs between a 1-day-old and a 3-week-old
      blocker
- [ ] Component renders identically regardless of app dark mode setting
- [ ] sr-only summary matches what's visually shown, generated not
      hand-written
- [ ] Hub view with 10+ chains doesn't drop frames on scroll
