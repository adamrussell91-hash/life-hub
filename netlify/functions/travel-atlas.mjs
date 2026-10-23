import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { createTravelJournalRepository } from './_shared/travel-journal-repository.mjs';
import { liveAtlasItems, normaliseAtlasSettings } from './_shared/travel-atlas.mjs';

export const config = { path: '/api/travel-atlas' };

/**
 * GET: every live Arches Atlas item across trip journals (or one trip with
 * `?trip=`), plus the home Big Mac price. PUT: `{ home_big_mac_aud }`.
 * Items are written through the journal itself, not here.
 */
export function createTravelAtlasHandler(deps = {}) {
  const operatorDeps = {
    ...deps,
    createTravelRepository:
      deps.createTravelJournalRepository ??
      deps.createTravelRepository ??
      ((opts) => createTravelJournalRepository(opts))
  };

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method === 'GET') {
      const tripId = new URL(request.url).searchParams.get('trip');
      let journals;
      if (tripId) {
        try {
          journals = [(await ctx.repo.getJournal(tripId)).journal];
        } catch (error) {
          if (error?.code !== 'not_found') throw error;
          journals = [];
        }
      } else {
        journals = await ctx.repo.listJournals();
      }
      const items = journals.flatMap((journal) => liveAtlasItems(journal));
      items.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
      const { settings, version } = await ctx.repo.getAtlasSettings();
      return okResponse(
        200,
        { items, settings: normaliseAtlasSettings(settings), settings_version: version },
        PRIVATE_CACHE
      );
    }

    if (request.method === 'PUT') {
      const body = await readJson(request);
      const home = body?.home_big_mac_aud;
      if (home !== null && !(typeof home === 'number' && Number.isFinite(home) && home > 0 && home < 1000)) {
        return errorResponse(400, 'validation_error', 'home_big_mac_aud must be a price in AUD.', false, PRIVATE_CACHE);
      }
      const current = await ctx.repo.getAtlasSettings();
      if ((body.settings_version ?? null) !== current.version) {
        return errorResponse(409, 'conflict', 'The Atlas changed somewhere else. Reload to see the latest.', false, PRIVATE_CACHE);
      }
      const settings = { ...current.settings, ...normaliseAtlasSettings({ home_big_mac_aud: home }) };
      const saved = await ctx.repo.saveAtlasSettings(settings, current.version);
      return okResponse(
        200,
        { settings: normaliseAtlasSettings(saved.settings), settings_version: saved.version },
        PRIVATE_CACHE
      );
    }

    return errorResponse(405, 'method_not_allowed', 'Use GET or PUT.', false, PRIVATE_CACHE);
  }, operatorDeps);
}

export default createTravelAtlasHandler();
