# Capacity forecast: what was built (October 2026)

Adam approved the full build on 5 Oct 2026 and supplied the 30 icons. This page maps the handoff to the code and lists what is still provisional.

## Where things live

| Piece | File |
|---|---|
| Readiness model v2 (pure, versioned `readiness-2.0-provisional`) | `packages/design-kit/js/calendar/readiness-model.js` |
| Morning bubbles (question choice, answer codes) | `packages/design-kit/js/calendar/morning-bubbles.js` |
| Day view panel (forecast, hourly line, weather windows, bubbles, "What did we miss?") | `packages/design-kit/js/calendar/readiness-panel.js`, `packages/design-kit/calendar-readiness.css` |
| Persistence: snapshots, observations, discrepancies, Central Node line | `netlify/functions/capacity-checkins.mjs` → `/api/capacity-checkins` |
| 7 am phone nudge (`?checkin=1`) | `netlify/functions/_shared/day-sense-notify.mjs` (`checkin` rule) |
| Icons: Adam's originals (never edited) | `packages/design-kit/icons/capacity-weather/src/1–30.svg` |
| Icons: condition-coloured output | `packages/design-kit/icons/capacity-weather/1–30.svg`, `js/calendar/weather-icons.js` (generated) |
| Icon build | `node scripts/build-weather-icons.mjs` |
| Tests | `tests/unit/capacity-forecast.test.js` |

## Where Adam sees it

Life → Calendar → **Day**. For today, a **Capacity forecast** block now opens the side column, and the dial's centre gauge shows the same number. Between 5 am and noon the bubbles appear under the forecast. Outside that window a "Check in now" link appears instead. Around 7:00–9:30 am, if no check-in exists yet, the phone gets one push ("How are you starting today?"). The push counts toward the existing cap of 4 a day and opens the bubbles directly.

## One number everywhere

Every capacity percentage, in every view and every server planner, comes from one function: `capacityForDates` in `capacity-model.js`, which is now the readiness model (`readinessForDates`). Each caller also feeds it the same evidence:

| Caller | How check-ins and workload get in |
|---|---|
| Day dial, Day panel, Week (Tideline), Term / Year (river) — Life and every hub calendar | `withCheckins()` in `readiness-checkins.js` merges the shared check-ins into the view's events; each view repaints when check-ins change |
| Almanac (server) | `readinessEvidenceEvents()` adds check-ins, tracked sessions and classes; a check-in clears the Almanac cache |
| Sara's ghost proposer, Hammond's goal slots (server) | The same helper, with three weeks of sleep / diary / training history |

The holiday rule is the same everywhere (`school-time.js`). `tests/unit/capacity-forecast.test.js` (“one number everywhere”) fails if Day, Week, Term/Year and the Almanac ever disagree for the same day.

Removed to make that true:
- The old penalty formula (baseline 80, ceiling 95, low-day streak).
- The Almanac's placeholder term pattern (−12 on every future term day, −18 in week one).
- The Term river's hand-made fixture numbers whenever real logs exist.

Fixed along the way: Hammond's goal slots read the capacity Map as a plain object, so every day silently read 80%.

Days are computed when a check-in, sleep record or diary speaks to them, and today always is. After the last such day, the forecast recovers toward the baseline (75), with a small holiday lift and a band that widens with distance. "No symptoms logged" counts as unknown (history), not perfect health, so quiet days don't drift upward. A day is flagged to soften below 40, or when illness and known poor sleep coincide.

## How the handoff rules map

- **100 is reachable.** The readiness forecast has no 95 ceiling.
- **Missing sleep is unknown.** It falls back to recent history. Staler sleep widens the band and never moves the estimate.
- **Sleep, prior workload and strenuous exercise are kept after fresh answers.** Lingering soreness or mental fatigue scales those costs. "Recovered" shrinks them.
- **Mood is one of five weighted inputs.** Physical, cognitive and emotional domains drive the weather separately. A domain nobody has reported on (an unanswered question with no log) is left out of the weather, so fog, rain or cloud never comes from a guess.
- **Evidence is filtered by when it became knowable.** The model uses `recorded_at`/`created_at`, else the record's date and time. A diary with no time counts as written that evening, so it never enters that morning's forecast.
- **Monday uses Sunday.** History, evidence and yesterday's workload are read from events by date, not from the displayed week.
- **Workload.** Tracked work sessions count as *actual*. Classes count as *scheduled*. Professional meetings count at 0.65× a class hour (`MEETING_WEIGHT`), because they're usually less cognitively consuming; in today's hourly line they drain at the same ratio. Server planners load meetings through the same projection the calendar uses. A task's time block alone does not count.
- **Free time is opportunity, not proof of recovery.** There are no lunch or tea bumps and no title-based spikes. Grogginess at the start of the day is modelled only when poor sleep and foggy focus were actually reported.
- **The snapshot is immutable.** It is issued once, before any answer. The server refuses to back-fill a forecast after the answer, and computes the residual against the stored snapshot, never against a client number.
- **Observations are append-only.** Corrections supersede. Deletes set `deleted_at` and drop out of the forecast, history and the next morning's question choice.
- **The discrepancy step comes after saving.** It is asked only after the observation is saved. It compares like with like: the overall readiness answer against the issued forecast. It fires at a 10+ point gap when the answer is outside the issued band, or at 20+ points regardless, because bubble anchors are 20 apart. "Not sure" is stored as `unexplained`.
- **Central Node gets one line per day**, linked to the observation id, for example `**5 Oct:** Capacity: 07:05 morning check-in: readiness lower than forecast; sleep better, still tired. (check-in obs_…)`. A correction replaces the line rather than adding another. If GitHub is down, the observation is still saved.

