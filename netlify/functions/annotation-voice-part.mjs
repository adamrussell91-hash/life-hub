/**
 * Operator-only: one slice of a long annotation voice recording.
 *
 * Netlify rejects request bodies over 6 MB before a function runs, so the
 * recorder sends audio in ≤4 MB parts here, then calls
 * `POST /api/annotation/voice/transcribe` with JSON `{ upload_id, parts, … }`
 * to join them into one media file and queue transcription.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/annotation/voice/part' };

export const MAX_VOICE_PART_BYTES = 4.5 * 1024 * 1024;
export const MAX_VOICE_PARTS = 400;
const UPLOAD_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function voicePartKey(uploadId, index) {
  return `voice_parts/${uploadId}/${String(index).padStart(4, '0')}`;
}

export function isVoiceUploadId(value) {
  return typeof value === 'string' && UPLOAD_ID.test(value);
}

export function createAnnotationVoicePartHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const bad = (message) =>
      withCors(errorResponse(400, 'validation_error', message, false), request, env);

    let form;
    try {
      form = await request.formData();
    } catch {
      return bad('Request body must be multipart form data');
    }
    const uploadId = form.get('upload_id');
    const index = Number(form.get('index'));
    const part = form.get('file');
    if (!isVoiceUploadId(uploadId)) return bad('upload_id is invalid');
    if (!Number.isInteger(index) || index < 0 || index >= MAX_VOICE_PARTS) return bad('index is invalid');
    if (!(part instanceof Blob) || part.size === 0) return bad('file is required');
    if (part.size > MAX_VOICE_PART_BYTES) return bad('Part is too large');

    const bytes = await part.arrayBuffer();
    await store.set(voicePartKey(uploadId, index), bytes, {
      metadata: { contentType: 'application/octet-stream' }
    });
    return withCors(okResponse(200, { upload_id: uploadId, index, bytes: bytes.byteLength }), request, env);
  }, deps);
}

export default createAnnotationVoicePartHandler();
