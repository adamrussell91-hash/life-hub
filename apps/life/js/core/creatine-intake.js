/** Conservative guard for explicit intake quantities. Complex multi-dose,
 * retrospective-total and hypothetical wording stays with the agent; this
 * guard never guesses an amount or creates a record on its own.
 */
export function reportedCreatineGrams(message) {
  if (typeof message !== 'string' || !/\bcreatine\b/i.test(message)) return null;
  if (/\?|\b(?:should|could|would|will|tomorrow|planning|plan to|didn't|did not|haven't|have not|not taken|no creatine|total|altogether|actually|correct|correction|instead|wrong|remove|delete)\b/i.test(message)) return null;
  if (!/\bi\s+(?:(?:already|just)\s+)*(?:took|had|made|drank|mixed|added|have taken)\b|^\s*(?:had|took|drank|made)\b/i.test(message)) return null;
  const quantities = [...message.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:g|grams?)\s+(?:of\s+)?creatine\b|\bcreatine\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/gi)];
  if (quantities.length !== 1) return null;
  const grams = Number(quantities[0][1] ?? quantities[0][2]);
  return Number.isFinite(grams) && grams > 0 && grams <= 100 ? grams : null;
}

export function candidateContainsCreatine(candidate) {
  return candidate?.type === 'creatine' || (candidate?.type === 'meal' && (Number(candidate.fields?.creatine_g) > 0 || /\bcreatine\b/i.test(candidate.notes ?? '')));
}

export function preserveReportedCreatine(candidate, message) {
  const grams = reportedCreatineGrams(message);
  if (grams === null || !candidate?.fields) return candidate;
  if (candidate.type === 'meal' && candidateContainsCreatine(candidate)) return {...candidate, fields:{...candidate.fields, creatine_g:grams}};
  if (candidate.type === 'creatine') return {...candidate, fields:{...candidate.fields, grams}};
  return candidate;
}

/** One explicitly reported dose gets one proposal per turn, even if the model
 * calls both meal and supplement tools. Failed validation leaves it unclaimed.
 * Compound dose reports deliberately stay with the agent's individual keys.
 */
export function createReportedCreatineGuard(message) {
  const grams = reportedCreatineGrams(message);
  let accepted = false;
  const relevant = candidate => grams !== null && candidateContainsCreatine(candidate);
  return {
    prepare(candidate) {
      if (relevant(candidate) && accepted) return {error:'This reported creatine intake already has a proposal. Do not create a second meal or supplement for the same dose.'};
      return {candidate:preserveReportedCreatine(candidate,message)};
    },
    accept(candidate) { if (relevant(candidate)) accepted = true; }
  };
}
