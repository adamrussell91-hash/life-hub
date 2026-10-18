// netlify/functions/notion-import-apply.mjs
// Background run for one queued Notion import job. Kicked by POST /api/notion-import/jobs;
// the page polls GET /api/notion-import/jobs/:id.
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { JOB_ID, notionJobKey } from './_shared/notion-import-store.mjs';
import { runApply } from './_shared/notion-import-run.mjs';
import { getJSON } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/notion-import/apply', background: true };

export function createNotionImportApplyHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const body = await request.json().catch(() => ({}));
    const jobId = String(body?.job_id ?? '');
    if (!JOB_ID.test(jobId)) return withCors(errorResponse(400, 'validation_error', 'job_id is required', false), request, env);
    if (!(await getJSON(store, notionJobKey(jobId)))) {
      return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
    }
    const clock = deps.now ?? Date.now;
    await runApply(store, jobId, {
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

export default createNotionImportApplyHandler();
