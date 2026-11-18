import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE,
  withPrivate
} from './_shared/travel-http.mjs';
import {
  audioBytesKey,
  audioMetaKey,
  defaultGetTravelStore,
  isAudioId,
  newAudioId
} from './_shared/travel-blobs.mjs';
import { createTravelRepository } from './_shared/travel-repository.mjs';
import { liveTripForShareToken } from './_shared/travel-share-token.mjs';
import { parseByteRange } from './_shared/byte-range.mjs';
import {
  guardRequestOrigin,
  isConfigured,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';

export const config = { path: '/api/travel-audio' };

/** A 30 second clip is a few hundred KB; 2 MB leaves room for any phone's encoder. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AUDIO_MIME = new Set(['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav']);

const NO_STORE = { 'cache-control': 'no-store' };
// Per-viewer, like photos: the owner path is session-gated and the follower path
// depends on a share token that can be turned off, so no shared (CDN) caching.
const AUDIO_CACHE = 'private, max-age=86400';

/** "audio/webm;codecs=opus" is "audio/webm". */
export function baseAudioMime(type) {
  return String(type ?? '').split(';')[0].trim().toLowerCase();
}

async function readAudioMeta(store, audioId) {
  try {
    const raw = await store.get(audioMetaKey(audioId), { type: 'text' });
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadAudio(store, audioId, expectedTripId) {
  const meta = await readAudioMeta(store, audioId);
  if (!meta || (expectedTripId && meta.trip_id !== expectedTripId)) return null;
  const result = await store.getWithMetadata(audioBytesKey(audioId), { type: 'arrayBuffer' });
  if (!result?.data) return null;
  return { bytes: result.data, contentType: meta.mime_type || 'audio/mp4' };
}

/** The whole clip, or the part a Range header asks for. iOS will not play audio without ranges. */
export function audioResponse(bytes, contentType, rangeHeader) {
  const size = bytes.byteLength;
  const headers = {
    'content-type': contentType,
    'cache-control': AUDIO_CACHE,
    vary: 'cookie',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff'
  };
  const range = parseByteRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } });
  }
  if (range) {
    return new Response(bytes.slice(range.start, range.end + 1), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${size}` }
    });
  }
  return new Response(bytes, { status: 200, headers });
}

/** Owner only. POST multipart `file` + query `trip` returns `{ audio_id }`. DELETE `?id=` removes a clip no postcard uses. */
export function createTravelAudioWriteHandler(deps = {}) {
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const bad = (message) => errorResponse(400, 'validation_error', message, false, PRIVATE_CACHE);

  return createTravelOperatorHandler(async (request, ctx) => {
    const url = new URL(request.url);

    if (request.method === 'DELETE') {
      const audioId = url.searchParams.get('id');
      if (!isAudioId(audioId)) {
        return errorResponse(404, 'not_found', 'Clip not found.', false, PRIVATE_CACHE);
      }
      const store = await getStore(ctx.env);
      const meta = await readAudioMeta(store, audioId);
      if (meta?.trip_id) {
        let trip = null;
        try {
          ({ trip } = await ctx.repo.getTrip(meta.trip_id));
        } catch {
          trip = null;
        }
        if ((trip?.checkins || []).some((c) => c?.postcard?.audio_id === audioId)) {
          return errorResponse(
            409,
            'in_use',
            'This clip is on a postcard. Remove the postcard instead.',
            false,
            PRIVATE_CACHE
          );
        }
      }
      await store.delete(audioBytesKey(audioId));
      await store.delete(audioMetaKey(audioId));
      return okResponse(200, { id: audioId, deleted: true }, PRIVATE_CACHE);
    }

    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST to upload.', false, PRIVATE_CACHE);
    }
    const tripId = url.searchParams.get('trip');
    if (!tripId) return bad('trip is required.');
    await ctx.repo.getTrip(tripId);

    let form;
    try {
      form = await request.formData();
    } catch {
      return bad('Request body must be multipart form data.');
    }
    const fileEntry = form.get('file');
    if (!(fileEntry instanceof File)) return bad('file is required.');
    const mime = baseAudioMime(fileEntry.type);
    if (!ALLOWED_AUDIO_MIME.has(mime)) return bad('That recording format is not supported.');
    if (fileEntry.size === 0) return bad('The recording is empty.');
    if (fileEntry.size > MAX_AUDIO_BYTES) {
      return bad(`Recording exceeds maximum size of ${MAX_AUDIO_BYTES} bytes.`);
    }

    const audioId = newAudioId();
    const bytes = new Uint8Array(await fileEntry.arrayBuffer());
    const store = await getStore(ctx.env);
    await store.set(audioBytesKey(audioId), bytes, { metadata: { contentType: mime } });
    await store.set(
      audioMetaKey(audioId),
      JSON.stringify({
        id: audioId,
        trip_id: tripId,
        mime_type: mime,
        size: bytes.byteLength,
        created_at: new Date(ctx.now()).toISOString()
      })
    );
    return okResponse(201, { audio_id: audioId }, PRIVATE_CACHE);
  }, deps);
}

/** GET ?id=…&token=… for followers on a live trip link, or GET ?id=… with a session for the owner. */
export function createTravelAudioGetHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const createRepo = deps.createTravelRepository ?? createTravelRepository;
  const verify = deps.verifySessionToken ?? verifySessionToken;
  const now = deps.now ?? Date.now;
  const clearCookie = deps.serializeExpiredSessionCookie ?? serializeExpiredSessionCookie;
  const notFound = (message) => errorResponse(404, 'not_found', message, false, NO_STORE);

  return async function travelAudioGetHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    if (request.method !== 'GET') {
      return withCors(errorResponse(405, 'method_not_allowed', 'Use GET.', false), request, env);
    }
    return withCors(await handleGet(request), request, env);
  };

  async function handleGet(request) {
    const originError = guardRequestOrigin(request, env);
    if (originError) return originError;

    const url = new URL(request.url);
    const audioId = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    if (!isAudioId(audioId)) return notFound('Clip not found.');

    let repo;
    try {
      repo = createRepo({ env, fetchImpl: deps.fetchImpl ?? fetch, github: deps.github });
    } catch {
      return errorResponse(503, 'misconfigured', 'Travel storage is unavailable.', true, NO_STORE);
    }
    const store = await getStore(env);
    const range = request.headers.get('range');

    if (token) {
      const shared = await liveTripForShareToken(repo, token);
      if (!shared) return notFound('This link has been turned off.');
      const clip = await loadAudio(store, audioId, shared.tripId);
      return clip ? audioResponse(clip.bytes, clip.contentType, range) : notFound('Clip not found.');
    }

    if (!isConfigured(env)) return withPrivate(misconfiguredResponse());
    let session;
    try {
      session = await verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return withPrivate(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        'cache-control': 'no-store',
        'set-cookie': clearCookie()
      });
    }
    const clip = await loadAudio(store, audioId, null);
    return clip ? audioResponse(clip.bytes, clip.contentType, range) : notFound('Clip not found.');
  }
}

/** Combined handler: GET = follower or owner read; POST and DELETE = owner. */
export function createTravelAudioHandler(deps = {}) {
  const write = createTravelAudioWriteHandler(deps);
  const read = createTravelAudioGetHandler(deps);
  return async function travelAudioHandler(request, context) {
    if (request.method === 'GET' || request.method === 'OPTIONS') {
      return read(request, context);
    }
    return write(request, context);
  };
}

export default createTravelAudioHandler();
