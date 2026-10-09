import { createHash } from 'node:crypto';
import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE,
  withPrivate
} from './_shared/travel-http.mjs';
import {
  defaultGetTravelStore,
  newPhotoId,
  photoBytesKey,
  photoMetaKey
} from './_shared/travel-blobs.mjs';
import { createTravelRepository } from './_shared/travel-repository.mjs';
import {
  errorResponse as httpError,
  guardRequestOrigin,
  isConfigured,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';

export const config = { path: '/api/travel-photo' };

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Operator upload: POST multipart `file` + query `trip`. Returns `{ photo_id }`. */
export function createTravelPhotoUploadHandler(deps = {}) {
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST to upload.', false, PRIVATE_CACHE);
    }
    const tripId = new URL(request.url).searchParams.get('trip');
    if (!tripId) {
      return errorResponse(400, 'validation_error', 'trip is required.', false, PRIVATE_CACHE);
    }
    await ctx.repo.getTrip(tripId);

    let form;
    try {
      form = await request.formData();
    } catch {
      return errorResponse(400, 'validation_error', 'Request body must be multipart form data.', false, PRIVATE_CACHE);
    }
    const fileEntry = form.get('file');
    if (!(fileEntry instanceof File)) {
      return errorResponse(400, 'validation_error', 'file is required.', false, PRIVATE_CACHE);
    }
    const mime = (fileEntry.type || '').trim();
    if (!mime || !ALLOWED_PHOTO_MIME.has(mime)) {
      return errorResponse(400, 'validation_error', 'Only JPEG, PNG, WebP or GIF photos are allowed.', false, PRIVATE_CACHE);
    }
    if (fileEntry.size > MAX_PHOTO_BYTES) {
      return errorResponse(
        400,
        'validation_error',
        `Photo exceeds maximum size of ${MAX_PHOTO_BYTES} bytes.`,
        false,
        PRIVATE_CACHE
      );
    }

    const photoId = newPhotoId();
    const bytes = new Uint8Array(await fileEntry.arrayBuffer());
    const store = await getStore(ctx.env);
    await store.set(photoBytesKey(photoId), bytes, { metadata: { contentType: mime } });
    await store.set(
      photoMetaKey(photoId),
      JSON.stringify({
        id: photoId,
        trip_id: tripId,
        mime_type: mime,
        size: bytes.byteLength,
        created_at: new Date(ctx.now()).toISOString()
      })
    );
    return okResponse(201, { photo_id: photoId }, PRIVATE_CACHE);
  }, deps);
}

async function loadPhotoResponse(store, photoId, expectedTripId) {
  let metaRaw;
  try {
    metaRaw = await store.get(photoMetaKey(photoId), { type: 'text' });
  } catch {
    metaRaw = null;
  }
  if (!metaRaw) return null;
  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return null;
  }
  if (expectedTripId && meta.trip_id !== expectedTripId) return null;
  const result = await store.getWithMetadata(photoBytesKey(photoId), { type: 'arrayBuffer' });
  if (!result?.data) return null;
  const contentType =
    meta.mime_type ||
    (typeof result.metadata?.contentType === 'string' ? result.metadata.contentType : null) ||
    'application/octet-stream';
  return new Response(result.data, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=86400'
    }
  });
}

/**
 * GET ?id=…&token=… for followers, or GET ?id=… with a session for the owner.
 */
export function createTravelPhotoGetHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const createRepo = deps.createTravelRepository ?? createTravelRepository;
  const verify = deps.verifySessionToken ?? verifySessionToken;
  const now = deps.now ?? Date.now;
  const clearCookie = deps.serializeExpiredSessionCookie ?? serializeExpiredSessionCookie;

  return async function travelPhotoGetHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    if (request.method !== 'GET') {
      return withCors(httpError(405, 'method_not_allowed', 'Use GET.', false), request, env);
    }
    return withCors(await handleGet(request), request, env);
  };

  async function handleGet(request) {
    const originError = guardRequestOrigin(request, env);
    if (originError) return originError;

    const url = new URL(request.url);
    const photoId = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    if (!photoId || !/^tph_[a-z0-9]+$/i.test(photoId)) {
      return httpError(404, 'not_found', 'Photo not found.', false, { 'cache-control': 'no-store' });
    }

    let repo;
    try {
      repo = createRepo({ env, fetchImpl: deps.fetchImpl ?? fetch, github: deps.github });
    } catch {
      return httpError(503, 'misconfigured', 'Travel storage is unavailable.', true, { 'cache-control': 'no-store' });
    }

    const store = await getStore(env);

    if (token) {
      const { map } = await repo.getShareTokens();
      const hash = createHash('sha256').update(token).digest('hex');
      const row = map[hash];
      if (!row?.trip_id) {
        return httpError(404, 'not_found', 'This link has been turned off.', false, { 'cache-control': 'no-store' });
      }
      const response = await loadPhotoResponse(store, photoId, row.trip_id);
      return response || httpError(404, 'not_found', 'Photo not found.', false, { 'cache-control': 'no-store' });
    }

    if (!isConfigured(env)) return withPrivate(misconfiguredResponse());
    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return withPrivate(misconfiguredResponse());
    }
    if (!session.valid) {
      return httpError(401, 'unauthenticated', 'Please sign in to continue.', false, {
        'cache-control': 'no-store',
        'set-cookie': clearCookie()
      });
    }
    const response = await loadPhotoResponse(store, photoId, null);
    return response || httpError(404, 'not_found', 'Photo not found.', false, { 'cache-control': 'no-store' });
  }
}

/** Combined handler: POST = upload (session), GET = public/owner read. */
export function createTravelPhotoHandler(deps = {}) {
  const upload = createTravelPhotoUploadHandler(deps);
  const read = createTravelPhotoGetHandler(deps);
  return async function travelPhotoHandler(request, context) {
    if (request.method === 'GET' || request.method === 'OPTIONS') {
      return read(request, context);
    }
    return upload(request, context);
  };
}

export default createTravelPhotoHandler();
