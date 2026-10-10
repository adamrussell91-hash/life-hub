# Creatine evidence and model boundary

Verified against primary publications and first-party AIS guidance on 10 October 2026. This brief informs coaching and explains the model; it does not establish an individual prescription.

## Population evidence

| Source | Supported conclusion | Limit for Life Hub |
|---|---|---|
| [AIS: how and when to use creatine](https://www.ausport.gov.au/ais/nutrition/supplements/group_a/performance-supplements2/creatine/how-and-when-do-i-use-it) | Rapid loading: approximately 0.3 g/kg/day for about five days, split into 3–4 doses. Maintenance-style 3–5 g/day can instead raise stores over about four weeks. | Loading is an option to discuss, not required or automatically prescribed from weight or ETA. |
| [Kreider et al., ISSN position stand, 2017](https://doi.org/10.1186/s12970-017-0173-z) | Summarises rapid loading over 5–7 days, maintenance at 3–5 g/day, gradual loading over 3–4 weeks, and return toward baseline over roughly 4–6 weeks after cessation. | Population time ranges do not identify Adam's baseline, exact uptake rate, saturation or personal catch-up amount. |
| [Hultman et al., Muscle creatine loading in men, 1996](https://doi.org/10.1152/jappl.1996.81.1.232), PMID 8828669 | Study of 31 men: approximately 20% mean muscle-total-creatine increase after 20 g/day for six days; a similar gradual increase with 3 g/day over 28 days. Elevated stores were maintained with 2 g/day in that study; after stopping, levels approached pre-supplement values by 30 days. | Group biopsy findings, specific sample and regimens. This does not validate Life Hub's daily interpolation or scale-derived personalised saturation. The app's 3–5 g maintenance range comes from broader guidance, not a claim that this trial tested that exact range. |
| [AIS: concerns and considerations](https://www.ausport.gov.au/ais/nutrition/supplements/group_a/performance-supplements2/creatine/are-there-any-concerns-or-considerations) | Short-term body-mass increase and GI tolerance can matter; lower-dose gradual use and taking with meals are possible tolerance strategies. | Current clinician advice, Crohn's context and the actual product label govern individual decisions; general safety evidence is not medical clearance. |

## What the app computes

The engine reconstructs actual recorded supplement intake from meal `creatine_g` plus separate `creatine` doses, stable corrections and effective `creatine_plan` records. A meal supplement is never recorded again as a standalone dose. Its bounded 91-day context and last-week dose view support the dated Central Node summary and Nutrition card. The current day is recomputed after historical edits, rather than adding old intake to today's grams. A planned daily amount is never retrospectively counted as taken.

The stores curve is a **relative adherence/loading index calibrated to the population loading and washout ranges above**. It is not a validated individual pharmacokinetic model, measured muscle saturation, mmol/kg concentration, gram deficit, or percentage of a person's total muscle capacity. Food-derived creatine, endogenous synthesis, individual response and actual pre-record history are not measured. Weight can contextualise a discussed population loading regimen; body fat or a scale's skeletal-muscle estimate cannot measure saturation or define a personal creatine tank.

Unlogged days contribute zero recorded supplemental intake. That convention makes incomplete logging visible, but cannot prove that no intake happened. An optional starting baseline requires explicit established intake history; do not infer it from appearance, strength, weight or the existence of a plan. Incomplete history suppresses the forecast. A displayed default routine is an assumption, not a confirmed prescription. ETAs depend on future adherence to the displayed routine and remain ranges.

The recent-dose marker represents gradual potential contribution, not a proven hour-by-hour uptake curve or a timer for when all grams have reached muscle. The UI animation is explanatory. No source here validates an exact four-hour absorption clock, an exact number of grams needed to fill the plotted gap, a double-dose catch-up rule or a guaranteed performance gain at target. Coaching should favour the agreed routine and a practical adherence cue, subject to live clinical and label constraints.

## Operational ownership

Brisket logs doses and effective plans through Confirm, using stable per-date dose keys for retries/corrections and separate keys for genuinely additional same-minute doses. Confirmed nutrition mutations publish one full dated Central Node summary automatically. Sara, Hammond and Chadwick consume that summary only for a relevant clinical, habit or training question; routine doses do not require broadcast handoffs. A pending proposal is not saved intake or an updated summary.
