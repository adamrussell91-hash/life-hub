import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { aiJobKey, getJSON, readPublishedId, setJSON } from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { writeJobInbox } from './ai-jobs.mjs';
import {
  createKnowledgeIntakeRuntime,
  isKnowledgeIntakeJob,
  resolveKnowledgeIntakeJob
} from './_shared/knowledge-intake.mjs';

export const config = { path: '/api/ai/jobs/:id' };

const RESOLUTIONS = new Set(['accepted', 'rejected', 'dismissed']);

export function createAiJobHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
    }
    const job = await getJSON(store, aiJobKey(id));
    if (!job) {
      return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
    }
    if (request.method === 'GET') {
      return withCors(okResponse(200, job), request, env);
    }
    if (request.method !== 'PATCH') {
      return withCors(methodNotAllowed('GET, PATCH, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    if (!RESOLUTIONS.has(parsed.value.resolution)) {
      return withCors(errorResponse(400, 'validation_error', 'resolution is required', false), request, env);
    }
    let next;
    if (isKnowledgeIntakeJob(job)) {
      try {
        next = await resolveKnowledgeIntakeJob(
          job,
          parsed.value.resolution,
          createKnowledgeIntakeRuntime({ ...deps, env })
        );
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 400;
        return withCors(
          errorResponse(status, error?.code ?? 'validation_error', error.message, false),
          request,
          env
        );
      }
    } else {
      next = {
        ...job,
        resolution: parsed.value.resolution,
        status: job.status === 'working' ? 'done' : job.status,
        updated_at: new Date().toISOString()
      };
    }
    await setJSON(store, aiJobKey(id), next);
    await writeJobInbox(store, next);
    return withCors(okResponse(200, next), request, env);
  }, deps);
}

export default createAiJobHandler();
