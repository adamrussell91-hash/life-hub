/**
 * Quiet until the evidence grows: one rule for a suggestion the teacher turned down.
 *
 * "Not now" remembers how much evidence stood behind the suggestion. It comes back only when
 * the count reaches QUIET_FACTOR times that, with at least QUIET_MIN_NEW new pieces. Never on
 * time alone. "Not this" mutes the suggestion until a stated day (the end of term).
 * This is the tie-inference declined-pair rule (TIE_DECLINED_REPROPOSE_FACTOR) as a pure helper
 * the WalkThrus pattern monitor uses; the three older dismissal engines are untouched.
 *
 * A record is `{ kind: 'not_now' | 'accepted', count, at }` or `{ kind: 'not_this', until, at }`.
 */

export const QUIET_FACTOR = 2;
export const QUIET_MIN_NEW = 3;
export const QUIET_KINDS = Object.freeze(['not_now', 'not_this', 'accepted']);

const DAY = /^\d{4}-\d{2}-\d{2}/;

/** @returns {{kind: 'not_now' | 'accepted', count: number, at: string}} */
export function quietCountRecord(kind, count, at) {
  return { kind: kind === 'accepted' ? 'accepted' : 'not_now', count: Math.max(0, Math.floor(Number(count) || 0)), at };
}

/** @returns {{kind: 'not_this', until: string, at: string}} */
export function quietUntilRecord(until, at) {
  return { kind: 'not_this', until, at };
}

export function normalizeQuiet(value) {
  if (!value || typeof value !== 'object' || typeof value.at !== 'string') return null;
  if (value.kind === 'not_this') return typeof value.until === 'string' && DAY.test(value.until) ? { kind: 'not_this', until: value.until.slice(0, 10), at: value.at } : null;
  if (value.kind === 'not_now' || value.kind === 'accepted') return quietCountRecord(value.kind, value.count, value.at);
  return null;
}

/**
 * Is the suggestion quiet right now, and if it has come back, what is new since.
 * @param {any} record
 * @param {number} count evidence behind the suggestion today
 * @param {string} today YYYY-MM-DD
 * @param {{ factor?: number, minNew?: number }} [rule]
 * @returns {{ quiet: boolean, comeback: { at: string, was: number, now: number, since: number } | null }}
 */
export function quietState(record, count, today, rule = {}) {
  const r = normalizeQuiet(record);
  if (!r) return { quiet: false, comeback: null };
  if (r.kind === 'not_this') return { quiet: today.slice(0, 10) <= r.until, comeback: null };
  const factor = rule.factor ?? QUIET_FACTOR;
  const minNew = rule.minNew ?? QUIET_MIN_NEW;
  const since = count - r.count;
  const back = since >= minNew && count >= r.count * factor;
  return back ? { quiet: false, comeback: { at: r.at, was: r.count, now: count, since } } : { quiet: true, comeback: null };
}

/** "Dismissed 4 Nov. Since then, 3 more quizzes show the same problem." */
export function comebackNote(comeback, noun = 'quizzes') {
  if (!comeback) return '';
  const day = new Date(comeback.at);
  const when = Number.isNaN(day.getTime()) ? '' : ` ${day.getUTCDate()} ${day.toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' })}`;
  return `Dismissed${when}. Since then, ${comeback.since} more ${noun} show the same problem.`;
}

/**
 * The last day of the school term a date falls in, on the same spread `termRefFor` uses for labels
 * (Term 1 to April, 2 to June, 3 to September, 4 to the year's end). Labelling-grade, not a calendar.
 */
export function termEndFor(isoDate) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getUTCMonth() + 1;
  const [m, day] = month <= 4 ? [4, 30] : month <= 6 ? [6, 30] : month <= 9 ? [9, 30] : [12, 31];
  return `${d.getUTCFullYear()}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
