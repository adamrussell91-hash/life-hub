import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { createTravelJournalRepository } from './_shared/travel-journal-repository.mjs';
import { validateJournal } from './_shared/travel-journal-schema.mjs';

export const config = { path: '/api/travel-journal' };

export function createTravelJournalHandler(deps = {}) {
  const operatorDeps = {
    ...deps,
    createTravelRepository:
      deps.createTravelJournalRepository ??
      deps.createTravelRepository ??
      ((opts) => createTravelJournalRepository(opts))
  };

  return createTravelOperatorHandler(async (request, ctx) => {
    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip');
    if (!tripId) {
      return errorResponse(400, 'validation_error', 'trip is required.', false, PRIVATE_CACHE);
    }

    if (request.method === 'GET') {
      const { journal, version } = await ctx.repo.getJournal(tripId);
      return okResponse(200, { journal, version }, PRIVATE_CACHE);
    }

    if (request.method === 'PUT') {
      const body = await readJson(request);
      if (!body?.journal || typeof body.journal !== 'object') {
        return errorResponse(400, 'validation_error', 'journal is required.', false, PRIVATE_CACHE);
      }
      if (body.journal.trip_id !== tripId) {
        return errorResponse(
          400,
          'validation_error',
          'journal.trip_id must match trip query.',
          false,
          PRIVATE_CACHE
        );
      }

      if (body.create === true) {
        validateJournal(body.journal);
        const created = await ctx.repo.createJournal(body.journal);
        return okResponse(200, created, PRIVATE_CACHE);
      }

      if (!body.if_version) {
        return errorResponse(400, 'validation_error', 'if_version is required.', false, PRIVATE_CACHE);
      }

      validateJournal(body.journal);
      const saved = await ctx.repo.saveJournal(
        body.journal,
        body.if_version,
        `travel-journal: edit trip ${tripId}`
      );
      return okResponse(200, saved, PRIVATE_CACHE);
    }

    return errorResponse(405, 'method_not_allowed', 'Use GET or PUT.', false, PRIVATE_CACHE);
  }, operatorDeps);
}

export default createTravelJournalHandler();