## Icons

Shapes and numbering are exactly Adam's. Only colours changed, by condition family:

| Family | States | Hue |
|---|---|---|
| clear | 1–7 | warm gold / amber |
| steady | 8–9 | sage green |
| wind | 10–12 | teal |
| cloud | 13–17 | slate |
| fog | 18–21 | lavender-grey |
| rain | 22–25 | blue |
| storm | 26–27 | violet with yellow bolt |
| recovery | 28–29 | mint |
| evening | 30 | indigo |

To retune the colours, edit `FAMILIES` in the build script and re-run it. Every icon has a `<title>`, and the state name always appears as text next to it, so colour is never the only signal.

## Still provisional / not done

- The weights are the comparison prototype's design weights. They have not been fitted or evaluated. The band is illustrative, not calibrated. Prospective evaluation and chronological holdouts (see `algorithm.md`) still need to be built from the stored snapshot and observation pairs once enough mornings exist.
- No predicted Corey/social lift yet. The weather and explanation code supports one (`lifts`, state 7), but nothing in the stored data supports it yet, so none is shown.
- `tests/browser/dial-visual.spec.mjs` (in `DIAL_APP=1` mode) and the calendar reference mock-ups still quote the old fixture values (34% Thursday). The fixture day now reads 51 by design. That spec is not in the default browser run, and its header says not to edit it, so this is flagged in the PR instead.

## Agent insights (offer first, Adam decides)

Patterns between capacity and the rest of life are worked out deterministically (no AI, no daily agent job) and cached for the Life agents. Agents only ever **offer** one. The finding reaches an agent only after Adam says yes, or when he asks outright ("any insights?", "noticed any patterns?").

| Insight | Agent | Minimum evidence |
|---|---|---|
| Food on lower-energy days (takeaway/fast food, eating after 9 pm, very high-fat meals) | Brisket | 5+ low days with meals logged, 3+ hits, low-day rate ≥25 points above other days |
| Poor or short sleep this week | Sara | 3+ poor nights in 7 |
| Low mood this week | Penelope, Vera | 3+ low days in 7 |
| Recovery after hard training / lingering soreness | Chadwick | 4+ sessions and an 8+ point gap, or 3+ soreness answers in 14 days |
| Capacity this week vs last | Hammond | 4+ computed days each week, an 8+ point change (or a week under 60) |

"Low days" are Adam's own bottom third, and below his median, using the same capacity number the calendar shows. A flat month has none. Deleted check-ins never count.

**Files.**
- `packages/design-kit/js/calendar/readiness-insights.js` finds the patterns.
- `netlify/functions/_shared/readiness-insight-turn.mjs` handles offer and consent.
- `netlify/functions/readiness-insights.mjs` (`/api/readiness-insights`) refreshes, lists topics and holds the off switch.
- `netlify/functions/chat.mjs` adds the block to the agent's evidence.

**When insights refresh.** In the background after each check-in. Saving the check-in never waits for this.

**What agents see when offering.**
- The topic only, e.g. "what you eat on your lower-energy days". The finding text never enters the prompt before a yes, and GET never returns it.
- If Adam replies yes within 3 hours, the agent shares the finding as a pattern, not a cause or judgement, with no shaming. "No" quiets that insight for 30 days.
- Each insight is offered at most once a week. An unanswered offer isn't repeated.
- Agents are told to skip the offer if Adam is upset or busy.

**Off switch.** "What's behind this" in the Day forecast → "Agents can offer insights … Turn off".

**Privacy.** Everything stays in the private tasks store. Central Node still gets only the daily check-in line.
