import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { createTravelJournalRepository } from './_shared/travel-journal-repository.mjs';
import { stripDeletedFromJournal, validateJournal } from './_shared/travel-journal-schema.mjs';
import { createMealLinkStore } from './_shared/meal-link-store.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';

export const config = { path: '/api/travel-journal' };

const conflict = () =>
  Object.assign(new Error('This journal changed somewhere else. Reload to see the latest.'), {
    code: 'conflict',
    status: 409
  });

async function deleteMealMoments(ctx, deps, { tripId, journal, dropped, ifVersion }) {
  const store = (deps.createMealLinkStore ?? createMealLinkStore)({
    env: ctx.env,
    fetchImpl: deps.fetchImpl,
    github: deps.github
  });
  const snap = await store.read(tripId);
  if (snap.travel.version !== ifVersion) throw conflict();
  const visitIds = new Set(dropped.values());
  const food = {
    ...snap.food.journal,
    visits: snap.food.journal.visits.map((v) =>
      visitIds.has(v.id) && !isDeletedRecord(v) ? { ...v, status: 'deleted' } : v
    )
  };
  const travel = validateJournal({
    ...journal,
    moments: journal.moments.map(({ meal, ...m }) => (dropped.has(m.id) || !meal ? m : { ...m, meal }))
  });
  const saved = await store.write(snap, {
    food,
    travels: [{ tripId, journal: travel }],
    message: `travel-journal: delete meal moments in ${tripId}`
  });
  return { journal: travel, version: saved.travelVersions[tripId] };
}

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
      const includeDeleted =
        url.searchParams.get('trash') === '1' || url.searchParams.get('include_deleted') === '1';
      const payload = includeDeleted ? journal : stripDeletedFromJournal(journal);
      return okResponse(200, { journal: payload, version }, PRIVATE_CACHE);
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
      // Meal links are owned by /api/travel-meal. Carry the server's links over
      // and drop any the client sent, so a stale copy cannot unlink or forge one.
      const current = await ctx.repo.getJournal(tripId);
      const links = new Map(
        current.journal.moments.filter((m) => m.meal).map((m) => [m.id, m.meal])
      );
      const journal = {
        ...body.journal,
        moments: body.journal.moments.map(({ meal, ...m }) =>
          links.has(m.id) ? { ...m, meal: links.get(m.id) } : m
        )
      };
      // A meal moment deleted in this save (alone, or with its day, leg or
      // trip) takes its Food Journal visit with it, in the same commit.
      const incoming = new Map(journal.moments.map((m) => [m.id, m]));
      const dropped = new Map(
        current.journal.moments
          .filter((m) => m.meal && !isDeletedRecord(m) && isDeletedRecord(incoming.get(m.id)))
          .map((m) => [m.id, m.meal.food_visit_id])
      );
      if (!dropped.size) {
        const saved = await ctx.repo.saveJournal(
          journal,
          body.if_version,
          `travel-journal: edit trip ${tripId}`
        );
        return okResponse(200, saved, PRIVATE_CACHE);
      }
      return okResponse(
        200,
        await deleteMealMoments(ctx, deps, { tripId, journal, dropped, ifVersion: body.if_version }),
        PRIVATE_CACHE
      );
    }

    return errorResponse(405, 'method_not_allowed', 'Use GET or PUT.', false, PRIVATE_CACHE);
  }, operatorDeps);
}

export default createTravelJournalHandler();
