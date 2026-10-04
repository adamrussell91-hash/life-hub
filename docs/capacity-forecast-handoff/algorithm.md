# Algorithm — readiness model v1 (implemented)

**Code:** `packages/design-kit/js/calendar/readiness-model.js` (daily) and `readiness-hourly.js` (hourly + weather). `capacity-model.js` keeps the calendar API (`capacityForDates`, load budget, long-range series) and delegates the daily formula here, so the Day Dial, Tideline, Almanac, ghost proposals and agents all read the same number.

This replaces the illustrative comparison heuristic from the 4 October handoff. That heuristic is kept at the end for provenance, with the four problems that made it unsafe to ship.

## Meaning

- **100 = everything is peaches.** Full capacity to smash the day. Reachable.
- **80 = a normal, unremarkable day.** The value with no evidence at all.
- Readiness is not task count, not a percentile, and not a promise that an overfull day is doable. Plan demand stays separate (`dayLoadHours` / `isOverCapacity`).
- Every day carries a **band** (`low`–`high`). Confidence is separate from the score.

## Daily model

Five domains, each with its own value (0–100) and age (days since observed):

| Domain | Weight | Baseline | Sources |
|---|---:|---:|---|
| Energy | 0.25 | 75 | check-in, diary `energy` (low 30 · medium 70 · high 100; worst of the day wins) |
| Focus | 0.25 | 75 | check-in |
| Mood | 0.10 | 75 | diary `mood_score` × 10 (worst of the day), diary `mood: low` → 30 |
| Health | 0.20 | 100 | diary symptoms (one → 65, several → 35), check-in |
| Sleep | 0.20 | 75 | check-in, sleep log hours (4 h 25 · 5 h 45 · 6 h 70 · 7 h+ 100, interpolated) |

The weighted baselines give 80. Health's baseline is 100 because "no active episode" is the normal state, not an unknown one.

### Each day, in order

1. **Carry.** Every domain drifts halfway (`drift 0.5`) from yesterday's value toward its *drift target*, and ages one day.
   - The drift target is the baseline, except that **energy and focus are pulled down by an active health episode** (`75 − (100 − health) × 0.5`), and **focus by sleep debt** (`− 0.3 × (75 − sleep)`). Being ill keeps energy down instead of letting it bounce back on days nobody wrote anything.
2. **Observe.** Logs dated that day replace their domain (age 0).
3. **Co-move.** If energy was observed and focus wasn't (or the reverse), the unobserved one moves halfway toward the observed one.
4. **Snapshot the prediction.** Score the state now: this is the prediction issued *before* the check-in. It is stored beside the answer.
5. **Apply the check-in** (if any; skips are not evidence):
   - Sleep: worse 20 · still poor 30 · better, still tired 60 · restorative 100.
   - Energy: drained 20 · heavy but manageable 50 · back to normal 80 · energised 100.
   - Focus: foggy 30 · can focus briefly 45 · clear but distractible 60 · sharp 100.
   - Health, relative to the carried value: worse −20 · same = carried · easing = halfway to 100 · gone = 100.
   - Lingering: physical or mental adds a small cost (−4 each); *feeling recovered* cancels yesterday's costs.
   - Overall ("How ready do you feel?"): empty 15 · limited 35 · manageable 60 · strong 85 · full 100. Unasked domains move halfway toward it (it speaks for them), then **final = 0.7 × overall + 0.3 × model**, band ±6.
