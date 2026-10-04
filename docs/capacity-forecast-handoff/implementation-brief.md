# Implementation brief

## Outcome Adam wants

An understandable, personalised capacity forecast across Life Hub, driven by high-quality research, available cross-hub evidence, prior days and trends. The interface should behave like a weather forecast: a line across the day, meaningful condition icons, colour changes and honest uncertainty. Quick conditional bubble check-ins improve the forecast and leave observations suitable for later algorithm review.

**100/100 means everything is peaches: full capacity to smash the day, achieve things and kick ass.** It is an absolute readiness endpoint, not an average personal day, percentile, number of tasks completed or guaranteed ability to accomplish an impossible schedule. A previous prototype topped out around 60 even with perfect answers; Adam rejected that. Do not introduce an arbitrary history ceiling that makes 100 unreachable.

## Required behaviour

1. A forecast exists before the morning check-in. Two unanswered sleep questions must not break it, reset it to zero, imply poor sleep or pretend recovery is confirmed.
2. Sleep has a substantial effect. Poor sleep plus yesterday's heavy workload must not produce near-perfect readiness simply because mood is good.
3. Recent exercise and actual prior workload affect recovery even when fresh energy/focus answers exist. Gentle exercise can differ from strenuous exercise; effects depend on timing, recovery and learned individual response.
4. Mood is one domain, not the dominant universal input. Separate physical energy/fatigue, cognition and emotional strain internally.
5. Use history across week boundaries, prior days, rolling trends, and cross-hub sources. An evening diary must not retrospectively masquerade as morning knowledge.
6. Keep plan demand/feasibility distinct from readiness. Back-to-back meetings can lower predicted later readiness; a full-capacity person can still have an overfull schedule.
7. Morning questions are conditional, fast, bubble-based, never pre-answered. Keep the wording nuance in structured fields.
8. Larger prediction-versus-check-in discrepancies ask for a quick reason and preserve an auditable log. A reason of “Not sure” is valid.
9. Every forecast summary explains what and why, rather than merely “Bright spells.” Icons reinforce meaning; they do not replace explanations.
10. Adam provides the 30 final icons. Match the agreed mapping.

## Proposed build slices for a later implementation request

- Audit actual source coverage and write timestamped, deduplicated evidence adapters. Confirm Tasks Hub Blob records and health sources; do not assume schema fields are populated.
- Introduce a versioned, explainable readiness model and missing-data handling. Preserve original forecast snapshots. Keep coefficients explicitly provisional until evaluated.
- Add structured check-in persistence and discrepancy records, then an idempotent short Central Node summary linked to the observation.
- Add adaptive bubble UI to the morning forecast without requiring the diary workflow.
- Add hourly demand/recovery projections, uncertainty and explanations, followed by supplied weather assets.
- Evaluate prospectively and against chronological holdouts before claiming calibration or learning individual event effects.

## Acceptance examples

- All supportive current evidence + adequate recovery + no limiting context can reach 100.
- Poor sleep + heavy yesterday + strenuous exercise yields less readiness than the same case with restorative sleep and light demand.
- Missing sleep for two versus seven days yields a usable forecast; stale evidence increases uncertainty rather than inventing a new negative answer.
- A Monday uses available Sunday evidence even if the displayed calendar starts Monday.
- A diary entered at 10 pm does not enter an archived 7 am forecast's feature set.
- A scheduled lunch does not prove a meal was eaten; free time is recovery opportunity, not guaranteed recovery.
- Corey may produce a predicted emotional lift if supported by personal data; this does not erase physical fatigue.
- Check-in corrections update readiness immediately. Reason gathering does not discard or postpone the observation.
- A discrepancy record stores the original issued prediction, not the revised number or a post-answer prediction.
- Duplicate diary/health/Central Node descriptions of one episode are counted once.
- All controls work by keyboard/touch at 320–390px and desktop; conditions remain understandable without colour.

## Prototype limitations to fix when implementing

The hourly prototype's line is a hand-authored example and check-in changes shift it by a simple decaying offset. Its weather icons remain tied to example time slots; production must derive them from current domain state and trend. Sleep/focus bubbles demonstrate interaction, not a validated combined model. The reason log supports one example check-in and uses illustrative timestamps; production needs append-only observations, real timestamps, revision linking and persistence.

The prototype “finish” button asks for a reason before completion; the production observation must already be saved/usable independently, with reason completion handled separately. Bubble anchor scores (20/40/60/80/100) are coarse: a 10-point threshold should account for answer resolution/uncertainty, or offer a finer optional adjustment. Do not interpret a label as an exact clinical measurement.

The browser prototypes are design references, not code to transplant unchanged. Reuse current design kit, persistence, liveness filters and accessibility conventions. Read root AGENTS.md/CLAUDE.md and relevant scoped instructions before edits. Run the required pre-PR gate for each implementation PR.
