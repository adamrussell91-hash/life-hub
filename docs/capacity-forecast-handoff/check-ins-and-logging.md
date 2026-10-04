# Conditional morning bubbles and feedback logs

## Entry experience

A very quick morning entry point around 7 am, independent of evening diary entry. All questions can be conditional; ask roughly 1–3 high-value questions based on freshness, uncertainty, recent conditions and decision relevance. Skip remains available. Do not require sleep monitoring, wearables, numeric hours or completion every day.

Start consistently: “How are you starting today?” Predict the relevant question from yesterday's context, not the user's answer. Never preselect or automatically submit an inferred response.

| Relevant context | Example question | Bubble options |
|---|---|---|
| Previous poor sleep | How was last night? | Worse / Still poor / Better, still tired / Restorative |
| Recent low energy | How is your energy? | Drained / Heavy but manageable / Back to normal / Energised |
| Recent brain fog | How is focus? | Foggy / Clear but distractible / Can focus briefly / Sharp |
| Active symptoms | How is it today? | Worse / Same / Easing / Gone |
| Heavy work or training | What is lingering? | Physical soreness / Mental fatigue / Both / Feeling recovered |
| Unclear initial state | How ready do you feel? | Running on empty / Limited reserves / Manageable / Feeling strong / Full capacity |
| Meaningful recovery opportunity | Did the break help? | Not really / A little / Refreshed |

Add a correction/“Something else” route when the premise is wrong. If context is stale or contradictory, use a neutral question instead of repeatedly assuming an ongoing problem. Store nuance: “better, still tired” means positive trend plus residual fatigue, not simply “good.” Keep energy, focus, mood, physical symptoms and recovery distinguishable.

Do not ask users to manually reproduce calendar/tasks/training facts already available. Ask about experience when the source cannot establish it: restorative quality, actual effect of a break, pain, fatigue or cognitive clarity.

## Larger discrepancies

Adam requested a reason when the response differs by around 10 points. Use an initially configurable absolute difference threshold of 10, with explicit consideration of coarse bubble anchors and uncertainty. Compare against the prediction issued before the answer, for the same domain/time/outcome.

Prompt: “That’s a bigger difference. What did we miss?”

One-tap examples: Sleep worse than expected / Work took more out of me / Pain or illness / A break helped / Feeling emotionally lifted / Something else / Not sure.

Permit reasons for either direction, and multiple contributors if helpful without making entry onerous. Optional short note for “Something else”; do not force an essay. The observation immediately tightens/updates the forecast even if the reason is unfinished. “Not sure” records unexplained error honestly; never invent attribution. Do not replace the prediction with the user's report and then log a zero residual.

## Persistence design

1. Durable structured, timestamped observation log in the existing authorised private data/persistence layer. Choose exact schema/path after confirming architecture. Do not put personal responses in this public repo.
2. Link to immutable forecast snapshot/model version with source feature availability and same-time prediction.
3. Discrepancy/calibration record stores error and stated reason, independent of forecast rendering.
4. Central Node receives a short dated summary referencing the structured observation. Follow existing update/receipt rules and avoid duplicate notes or duplicated scoring.
5. Later reviewed algorithm modifications refer back to evidence and evaluation results. Reasons are hypotheses, not automatically causal labels.

Suggested fields:

```json
{
  "id": "observation-id",
  "observed_at": "ISO timestamp with timezone",
  "recorded_at": "ISO timestamp",
  "local_date": "YYYY-MM-DD",
  "source": "morning_bubbles",
  "domain": "overall_readiness",
  "answer_code": "limited_reserves",
  "answer_text": "Limited reserves",
  "reported_estimate": 40,
  "answer_resolution": "coarse_anchor",
  "sleep_quality": null,
  "sleep_trend": null,
  "residual_fatigue": null,
  "focus": null,
  "forecast_snapshot_id": "snapshot-id",
  "forecast_issued_at": "ISO timestamp before response",
  "forecast_target_at": "same target time as observation",
  "model_version": "version",
  "predicted_estimate": 72,
  "predicted_range": [58, 86],
  "residual": -32,
  "reason_codes": ["work_fatigue"],
  "reason_status": "provided",
  "note": null,
  "supersedes_observation_id": null,
  "central_node_receipt_id": "receipt-id"
}
```

The numerical example is invented. Separate absent from skipped, stale from fresh, incomplete reason from “Not sure.” Protect deletion/liveness semantics: deleted records must not remain training evidence or agent-visible context. Define how derived aggregates/snapshots handle deletions and corrections using repository conventions.

Central Node summary example: “07:05 morning check-in: readiness lower than forecast; reports lingering fatigue after yesterday's workload. Sleep improved but still tired. See linked observation.” Raw responses remain the durable source; the summary does not become a second independent observation.
