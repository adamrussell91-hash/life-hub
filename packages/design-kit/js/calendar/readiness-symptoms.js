/**
 * Symptom words recognised in diary text until the diary schema carries `symptoms`.
 * Order matters for the note: the first match is named. A word preceded by "no", "not"
 * or "without" ("no headache today") is not a symptom.
 */
const SYMPTOM_PATTERNS = [
  ['sore throat', /\bsore throat\b/i],
  ['sniffles', /\bsniffl(?:es|y)\b|\brunny nose\b/i],
  ['run down', /\brun[- ]down\b/i],
  ['viral', /\bviral\b|\bvirus\b|\bflu\b/i],
  ['headache', /\bheadache\b|\bmigraine\b/i],
  ['nausea', /\bnause(?:a|ous)\b/i],
  ['flare', /\bflare(?:[- ]up)?\b/i],
  ['cramps', /\bcramp(?:s|ing)?\b/i],
  ['fatigue', /\bfatigue\b|\bexhausted\b|\bwiped out\b/i],
  ['fever', /\bfever\b|\btemperature\b/i]
];

const NEGATED = /\b(?:no|not|without|zero)\s+(?:\w+\s+){0,2}$/i;

function mentioned(text, re) {
  const global = new RegExp(re.source, 'gi');
  for (const match of text.matchAll(global)) {
    const before = text.slice(Math.max(0, match.index - 30), match.index);
    if (!NEGATED.test(before)) return true;
  }
  return false;
}

/** Symptoms from a diary record: its `symptoms` array if present, else words in its text. */
export function symptomsInRecord(record, body = '') {
  if (Array.isArray(record?.symptoms)) {
    return record.symptoms.map(s => String(s).trim()).filter(Boolean);
  }
  const text = `${record?.title ?? ''}\n${record?.notes ?? ''}\n${body ?? ''}`;
  return SYMPTOM_PATTERNS.filter(([, re]) => mentioned(text, re)).map(([name]) => name);
}
