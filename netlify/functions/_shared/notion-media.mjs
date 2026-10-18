// netlify/functions/_shared/notion-media.mjs
import { createHash } from 'node:crypto';
import { getJSON, mediaFileKey, mediaKey, setJSON, slugify } from './teaching-blobs.mjs';
import { ALLOWED_MEDIA_MIME, mediaTypeFromMime } from '../media-upload.mjs';

/** Server-side imports only. The browser upload route keeps its 10 MB cap. */
export const IMPORT_MAX_BYTES = 200 * 1024 * 1024;
export const IMPORT_HTML_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_ALLOWED_MIME = new Set([
  ...ALLOWED_MEDIA_MIME,
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const BY_EXTENSION = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4',
  webm: 'video/webm', mov: 'video/quicktime', zip: 'application/zip', txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export function importMediaId(ref) {
  return `media_n_${createHash('sha256').update(`notion-media:${ref}`).digest('hex').slice(0, 24)}`;
}

function mimeFor(res, name) {
  const header = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (header && header !== 'application/octet-stream' && header !== 'binary/octet-stream') return header;
  const ext = String(name).split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? header;
}

async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/**
 * @returns {Promise<{ok:true,url?:string,text?:string,media_id?:string}|{ok:false,reason:'too_big'|'type'|'failed',message:string}>}
 */
export async function rehostMedia(store, mediaRef, { fetchImpl = fetch, origin, now, maxBytes = IMPORT_MAX_BYTES }) {
  const id = importMediaId(mediaRef.ref);
  const fileUrl = new URL(`/api/media/${id}/file`, origin).href;
  if (mediaRef.purpose !== 'html' && (await getJSON(store, mediaKey(id)))) {
    return { ok: true, url: fileUrl, media_id: id };
  }
  let res;
  try {
    res = await fetchImpl(mediaRef.url);
  } catch (error) {
    return { ok: false, reason: 'failed', message: `Could not download ${mediaRef.name}: ${error.message}` };
  }
  if (!res.ok) return { ok: false, reason: 'failed', message: `Could not download ${mediaRef.name} (HTTP ${res.status}).` };

  if (mediaRef.purpose === 'html') {
    const bytes = await readCapped(res, IMPORT_HTML_MAX_BYTES);
    if (!bytes) return { ok: false, reason: 'too_big', message: `${mediaRef.name} is over 2 MB.` };
    return { ok: true, text: new TextDecoder().decode(bytes) };
  }

  const mime = mimeFor(res, mediaRef.name);
  if (!IMPORT_ALLOWED_MIME.has(mime)) {
    return { ok: false, reason: 'type', message: `${mediaRef.name} (${mime || 'unknown type'}) can't be stored.` };
  }
  const bytes = await readCapped(res, maxBytes);
  if (!bytes) {
    return { ok: false, reason: 'too_big', message: `${mediaRef.name} is over ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  const title = mediaRef.purpose === 'cover' ? 'Cover image' : mediaRef.name || 'Imported file';
  const mediaType = mime.startsWith('video/') ? 'video' : mediaTypeFromMime(mime);
  await store.set(mediaFileKey(id), bytes, { metadata: { contentType: mime } });
  await setJSON(store, mediaKey(id), {
    id, type: 'media', title, slug: slugify(title), status: 'active', provider: 'direct',
    media_type: mediaType, mime_type: mime, file_name: mediaRef.name || undefined,
    preview_url: fileUrl, download_url: fileUrl, sharing: 'public_link',
    created_at: now, updated_at: now, schema_version: 1
  });
  return { ok: true, url: fileUrl, media_id: id };
}
