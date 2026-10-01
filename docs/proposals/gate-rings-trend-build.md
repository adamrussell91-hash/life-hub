# Gate rings: recent-pace arcs (build brief)

**Ask (Adam, 01/10/26):** the Stimulus gate rings average over weeks, so recent behaviour barely moves them. Five days of hitting protein is invisible. Add a thin line per key that shows what the last few days are doing to the average: length for strength, green to red for helping or hurting.

**Mockup (source of truth for the look):** `docs/mockups/gate-rings-trend.html`, also published as a private Artifact for Adam. Open it and click through all four scenarios before writing code.

**Size: Small–Medium.** One data function, one geometry addition to `gate-rings.js`, one row line, CSS, tests. **Display only:** the forecast, the gate result and every date stay on the long average.

---

## 1. What the thin line means

For each key, a 3px arc sits in the gap **just inside** its ring, on the ring's own scale (0 → 2× gate).

- **Tail** at the current average (where the thick ring ends). **Tip** at the recent pace. The tail fades in (gradient from 18% to 100% opacity along the chord), and the tip carries a small chevron pointing in the direction of travel.
- **Colour = recent pace vs the gate:** `--success` if recent ≥ gate, `--danger` if below. One colour per arc, not a red-to-green blend.
- **Direction and length = which way the average is heading, and how hard.** Forward (clockwise) = pulling the average up.
- **Steady:** if |tip angle − tail angle| < 5°, draw a 2.6px `--muted` dot at the average instead of an arc.
- **Both off the scale** (average and recent > 2× gate): steady dot at the end of the ring.
- **No recent data** (see §2): no arc, no dot. The row says why.
- **Tip floor:** a recent value of 0 draws its tip at `START + 8°`, so the chevron clears the ring label at 12 o'clock.

Colour and direction are separate on purpose. A green arc pointing backwards ("average dropping, still clear of the gate") is a valid, useful state.

## 2. Windows: `apps/life/js/app/home-forecast-charts.js`

Add `recent` to each key in `buildStimulusChartData`:

| Key | Recent window | Calculation |
|---|---|---|
| Sessions | last **7** days to `asOf`, inclusive | `summariseTrainingBehaviour(items, { asOf, days: 7 }).genuine_loaded_sessions`. A 7-day count is already per week. |
| Upper sets | same 7 days | `upperBodySetsPerWeek(summary.loaded_sets_by_muscle_group, 7)` |
| Protein | last **4 complete** nutrition days among the last 7 days, **excluding today** | mean of `logged_protein_g` over those days ÷ `forecast.current.weight_kg`. Needs ≥ 3 complete days, otherwise `recent: null` with `recentReason: 'n of 3 complete days'`. |

- Why 7 days for training: the gate is 2 sessions a week, so a 4-day window goes red after any normal rest stretch.
- **Unlogged and partial days are skipped, never counted as zero** (D6). Today is excluded until it's complete.
- `classifySpan` in `core/forecast-inputs.js` already produces per-day `nutrition_logging_status` and `logged_protein_g`. Export a small `recentCompleteProtein(items, asOf, { lookback: 7, take: 4, min: 3 })` from there; don't duplicate the classifier.
- `buildStimulusChartData` needs `items` and `asOf`. Pass them from `stimulusCard` in `home-forecast.js`.
- Each key gains `recent`, `recentStatus` (`'met' | 'short' | null`), `recentWindow` (`'Last 7 days'` / `'Last 4 logged days'`), `recentReason`.

## 3. Geometry: `apps/life/js/app/chart-kit/gate-rings.js`

