import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import {
  DERIVATIVE_WIDTHS,
  isJournalMediaKey,
  journalMediaDerivativeKey,
  journalMediaOriginalKey,
  parseJournalByteRange,
  travelJournalGetObject,
  travelJournalPresignGet,
  travelJournalR2Unbound
} from './_shared/travel-journal-r2.mjs';

/** A photo copy or voice note never changes under its key, so the phone may keep it a day. */
const MEDIA_BYTES_CACHE = 'private, max-age=86400';

export const config = { path: '/api/travel-journal-media' };

function resolveStoredJournalKey(tripId, stored) {
  if (typeof stored !== 'string' || stored.length === 0) return { missing: true };
  if (!isJournalMediaKey(tripId, stored)) return { invalid: true };
  return { key: stored };
}

function resolveMediaKey(tripId, media, variant, widthParam) {
  if (variant === 'derivative') {
    const width = Number(widthParam);
    if (!DERIVATIVE_WIDTHS.has(width)) return null;
    const derivatives = media.derivative_keys;
    if (derivatives && typeof derivatives === 'object') {
      const stored = derivatives[String(width)] ?? derivatives[width];
      const resolved = resolveStoredJournalKey(tripId, stored);
      if (resolved.invalid) return { invalid: true };
      if (resolved.key) return { key: resolved.key };
    }
    return { key: journalMediaDerivativeKey(tripId, media.id, width) };
  }
  const original = resolveStoredJournalKey(tripId, media.original_key);
  if (original.invalid) return { invalid: true };
  if (original.key) return { key: original.key };
  return { key: journalMediaOriginalKey(tripId, media.id) };
}

export function createTravelJournalMediaHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'Use GET.', false, PRIVATE_CACHE);
    }

    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip') ?? '';
    const mediaId = url.searchParams.get('id') ?? '';
    const variant = (url.searchParams.get('variant') ?? 'original').toLowerCase();
    const widthParam = url.searchParams.get('width') ?? url.searchParams.get('derivative_width');

    if (!tripId || !mediaId) {
      return errorResponse(400, 'validation_error', 'trip and id are required.', false, PRIVATE_CACHE);
    }

    const { journal } = await ctx.repo.getJournal(tripId);
    const media = journal.media.find((item) => item.id === mediaId);
    if (!media) {
      return errorResponse(404, 'not_found', 'Media not found.', false, PRIVATE_CACHE);
    }

    const resolved = resolveMediaKey(tripId, media, variant, widthParam);
    if (!resolved) {
      return errorResponse(404, 'not_found', 'Media object not available.', false, PRIVATE_CACHE);
    }
    if (resolved.invalid) {
      return errorResponse(
        400,
        'validation_error',
        'Media object key is not allowed.',
        false,
        PRIVATE_CACHE
      );
    }
    const key = resolved.key;
    const redirectToStorage = async () =>
      new Response(null, {
        status: 302,
        headers: {
          Location: await travelJournalPresignGet(ctx.env, { key, signGet: deps.signGet }),
          'cache-control': 'private, no-store'
        }
      });

    try {
      const wantsJson =
        url.searchParams.get('format') === 'json' ||
        (request.headers.get('accept') ?? '').includes('application/json');
      if (wantsJson) {
        const signedUrl = await travelJournalPresignGet(ctx.env, { key, signGet: deps.signGet });
        return okResponse(200, { url: signedUrl, key }, PRIVATE_CACHE);
      }

      // The page asks for photos and voice notes as credentialed CORS requests
      // to this API. Following a redirect to the bucket would depend on the
      // bucket's own CORS rules, so the bytes are sent from here.
      const range = parseJournalByteRange(request.headers.get('range')) ?? undefined;
      const object = await travelJournalGetObject(ctx.env, { key, range, getObject: deps.getObject });
      if (!object) {
        return errorResponse(404, 'not_found', 'Media object not available.', false, PRIVATE_CACHE);
      }
      if (object.invalidRange) {
        return new Response(null, { status: 416, headers: PRIVATE_CACHE });
      }
      if (object.tooLarge) return redirectToStorage();

      const headers = {
        'content-type':
          object.contentType ||
          (variant === 'derivative' ? 'image/jpeg' : media.content_type) ||
          'application/octet-stream',
        'content-length': String(object.bytes.byteLength),
        'accept-ranges': 'bytes',
        'cache-control': MEDIA_BYTES_CACHE,
        'access-control-expose-headers': 'content-length, content-range, accept-ranges'
      };
      if (object.contentRange) headers['content-range'] = object.contentRange;
      return new Response(object.bytes, { status: object.contentRange ? 206 : 200, headers });
    } catch (error) {
      if (error?.code === travelJournalR2Unbound().code || error?.status === 503) {
        return errorResponse(
          503,
          'travel_journal_r2_unbound',
          'Journal media storage is not configured',
          true,
          PRIVATE_CACHE
        );
      }
      throw error;
    }
  }, deps);
}

export default createTravelJournalMediaHandler();
