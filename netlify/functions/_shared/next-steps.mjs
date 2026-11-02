/**
 * Next steps in writing boxes: the shared rules. Pure.
 * A code's ladder has one line per placement rung, below → excellent. A
 * writing box's bank is that ladder rewritten for its question.
 */
export const RUNG_ORDER = ['below', 'capable', 'skilled', 'accomplished', 'excellent'];
export const LADDER_MAX = 160;
export const SKILL_REF = /^[a-z]{3,20}\.[a-z-]{2,40}$/;

/** Index into a ladder or bank. No rung yet means the Capable line. */
export function rungIndex(rung) {
  const i = RUNG_ORDER.indexOf(rung);
  return i === -1 ? 1 : i;
}

const BANNED = /\b(not|no longer|without|never|rather than|instead of|don'?t|doesn'?t|isn'?t|lacks?|weak|fails?)\b|^this is\b/i;

/** Problems with one line of student-facing wording; empty means it passes. */
export function checkWording(line, max = LADDER_MAX) {
  const out = [];
  const t = String(line ?? '').trim().replace(/[’‘]/g, "'");
  if (!t) out.push('empty');
  if (t.length > max) out.push('too_long');
  const hit = t.match(BANNED);
  if (hit) out.push(`word:${hit[0].toLowerCase()}`);
  return out;
}

/** What a bank entry was built from, so the builder can tell when it is stale. */
export function bankSource(question, skills, ladder) {
  const s = JSON.stringify([String(question ?? '').trim(), [...(skills ?? [])].sort(), ladder ?? null]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * For each skill, the student's growth codes linked to it, top first, and
 * their rung. A box takes the first one its bank covers, so a code new to a
 * skill leaves existing banks working. `rankedGrowth` rows are already ordered
 * most hits first, most recent first.
 */
export function stepsBySkill(rankedGrowth, codesById, rungs) {
  const skills = {};
  for (const [skill, rung] of Object.entries(rungs)) skills[skill] = { rung, codes: [] };
  for (const r of rankedGrowth) {
    const c = codesById.get(r.code_id);
    if (!c?.skill) continue;
    const s = (skills[c.skill] ??= { rung: null, codes: [] });
    s.codes.push({ id: c.id, code: c.code, colour: c.colour, hits: r.hit });
  }
  return skills;
}

/**
 * A student's next-step pick, cleaned: `{ code_id, line, start, end }` for the
 * sentence they tapped in `answer`, or `{ code_id, line, skipped: true }`.
 * `line` is the step they saw, so marking never depends on a regenerated bank.
 * Null when it doesn't fit. Without the answer text, offsets are checked against `max`.
 */
export function cleanStepPick(raw, answer, max = 4000) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.code_id !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(raw.code_id)) return null;
  const line = typeof raw.line === 'string' ? raw.line.trim() : '';
  if (!line || line.length > LADDER_MAX) return null;
  if (raw.skipped === true) return { code_id: raw.code_id, line, skipped: true };
  const limit = typeof answer === 'string' ? answer.length : max;
  const { start, end } = raw;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > limit) return null;
  return { code_id: raw.code_id, line, start, end };
}
