// netlify/functions/_shared/problem-solver/migrate.mjs
import { defineStepOf } from '../../../../packages/problem-solver/models.mjs';
import { nextStepAfter } from '../../../../packages/problem-solver/steps.mjs';
import { isComplete } from '../../../../packages/problem-solver/machine.mjs';

function completeSafely(run) {
  try {
    return Boolean(isComplete(run));
  } catch {
    return false;
  }
}

const emptyStep = () => ({ runs: [], status: 'open', objection: null });

function defineFor(modelId) {
  return modelId ? defineStepOf(modelId) : 'define';
}

function afterDefine(modelId) {
  return (modelId && nextStepAfter(modelId, defineFor(modelId))) || 'finished';
}

/**
 * v1 stored `define: { runs, finishedEarly, exitObjection }` and phases frame/define/defined.
 * v2 stores `steps[stepId]` and phase = the current plan step. Index rows (no turns) and
 * v2 sessions pass through untouched. Pure; the store is not written.
 */
export function migrateSession(session) {
  if (!session || !Array.isArray(session.turns) || session.steps) return session;
  const { define = { runs: [], finishedEarly: false, exitObjection: null }, ...rest } = session;
  const modelId = rest.model?.id ?? null;
  const defineStep = defineFor(modelId);
  const runs = define.runs ?? [];
  const steps = {};
  let phase = rest.phase;
  if (phase === 'define') {
    phase = defineStep;
    steps[defineStep] = { runs, status: 'open', objection: define.exitObjection ?? null };
  } else if (phase === 'defined') {
    const kept = runs.some((run) => run.status !== 'switched' && completeSafely(run));
    steps[defineStep] = { runs, status: kept ? 'done' : 'skipped', objection: define.exitObjection ?? null };
    phase = afterDefine(modelId);
    if (phase !== 'finished') steps[phase] = emptyStep();
  }
  const runner = rest.runner?.mode === 'closing'
    ? { ...rest.runner, mode: 'boundary', error: rest.runner.error ?? null, leaving: defineStep }
    : { ...rest.runner, mode: 'turn' };
  const suggestion = rest.suggestion?.kind === 'finish_define' ? { kind: 'next_step', reason: rest.suggestion.reason ?? '' } : rest.suggestion ?? null;
  return {
    ...rest,
    kind: 'full',
    status: rest.status === 'defined' ? (phase === 'finished' ? 'finished' : 'active') : rest.status,
    phase,
    steps,
    learnings: [],
    pendingLearning: null,
    suggestion,
    runner
  };
}

/** List index rows written by v1 carry phase define/defined. */
export function migrateRow(row) {
  if (!row || (row.phase !== 'define' && row.phase !== 'defined')) return row;
  const phase = row.phase === 'define' ? defineFor(row.model) : afterDefine(row.model);
  return { ...row, phase, status: row.status === 'defined' ? (phase === 'finished' ? 'finished' : 'active') : row.status };
}
