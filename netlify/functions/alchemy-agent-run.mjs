/**
 * Background runner for Ann's lesson reviews. The quick endpoint
 * (`/api/alchemy-agent`) creates the job and starts this; Ann works for up
 * to ten minutes, writing her progress and then her result onto the job.
 */
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, okResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { alchemyJobError } from './_shared/alchemy-check.mjs';
import { alchemyError } from './_shared/alchemy-budget.mjs';
import { runAlchemyAgent } from './_shared/alchemy-agent.mjs';
import { readAgentJob, updateAgentJob, releaseAgentRun } from './_shared/alchemy-agent-jobs.mjs';

export const config = { path: '/api/alchemy-agent/run', background: true };
export const AGENT_RUN_DEADLINE_MS = 10 * 60000;

export function createAlchemyAgentRunHandler(deps = {}) {
  return createOperatorHandler(async (request, { env, store }) => {
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const body = await request.json().catch(() => ({}));
    const job = await readAgentJob(store, body?.id);
    if (!job) return withCors(errorResponse(404, 'not_found', 'Review not found', false), request, env);
    if (job.status !== 'working') return withCors(okResponse(200, { job: job.id, status: job.status }), request, env);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(alchemyError(504, 'alchemy_timeout', 'Ann ran out of time. Try again, or ask about one block.')), deps.deadlineMs ?? AGENT_RUN_DEADLINE_MS);
    // Progress lines are written in order, one write at a time.
    let writing = Promise.resolve();
    const onProgress = line => {
      writing = writing.then(() => updateAgentJob(store, job.id, current => ({ ...current, progress: [...(current.progress ?? []), { at: new Date().toISOString(), text: line }].slice(-60) }))).catch(() => {});
    };
    let outcome;
    try {
      const result = await (deps.run ?? runAlchemyAgent)({ kind: job.kind, id: job.entityId, blockId: job.blockId, request: job.request, env, store, deps, signal: controller.signal, onProgress });
      outcome = { status: 'done', result, finished_at: new Date().toISOString() };
    } catch (error) {
      const cause = controller.signal.aborted && controller.signal.reason ? controller.signal.reason : error;
      outcome = { status: 'error', error: alchemyJobError(cause), finished_at: new Date().toISOString() };
      console.error('alchemy agent failed', outcome.error.status, outcome.error.code, error?.message);
    } finally {
      clearTimeout(timer);
    }
    await writing;
    await updateAgentJob(store, job.id, current => ({ ...current, ...outcome }));
    await releaseAgentRun(store, job).catch(() => {});
    return withCors(okResponse(200, { job: job.id, status: outcome.status }), request, env);
  }, deps);
}

export default createAlchemyAgentRunHandler();
