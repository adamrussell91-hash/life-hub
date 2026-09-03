import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  mediaFileKey,
  mediaKey,
  newId,
  setJSON,
  slugify
} from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/media/upload' };

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MEDIA_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'audio/mpeg',
  'audio/wav',
  'application/zip',
  'text/plain'
]);

export function mediaTypeFromMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

async function setBytes(store, key, bytes, contentType) {
  if (typeof store.set !== 'function') {
    throw new Error('Teaching content store cannot write files.');
  }
  return store.set(key, bytes, { metadata: { contentType } });
}

export function createMediaUploadHandler(deps = {}) {
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
    if (!mime || !ALLOWED_MEDIA_MIME.has(mime)) {
      return withCors(errorResponse(400, 'validation_error', 'File MIME type is not allowed', false), request, env);
    }
    if (fileEntry.size > MAX_MEDIA_BYTES) {
      return withCors(
        errorResponse(400, 'validation_error', `File exceeds maximum size of ${MAX_MEDIA_BYTES} bytes`, false),
        request,
        env
      );
    }

    const titleField = form.get('title');
    const title = (typeof titleField === 'string' && titleField.trim()
      ? titleField.trim()
      : fileEntry.name.trim()) || 'Untitled';

    const bytes = await fileEntry.arrayBuffer();
    const id = newId('media');
    const fileUrl = new URL(`/api/media/${id}/file`, request.url).href;
    const timestamp = new Date().toISOString();
    const record = {
      id,
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

    await setBytes(store, mediaFileKey(id), bytes, mime);
    await setJSON(store, mediaKey(id), record);
    return withCors(okResponse(201, record), request, env);
  }, deps);
}

export default createMediaUploadHandler();
