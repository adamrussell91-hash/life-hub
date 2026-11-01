/**
 * Patterns in one student's marked pieces: a row per outcome, concept or
 * skill, code counts per piece, and the next steps they point to. Pure and
 * shared by the student page and the teacher's Analysis panel. It returns
 * structure, not sentences; the views word it (apps/teaching/src/progress/story-text.ts).
 *
 * Levels come only from the teacher's placements (`places`). Codes never move a level.
 */
import { isTop } from './progress-steps.mjs';

export const HOLD_RUN = 3;
export const RECENT = 5;
export const CHART_MAX = 8;

const VIVA_GROUPS = new Set(['viva', 'speaking']);

/** A code applies to a piece of its own kind: viva and speaking codes to vivas, composition to everything else. */
export function codeApplies(code, piece) {
  const viva = piece.kind === 'viva';
  return viva ? VIVA_GROUPS.has(code?.group) : code?.group === 'composition' || !code?.group;
}

const byId = (library) => new Map(library.map((c) => [c.id, c]));
const countOf = (piece, codeId, positive) => piece.tags.filter((t) => t.code_id === codeId && Boolean(t.positive) === positive).length;

/** The growth code that appears on most of the given pieces; the latest wins a tie. */
function commonGrowth(pieces) {
  const seen = new Map();
  pieces.forEach((p, i) => {
    for (const id of new Set(p.tags.filter((t) => !t.positive).map((t) => t.code_id))) {
      const row = seen.get(id) ?? { n: 0, last: -1 };
      seen.set(id, { n: row.n + 1, last: i });
    }
  });
  let best = null;
  for (const [id, row] of seen) if (!best || row.n > best.n || (row.n === best.n && row.last > best.last)) best = { id, ...row };
  return best?.id ?? null;
}

/** One target's cells (null where a piece didn't assess it), its current level and its story. */
export function targetRow(pieces, key) {
  const cells = pieces.map((p) => p.places?.[key] ?? null);
  const assessed = pieces.map((p, i) => ({ p, step: cells[i] })).filter((x) => x.step);
  const now = assessed.at(-1)?.step ?? null;
  if (assessed.length < HOLD_RUN) return { key, cells, now, story: { kind: 'few', count: assessed.length } };
  let run = 1;
  while (run < assessed.length && assessed.at(-1 - run).step === now) run += 1;
  if (run >= HOLD_RUN && !isTop(now)) {
    const held = assessed.slice(-run).map((x) => x.p);
    return { key, cells, now, story: { kind: 'holding', step: now, count: run, code_id: commonGrowth(held) } };
  }
  const prev = assessed.at(-1 - run);
  const rank = (id) => ['starting', 'building', 'secure', 'extending', 'below', 'capable', 'skilled', 'accomplished', 'excellent'].indexOf(id);
  if (prev && rank(now) > rank(prev.step)) {
    return { key, cells, now, story: { kind: 'moved_up', from: prev.step, to: now, piece_id: assessed.at(-run).p.id } };
  }
  return { key, cells, now, story: { kind: 'now', step: now } };
}

/** Every target any piece placed, in first-seen order. */
export function targetKeys(pieces) {
  const keys = [];
  for (const p of pieces) for (const k of Object.keys(p.places ?? {})) if (!keys.includes(k)) keys.push(k);
  return keys;
}

/**
 * Code counts per piece. Cells are a count, 0 when the code applies and is
 * absent, or null when it doesn't apply. `dropped`: 2+ earlier hits and none
 * on the last 3 applicable pieces.
 */
export function codeGrid(pieces, library) {
  const codes = byId(library);
  const used = [];
  for (const p of pieces) for (const t of p.tags) {
    const k = `${t.code_id}|${Boolean(t.positive)}`;
    if (codes.has(t.code_id) && !used.includes(k)) used.push(k);
  }
  return used.map((k) => {
    const [code_id, pos] = k.split('|');
    const positive = pos === 'true';
    const code = codes.get(code_id);
    const cells = pieces.map((p) => (codeApplies(code, p) ? countOf(p, code_id, positive) : null));
    const applicable = cells.filter((c) => c !== null);
    const hit = applicable.filter((c) => c > 0).length;
    const total = applicable.reduce((a, b) => a + b, 0);
    const last3 = applicable.slice(-3);
    const before = applicable.slice(0, -3).filter((c) => c > 0).length;
    const dropped = !positive && before >= 2 && last3.length === 3 && last3.every((c) => c === 0);
    return { code_id, positive, cells, hit, of: applicable.length, total, dropped };
  });
}

/** Codes on 2+ of their last 5 applicable pieces, most hits first, then most recent. */
export function ranked(pieces, library, positive) {
  const codes = byId(library);
  const out = [];
  for (const row of codeGrid(pieces, library).filter((r) => r.positive === positive)) {
    const recent = pieces.filter((p) => codeApplies(codes.get(row.code_id), p)).slice(-RECENT);
    const hit = recent.filter((p) => countOf(p, row.code_id, positive) > 0).length;
    const last = recent.reduce((at, p, i) => (countOf(p, row.code_id, positive) ? i : at), -1);
    if (hit >= 2) out.push({ code_id: row.code_id, positive, hit, of: recent.length, last });
  }
  return out.sort((a, b) => b.hit - a.hit || b.last - a.last).map(({ last, ...r }) => r);
}

/** Up to two growth codes and one strength code, each on 2+ of its last 5 applicable pieces. */
export function nextSteps(pieces, library) {
  return [...ranked(pieces, library, false).slice(0, 2), ...ranked(pieces, library, true).slice(0, 1)];
}

/** Students holding at the same step on the same target, 3 or more, with their commonest growth code. */
export function classPatterns(students, library) {
  const groups = new Map();
  for (const s of students) {
    for (const key of targetKeys(s.pieces)) {
      const row = targetRow(s.pieces, key);
      if (row.story.kind !== 'holding') continue;
      const id = `${key}|${row.now}`;
      const g = groups.get(id) ?? { key, step: row.now, students: [], codes: [] };
      g.students.push(s.id);
      if (row.story.code_id) g.codes.push(row.story.code_id);
      groups.set(id, g);
    }
  }
  return [...groups.values()]
    .filter((g) => g.students.length >= HOLD_RUN)
    .map((g) => {
      const tally = new Map();
      for (const c of g.codes) tally.set(c, (tally.get(c) ?? 0) + 1);
      const code_id = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { key: g.key, step: g.step, students: g.students, code_id };
    })
    .sort((a, b) => b.students.length - a.students.length);
}
