import { createHash, randomBytes } from 'node:crypto';
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE,
  withPrivate
} from './_shared/travel-http.mjs';
import { createTravelRepository } from './_shared/travel-repository.mjs';
import { createTravelJournalRepository } from './_shared/travel-journal-repository.mjs';
import {
  preflightResponse,
  withCors
} from './_shared/http.mjs';
import {
  buildSharedJournalPayload,
  collectSharedMomentIds
} from './_shared/travel-journal-share-privacy.mjs';
import {
  DERIVATIVE_WIDTHS,
  journalMediaDerivativeKey,
  travelJournalPresignGet,
  travelJournalR2Unbound
} from './_shared/travel-journal-r2.mjs';

export const config = { path: '/api/travel-journal-share' };

const PUBLIC_CACHE = { 'cache-control': 'no-store' };

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function sharePublicUrl(token, deps) {
  const base = deps.publicBaseUrl ?? 'https://life-hub.adam-russell.com';
  return `${base}/api/travel-journal-share?token=${encodeURIComponent(token)}`;
}

function resolveDerivativeKey(tripId, media, width) {
  const stored = media.derivative_keys?.[String(width)] ?? media.derivative_keys?.[width];
  if (typeof stored === 'string' && stored.length > 0) return stored;
  return journalMediaDerivativeKey(tripId, media.id, width);
}

async function presignDerivativeDownloads(tripId, journal, env, signGet) {
  const mediaIds = new Set(journal.media.map((row) => row.id));
  const downloads = [];
  for (const media of journal.media) {
    if (!mediaIds.has(media.id)) continue;
    for (const width of DERIVATIVE_WIDTHS) {
      const key = resolveDerivativeKey(tripId, media, width);
      try {
        const url =
          typeof signGet === 'function'
            ? await signGet({ key })
            : await travelJournalPresignGet(env, { key });
        downloads.push({
          media_id: media.id,
          variant: 'derivative',
          derivative_width: width,
          url,
          gps_stripped: true
        });
      } catch (error) {
        if (error?.code !== travelJournalR2Unbound().code) throw error;
      }
    }
  }
  return downloads;
}

function journalRepoFor(env, deps) {
  const factory = deps.createTravelJournalRepository ?? createTravelJournalRepository;
  return factory({ env, fetchImpl: deps.fetchImpl ?? fetch, github: deps.github });
}

function travelRepoFor(env, deps) {
  const factory = deps.createTravelRepository ?? createTravelRepository;
  return factory({ env, fetchImpl: deps.fetchImpl ?? fetch, github: deps.github });
}

async function loadShareRow(travelRepo, token) {
  const { map } = await travelRepo.getShareTokens();
  const row = map[tokenHash(token)];
  if (!row || row.kind !== 'journal' || !row.trip_id) return null;
  return row;
}

async function handlePublicGet(request, token, deps) {
  const env = deps.env ?? process.env;
  let travelRepo;
  let journalRepo;
  try {
    travelRepo = travelRepoFor(env, deps);
    journalRepo = journalRepoFor(env, deps);
  } catch {
    return errorResponse(503, 'misconfigured', 'Travel storage is unavailable.', true, PUBLIC_CACHE);
  }

  const row = await loadShareRow(travelRepo, token);
  if (!row) {
    return errorResponse(404, 'not_found', 'This link has been turned off.', false, PUBLIC_CACHE);
  }

  const url = new URL(request.url);
  const mediaId = url.searchParams.get('media');
  const widthParam = url.searchParams.get('width');
  if (mediaId) {
    const width = Number(widthParam);
    if (!DERIVATIVE_WIDTHS.has(width)) {
      return errorResponse(400, 'validation_error', 'width must be a supported derivative size.', false, PUBLIC_CACHE);
    }
    const { journal } = await journalRepo.getJournal(row.trip_id);
    const scoped = buildSharedJournalPayload(journal, row);
    const allowed = scoped.media.some((m) => m.id === mediaId);
    if (!allowed) {
      return errorResponse(404, 'not_found', 'Media not included in this share.', false, PUBLIC_CACHE);
    }
    const fullMedia = journal.media.find((m) => m.id === mediaId);
    if (!fullMedia) {
      return errorResponse(404, 'not_found', 'Media not found.', false, PUBLIC_CACHE);
    }
    const key = resolveDerivativeKey(row.trip_id, fullMedia, width);
    try {
      const signedUrl =
        typeof deps.signGet === 'function'
          ? await deps.signGet({ key })
          : await travelJournalPresignGet(env, { key, signGet: deps.signGet });
      const wantsJson =
        url.searchParams.get('format') === 'json' ||
        (request.headers.get('accept') ?? '').includes('application/json');
      if (wantsJson) {
        return okResponse(200, { url: signedUrl, gps_stripped: true, variant: 'derivative' }, PUBLIC_CACHE);
      }
      return new Response(null, {
        status: 302,
        headers: { Location: signedUrl, 'cache-control': 'no-store' }
      });
    } catch (error) {
      if (error?.code === travelJournalR2Unbound().code || error?.status === 503) {
        return errorResponse(
          503,
          'travel_journal_r2_unbound',
          'Journal media storage is not configured',
          true,
          PUBLIC_CACHE
        );
      }
      throw error;
    }
  }

  const { journal } = await journalRepo.getJournal(row.trip_id);
  const sharedJournal = buildSharedJournalPayload(journal, row);
  let media_downloads = [];
  try {
    media_downloads = await presignDerivativeDownloads(row.trip_id, sharedJournal, env, deps.signGet);
  } catch (error) {
    if (error?.code !== travelJournalR2Unbound().code && error?.status !== 503) throw error;
  }

  return okResponse(
    200,
    {
      trip_id: row.trip_id,
      shared_at: row.created_at,
      journal: sharedJournal,
      media_downloads
    },
    PUBLIC_CACHE
  );
}

