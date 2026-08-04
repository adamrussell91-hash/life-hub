# Fitness Tab (Chadwick) — Design

## Purpose

The Fitness nav item is still a stub (“later Life Hub phase”). This design builds a full **Fitness-first** dashboard in Chadwick Flexington’s domain: soft-medical visual language shared with Nutrition, but session / streak / lift progress as the hero story — not a Nutrition clone with workout labels.

Writes remain chat-only (Chadwick → confirm). This phase also closes the gap where completed workouts refresh Status/Recent Actions but never append the documented **Chadwick→Brisket Day Type** Cross-Agent directive.

**Deploy constraint:** local commits only until Adam explicitly asks to push (Netlify token burn).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Layout philosophy | Fitness-first (not Nutrition-mirror content) |
| Visual language | Same soft-medical elements as Nutrition (tokens, rings, area/columns, fill-on-load) |
| First viewport | Streak strip **and** session hero stacked |
| Hero when no completed session today | Today’s `planned` if any, else last `completed` |
| Charts / density | Week volume + 30-day consistency heatmap + muscle/focus hit strip + vs-last comparisons + **PR callouts** |
| PR definition | Estimated 1RM via Epley: `weight × (1 + reps/30)` |
| Chat | Floating Chadwick panel; accent `#2E7BD6`; default agent `chadwick` |
| Confirm extras | Auto-append Cross-Agent Day Type line on completed workout |
| Inspiration | Mens Journal / Flex Fitness / glass gym UI — inspiration only, not copies |
| Deferred | Notion exercise playbook into Chadwick voice; in-tab set editing; pain-flag timeline |

## Architecture

```
events (workout) / targets
        ↓
fitness-model.js
  streak · heroSession · week volume · focusHits · comparisons/PRs · month consistency
        ↓
chart-kit (existing) + soft-medical tokens
        ↓
render-fitness.js → #fitness-dashboard
        ↓
floating Chadwick chat (chat-panel reparent, same as Nutrition)

chat-confirm (workout completed):
  fitness file write
    → Status / Recent Actions (existing)
    → Cross-Agent Chadwick→Brisket Day Type line (new)
```

- Pattern: same model/render/controller wiring as Nutrition / Central Node.
- No chart library. No direct editing UI on the tab.

## Surfaces

### Streak strip (first viewport, top)

- Current streak (reuse `calculateWorkoutStreak`).
- 7-day dots: completed / not / today emphasis.
- Day-type chip for the display date (`resolveDayType`).

### Session hero

- Resolve order: today’s `status === 'planned'` → else latest `completed` on or before display date.
- Show: title, duration_min, day_type, focus tags, exercises with sets (`reps` × `weight_kg`).
- Compact pain_flags as chips; session notes as short prose if present.
- Empty (no planned today and no history): “No session yet — talk to Chadwick” while streak strip still renders.
- Long exercise lists scroll inside the card.

### Below the hero

1. **Week volume** — daily `Σ (reps × weight_kg)` over trailing 7 days (columns or soft area from chart-kit).
2. **Focus / muscle hit strip** — aggregate `focus[]` tags across the week.
3. **Vs last time + PRs** — for each exercise in the hero session, find the most recent prior completed session containing the same exercise name (case-insensitive trim). Compare best-set e1RM; badge **PR** when this session’s best e1RM is strictly greater than every prior best for that name. Show prior best set numbers for context. No prior match → “first logged”, not a PR.
4. **30-day consistency heatmap** — binary completed-workout days (existing heatmap tile pattern).
5. **Floating Chadwick chat button** — `--agent-accent` from agents config (`#2E7BD6`).

### Motion

Fill-on-load for rings/columns/area; respect `prefers-reduced-motion`.

## Data model (`buildFitnessModel`)

Inputs: `{ events, targetsConfig?, date }` (targets optional; day type still from workouts).

Outputs (conceptual):

- `date`, `dayType`, `streak`
- `weekDots[]` — `{ date, completed, isToday }`
- `heroSession` — workout record + derived display fields, or `null`
- `weekVolume[]` — `{ date, volume }`
- `focusHits[]` — `{ key, label, count }` or similar
- `comparisons[]` — `{ name, currentBest, previousBest, e1rm, previousE1rm, isPr, firstLogged }`
- `month[]` — `{ date, completed }` for heatmap

**Epley:** for a set, `e1rm = weight_kg * (1 + reps / 30)`. Best set for an exercise = max e1rm among its sets. Ignore non-finite / missing reps or weight.

**Volume:** sum over all exercises/sets of `reps * weight_kg` for completed workouts that day. `skipped` / `planned` do not add volume or heatmap hits.

## Confirm / Cross-Agent write

On successful confirm of a **completed** workout:

1. Existing: event file + Status/Recent Actions sync.
2. **New:** update `central-node.md` Cross-Agent section with one line, e.g.  
   `Chadwick→Brisket: 30 Jul session completed, Chest and Curls. Set Day Type to 30-min Workout.`  
   Humanize `workout_30` / `workout_45_60` / `movement` consistently with Home labels.
3. Skip for `planned` / `skipped`.
4. Idempotent: if a line for that session date + Day Type already exists, do not duplicate.
5. Best-effort: failures after the event write must not fail the confirm response (same contract as Status sync).
6. Prefer one Central Node write that combines Recent Actions + Status + Cross-Agent when practical, to reduce SHA races.

Extend `js/core/central-node-write.js` (or sibling helper) with pure Cross-Agent upsert; unit-test without GitHub.

## Chadwick personality / protocols note

- **In-app voice:** frat-boy hype + no flat “logged” replies (`agent-directory.mjs`) — not a structured logging SOP.
- **Schema:** workout fields already define what can be logged.
- **Notion** exercise programming page linked from Constraints is **not** migrated in this phase.

## App wiring

- `index.html`: `#fitness-dashboard` + Chadwick floating button.
- `app-controller.js`: stop routing `fitness` to “later phase”; `showSection('fitness')`; render on show/refresh; wire chat panel like Nutrition.
- `main.js`: `DEFAULT_AGENT_BY_SECTION.fitness = 'chadwick'`; pass `buildFitnessModel` / `renderFitness`.
- `service-worker.js`: precache new modules; bump shell cache version.
- Tests: unit model + Cross-Agent helper; integration confirm; browser acceptance (fixture Chest and Curls + Chadwick accent).

## Edge cases

| Case | Behaviour |
|------|-----------|
| No workouts in repo | Empty hero + zero charts |
| Only planned today | Hero = planned; comparisons may be empty |
| Exercise name drift | Exact case-insensitive match only (v1) |
| Bad sets | Skip for volume/e1RM; tab still renders |
| Duplicate Day Type line | No-op |

## Out of scope

- Notion Chadwick programming / AEKE playbook migration into prompts  
- Editing sets on the Fitness tab  
- Pain-flag timeline / medical narrative UI  
- XP / gamification / social feeds from commercial gym apps  
- Continuous GitHub push  

## Success criteria

1. Fitness nav opens a real dashboard (not “later phase”).  
2. First viewport reads streak + session hero.  
3. Week volume, focus strip, vs-last/PR, and month heatmap render from fixture/live events.  
4. Chadwick chat opens with correct accent and sticky default.  
5. Completing a workout via confirm appends Cross-Agent Day Type for Brisket (when Central Node write succeeds).  
6. Soft-medical motion/tokens match Nutrition; layout feels gym-first.
