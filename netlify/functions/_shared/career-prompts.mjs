/**
 * Ann O'Tation career prompts. Every model output is a proposal Adam confirms.
 * Voice comes from agent-directory (ann).
 */

import { findAgent } from './agent-directory.mjs';

export function annVoice() {
  const ann = findAgent('ann');
  return ann?.voice ?? "You ARE Ann O'Tation — plain, concrete, Australian spelling.";
}

/** Draft criteria / aliases / where for a new future from an ad or description. */
export function futureDraftPrompt({ title, description }) {
  return `${annVoice()}

Adam is weighing a future role. Draft selection criteria from what he pasted.
Return strict JSON only:
{
  "title": string,
  "where": string|null (≤ 200, school/system if stated),
  "aliases": string[] (≤ 8 role titles people use in employee_at),
  "criteria": [{ "text": string ≤ 500, "source": "ad"|"ann" }] (5–8 items)
}

Rules:
- Prefer criteria stated in the ad (source "ad"); fill gaps with Ann-sourced practical criteria (source "ann").
- No invented schools, salaries, or named people.
- Australian English. No markdown.

Role title: ${JSON.stringify(title || '')}
Paste / description:
${JSON.stringify(String(description || '').slice(0, 8000))}
`;
}

/** Weekly Skills scan — groups hub records into keep/bin proposals. */
export function skillsScanPrompt({ sources, futures }) {
  return `${annVoice()}

Adam asked for a Skills scan. Group the source records into 3–8 skill-card proposals.
Return strict JSON only:
{
  "proposals": [{
    "title": string,
    "occurred_on": "YYYY-MM-DD",
    "date_precision": "day"|"month"|"year",
    "star": { "situation": string|null, "task": string|null, "action": string|null, "result": string|null },
    "skills": string[],
    "apst": string[],
    "source_refs": string[],
    "witness_refs": string[],
    "future_matches": [{ "future_id": string, "criterion_ids": string[], "strength": "strong"|"some" }],
    "why": string
  }]
}

Rules:
- source_refs must be a subset of the input refs. Drop any other.
- witness_refs must be a subset of the input witness candidates.
- future_matches must use only the provided future ids and criterion ids.
- Prefer concrete STAR over fluff. Australian English.

Futures:
${JSON.stringify(futures)}

Sources:
${JSON.stringify(sources)}
`;
}

/** Suggest a future Adam didn't plan (Ann spotted). */
export function spottedFuturePrompt({ ledgerSummary, existingTitles }) {
  return `${annVoice()}

From Adam's skill cards, suggest at most one future role he has not already listed.
Return strict JSON only:
{ "title": string, "where": string|null, "aliases": string[], "criteria": [{ "text": string, "source": "ann" }], "suggested_reason": string ≤ 1000 }
or { "none": true } when nothing solid.

Existing futures (do not repeat): ${JSON.stringify(existingTitles)}
Ledger summary: ${JSON.stringify(ledgerSummary)}
`;
}
