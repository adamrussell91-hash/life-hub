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
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/x-m4a',
  'audio/aac',
  'application/zip',
  'text/plain',
  // Word, PowerPoint and Excel, so lesson files upload straight from a Mac.
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

export function mediaTypeFromMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

/*
 * Netlify drops request bodies over 6 MB before the function runs, so larger
 * files arrive in parts: each part is a multipart POST with `upload_id`,
 * `part_index` and `part_count`, and the last part joins them into one file.
 */
export const MAX_UPLOAD_PARTS = 8;
const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function mediaPartKey(uploadId, index) {
  return `media_parts/${uploadId}/${index}`;
}

function readPartFields(form) {
  const countField = form.get('part_count');
  if (countField === null) return { parts: null };
  const count = Number(countField);
  const index = Number(form.get('part_index'));
  const uploadId = form.get('upload_id');
  if (
    !Number.isInteger(count) || count < 1 || count > MAX_UPLOAD_PARTS ||
    !Number.isInteger(index) || index < 0 || index >= count ||
    typeof uploadId !== 'string' || !UPLOAD_ID_RE.test(uploadId)
  ) {
    return { error: 'upload_id, part_index and part_count must describe one part of the file' };
  }
  return { parts: { count, index, uploadId } };
}

async function joinParts(store, parts, lastBytes) {
  const pieces = [];
  for (let index = 0; index < parts.count - 1; index += 1) {
    const piece = await store.get(mediaPartKey(parts.uploadId, index), {
      type: 'arrayBuffer',
      consistency: 'strong'
    });
    if (!piece) return null;
    pieces.push(new Uint8Array(piece));
  }
  pieces.push(new Uint8Array(lastBytes));
  const joined = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.byteLength, 0));
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.byteLength;
  }
  return joined.buffer;
}

async function deleteParts(store, parts) {
  if (typeof store.delete !== 'function') return;
  for (let index = 0; index < parts.count - 1; index += 1) {
    await store.delete(mediaPartKey(parts.uploadId, index)).catch(() => undefined);
  }
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

    const { parts, error: partError } = readPartFields(form);
    if (partError) {
      return withCors(errorResponse(400, 'validation_error', partError, false), request, env);
    }

    let bytes = await fileEntry.arrayBuffer();
    if (parts && parts.count > 1) {
      if (parts.index < parts.count - 1) {
        await setBytes(store, mediaPartKey(parts.uploadId, parts.index), bytes, mime);
        return withCors(
          okResponse(202, { upload_id: parts.uploadId, part_index: parts.index }),
          request,
          env
        );
      }
      const joined = await joinParts(store, parts, bytes);
      if (!joined) {
        return withCors(
          errorResponse(400, 'validation_error', 'An earlier part of the file is missing. Upload it again.', true),
          request,
          env
        );
      }
      if (joined.byteLength > MAX_MEDIA_BYTES) {
        await deleteParts(store, parts);
        return withCors(
          errorResponse(400, 'validation_error', `File exceeds maximum size of ${MAX_MEDIA_BYTES} bytes`, false),
          request,
          env
        );
      }
      bytes = joined;
    }

    const titleField = form.get('title');
    const title = (typeof titleField === 'string' && titleField.trim()
      ? titleField.trim()
      : fileEntry.name.trim()) || 'Untitled';

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
    if (parts && parts.count > 1) await deleteParts(store, parts);
    return withCors(okResponse(201, record), request, env);
  }, deps);
}

export default createMediaUploadHandler();
