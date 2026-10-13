/**
 * Operator-only: accept annotation voice audio, store via teaching media blobs,
 * enqueue AI job kind `annotation_voice_transcribe`.
 *
 * Poll path: GET /api/ai/jobs/:id (ai-job.mjs) until status is `done` or `error`.
 * Scheduled/operator tick (`ai-jobs-tick`) processes queued jobs of this kind by
 * calling the Knowledge Worker `POST /transcribe` and writing the raw JSON onto
 * the job record (`result.whisper`). Transcript text is never logged.
 */
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  aiJobKey,
  mediaFileKey,
  mediaKey,
  newId,
  setJSON,
  slugify
} from './_shared/teaching-blobs.mjs';
import { writeJobInbox } from './ai-jobs.mjs';
import {
  ALLOWED_MEDIA_MIME,
  MAX_MEDIA_BYTES,
  mediaTypeFromMime
} from './media-upload.mjs';

export const config = { path: '/api/annotation/voice/transcribe' };

export const ANNOTATION_VOICE_TRANSCRIBE_KIND = 'annotation_voice_transcribe';
export const MAX_VOICE_TRANSCRIBE_BYTES = Math.min(MAX_MEDIA_BYTES, 8 * 1024 * 1024);

const VOICE_MIME = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']);

async function setBytes(store, key, bytes, contentType) {
  if (typeof store.set !== 'function') {
    throw new Error('Teaching content store cannot write files.');
  }
  return store.set(key, bytes, { metadata: { contentType } });
}

export function createAnnotationVoiceTranscribeHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return withCors(
        errorResponse(400, 'validation_error', 'Request body must be multipart form data', false),
        request,
        env
      );
    }

    const fileEntry = form.get('file');
    if (!(fileEntry instanceof File)) {
      return withCors(errorResponse(400, 'validation_error', 'file is required', false), request, env);
    }

    const mime = (fileEntry.type || '').trim();
    if (!mime || !ALLOWED_MEDIA_MIME.has(mime) || !VOICE_MIME.has(mime)) {
      return withCors(errorResponse(400, 'validation_error', 'File MIME type is not allowed', false), request, env);
    }
    if (fileEntry.size > MAX_VOICE_TRANSCRIBE_BYTES) {
      return withCors(
        errorResponse(
          400,
          'validation_error',
          `File exceeds maximum size of ${MAX_VOICE_TRANSCRIBE_BYTES} bytes`,
          false
        ),
        request,
        env
      );
    }

    const titleField = form.get('title');
    const title = (typeof titleField === 'string' && titleField.trim()
      ? titleField.trim()
      : fileEntry.name.trim()) || 'Voice recording';

    const trackIdField = form.get('track_id');
    const track_id = typeof trackIdField === 'string' && trackIdField.trim()
      ? trackIdField.trim()
      : undefined;
    const lessonIdField = form.get('lesson_id');
    const lesson_id = typeof lessonIdField === 'string' && lessonIdField.trim()
      ? lessonIdField.trim()
      : undefined;
    const durationField = form.get('duration_s');
    const duration_s = typeof durationField === 'string' && Number.isFinite(Number(durationField))
      ? Number(durationField)
      : undefined;

    const bytes = await fileEntry.arrayBuffer();
    const mediaId = newId('media');
    const fileUrl = new URL(`/api/media/${mediaId}/file`, request.url).href;
    const timestamp = new Date().toISOString();
    const record = {
      id: mediaId,
      type: 'media',
      title,
      slug: slugify(title),
      status: 'active',
      provider: 'direct',
      media_type: mediaTypeFromMime(mime),
      mime_type: mime,
      file_name: fileEntry.name || undefined,
      preview_url: fileUrl,
      download_url: fileUrl,
      sharing: 'public_link',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    await setBytes(store, mediaFileKey(mediaId), bytes, mime);
    await setJSON(store, mediaKey(mediaId), record);

    const jobId = newId('ai_job');
    const job = {
      id: jobId,
      kind: ANNOTATION_VOICE_TRANSCRIBE_KIND,
      status: 'working',
      phase: 'queued',
      media_id: mediaId,
      ...(lesson_id ? { lesson_id } : {}),
      ...(track_id ? { track_id } : {}),
      ...(duration_s != null ? { duration_s } : {}),
      mime_type: mime,
      attempts: 0,
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(store, aiJobKey(jobId), job);
    await writeJobInbox(store, job);

    return withCors(
      okResponse(202, {
        id: jobId,
        status: 'working',
        phase: 'queued',
        media: record,
        poll: `/api/ai/jobs/${jobId}`
      }),
      request,
      env
    );
  }, deps);
}

export default createAnnotationVoiceTranscribeHandler();
