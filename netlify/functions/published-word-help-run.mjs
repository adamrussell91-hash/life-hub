/**
 * Background run for a student dictionary scan or morphemic matrix build.
 * Kicked by `POST /api/published/word-help/:id` and `/api/published/morphemic/:id`.
 * Public like its callers, so it only runs jobs those routes already wrote
 * from published text.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { isTextToolKey, readTextToolJob, runTextToolJob } from './_shared/text-tools.mjs';

export const config = { path: '/api/published/word-help-run', background: true };

export function createPublishedWordHelpRunHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const body = await request.json().catch(() => ({}));
    const job = isTextToolKey(body?.key) ? await readTextToolJob(store, body.key) : null;
    if (!job || (job.tool !== 'dictionary' && job.tool !== 'morphemic')) {
      return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
    }
    const done = await runTextToolJob({ store, env, key: body.key, completeMessage: deps.completeMessage });
    return withCors(okResponse(200, { key: body.key, status: done?.status ?? 'missing' }), request, env);
  }, deps);
}

export default createPublishedWordHelpRunHandler();
