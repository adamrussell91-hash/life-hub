import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { stripDeletedFromJournal } from './_shared/travel-journal-schema.mjs';
import {
  DERIVATIVE_WIDTHS,
  journalMediaDerivativeKey,
  journalMediaOriginalKey,
  travelJournalPresignGet,
  travelJournalR2Unbound
} from './_shared/travel-journal-r2.mjs';

export const config = { path: '/api/travel-journal-export' };

export const JOURNAL_EXPORT_BUNDLE_VERSION = 1;

function resolveOriginalKey(tripId, media) {
  if (typeof media.original_key === 'string' && media.original_key.length > 0) {
    return media.original_key;
  }
  return journalMediaOriginalKey(tripId, media.id);
}

function resolveDerivativeKey(tripId, media, width) {
  const stored = media.derivative_keys?.[String(width)] ?? media.derivative_keys?.[width];
  if (typeof stored === 'string' && stored.length > 0) return stored;
  return journalMediaDerivativeKey(tripId, media.id, width);
}

async function presignUrl(env, key, signGet) {
  if (typeof signGet === 'function') {
    return signGet({ key });
  }
  return travelJournalPresignGet(env, { key });
}

async function presignMediaDownloads(tripId, journal, env, signGet) {
  const downloads = [];
  for (const media of journal.media) {
    if (media.lifecycle !== 'live') continue;
    const originalKey = resolveOriginalKey(tripId, media);
    try {
      const originalUrl = await presignUrl(env, originalKey, signGet);
      downloads.push({
        media_id: media.id,
        variant: 'original',
        key: originalKey,
        url: originalUrl,
        checksum: media.checksum ?? null,
        bundle_path: `media/${media.id}/original`
      });
    } catch (error) {
      if (error?.code !== travelJournalR2Unbound().code) throw error;
    }

    for (const width of DERIVATIVE_WIDTHS) {
      const key = resolveDerivativeKey(tripId, media, width);
      try {
        const url = await presignUrl(env, key, signGet);
        downloads.push({
          media_id: media.id,
          variant: 'derivative',
          derivative_width: width,
          key,
          url,
          bundle_path: `media/${media.id}/der/${width}.jpg`
        });
      } catch (error) {
        if (error?.code !== travelJournalR2Unbound().code) throw error;
      }
    }
  }
  return downloads;
}

export function createTravelJournalExportHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'Use GET.', false, PRIVATE_CACHE);
    }

    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip');
    if (!tripId) {
      return errorResponse(400, 'validation_error', 'trip is required.', false, PRIVATE_CACHE);
    }

    const { journal, version } = await ctx.repo.getJournal(tripId);
    const stripped = stripDeletedFromJournal(journal);

    let media_downloads = [];
    try {
      media_downloads = await presignMediaDownloads(
        tripId,
        stripped,
        ctx.env,
        deps.signGet
      );
    } catch (error) {
      if (error?.code !== travelJournalR2Unbound().code && error?.status !== 503) {
        throw error;
      }
    }

    return okResponse(
      200,
      {
        bundle_version: JOURNAL_EXPORT_BUNDLE_VERSION,
        exported_at: new Date(ctx.now?.() ?? Date.now()).toISOString(),
        trip_id: tripId,
        journal_version: version,
        journal: stripped,
        media_downloads,
        restore_gaps: [
          'Client restore currently imports journal JSON only; media must be copied separately until signed upload restore ships.'
        ]
      },
      PRIVATE_CACHE
    );
  }, deps);
}

export default createTravelJournalExportHandler();
