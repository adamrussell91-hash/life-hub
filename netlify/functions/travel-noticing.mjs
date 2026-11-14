import { createTravelOperatorHandler, okResponse, errorResponse, PRIVATE_CACHE } from './_shared/travel-http.mjs';
import { createTravelJournalRepository } from './_shared/travel-journal-repository.mjs';
import { buildNoticingHistory } from './_shared/travel-noticing-history.mjs';

export const config = { path: '/api/travel-noticing' };

/**
 * GET `?trip=`: what the journal's noticing cards need from outside the trip
 * in hand. For now that is a compact history of every other trip.
 */
export function createTravelNoticingHandler(deps = {}) {
  const loadTrips =
    deps.loadTrips ??
    (async (ctx) => {
      const summaries = await ctx.repo.listTrips();
      const trips = [];
      for (const summary of summaries) {
        try {
          trips.push((await ctx.repo.getTrip(summary.id)).trip);
        } catch {
          // One unreadable trip should not hide the rest.
        }
      }
      return trips;
    });
  const loadJournals =
    deps.loadJournals ??
    ((ctx) =>
      (deps.createTravelJournalRepository ?? createTravelJournalRepository)({
        env: ctx.env,
        fetchImpl: deps.fetchImpl ?? fetch,
        github: deps.github
      }).listJournals());

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'Use GET.', false, PRIVATE_CACHE);
    }
    const tripId = new URL(request.url).searchParams.get('trip') || '';
    if (!/^trp_[a-z0-9_]{4,64}$/i.test(tripId)) {
      return errorResponse(400, 'bad_request', 'A trip id is needed.', false, PRIVATE_CACHE);
    }
    const [trips, journals] = await Promise.all([loadTrips(ctx), loadJournals(ctx)]);
    return okResponse(200, { history: buildNoticingHistory({ trips, journals, exceptTripId: tripId }) }, PRIVATE_CACHE);
  }, deps);
}

export default createTravelNoticingHandler();
