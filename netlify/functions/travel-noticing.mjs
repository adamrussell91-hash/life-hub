import { createTravelOperatorHandler, okResponse, errorResponse, readJson, PRIVATE_CACHE } from './_shared/travel-http.mjs';
import { completeMessage } from './_shared/anthropic-client.mjs';
import { checkRateLimit } from './_shared/travel-rate-limit.mjs';
import { TASK_PREFIX, defaultGetTasksStore, listJSON } from './_shared/tasks-blobs.mjs';
import {
  WISHES_MODEL,
  WISHES_SYSTEM,
  dayEvidence,
  openWishes,
  parseWishMatches,
  wishCards,
  wishesRequest
} from './_shared/travel-noticing-wishes.mjs';
import {
  MIN_PHOTOS_FOR_A_LOOK,
  PHOTOS_MODEL,
  PHOTOS_SYSTEM,
  dayPhotos,
  parsePhotoNotices,
  photoCards,
  photosContent,
  samplePhotos
} from './_shared/travel-noticing-photos.mjs';
import { travelJournalPresignGet } from './_shared/travel-journal-r2.mjs';
import { createFoodJournalRepository } from './_shared/food-journal-repository.mjs';
import { createGitHubClient } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { selectOnThisDayEntries } from './_shared/mind-digest.mjs';
import { defaultGetShelfStore, readShelf } from './_shared/knowledge-shelf.mjs';
import { diaryOnThisDay, diaryRecord, foodFacts, shelfMatches } from './_shared/travel-noticing-extras.mjs';

/** A 320px copy is tens of kilobytes. Anything much larger is not what was asked for. */
const MAX_SMALL_COPY_BYTES = 400_000;
import { createTravelJournalRepository } from './_shared/travel-journal-repository.mjs';
import { buildNoticingHistory } from './_shared/travel-noticing-history.mjs';

export const config = { path: '/api/travel-noticing' };

