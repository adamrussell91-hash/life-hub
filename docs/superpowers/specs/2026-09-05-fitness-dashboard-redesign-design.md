# Fitness dashboard redesign — instructions for Cursor/Chadwick

Date: 2026-09-05 (rev 2 — supersedes the "consolidate to 4 chart families" draft below the fold in git history; this version goes wide, not narrow)
Scope: `apps/life` Fitness tab only. Out of scope: the planned/hero session workout card (`fitness-hero-card` / `renderHero` in `render-fitness.js`), and the templates rail (`renderTemplateRail`). Both already work — leave them alone.

## Why this revision

Live review of `life-hub.adam-russell.com` Mind and Bloods tabs (both on `apps/life`) turned up nine genuinely distinct chart forms already in production and battle-tested: mood radial (polar scatter), energy orbit (concentric radial + wedge), mood-mix (donut+bar combo), watchlist heat matrix, chord diagram, bump/rank line, a reference-band trend line, a horizontal range-gauge bar with historical dots, a vertical pill/thermometer gauge. Fitness currently has four families (ring, pie, area-line, column-bar), reused so heavily it produces 12–20+ near-identical stacked charts. The fix isn't fewer charts — Mind and Bloods aren't sparse, they're just never *repetitive* because each kind of insight gets its own shape. This revision gives Fitness the same treatment: **18 distinct chart forms**, each chosen because it's the honest shape for that specific question, mostly borrowed wholesale from `chart-kit/` and Bloods rather than invented from scratch.

Still true from rev 1, unchanged:

1. **Pie colours are off-token** — `fitness-charts-model.js` uses `var(--navy-2)` / raw `var(--high-sea)` instead of `chart-kit/clinical-slots.js`. Fix regardless of everything else here.
2. **The float bug** — `renderRunWidget` in `render-fitness.js` feeds `model.longTerm.workoutsPerWeek` unrounded into the shared `createRunWidget`. Round to 1 decimal.
3. **2+-point data gating already exists** (`seriesIfReady`, `buildE1rmTrends`) — keep it. Every chart below inherits this: no chart renders on 0–1 data points, ever.

## What stays

Hero/planned session card, templates rail, the underlying gate-on-2+-points rule, and the closed `clinical-slots.js` palette (`--wave`, `--marine`, `--success`, `--danger`, `--high-sea-ink`, `--pastel-sage-ink`, `--pastel-peach-ink`, `--muted`) as the only colours any of the below may use.

## The 18 forms

Each entry: what it borrows, what real field(s) drive it, and — since a straight port of a Mind/Bloods chart onto fitness data is usually a *worse* fit than a chart designed for what fitness data actually means — the adaptation that makes it the intelligent version rather than a reskin.

### 1. Polar clock — training time-of-day, coloured by region
Borrow: `chart-kit/polar-clock.js` (already used by `mood-radial.js`/`energy-orbit.js`). Field: `record.time`, `record.focus` → region.
Naive version: a histogram of session start times. Intelligent version: each completed session is a dot at its `time` (angle) and date (radius, most recent outermost), **coloured by the region trained that day**. This answers a compound question in one glance — not just "when do I train" but "what do I train when" (e.g. mornings skew legs, evenings skew arms) — which a plain histogram can't show at all.

### 2. Energy-orbit-style radial — monthly training rhythm
Borrow: `chart-kit/energy-orbit.js`. Field: `sessionVolume(record)` per day, `day_type`.
Each day-of-month is a wedge (as in the original), but radius = that day's session volume (0 = rest, further out = bigger session) and colour = `day_type`. This exposes *rhythm* — clusters of big sessions followed by a crash read differently from a steady rhythm, which the current flat month-heatmap (hit/miss only) can't distinguish.

### 3. Mood-radial-style polar scatter — e1RM per lift, self-normalised
Borrow: `chart-kit/mood-radial.js`. Field: `buildE1rmTrends` series, but **normalised to % of that lift's own all-time best**, not absolute kg.
This is the adaptation that matters: Mind's radial plots one score on a fixed 1–10 scale, so many days share one wheel meaningfully. Fitness has no shared scale — 56kg on Bar Press and 16kg on Biceps Curl aren't comparable in kg. Normalising each lift to its own trailing best (100% = your current PR for *that* lift) lets every lift share one radial wheel as concentric rings, same trick Bloods uses when it says "each marker plotted in its own reference range."