function createOperator(deps) {
  return createTravelOperatorHandler(async (request, ctx) => {
    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip');
    if (!tripId) {
      return errorResponse(400, 'validation_error', 'trip is required.', false, PRIVATE_CACHE);
    }
    const journalRepo = journalRepoFor(ctx.env, deps);

    if (request.method === 'POST') {
      const body = await readJson(request);
      const scope = {
        moment_ids: Array.isArray(body?.moment_ids) ? body.moment_ids : [],
        leg_ids: Array.isArray(body?.leg_ids) ? body.leg_ids : []
      };
      const { journal } = await journalRepo.getJournal(tripId);
      const momentIds = collectSharedMomentIds(scope, journal);
      if (momentIds.size === 0) {
        return errorResponse(
          400,
          'validation_error',
          'Select at least one moment or leg to share.',
          false,
          PRIVATE_CACHE
        );
      }

      const { map, version: shareVersion } = await ctx.repo.getShareTokens();
      for (const [hash, row] of Object.entries(map)) {
        if (row.trip_id === tripId && row.kind === 'journal') delete map[hash];
      }
      const token =
        typeof deps.randomToken === 'function' ? deps.randomToken() : randomBytes(32).toString('base64url');
      const created_at = new Date(ctx.now()).toISOString();
      map[tokenHash(token)] = {
        trip_id: tripId,
        kind: 'journal',
        created_at,
        moment_ids: [...scope.moment_ids],
        leg_ids: [...scope.leg_ids]
      };
      await ctx.repo.saveShareTokens(map, shareVersion);

      return okResponse(
        200,
        {
          url: sharePublicUrl(token, deps),
          token,
          scope: {
            moment_ids: [...scope.moment_ids],
            leg_ids: [...scope.leg_ids],
            resolved_moment_ids: [...momentIds].sort()
          },
          downloads_outside_revocation:
            'Turning the link off blocks new views. Files someone already saved stay on their device.'
        },
        PRIVATE_CACHE
      );
    }

    if (request.method === 'DELETE') {
      const { map, version: shareVersion } = await ctx.repo.getShareTokens();
      for (const [hash, row] of Object.entries(map)) {
        if (row.trip_id === tripId && row.kind === 'journal') delete map[hash];
      }
      await ctx.repo.saveShareTokens(map, shareVersion);
      return okResponse(200, { revoked: true }, PRIVATE_CACHE);
    }

    return errorResponse(405, 'method_not_allowed', 'Use POST or DELETE.', false, PRIVATE_CACHE);
  }, deps);
}

export function createTravelJournalShareHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const operator = createOperator(deps);

  return async function travelJournalShareHandler(request, context = {}) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (request.method === 'GET' && token) {
      return withCors(await handlePublicGet(request, token, deps), request, env);
    }
    const response = await operator(request, context);
    return response instanceof Response && !response.headers.get('access-control-allow-origin')
      ? withCors(withPrivate(response), request, env)
      : withCors(response, request, env);
  };
}

export default createTravelJournalShareHandler();
