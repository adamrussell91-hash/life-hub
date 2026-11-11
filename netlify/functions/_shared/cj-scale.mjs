/**
 * The comparative judgement scale and its pool sources. Pure (no node
 * built-ins, no store), so the CJ block server (comparative-judgement.mjs)
 * and the Short-answer battles room (bundled into the game room Worker) run
 * the same engine: one Bradley–Terry fit, one reliability signal, one misfit
 * rule. Design decisions D7–D17 in
 * docs/superpowers/specs/2026-11-11-comparative-judgement-design.md; Battles
 * in docs/superpowers/specs/2026-11-11-game-lessons-design.md §6.7.
 */
import { fitBradleyTerry, flagMisfits, judgeFit, reliabilitySignal, splitHalf, ssr } from './cj-maths.mjs';

/** Longest answer text a pool item keeps (CJ_LIMITS.text in comparative-judgement.mjs). */
export const POOL_TEXT_MAX = 4000;

/**
 * The scale from every judgement on items still in the pool. Students count 1,
 * the teacher `teacher_weight` (D16); flagged misfits count 0.5 after one refit (D15).
 */
export function computeScale(round, config, judges, rng = Math.random) {
  const ids = Object.keys(round.pool);
  const inPool = (id) => id in round.pool;
  const weightOf = (key) => (key === 'teacher' ? config.teacher_weight : 1);
  const judgements = [];
  const comparisons = [];
  for (const [key, judge] of judges) {
    for (const j of judge.judgements) {
      if (!inPool(j.left) || !inPool(j.right) || (j.winner !== j.left && j.winner !== j.right)) continue;
      judgements.push(j);
      comparisons.push({ winner: j.winner, loser: j.winner === j.left ? j.right : j.left, judge: key, weight: weightOf(key) });
    }
  }
  let fit = fitBradleyTerry(ids, comparisons);
  let infit = judgeFit(comparisons, fit.theta);
  const flagged = flagMisfits(infit);
  let used = comparisons;
  if (config.downweight_misfits && flagged.size) {
    used = comparisons.map((c) => (flagged.has(c.judge) ? { ...c, weight: c.weight * 0.5 } : c));
    fit = fitBradleyTerry(ids, used);
    infit = judgeFit(comparisons, fit.theta);
  }
  const s = ssr(fit.theta, fit.se);
  const half = splitHalf(ids, used, { rng });
  const reliability = { ...reliabilitySignal({ ssr: s, splitHalf: half, comparisons: comparisons.length, items: ids.length }), ssr: s, split_half: half };
  const order = [...ids].sort((a, b) => fit.theta[b] - fit.theta[a] || (a < b ? -1 : 1));
  const studentOrder = order.filter((id) => round.pool[id].kind === 'student');
  const weights = Object.fromEntries([...judges.keys()].map((key) => [key, weightOf(key) * (config.downweight_misfits && flagged.has(key) ? 0.5 : 1)]));
  return { ids, fit, comparisons, judgements, infit, flagged, reliability, order, studentOrder, weights };
}

/**
 * Pool source 'game' (spec §6.7): answers written inside a Battles game rather
 * than a question_set block. Ids come from the room (anonymous, made with the
 * room's seeded random); `ref` is the seat owner and never leaves the room's
 * state. Blank answers are left out, as buildPool leaves out students with no
 * answer.
 * @param {Array<{ id: string, text: string, ref: string }>} answers
 * @returns {Record<string, { text: string, kind: 'student', ref: string }>}
 */
export function gamePool(answers) {
  const pool = {};
  for (const a of Array.isArray(answers) ? answers : []) {
    if (!a || typeof a.id !== 'string' || !a.id || typeof a.text !== 'string') continue;
    const text = a.text.trim().slice(0, POOL_TEXT_MAX);
    if (text && !(a.id in pool)) pool[a.id] = { text, kind: 'student', ref: String(a.ref ?? '') };
  }
  return pool;
}
