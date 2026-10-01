# Chart "i" button: what this chart shows and how it's worked out (build brief)

**Ask (Adam, 01/10/26):** a tiny, discreet "i" on every chart that explains what the chart is and how it's calculated. On phone, a tap shows it as a floating note. On desktop, it appears on hover and goes away when the pointer leaves.

**Size: Small–Medium.** One design-kit component plus copy for every chart placement. The component is small. The work is the copy and the rollout to every placement.

**Reference:** the working "i" in `docs/mockups/gate-rings-trend.html` (open it, hover and tap the "i" next to STIMULUS). Its copy is the model for every other chart.

---

## 1. Component: `packages/design-kit/js/hub-chart-info.js` + `chart-info.css`

One function, used by every hub:

```js
mountChartInfo(anchorEl, { id, title, what, how })
// id    — placement id, e.g. 'life.home.stimulus.gate'
// what  — 1–2 sentences: what the chart shows and why it matters
// how   — 1–3 short sentences: the calculation, its window, its units
```

- **Button:** 18px circle, 1px border at `color-mix(in srgb, var(--muted) 45%, transparent)`, italic serif "i" in `--muted`, 11px. It sits **inline after the card's label** (e.g. after "STIMULUS"), never floating over the chart. Hit area 44×44 via a `::after` inset, with no layout shift. `aria-label="About this chart"`, `aria-expanded`, `aria-controls`.
- **Note:** kit surface (`--warm-white`, `--line` border, `--elev-2`, `--radius-xs`), max-width 18rem, `--text-sm`, `--muted` body with `--ink` subheads ("What this shows" / "How it's worked out"). Fully opaque.
- **Position:** `positionHubFloating` from `hub-floating.js` (flip + shift, the phone bottom pad already clears the tab bar). Prefer below the button, start-aligned.
- **Desktop** (`(hover: hover) and (pointer: fine)`): show on `mouseenter` and keyboard focus. Hide on `mouseleave` and blur, unless it was clicked; a click pins it until an outside click or Esc.
- **Phone / touch:** tap toggles it. An outside tap, Esc or scroll closes it. Only one note is open at a time across the page; reuse the module-level "open popover" pattern from `morphing-popover.js`.
- **Motion:** 160ms fade + 4px rise, none under `prefers-reduced-motion`.
- **It must not change chart interaction.** Tapping the "i" never selects a ring, row or bar. Stop propagation on the button only.

## 2. Copy: one registry per hub, keyed by placement

`apps/<hub>/…/chart-info-copy.(js|ts)` exports `{ [placementId]: { title, what, how } }`. One file per hub keeps all the wording in one place to review.

Copy rules:
- Plain words, written to Adam ("your", not "the user's").
- **`how` names the real window, unit and threshold from the code**, never a guess. If the window is chosen at runtime (e.g. the forecast's 28/42/56-day calibration window), say "usually the last 28 days" and pass the live value in when the renderer has it.
- Name any non-obvious rule the code applies: what's excluded (walks, mobility, unlogged days), caps (ring fraction capped at 1, gate rings capped at 2× the gate, with the white dot meaning off the scale), and odd groupings (full-body sets count as upper body).
- At most 5 sentences in total. If it needs more, the chart has a design problem; flag it in the PR instead of writing an essay.

**Model copy, Home → Stimulus → Gate** (use this as written):

> **What this shows:** Whether your training and protein are enough for the forecast to assume you keep muscle while losing fat. Miss a key and the forecast assumes some loss is muscle, so your body-fat date moves later.
> **How it's worked out:** Each ring is your average over the forecast window (usually 28 days), scaled from zero to twice the pass mark so every pass mark sits on the orange spoke. Sessions count completed workouts with a set above 0 kg and 0 reps. Upper sets count chest, shoulders, arms, back and full-body sets. Protein is typical daily protein ÷ current weight. A white dot means the ring is off the scale.

(Once the recent-pace arcs from `gate-rings-trend-build.md` ship, add the thin-line sentence from the mockup.)

## 3. Rollout: every chart placement

The inventory is the **"Where used now"** column of `packages/design-kit/CHART-CATALOG.md`, checked against call sites (`grep -rn "chart-kit/" apps`). Graphs (Knowledge archive, Tasks Graph views) are included.

The PR description carries a table: **placement id · hub/page · file · "i" present (y/n) · copy reviewed (y/n)**. Every row must be y/y. A placement that genuinely shouldn't have one (e.g. a 24px inline sparkline in a list row) is listed with the reason.

Add one line to `packages/design-kit/CHARTS.md` "Locked look": *Every chart card carries a `hub-chart-info` "i" after its label.* Add a log entry in the same PR.

## 4. Must-not

- No "i" floating over the plot area or overlapping a legend, pill or value.
- No new tooltip system. The chart's own hover tip (`.hc-tip`) stays as it is; the "i" is about the chart, not one value.
- No copy that describes the code ("computed from `summariseTrainingBehaviour`"). Describe the measure.
- No roadmap talk ("coming soon") in any note (P4).
- Don't ship a placement with placeholder copy.

## 5. Verify

1. At 1440 and 390, on the live umbrella (`life-hub.adam-russell.com`), with real data: open the "i" on **every** placement in the table. Screenshot five, including Home Stimulus and one Tasks Graph view.
2. Desktop: hover opens, leave closes, click pins, Esc closes and returns focus to the button.
3. iPhone Home Screen app: a tap opens it; a tap outside closes it; the note is never under the tab bar and never off-screen. Test the right-most card in a row.
4. Tapping the "i" on Home Stimulus does not select a ring or switch to Regions.
5. Keyboard: Tab reaches the "i", Enter/Space toggles, `aria-expanded` matches.
6. `npm run pre-pr-check` passes.

## 6. UI failure modes to check (from `docs/CURSOR-UI-FAILURES.md`)

| ID | Check for this feature |
|---|---|
| **S3** | The note is fully opaque over a chart; nothing shows through. |
| **S4** (SVG fill) | n/a for the button (HTML); if any placement draws the "i" in SVG, give it an explicit fill. |
| **C1** | The button never overlaps a card label, pills or a chart label at 390. Check every card head that has pills (Stimulus Gate/Regions). |
| **R5** | Phone: the hover-only reveal has a tap replacement on every placement. |
| **R6** | The note opens above the fixed tab bar at 390 (bottom-of-page cards). |
| **T1** | The note text is `--text-sm` everywhere; no inherited 17px reading copy. |
| **I3** | Every "i" opens real copy; no empty note. |
| **D5** | No ambiguous copy: units and windows always named ("per week", "last 28 days"). |
| **W1 / W2** | Works on the umbrella route, not only the standalone hub; check one Tasks and one Knowledge page in production. |
| **P1 / P5** | The placement table is complete; partial rollout is not reported as done. |
