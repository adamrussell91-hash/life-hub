/**
 * Background run for one annotation voice transcription job.
 *
 * `POST /api/annotation/voice/transcribe` kicks this straight after the audio
 * is stored, so the teacher gets a transcript in seconds rather than waiting
 * for the daily `ai-jobs-tick` cron (which stays as the backstop). Retries once
 * on a kernel failure, then marks the job `error` so the recorder stops polling.
 */
import { methodNotAllowed, okResponse, withCors, errorResponse } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  ANNOTATION_VOICE_TRANSCRIBE_KIND,
  MAX_VOICE_TRANSCRIBE_ATTEMPTS,
  processAnnotationVoiceTranscribeJobs
} from './_shared/ai-jobs-tick.mjs';
import { knowledgeKernelSecret } from './_shared/knowledge-kernel.mjs';
import { aiJobKey, getJSON, setJSON } from './_shared/teaching-blobs.mjs';
import { writeJobInbox } from './ai-jobs.mjs';

export const config = { path: '/api/annotation/voice/transcribe/run', background: true };

/** Long recordings take Whisper a while; a background function has minutes to spare. */
export const RUN_TRANSCRIBE_TIMEOUT_MS = 120_000;

export function createAnnotationVoiceTranscribeRunHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const body = await request.json().catch(() => ({}));
    const jobId = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!jobId) {
      return withCors(errorResponse(400, 'validation_error', 'id is required', false), request, env);
    }
    const nowIso = deps.nowIso ?? (() => new Date().toISOString());
    const job = await getJSON(store, aiJobKey(jobId));
    if (!job || job.kind !== ANNOTATION_VOICE_TRANSCRIBE_KIND) {
      return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
    }

    if (!knowledgeKernelSecret(env)) {
      // Say so on the job: otherwise the recorder polls a job nothing will ever run.
      const failed = {
        ...job,
        status: 'error',
        phase: 'failed',
        error: 'Transcription service is not connected (RESEARCH_KERNEL_SHARED_SECRET).',
        updated_at: nowIso()
      };
      await setJSON(store, aiJobKey(jobId), failed);
      await writeJobInbox(store, failed);
      return withCors(okResponse(200, { id: jobId, status: failed.status }), request, env);
    }

    let latest = job;
    for (let round = 0; round < MAX_VOICE_TRANSCRIBE_ATTEMPTS; round += 1) {
      await processAnnotationVoiceTranscribeJobs({
        store,
        env,
        fetchImpl: deps.fetchImpl,
        knowledgeFetch: deps.knowledgeFetch,
        nowIso,
        jobId,
        timeoutMs: deps.timeoutMs ?? RUN_TRANSCRIBE_TIMEOUT_MS
      });
      latest = (await getJSON(store, aiJobKey(jobId))) ?? latest;
      if (latest.status !== 'working') break;
    }
    return withCors(okResponse(200, { id: jobId, status: latest.status }), request, env);
  }, deps);
}

export default createAnnotationVoiceTranscribeRunHandler();
