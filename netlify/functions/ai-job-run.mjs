import { methodNotAllowed, okResponse, withCors, errorResponse } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { runStoredLessonJob } from './_shared/teaching-ai-job-run.mjs';

/**
 * Background runner for queued Teaching AI lesson jobs (Ann, Clementine,
 * Hammond, Clare). POST /api/ai/jobs kicks it; the panel polls the job.
 */
export const config = { path: '/api/ai/job-run', background: true };

const JOB_ID = /^ai_job_[a-z0-9_-]+$/i;

export function createAiJobRunHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const jobId = request.headers.get('x-ai-job-id') ?? '';
    if (!JOB_ID.test(jobId)) {
      return withCors(errorResponse(400, 'validation_error', 'Provide a valid AI job id.', false), request, env);
    }
    await runStoredLessonJob({ store, jobId, env, ...(deps.runDeps ?? {}) });
    return withCors(okResponse(202, { id: jobId }), request, env);
  }, deps);
}

export default createAiJobRunHandler();
