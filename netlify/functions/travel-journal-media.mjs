import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import {
  DERIVATIVE_WIDTHS,
  journalMediaDerivativeKey,
  journalMediaOriginalKey,
  travelJournalPresignGet,
  travelJournalR2Unbound
} from './_shared/travel-journal-r2.mjs';

export const config = { path: '/api/travel-journal-media' };

function resolveMediaKey(tripId, media, variant, widthParam) {
  if (variant === 'derivative') {
    const width = Number(widthParam);
    if (!DERIVATIVE_WIDTHS.has(width)) return null;
    const derivatives = media.derivative_keys;
    if (derivatives && typeof derivatives === 'object') {
      const stored = derivatives[String(width)] ?? derivatives[width];
      if (typeof stored === 'string' && stored.length > 0) return stored;
    }
    return journalMediaDerivativeKey(tripId, media.id, width);
  }
  if (typeof media.original_key === 'string' && media.original_key.length > 0) {
    return media.original_key;
  }
  return journalMediaOriginalKey(tripId, media.id);
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

    const key = resolveMediaKey(tripId, media, variant, widthParam);
    if (!key) {
      return errorResponse(404, 'not_found', 'Media object not available.', false, PRIVATE_CACHE);
    }

    try {
      const signedUrl = await travelJournalPresignGet(ctx.env, {
        key,
        signGet: deps.signGet
      });
      const wantsJson =
        url.searchParams.get('format') === 'json' ||
        (request.headers.get('accept') ?? '').includes('application/json');
      if (wantsJson) {
        return okResponse(200, { url: signedUrl, key }, PRIVATE_CACHE);
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: signedUrl,
          'cache-control': 'private, no-store'
        }
      });
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
