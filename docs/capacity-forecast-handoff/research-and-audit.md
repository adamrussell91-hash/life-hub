# Research basis and repository audit

## Research: what it supports and what it does not

The research below guided the design. None validates the prototype's point weights, one-person capacity scale, weather labels, or a causal lift from specific events. Recheck current papers/guidelines and relevant populations before implementation; do not claim custom bubbles are PROMIS or a validated clinical scale.

| Primary source | Design implication | Limit |
|---|---|---|
| [Van Dongen et al., 2003](https://pubmed.ncbi.nlm.nih.gov/12683469/): repeated restricted sleep and cumulative cognitive impairment | Multi-night sleep history matters; current subjective mood/energy may not erase accumulated cognitive cost. | Controlled group study, not a coefficient table for this user. |
| [Palmer et al., 2024](https://pubmed.ncbi.nlm.nih.gov/38127505/): sleep loss and emotion meta-analysis | Sleep can affect emotional as well as cognitive functioning; mood alone is insufficient. | Population effects are not personal readiness points. |
| [Consensus Sleep Diary, Carney et al., 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3250369/) | Capture perceived restorative quality separately from duration; morning entry is appropriate. | A shortened bubble flow is not automatically a validated sleep diary. |
| [Sonnentag, 2003](https://pubmed.ncbi.nlm.nih.gov/12814299/): recovery and next-day work engagement | Include prior workload and experienced recovery. | Engagement and overall capacity are different outcomes. |
| [Syrek et al., 2017](https://pubmed.ncbi.nlm.nih.gov/27101340/): unfinished tasks, rumination and sleep | Task context/carry-over can inform hypotheses; actual workload is more than scheduled hours. | Observational associations do not establish personal causality. |
| [PROMIS Fatigue scoring manual](https://www.healthmeasures.net/images/PROMIS/manuals/Scoring_Manual_Only/PROMIS_Fatigue_User_Manual_and_Scoring_Instructions_02202023.pdf) | Distinguish fatigue experience from impact on physical, mental and social function. | Custom bubble answers are not validated PROMIS scoring. |
| [Saw et al., 2016](https://pubmed.ncbi.nlm.nih.gov/26423706/): athlete monitoring review | Subjective recovery/wellbeing can be useful alongside training evidence. | Athlete findings do not directly calibrate this user's exercise effects. |
| [TRIPOD+AI, 2024](https://www.bmj.com/content/385/bmj-2023-078378) | Define the prediction target, report evaluation/calibration and uncertainty honestly. | Reporting guidance is not evidence that a model is accurate. |

## Existing calculation (before readiness v1)

Superseded by `readiness-model.js`; see [algorithm.md](algorithm.md). Kept for provenance.

Canonical implementation: `packages/design-kit/js/calendar/capacity-model.js`; Life app capacity file reexports it. Baseline 80, floor 10, ceiling 95. Current adjustments:

- Sleep below 7 hours: −8 per missing hour, maximum −30.
- Diary energy: low −15, medium 0, high +8; lowest reported energy wins for the day.
- Diary mood score ≤3: −8.
- Distinct diary symptoms: −15 each, capped −25; uses symptom array or regex text matching without reliable negation handling.
- Prior low logged days (<60): −4 each, capped −8.
- Missing-day forecast recovers toward 80 using `80 + (last − 80) × 0.6^daysAhead`; holiday +5.
- No earlier logged day within the supplied date list: 80 (“no logs”).

A numeric sleep record or any diary makes the day logged rather than forecast. It is not specifically mood that makes it solid, and logged does not mean well evidenced. Missing days do not independently reset the tracked low-day streak. Maximum 95 also conflicts with Adam's 100 endpoint.

`dayLoadHours` excludes class/protected/Corey/ghost/log items. `isOverCapacity` compares load hours to `(pct/100) × 6`; load does not alter the readiness score itself.

Earlier audit found `tideline-model.js` passes displayed-week dates to `capacityForDates`, excluding earlier context even if loaded. Almanac separately uses recent logged dates and term-pattern constants; its widening band is arbitrary rather than calibrated. Re-verify these view-specific details against the eventual implementation branch. Medication timing is a visual guide, not an existing readiness effect.

Audit snapshot originally read: life-hub `ad7b574826f447c017d4f6b5644ab09f0b485d45`. Handoff prepared against newer main `849d9f092d3060f579dd0081cedae9b0d54713fa`; canonical capacity formula remains as above. Do not assume all surrounding loaders are unchanged.

## Available information and coverage limits

The private life-hub-data repo has body/health, fitness, mind/diary and nutrition records and rich Central Node context. Actual personal contents are intentionally omitted here. No dedicated regularly populated sleep series was found in the initial audit; Adam explicitly says sleep is never measured or monitored. The morning entry must support subjective sleep without requiring measured hours.

Diary records frequently arrive in the evening and can be backdated. Medical records can mention fatigue or sleep but are ignored by the current diary-only capacity path. Use provenance/content and effective time, not only category label. Source structured health facts may supersede older Central Node summaries; never copy raw labs or infer capacity from them mechanically.

Tasks Hub is live inside this umbrella (`apps/tasks`) with data in Netlify Blobs; the old Tasks-Hub repo is archived. Schema supports estimated/actual duration, cognitive load, deep/shallow/admin work, target/review versus due dates, progress/dependencies and work sessions. Actual Blob coverage was not inspected during the read-only repo audit; it remains unknown. Work sessions can carry actual duration, depth, work mode, source and result. Calendar completion is not evidence work happened.

Fitness can contain completed training duration and recovery flags. Nutrition distinguishes partial/unlogged from complete records; missing logs do not imply fasting or missed meals. Central Node provides constraints/priorities and concise summaries, with existing receipts/update rules. Do not count summary plus original record as two observations.

## Verification completed during design

Local browser checks exercised both interactive prototypes. The comparison model was checked for reachable 100, sleep/work/exercise sensitivity, finite bounded output, and wider uncertainty with more missing days. The hourly prototype was checked for sleep changes, discrepancy reason requirement, structured log preview, no script errors and fitting a 390px viewport. These validate prototype behaviour, not algorithm accuracy.