### 4. Chord diagram — which muscle groups get trained together
Borrow: `chart-kit/chord-layout.js` (direct analogue of Mind's "themes that appear together"). Field: `record.focus` co-occurrence across completed sessions.
Edge thickness = how often two regions appear in the same session's `focus` list. This surfaces your actual training split (push/pull/legs vs bro-split vs full-body) from real logged data, instead of you having to name it yourself.

### 5. Bump/rank chart — which lift is "winning" this month
Borrow: `chart-kit/bump.js` (direct analogue of Mind's "Theme rank by week"). Field: e1RM **relative improvement** (% change from first-logged value), ranked against all other qualifying lifts, per week.
Ranking by relative improvement rather than absolute e1RM means a small isolation lift can legitimately outrank a big compound lift in "who's improving fastest" — which is the actually interesting question, not "which lift has the highest number."

### 6. Streamgraph — region volume composition over time
Borrow: `chart-kit/stream.js`. Field: weekly `regionVolume` per region, stacked over the trailing ~12 weeks instead of one 30-day snapshot.
Replaces the region donut's implicit claim that "this month" is representative. A stream shows drift (e.g. arms volume has quietly displaced legs since July) that a single snapshot pie actively hides.

### 7. Watchlist heat matrix — pain-flag site × week, cross-referenced with load
Borrow: `chart-kit/watchlist-heat.js` (direct analogue of Mind's term-count matrix). Field: `pain_flags[].site` counts per week, **plus a thin marker overlay on weeks where that same region's training volume spiked** (from the same `regionVolume` data source as #6).
The cross-reference is the intelligent part: today's `renderPain` just lists counts with no context. Overlaying "was this region also being trained hard that week" turns a flag log into an actual signal — did the pain follow a volume spike, or is it unrelated.

### 8. Horizon bands — weekly training-load banding
Borrow: `chart-kit/horizon.js`. Field: **synthetic load score** = session volume × duration, banded low/medium/high against your own trailing 8-week average (z-score bands), not a manually-logged RPE field.
This is deliberately not blocked on the missing `effort`/RPE schema field the Chadwick review flagged as a "won't" — it derives a load band entirely from data you already log, so it ships now instead of waiting on a schema decision.

### 9. Two-ring donut — region volume, this month vs last
Borrow: `chart-kit/pie.js` (`buildDistributionPie`), recoloured per the token fix. Field: `regionVolume` current + prior 30-day window (both already computed in `fitness-model.js`'s `buildRegions`).
Outer ring = this month, inner ring = last month, same slice order. A single donut only ever shows a snapshot; two concentric rings show the shift at the same glance, for free — the prior-period number already exists in the model, it's just never rendered today.

### 10. Range-gauge bar with a target tick — push vs pull, trained vs rest
Borrow: Bloods' `rangeBarLayout` (`apps/life/js/app/bloods-charts-layout.js`) — **promote this into `chart-kit/` as a shared primitive** since it's now used by two tabs, not one. Field: `pushPull`, `restRatio`.
Add a small tick mark at the "balanced" point (50/50 for push/pull; your own target sessions/week for trained/rest) the same way Bloods marks a reference band on its gauges — turns "here's the split" into "here's how far off-balance you are," which is the actual question.

### 11. Reference-band trend line — e1RM vs your own trailing form
Borrow: Bloods' band-trend-line pattern (in-range shading + per-point status colour). Field: `buildE1rmTrends` series, band = trailing 8-week min–max for that lift.
Bloods shades a *clinical* reference band (an external, fixed range). Strength has no external reference range — the honest adaptation is a *self-referential* band (your own recent min–max), with the latest point coloured green/red only when it's outside that self-band (a real new high or a real regression), not just "above/below average."

### 12. Pill/thermometer gauge — last session vs your rolling average
Borrow: Bloods' vertical pill gauge. Field: last completed session's `sessionVolume` as % of trailing 8-week average session volume.
One glance answer to "was that a big session or a light one," sized to sit next to the Recent Sessions list rather than buried in text.

### 13. Radial year — full-year training wheel, by region
Borrow: `chart-kit/radial-year.js`. Field: every completed session across the year, one dot per trained day, **coloured by region(s) trained that day**, dot size = session volume.
This is the exact case you named: replaces the flat 30-day heatmap with a full-year view that answers both "when did I train" and "what did I train" at once — density shows consistency, colour shows whether your split has been balanced across the whole year, not just the last month.

### 14. Mood-mix-style donut+bar combo — rep-range distribution, named
Borrow: `chart-kit/mood-mix.js` (direct analogue of Mind's "Mood mix," which centres a plain-English label like "Mostly Low"). Field: `buildRepRanges`.
Centre label translates the dominant rep-range bucket into plain English — "Mostly Hypertrophy" (6–12 dominant), "Mostly Strength" (1–5 dominant), "Mostly Endurance" (13+ dominant) — the same trick Mind uses to turn a number into a read, instead of leaving you to interpret four percentages yourself.

### 15. Sankey flow — planned → actual, three columns
Borrow: `chart-kit/sankey-flow.js`. Field: planned exercises (from the session's template/plan) vs completed actuals, three columns: Planned → {Completed as planned / Substituted / Skipped} → logged sets.
A two-column planned-vs-actual Sankey only shows binary adherence. Three columns show *where* deviation happens — swapped an exercise vs dropped a set vs skipped the session outright are three different problems with three different fixes.

### 16. Theme-constellation-style node map — your real exercise library
Borrow: `chart-kit/theme-constellation.js`. Field: `canonicalExerciseName` frequency (node size) and same-session co-occurrence (edges), coloured by region.
Surfaces redundancy the current "Unique lifts: 14" stat number can't — e.g. six barely-distinct biceps-curl variants clustering together is a nudge toward canonicalising your naming, not just a count.

### 17. Sparkline rows with a "vs your average" tick — duration, distance, pace, avg HR
Borrow: `chart-kit/area-line.js`, compact size, one row per metric (unchanged from rev 1) — these four really are the same shape and don't need a bespoke form each. Add one small tick mark per row at the trailing average, matching the marker idea from #10/#11 for visual consistency across the page.

### 18. Coloured column chart — weekly volume-per-set efficiency
Borrow: `chart-kit/columns.js` (`buildColumns`), kept as its own bar form rather than folded into sparklines. Field: `buildVolumePerSetWeeks`, bar colour = above vs below trailing average (green/muted), reusing the same tokens as #17's tick mark.

## Cross-cutting

- Every chart above is gated on its own real minimum (2+ points for trends, 1+ non-zero category for distributions, 2+ regions for the chord/constellation) — hidden entirely, never rendered empty, per the existing `setHidden` pattern.
- All colour comes from `clinical-slots.js`; region colours reuse the existing `REGION_COLOURS` mapping (once those are themselves moved onto the closed palette — see fix #1).
- `chart-kit/` gains one promoted primitive from Bloods (`rangeBarLayout` → shared) rather than a fork; everything else in this list already exists in `chart-kit/` and is only new *as applied to fitness data*, not new code from scratch.
- Chart entrance animation via the existing `chart-kit/animate.js` (`prefersReducedMotion`-aware) throughout, matching Mind/Bloods.
- Tap targets: anything that opens a detail view (the constellation, the per-lift radial, the Sankey) gets the same chevron/hover affordance the hero card already uses — no new interaction language invented.

## Explicitly not resolved here

- #8's synthetic load score and #12's rolling-average gauge are proposed derivations, not existing fields — flag for a quick sanity check with Adam on the exact formula (e.g. is z-score banding against 8 weeks the right window) before shipping, same spirit as the original Chadwick review's "flag definitional decisions, don't silently invent them."
- Whether the "This week" text stat block (day-glance summary) still needs to exist at all once #1, #9, #13, and #17 are on the page, or whether its remaining content (current/longest streak, sessions-this-week-vs-target) is fully covered by the existing rings — recommend cutting it entirely and confirming nothing is lost, rather than redesigning a block that may now be redundant.