6. **Costs from yesterday** (from records the hub already has, never asked again):
   - Work sessions: ≥ 6 h heavy (8), ≥ 3 h moderate (3). Hard training 5, moderate 2.
   - Scaled by last night's sleep: R = 0.4 if sleep ≥ 85, 0.7 if ≥ 60 or unknown, 1 if lower.
   - **Half strength when energy and focus were both answered fresh**: those answers already contain part of the cost. This keeps your rule (fresh answers don't erase recovery context) without counting the same tiredness twice.
   - Poor known sleep (< 60) after a heavy day: extra 5.
7. **Score.**
   `pct = Σ weight × value + 0.2 × min(0, worst domain − its baseline) − costs`, clamped 5–100.
   The weakest-link term means one broken domain limits the day. A normal day has no gap (80), an all-good day has no gap (100).
8. **Band.** Each domain adds its weight × uncertainty: 4 if observed today, `8 + 4 × age` if carried (max 25), 14 if never seen. Old evidence widens the band; it does not move the score down.
9. **Forecast days** (no evidence that day) get +5 in school holidays.

History is built only from observations and their drift. The model never feeds its own earlier output back in as evidence.

### Notes and explanations

- Note: the two biggest drains ("sore throat, poor sleep"), else the biggest lift ("restorative sleep"), else "steady". On forecast days: the main drain + "lingering" ("sore throat lingering"). The note never says "forecast": the dial's caps line already does.
- Explanation (the caseback): what is helping, what is holding it back, and what is unconfirmed ("Last night's sleep is unconfirmed.").

### The real week (T3 W10, the test fixture)

| | Mon | Tue | Wed | **Thu** | Fri* | Sat* | Sun* |
|---|---:|---:|---:|---:|---:|---:|---:|
| Old formula | 79 | 51 | 42 | 34 | 52 | 68 | 75 |
| Readiness v1 | 84 | 50 | 42 | **36** | 49 | 63 | 71 |

\* forecast. Thursday is still the lowest day and still flagged to soften. Recovery after the sore throat is a little slower and says why.

## Morning check-in

- On the Life dashboard, above everything else, until 2 pm. Gone for the day once answered or skipped.
- Opens with "How are you starting today?", then **one to three** questions chosen from the state carried into today:
  1. Sleep, if the last sleep was below 70 or two or more days old.
  2. Health, if below 90 ("How is the sore throat today?").
  3. Energy if below 55; focus if below 55.
  4. Lingering, if yesterday had hard training or six or more hours of work.
  5. Overall, when fewer than three were picked.
- Nothing is preselected or auto-submitted.
- **Discrepancy:** asks "That's a bigger difference. What did we miss?" only when the result lands **outside the band issued before the answer** and at least 10 points from it. Coarse bubbles can't trip it on rounding. The observation is already saved; the reason is optional, and "Not sure" is a valid answer.

Storage: `/api/readiness-checkin`, private Tasks Blobs at `meta/readiness_checkin/<date>`. Each record keeps the issued prediction (`predicted_estimate`, `predicted_range`, `forecast_issued_at`, `model_version`), the answers, the final number, the residual, and the reason (`reason_status` pending / provided / not_needed). A later reason never rewrites the residual. A skip is stored as a skip and is superseded if Adam answers later. The shared Life loader adds the last 16 days of check-ins to every calendar as `readiness_checkin` records.

Not built yet: the Central Node summary line. It is a follow-up so the summary never becomes a second observation of the same morning.

## Hourly model (battery)

`projectDay({ start, items, wakeHour = 7, bedHour = 22.5, observations })`, half-hour steps.

- Start at the morning readiness.
- Each step, the level loses a **share of what is left** (so a low day loses fewer points and never hits zero):
  - awake 0.8 %/h; class or deep work 4 %/h; physical 5 %/h; meeting 3 %/h; shallow task 2.5 %/h; admin 2 %/h;
  - two commitments at once +1.5 %/h; each switch beyond the first in the surrounding two hours +1 %/h.
- **Recovery is an opportunity, not proof.** After 30 minutes free, a gap closes 15 % of the deficit per hour toward **90 % of the morning level**, never above it.
- Logs, ghosts, protected time and Corey time do not drain. No meal, medication or Corey lift is assumed; an item can carry `lift` only from personal evidence learned from check-ins. `profile(h)` is where a learned personal daily shape plugs in. Both default to nothing.
- A check-in during the day re-anchors the level at that time and tightens the band to ±6.
- Band: start half-width + 2.2 × √(hours since the last anchor), max 30.
- **Drift (the equation of time):** `driftAgainst(snapshot, observations)` compares an earlier issued line with what a later check-in found.

## Weather states

`weatherAt(points, i, state)` picks one of the thirty supplied states from the level, its two-hour trend, the calendar around it and the domain state. The number says amount; the icon says conditions. First match wins:

| Rule | State |
|---|---|
| level < 25 during a commitment | 27 Thunderstorm |
| level < 35 with ≥ 1.5 h of commitments in the next two hours | 26 Storm building |
| was below 30 earlier, now rising, still < 50 | 28 Storm easing |
| swing ≥ 25 within three hours | 25 Squally showers |
| focus < 35 | 18 Morning mist (before 11) · 20 Dense fog |
| focus < 45 | 18 Morning mist · 21 Fog lifting (from 1 pm) · 19 Patchy fog |
| mood < 35 / < 45 | 24 Persistent rain / 22 Light drizzle |
| two commitments at once | 12 Crosswinds |
| two or more switches around now | 10 Gusty conditions |
| gaps between commitments, 60–75, not falling | 5 Sunny intervals |
| level ≥ 90 | 2 Brilliant sunshine (energy ≥ 95) · 1 Clear skies |
| after 7 pm, nothing ahead | 30 Calm evening |
| rising ≥ 4 | 29 Cloud breaking (< 50) · 9 Building breeze (morning) · 4 Afternoon sunshine |
| falling ≥ 4 | 3 Morning sunshine (morning, ≥ 60) · 14 Increasing cloud |
| a recent dip now recovering | 23 Passing showers |
| < 35 / < 50 | 16 Heavy cloud / 17 Low cloud (morning, low energy) · 15 Overcast |
| < 60 during a commitment | 11 Strong headwind |
| ≥ 70 with health < 80 or sleep < 60 | 6 Sun through cloud |
| < 70 | 13 High cloud |
| otherwise | 8 Gentle breeze |

7 Warm front approaching is reserved for an item with a learned personal `lift`.

`weatherCards(points)` shows a new card only when a condition holds for an hour and changes family (or moves the level by 8 or more), with at most six cards. Every card has a one-line why.

## Evaluation and learning (unchanged principles)

- Prospective comparison against carry-forward, recent-average and old-formula baselines, by horizon. Report error, bias and band coverage.
- No coefficient changes from a single surprising answer. Review repeated residuals with their reasons, version every change, and keep it only if it improves unseen days.
- Everything above is provisional until that evaluation exists.

## Provenance: the 4 October comparison heuristic, and why it was replaced

`B = 0.25 energy + 0.25 focus + 0.10 mood + 0.20 health + 0.20 sleep`, minus work, exercise and interaction costs, with unknown answers filled by a shared history value `H = 0.55 × yesterday's estimate + 0.30 × 7-day mean + 0.15 × 75`.

1. **Hidden ceiling.** Unasked domains took H (≈ 50). With one to three questions a morning and mood almost always unknown before the evening diary, perfect answers topped out around 82–95, which brought back the rejected cap.
2. **Stale sleep never faded.** Missing sleep stayed at a fixed 35 however many days passed; only the band widened.
3. **Self-feeding history.** H was mostly the model's own previous output.
4. **Double counting.** Fresh energy and focus answers already reflect yesterday's load, and the full costs were subtracted again.

v1 fixes each: per-domain carry with drift (1, 2), observation-only history (3), half-strength costs with fresh answers (4).
