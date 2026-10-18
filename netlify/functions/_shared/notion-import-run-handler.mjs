// netlify/functions/_shared/notion-import-run-handler.mjs
// Shared body of the two background functions. Kicked by POST /api/notion-import/jobs
// with { job_id }; the page polls GET /api/notion-import/jobs/:id.
import { createOperatorHandler } from './operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './http.mjs';
import { JOB_ID, notionJobKey } from './notion-import-store.mjs';
import { runApply, runPlan } from './notion-import-run.mjs';
import { getJSON } from './teaching-blobs.mjs';

const RUNNERS = { plan: runPlan, apply: runApply };

export function createNotionImportRunHandler(kind, deps = {}) {
  const run = RUNNERS[kind];
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const body = await request.json().catch(() => ({}));
    const jobId = String(body?.job_id ?? '');
    if (!JOB_ID.test(jobId)) return withCors(errorResponse(400, 'validation_error', 'job_id is required', false), request, env);
    if (!(await getJSON(store, notionJobKey(jobId), { consistency: 'strong' }))) {
      return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
    }
    const clock = deps.now ?? Date.now;
    await run(store, jobId, {
      env,
      clock,
      now: new Date(clock()).toISOString(),
      origin: new URL(request.url).origin,
      fetchImpl: deps.fetchImpl,
      sleep: deps.sleep,
      timeoutSignal: deps.timeoutSignal,
      requestTimeoutMs: deps.requestTimeoutMs,
      mediaDeadlineAt: deps.mediaDeadlineAt
    });
    return withCors(okResponse(202, {}), request, env);
  }, deps);
}
