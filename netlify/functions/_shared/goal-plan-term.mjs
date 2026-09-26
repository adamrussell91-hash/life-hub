// netlify/functions/_shared/goal-plan-term.mjs
import { normalizeGoalRecord, normalizeTerm } from './goal-record.mjs';

const OUTCOMES = new Set(['carried', 'parked', 'achieved', 'dropped']);

export function nextTermRef(term) {
  const current = normalizeTerm(term);
  if (!current) return null;
  if (current.term === 4) return { year: current.year + 1, term: 1 };
  return { year: current.year, term: /** @type {1|2|3|4} */ (current.term + 1) };
}

function sameTerm(a, b) {
  const left = normalizeTerm(a);
  const right = normalizeTerm(b);
  return Boolean(left && right && left.year === right.year && left.term === right.term);
}

/**
 * Apply Plan-next-term decisions in memory. Pure.
 * @returns {{ goals?: object[], error?: { code: string, message: string } }}
 */
export function applyPlanTerm({ goals, from, decisions, at }) {
  const fromTerm = normalizeTerm(from);
  if (!fromTerm) {
    return { error: { code: 'validation_error', message: 'from must be { year, term: 1..4 }' } };
  }
  if (!Array.isArray(decisions) || !decisions.length) {
    return { error: { code: 'validation_error', message: 'decisions are required' } };
  }

  const byId = new Map(
    (Array.isArray(goals) ? goals : [])
      .filter(g => g && typeof g === 'object' && typeof g.id === 'string')
      .map(g => [g.id, g])
  );
  const seen = new Set();
  const updated = [];

  for (const decision of decisions) {
    if (!decision || typeof decision !== 'object') {
      return { error: { code: 'validation_error', message: 'each decision needs goal_id and outcome' } };
    }
    const goalId = typeof decision.goal_id === 'string' ? decision.goal_id : '';
    const outcome = OUTCOMES.has(decision.outcome) ? decision.outcome : null;
    if (!goalId || !outcome) {
      return { error: { code: 'validation_error', message: 'each decision needs goal_id and outcome' } };
    }
    if (seen.has(goalId)) {
      return { error: { code: 'validation_error', message: `duplicate decision for ${goalId}` } };
    }
    seen.add(goalId);
    const goal = byId.get(goalId);
    if (!goal) {
      return { error: { code: 'not_found', message: `Goal ${goalId} not found` } };
    }
    if (!sameTerm(goal.term, fromTerm)) {
      return {
        error: {
          code: 'validation_error',
          message: `Goal ${goalId} is not in term ${fromTerm.year}-${fromTerm.term}`
        }
      };
    }

    const history = Array.isArray(goal.term_history) ? [...goal.term_history] : [];
    history.push({ year: fromTerm.year, term: fromTerm.term, outcome, at });

    let next = {
      ...goal,
      term_history: history,
      updated_at: at
    };
    if (outcome === 'carried') {
      next = { ...next, term: nextTermRef(fromTerm), status: 'active' };
    } else if (outcome === 'parked') {
      next = { ...next, status: 'parked' };
    } else if (outcome === 'achieved') {
      next = { ...next, status: 'achieved' };
    } else {
      next = { ...next, status: 'dropped' };
    }
    updated.push(normalizeGoalRecord(next));
  }

  return { goals: updated };
}