- Lane radius: `r - stroke / 2 - gap / 2` (gap is 9, so there's 3px clearance each side).
- Draw the arcs **after all rings and before the spoke**, so the spoke stays on top.
- Gradient: a `linearGradient` with `gradientUnits="userSpaceOnUse"` from the tail point to the tip point. Ids go through the scene's `url(#…)` prefixing (`scopedValue` in `render-scene-chart.js`) so two charts on one page don't collide.
- Chevron: a 2px stroked open path, tangent to the arc at the tip. See `drawTrend` in the mockup; port it to scene nodes.
- Animation: `anim: 'draw'` with the delay after its ring (`120 * index + 600`). None under reduced motion (already handled by the shell).
- Hit target: the existing ring `hit` id. Add one tooltip line: `Last 7 days: 3 sessions · above the gate` (or `below`).

## 4. Rows and readout

- Each row grows a third line (row height 52 → 62): `↑ Last 4 logged days: 1.74`. The arrow (`↑` / `↓` / `•`) is in `--success` / `--danger` / `--muted`, and the text stays `--muted` (text wears text tokens, not the series colour). With no recent data: `Last 4 logged days: 1 of 3 needed`.
- The readout under the chart names the one thing that's changing, in this order:
  1. A key whose recent status differs from its average status. If recent is met: `Protein is above the gate recently. Keep it up and the key will flip to Met.` If recent is short: `Sessions has dropped below the gate recently. If it stays there, the key will flip to Short.`
  2. Otherwise: `Recent behaviour matches the averages.`
  3. Protein with no recent data and nothing else changing: `Log food for a few complete days to see recent protein.`
- Update `label` (the aria label) to include each key's recent value and above/below.

## 5. One colour change

`.hc-gate-fill--protein` and `.hc-key-dot--protein` move from `--success` to `--pastel-gold-ink`. Green and red now mean good and bad on this card, so a green ring next to a red line reads as a contradiction. Gold ink against navy and wave was checked with the dataviz palette validator: the three ring colours pass CVD separation and the normal-vision floor (worst pair ΔE 20.6). Gold ink fails the validator's chroma floor, as navy already does; the rings are direct-labelled, so that's acceptable. Leave the Met/Short pills as they are.

## 6. Must-not

- Don't change `lean_preservation_supported`, the gate result, the "keys met" count or any forecast output. Recent pace is display only.
- Don't treat an unlogged or partial day as 0 g protein.
- Don't blend red to green along the arc. One colour per arc.
- Don't draw the arc on top of the thick ring. It lives in the gap.
- Don't widen the card or shrink the rings to make room. The lane already exists.

## 7. Verify

1. Unit tests in `tests/unit/` for `recentCompleteProtein`: 4 complete days → mean ÷ weight; 2 complete days + 5 unlogged → `null` with reason; today partial → excluded.
2. Unit tests for `buildStimulusChartData`: `recentStatus` for the four mockup scenarios; a steady case returns a dot, not an arc.
3. Geometry test: lane radius and tip angle for sessions avg 2.5 / recent 3 (tail 78.75°, tip 112.5°); recent 0 → tip at −82°.
4. Live umbrella at 390 and 1440 with real data: screenshot the card and compare it side by side with the mockup's "Protein streak" state. The arcs sit in the gaps, the spoke is on top, and no chevron touches a ring label.
5. Two scene charts on one page: no gradient id collision (inspect `defs`).
6. `npm run pre-pr-check` passes.

## 8. UI failure modes to check (from `docs/CURSOR-UI-FAILURES.md`)

| ID | Check for this feature |
|---|---|
| **S4** (SVG fill) | The chevron path has `fill: none` and every dot has an explicit fill; nothing renders black. |
| **C1** | At 390 no chevron overlaps "Sessions" / "Upper sets" / "Protein" labels, the centre "2/3 keys met" or the spoke end. Test recent = 0 for all three. |
| **C2** | Every arc is drawn from real values; no decorative arc when `recent` is null. |
| **D3** | Screenshots on real data, not fixtures. |
| **D5** | Row text names its window ("Last 7 days", "Last 4 logged days"); no bare numbers. |
| **D6** | Protein recent is computed from complete days only; prove it with the unlogged-days test. |
| **V4** | Row arrow, arc colour, arc direction and readout always agree. Check each of the four scenarios. |
| **W2** | `items`/`asOf` actually reach `buildStimulusChartData` in production (Home, not only tests). |
| **P1** | Compare against the mockup before ticking anything. |
