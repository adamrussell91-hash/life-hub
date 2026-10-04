# Algorithm design and latest comparison heuristic

## Meaning and architecture

Readiness is bounded 0–100, with 100 meaning full capacity. Internally maintain at least physical energy/fatigue, focus/cognitive capacity, and emotional strain. Aggregate them without assuming every source is interchangeable. Track current readiness separately from today's planned demand and project demand/recovery across time.

Recommended architecture: personalised state estimation with a prior, state persistence, recent observations, demand and recovery context. Use a transparent conservative initial model while collecting prospective outcomes. A sophisticated label is not evidence of accuracy; sparse diary data cannot identify a fitted personal model yet.

Evidence should include observed time, entered time, effective period, source and confidence. Use only evidence available at the forecast issue time. Resolve conflicting/superseded health facts by recency, authority and provenance, not category label alone. Central Node can contain summaries older than the source records.

Missing answers are unknown, never zero or automatically “poor.” Use appropriate history/context fallback and wider uncertainty. Avoid both indefinite stale certainty and assumed automatic recovery. Confidence is separate from readiness; any diary record must not make the entire forecast “solid.” A stable estimate with widening uncertainty is preferable to dramatic score changes caused only by non-response.

## Latest illustrative comparison model

This describes the final side-by-side HTML, not an empirically validated production formula. Research informed the design priorities; these numerical weights and thresholds were chosen for the mockup.

Assumed personal baseline 75; previous-day state 43; seven-day mean 49. History fallback:

`H = round(0.55 × 43 + 0.30 × 49 + 0.15 × 75) = 50`

Input anchors:

| Domain | Anchors |
|---|---|
| Energy | low 30; medium 70; high 100; unknown H |
| Focus | foggy 30; okay 70; clear 100; unknown H |
| Mood | low 30; okay 70; good 100; unknown H |
| Sleep quality | poor 25; fair 70; good 100; missing historical prior 35 in this scenario |
| Sleep duration | 5h → 45; 6h → 70; 7h → 100 |
| Health | ill 30; improving 65; resolved 100 |

Sleep is the minimum of quality and available duration anchors: seven hours does not cancel poor quality. This combines two sleep measurements into one domain rather than charging duplicate independent penalties. Real duration response must be more nuanced than three anchors.

`B = 0.25 energy + 0.25 focus + 0.10 mood + 0.20 health + 0.20 sleep`

Recovery factor R:

- Missing sleep: 0.7 for this assumed scenario.
- Known sleep ≥85: 0.4.
- Known sleep ≥60: 0.7.
- Lower known sleep: 1.

Prior work costs: light 0, moderate 3, heavy 8, multiplied by R.
Recent exercise cost: hard 5, gentle/rest 0, multiplied by R.
Additional poor-sleep × heavy-work interaction: 5 if known sleep <60 and prior work heavy.

`readiness = round(clamp(B − workCost − exerciseCost − interactionCost, 0, 100))`

Reported symptoms cap the health component at 65 for one symptom and 35 for multiple symptoms in the mock. Do not copy symptom counts into production as equivalent severities or double-count a health episode across domains.

Example outcomes, holding otherwise ideal fresh inputs:

| Scenario | Mock readiness |
|---|---:|
| Restorative sleep, light previous work, no strenuous exercise, no health limitation | 100 |
| Poor sleep, heavy previous workload | 72 |
| Same plus strenuous exercise | 67 |
| Restorative sleep but heavy previous workload | 97 |

These are interaction demonstrations, not promised final clinical or personal scores. The sample uncertainty band is also an illustrative spread, not a calibrated confidence interval. In the missing-data example, two versus seven missing days retain the estimate but widen its band.

## Evolution that must not be lost

Adam rejected a capped/relative score that could only reach about 60 under perfect conditions. Next, he rejected weak sleep weighting and a model where current answers removed the influence of exercise/workload. The latest prototype restores sleep's importance and retains recovery context even with fresh answers. Do not resurrect those earlier versions.

## Intraday projection

Project state forward from current observations with expected demands/recovery opportunities: meetings, task depth/cognitive load, prior actual work sessions, recent training, breaks, confirmed food intake and individually supported uplifting events. Distinguish anticipated from observed effects. Avoid arbitrary lunch/tea points or event-title-based spikes.

Free time is opportunity, not proof of restoration. A positive social event may lift emotional engagement while physical fatigue remains. Planned calendar workload and completed work sessions are different evidence; due dates and time blocks are not completed work. Medication timing visuals are not permission to assume pharmacological capacity boosts.

Explain the most relevant contributors, their direction and missing evidence. Weather states depend on domain pattern and trajectory, not thirty numeric brackets. Separate accumulated demand from a label implying illness or distress that the evidence does not support.

## Evaluation and learning

Store original prediction snapshots/version and then later observations. Compare prospectively and on chronological holdouts with yesterday carry-forward, recent-average and existing-formula baselines. Assess prediction error, direction, bias by horizon/context, and uncertainty coverage. Define outcomes in advance: experienced readiness and ability to manage the planned day, not raw task completion alone.

Do not update coefficients automatically after one surprising answer. Review repeated residual patterns, confounding, event timing and contradictory evidence. Keep versioned changes and evaluate whether they improve unseen predictions. Research supports sleep/recovery priorities, not exact percentage coefficients.
