/**
 * Operator-only: accept annotation voice audio, store via teaching media blobs,
 * enqueue AI job kind `annotation_voice_transcribe`.
 *
 * Poll path: GET /api/ai/jobs/:id (ai-job.mjs) until status is `done` or `error`.
 * Straight after enqueueing, this handler kicks the background function
 * `/api/annotation/voice/transcribe/run` for the new job. The scheduled/operator tick (`ai-jobs-tick`) processes queued jobs of this kind by
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
import { isVoiceUploadId, MAX_VOICE_PARTS, voicePartKey } from './annotation-voice-part.mjs';
import {
  aiJobKey,
  deleteKey,
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
/** Joined from parts: about two hours of speech at 64 kbps. */
export const MAX_VOICE_ASSEMBLED_BYTES = 120 * 1024 * 1024;

const VOICE_MIME = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']);

async function setBytes(store, key, bytes, contentType) {
  if (typeof store.set !== 'function') {
    throw new Error('Teaching content store cannot write files.');
  }
  return store.set(key, bytes, { metadata: { contentType } });
}

export function transcribeRunUrl(request) {
  return new URL('/api/annotation/voice/transcribe/run', request.url);
}

/** Fire the background run with the caller's session; a 202 means it started. */
export async function defaultInvokeTranscribeRun(request, jobId, fetchImpl = fetch) {
  const response = await fetchImpl(transcribeRunUrl(request), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ id: jobId }),
    signal: AbortSignal.timeout(5_000)
  });
  return response.status === 202 || response.ok;
}

export function createAnnotationVoiceTranscribeHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    const bad = (message) =>
      withCors(errorResponse(400, 'validation_error', message, false), request, env);
    const isJson = (request.headers.get('content-type') || '').includes('application/json');

    // Long recordings arrive as parts (see annotation-voice-part.mjs) and are joined here.
    let form;
    let bytes;
    let mime;
    let fileName;
    let partKeys = [];
    if (isJson) {
      const body = await request.json().catch(() => null);
      const uploadId = body?.upload_id;
      const parts = Number(body?.parts);
      mime = String(body?.mime ?? '').split(';')[0].trim();
      if (!isVoiceUploadId(uploadId)) return bad('upload_id is invalid');
      if (!Number.isInteger(parts) || parts < 1 || parts > MAX_VOICE_PARTS) return bad('parts is invalid');
      if (!mime || !ALLOWED_MEDIA_MIME.has(mime) || !VOICE_MIME.has(mime)) return bad('File MIME type is not allowed');
      const chunks = [];
      let total = 0;
      for (let i = 0; i < parts; i += 1) {
        const key = voicePartKey(uploadId, i);
        // Each part was written by an earlier request: read it strongly.
        const entry = await store.getWithMetadata?.(key, { type: 'arrayBuffer', consistency: 'strong' });
        if (!entry?.data) {
          return withCors(
            errorResponse(409, 'missing_part', `Part ${i + 1} of ${parts} has not arrived. Send it again.`, true),
            request,
            env
          );
        }
        total += entry.data.byteLength;
        if (total > MAX_VOICE_ASSEMBLED_BYTES) return bad('Recording is too large');
        chunks.push(new Uint8Array(entry.data));
        partKeys.push(key);
      }
      const joined = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      bytes = joined.buffer;
      fileName = `${uploadId}`;
      form = new Map(Object.entries(body ?? {}).map(([k, v]) => [k, v == null ? v : String(v)]));
    } else {
      try {
        form = await request.formData();
      } catch {
        return bad('Request body must be multipart form data');
      }
      const fileEntry = form.get('file');
      if (!(fileEntry instanceof File)) return bad('file is required');
      mime = (fileEntry.type || '').trim();
      if (!mime || !ALLOWED_MEDIA_MIME.has(mime) || !VOICE_MIME.has(mime)) {
        return bad('File MIME type is not allowed');
      }
      if (fileEntry.size > MAX_VOICE_TRANSCRIBE_BYTES) {
        return bad(`File exceeds maximum size of ${MAX_VOICE_TRANSCRIBE_BYTES} bytes`);
      }
      bytes = await fileEntry.arrayBuffer();
      fileName = fileEntry.name.trim();
    }

    const titleField = form.get('title');
    const title = (typeof titleField === 'string' && titleField.trim()
      ? titleField.trim()
      : fileName) || 'Voice recording';

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
      file_name: fileName || undefined,
      preview_url: fileUrl,
      download_url: fileUrl,
      sharing: 'public_link',
      created_at: timestamp,
      updated_at: timestamp,
      schema_version: 1
    };

    await setBytes(store, mediaFileKey(mediaId), bytes, mime);
    await setJSON(store, mediaKey(mediaId), record);
    for (const key of partKeys) {
      await deleteKey(store, key).catch(() => undefined);
    }

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

    let started = false;
    try {
      started = await (deps.invokeRun ?? defaultInvokeTranscribeRun)(request, jobId);
    } catch {
      // The daily tick still picks the job up; the recorder falls back to its live captions.
    }

    return withCors(
      okResponse(202, {
        id: jobId,
        status: 'working',
        phase: 'queued',
        media: record,
        run_started: started,
        poll: `/api/ai/jobs/${jobId}`
      }),
      request,
      env
    );
  }, deps);
}

export default createAnnotationVoiceTranscribeHandler();
