// netlify/functions/_shared/goal-verdict-model.mjs
/**
 * G-32 Model-written verdict + content-aware splits (Haiku).
 * One call per recompute. Timeout 8s. Invalid/fail → deterministic fallback.
 */
const MODEL = 'claude-haiku-4-5';
const TIMEOUT_MS = 8000;

function extractJson(raw) {
  const trimmed = String(raw ?? '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}

export function parseVerdictModel(raw) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.verdict !== 'string' || !parsed.verdict.trim()) return null;
    const verdict = parsed.verdict.trim().slice(0, 240);
    let split_steps;
    if (Array.isArray(parsed.split_steps)) {
      const steps = parsed.split_steps.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim());
      if (steps.length >= 3 && steps.length <= 5) split_steps = steps;
    }
    return { verdict, split_steps, fallback: false };
  } catch {
    return null;
  }
}

export async function fetchVerdictModel({
  read,
  goal,
  apiKey = process.env.ANTHROPIC_API_KEY,
  fetchImpl = fetch,
  voice = 'Hammond: calm, practical, no shame, short.'
} = {}) {
  if (!apiKey) return { fallback: true, reason: 'fallback' };
  const openTitles = (goal?.next_start ? [goal.next_start] : []);
  const body = {
    model: MODEL,
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `${voice}

Write a goal verdict as strict JSON only: { "verdict": string ≤ 240 chars, "split_steps"?: string[3..5] }.

Deterministic read:
${JSON.stringify({
  temperature: read.temperature,
  days_since_movement: read.days_since_movement,
  week: read.week,
  crunch_weeks: read.crunch_weeks,
  verdict: read.verdict,
  structure: goal.structure,
  frame: goal.frame,
  if_then: goal.if_then,
  open_titles: openTitles
})}`
    }]
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!response.ok) return { fallback: true, reason: 'fallback' };
    const json = await response.json();
    const text = Array.isArray(json?.content)
      ? json.content.map(p => p?.text ?? '').join('')
      : '';
    const parsed = parseVerdictModel(text);
    if (!parsed) return { fallback: true, reason: 'fallback' };
    return parsed;
  } catch {
    return { fallback: true, reason: 'fallback' };
  } finally {
    clearTimeout(timer);
  }
}
