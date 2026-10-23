// netlify/functions/_shared/tutorial-groups-model.mjs
/**
 * Ann's grouping call for a tutorial: one Sonnet message, no tools. The brief
 * names students only as S1, S2…; anything that looks like a student id
 * (st_ + up to 24 of a-z0-9_, as student-initials.mjs makes them) is refused
 * before it leaves.
 */
import { QuizError } from './question-drop.mjs';

const MODEL = 'claude-sonnet-4-6';
const TIMEOUT_MS = 45_000;
const STUDENT_ID_LIKE = /(?<![a-z0-9])st_[a-z0-9_]+/i;
const FAILED = 'Ann couldn’t group them just now. Try again.';
const SYSTEM = 'You are Ann, a teaching assistant for a secondary English teacher in Sydney. You group students by the reason behind their mistakes so the teacher can reteach each reason. Reply with JSON only.';

export async function askForGroups({ brief, apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.TEACHING_AI_MODEL || MODEL, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new QuizError(503, 'no_key', 'Ann isn’t set up on this server.');
  if (typeof brief !== 'string' || !brief.trim()) throw new QuizError(400, 'bad_brief', 'Nothing to group.');
  if (brief.length > 12000) throw new QuizError(400, 'too_long', 'Too many students to group at once. Try a smaller group.');
  if (STUDENT_ID_LIKE.test(brief)) throw new QuizError(400, 'names_in_brief', 'The brief named a student. Nothing was sent.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let data;
    try {
      const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: brief }] }),
        signal: ctrl.signal
      });
      if (!response.ok) throw new QuizError(502, 'model_failed', FAILED);
      data = await response.json();
    } catch (e) {
      if (e instanceof QuizError) throw e;
      if (e?.name === 'AbortError') throw new QuizError(504, 'model_timeout', 'Ann took too long. Try again.');
      throw new QuizError(502, 'model_failed', FAILED);
    }
    const text = (Array.isArray(data?.content) ? data.content : []).filter((c) => c?.type === 'text').map((c) => c.text).join('');
    return { text, usage: data?.usage ?? null };
  } finally {
    clearTimeout(timer);
  }
}