/**
 * GET `?trip=`: what the journal's noticing cards need from outside the trip
 * in hand: a compact history of every other trip, and, matched by exact
 * rules only, a few facts from the food journal, the diary (for `&day=`)
 * and the bookshelf. Each of those is left out if it cannot be read.
 * POST `?trip=` with `{ kind: 'wishes', day }`: which open bucket-list and
 * dreams-jar items that day of the trip fulfilled. With `kind: 'photos'`:
 * what runs across that day's photos. Nothing is stored and nothing in Tasks
 * is changed here; the phone keeps the cards and ticking one off is the
 * owner's tap.
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
  const loadJournals = deps.loadJournals ?? ((ctx) => journalRepo(ctx).listJournals());

  const journalRepo = (ctx) =>
    (deps.createTravelJournalRepository ?? createTravelJournalRepository)({
      env: ctx.env,
      fetchImpl: deps.fetchImpl ?? fetch,
      github: deps.github
    });
  const loadTasks = deps.loadTasks ?? (async (ctx) => listJSON(await defaultGetTasksStore(ctx.env), TASK_PREFIX));

  async function wishesFor(ctx, tripId, day) {
    const wishes = openWishes(await loadTasks(ctx));
    if (!wishes.length) return [];
    const [{ trip }, journal] = await Promise.all([
      ctx.repo.getTrip(tripId),
      journalRepo(ctx).getJournal(tripId).then((r) => r.journal, () => null)
    ]);
    if (day < trip.start_date || day > trip.end_date) return [];
    const evidence = dayEvidence({ trip, journal, day });
    if (!evidence.length) return [];
    const raw = await (deps.complete ?? completeMessage)({
      apiKey: ctx.env.ANTHROPIC_API_KEY,
      fetchImpl: deps.fetchImpl,
      model: WISHES_MODEL,
      maxTokens: 600,
      system: WISHES_SYSTEM,
      messages: [{ role: 'user', content: wishesRequest(wishes, evidence) }],
      signal: AbortSignal.timeout(25000)
    });
    return wishCards(parseWishMatches(raw, wishes, evidence), day);
  }

  const loadFoodJournal =
    deps.loadFoodJournal ??
    (async (ctx) =>
      (await createFoodJournalRepository({ env: ctx.env, fetchImpl: deps.fetchImpl ?? fetch, github: deps.github }).getJournal()).journal);
  const loadBooks = deps.loadBooks ?? (async () => (await readShelf(await defaultGetShelfStore())).books);
  // The diary is read for one date only: this day in up to three earlier years. It is never sent to a model.
  const loadDiaryRecords =
    deps.loadDiaryRecords ??
    (async (ctx, day) => {
      const client = deps.github ?? createGitHubClient({ env: ctx.env, fetchImpl: deps.fetchImpl ?? fetch });
      const { tree } = await client.resolveTree();
      const { load } = await import('js-yaml');
      const records = [];
      for (const entry of selectOnThisDayEntries(tree, day)) {
        const record = diaryRecord(decodeBlob(await client.readBlob(entry.sha)), load);
        if (record) records.push(record);
      }
      return records;
    });
  const quietly = (work) => Promise.resolve().then(work).catch(() => null);

  async function extrasFor(ctx, tripId, day) {
    const trip = await quietly(async () => (await ctx.repo.getTrip(tripId)).trip);
    if (!trip) return {};
    const [food, diary, books] = await Promise.all([
      quietly(async () => foodFacts({ foodJournal: await loadFoodJournal(ctx), trip })),
      day ? quietly(async () => diaryOnThisDay(await loadDiaryRecords(ctx, day), day)) : null,
      quietly(async () => shelfMatches({ books: await loadBooks(ctx), trip }))
    ]);
    return { ...(food ? { food } : {}), ...(diary ? { diary } : {}), ...(books ? { books } : {}) };
  }

  const loadPhotoBytes =
    deps.loadPhotoBytes ??
    (async (ctx, key) => {
      const url = await travelJournalPresignGet(ctx.env, { key, signGet: deps.signGet });
      const response = await (deps.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length > 0 && bytes.length <= MAX_SMALL_COPY_BYTES ? bytes.toString('base64') : null;
    });

  async function photosFor(ctx, tripId, day) {
    const [{ trip }, journal] = await Promise.all([
      ctx.repo.getTrip(tripId),
      journalRepo(ctx).getJournal(tripId).then((r) => r.journal, () => null)
    ]);
    if (!journal || day < trip.start_date || day > trip.end_date) return [];
    const all = dayPhotos(journal, day);
    if (all.length < MIN_PHOTOS_FOR_A_LOOK) return [];
    const chosen = samplePhotos(all);
    const loaded = (
      await Promise.all(chosen.map(async (photo) => ({ id: photo.id, data: await loadPhotoBytes(ctx, photo.key).catch(() => null) })))
    ).filter((image) => image.data);
    if (loaded.length < MIN_PHOTOS_FOR_A_LOOK) return [];
    const raw = await (deps.complete ?? completeMessage)({
      apiKey: ctx.env.ANTHROPIC_API_KEY,
      fetchImpl: deps.fetchImpl,
      model: PHOTOS_MODEL,
      maxTokens: 500,
      system: PHOTOS_SYSTEM,
      messages: [{ role: 'user', content: photosContent(loaded) }],
      signal: AbortSignal.timeout(50000)
    });
    const notices = parsePhotoNotices(raw, loaded.map((image) => image.id));
    return photoCards(notices, { day, tripId, sent: loaded.length, total: all.length });
  }

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use GET or POST.', false, PRIVATE_CACHE);
    }
    const tripId = new URL(request.url).searchParams.get('trip') || '';
    if (!/^trp_[a-z0-9_]{4,64}$/i.test(tripId)) {
      return errorResponse(400, 'bad_request', 'A trip id is needed.', false, PRIVATE_CACHE);
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      const day = typeof body?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : '';
      if ((body?.kind !== 'wishes' && body?.kind !== 'photos') || !day) {
        return errorResponse(400, 'bad_request', 'A kind and a day are needed.', false, PRIVATE_CACHE);
      }
      if (!ctx.env.ANTHROPIC_API_KEY && !deps.complete) {
        return errorResponse(503, 'not_configured', 'Noticing is not set up on this server.', false, PRIVATE_CACHE);
      }
      const sessionKey = ctx.session?.token || ctx.session?.id || 'anon';
      checkRateLimit(`noticing:${sessionKey}`, { limit: 12, now: ctx.now() });
      try {
        const cards = body.kind === 'photos' ? await photosFor(ctx, tripId, day) : await wishesFor(ctx, tripId, day);
        return okResponse(200, { cards }, PRIVATE_CACHE);
      } catch (error) {
        if (error?.code === 'not_found' || error?.status === 404) throw error;
        return errorResponse(503, 'upstream_unavailable', 'Could not look at today just now.', true, PRIVATE_CACHE);
      }
    }
    const dayParam = new URL(request.url).searchParams.get('day') || '';
    const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : '';
    const [trips, journals, extras] = await Promise.all([loadTrips(ctx), loadJournals(ctx), extrasFor(ctx, tripId, day)]);
    return okResponse(
      200,
      { history: { ...buildNoticingHistory({ trips, journals, exceptTripId: tripId }), ...extras } },
      PRIVATE_CACHE
    );
  }, deps);
}

export default createTravelNoticingHandler();
