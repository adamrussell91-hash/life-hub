import { verifySessionToken } from './_shared/auth-security.mjs';
import {
  errorResponse,
  isConfigured,
  methodNotAllowed,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';
import { isIndexKey, listBlobKeys } from './_shared/blobs-list.mjs';
import { referencedMediaIds } from './_shared/media-usage.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { SHEET_SNAPSHOT_PREFIX } from './_shared/meeting-sheet.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';
import {
  CLASS_PREFIX,
  draftLessonKey,
  getJSON,
  listJSON,
  mediaFileKey,
  mediaKey,
  PUBLISHED_LESSON_PREFIX,
  readPublishedId,
  UNIT_PREFIX
} from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/media/:id/file' };

/**
 * Parse a single `bytes=` range against a file of `size` bytes.
 * Returns null for no/unsupported range, 'unsatisfiable' when it misses the file.
 */
export function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}

const PUBLIC_SET_TTL_MS = 60_000;
const PUBLIC_SET_RECHECK_MS = 5_000;
const publicSets = new WeakMap(); // store → { ids, at }

/**
 * Media ids a student page can show: referenced by a live published lesson snapshot
 * (the draft not trashed), or by a live unit or class, whose public pages
 * (/api/published/units|classes/:id) render their content, or by a share sheet while
 * its link is on. Everything else in the teacher's library stays private, whatever its id.
 */
export async function loadPublicMediaIds(store) {
  const snapshots = await listJSON(store, PUBLISHED_LESSON_PREFIX);
  const live = [];
  for (const snapshot of snapshots) {
    const lessonId = snapshot?.lesson_id ?? snapshot?.id;
    if (!lessonId) continue;
    const draft = await getJSON(store, draftLessonKey(lessonId));
    if (draft && !isDeletedRecord(draft)) live.push(snapshot);
  }
  const [units, classes, sheets] = await Promise.all([
    topLevelRecords(store, UNIT_PREFIX),
    topLevelRecords(store, CLASS_PREFIX),
    listJSON(store, SHEET_SNAPSHOT_PREFIX)
  ]);
  return referencedMediaIds([...live, ...units, ...classes, ...sheets]);
}

/** `units/{id}` and `classes/{id}` only, never their sub-documents. */
async function topLevelRecords(store, prefix) {
  const keys = (await listBlobKeys(store, prefix))
    .filter(key => !isIndexKey(key) && !key.slice(prefix.length).includes('/'));
  return Promise.all(keys.map(key => getJSON(store, key)));
}

async function isPubliclyReferenced(store, id, now, load = loadPublicMediaIds) {
  const cached = publicSets.get(store);
  if (cached && now - cached.at < PUBLIC_SET_TTL_MS) {
    if (cached.ids.has(id)) return true;
    // Just published? Rebuild at most every few seconds.
    if (now - cached.at < PUBLIC_SET_RECHECK_MS) return false;
  }
  const ids = await load(store);
  publicSets.set(store, { ids, at: now });
  return ids.has(id);
}

async function hasOwnerSession(request, env, verify, now) {
  const cookie = readUmbrellaSessionCookie(request);
  if (!cookie || !isConfigured(env)) return false;
  try {
    return Boolean((await verify(cookie, umbrellaSessionSecret(env), now))?.valid);
  } catch {
    return false;
  }
}

export function createMediaFileHandler(deps = {}) {
  const verify = deps.verifySessionToken ?? verifySessionToken;
  const clock = deps.now ?? Date.now;
  const loadPublic = deps.loadPublicMediaIds ?? loadPublicMediaIds;
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Media file not found', false), request, env);
    }

    const raw = await store.get(mediaKey(id), { type: 'json' });
    if (!raw || raw.status !== 'active') {
      return withCors(errorResponse(404, 'not_found', 'Media file not found', false), request, env);
    }
    // The owner's signed-in browser sees the whole library; anyone else only media a
    // student page actually uses. Same 404 either way, so ids cannot be probed.
    const owner = await hasOwnerSession(request, env, verify, clock());
    if (!owner && !(await isPubliclyReferenced(store, id, clock(), loadPublic))) {
      return withCors(errorResponse(404, 'not_found', 'Media file not found', false), request, env);
    }

    // Keep full video responses streaming; byte-range requests need sliceable bytes.
    const streamVideo = /^video\//.test(raw.mime_type ?? '') && !request.headers.has('range');
    const result = await store.getWithMetadata(mediaFileKey(id), { type: streamVideo ? 'stream' : 'arrayBuffer' });
    if (!result?.data) {
      return withCors(errorResponse(404, 'not_found', 'Media file not found', false), request, env);
    }

    const contentType = raw.mime_type
      || (typeof result.metadata?.contentType === 'string' ? result.metadata.contentType : null)
      || 'application/octet-stream';

    // Safari will not play audio or video without byte ranges, and seeking needs them everywhere.
    // Private cache: the CDN must not hand one range's bytes to a request for another.
    const size = result.data.byteLength;
    const headers = {
      'content-type': contentType,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff'
    };
    if (streamVideo) {
      return withCors(new Response(result.data, { status: 200, headers }), request, env);
    }
    const range = parseByteRange(request.headers.get('range'), size);
    if (range === 'unsatisfiable') {
      return withCors(new Response(null, {
        status: 416,
        headers: { ...headers, 'content-range': `bytes */${size}` }
      }), request, env);
    }
    if (range) {
      return withCors(new Response(result.data.slice(range.start, range.end + 1), {
        status: 206,
        headers: {
          ...headers,
          'content-range': `bytes ${range.start}-${range.end}/${size}`,
          'content-length': String(range.end - range.start + 1)
        }
      }), request, env);
    }

    return withCors(new Response(result.data, {
      status: 200,
      headers: { ...headers, 'content-length': String(size) }
    }), request, env);
  }, deps);
}

export default createMediaFileHandler();
