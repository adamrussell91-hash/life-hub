import { randomUUID } from "node:crypto";
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE,
} from "./_shared/travel-http.mjs";
import { createMealLinkStore } from "./_shared/meal-link-store.mjs";
import { upsertLinkedVisit, pickFoodPhotoKey } from "./_shared/travel-meal-link.mjs";
import { knowledgePutObject, readStoredPhoto } from "./_shared/knowledge-r2.mjs";
import { isDeletedRecord, withoutDeleted } from "./_shared/record-liveness.mjs";
import { validateFoodJournal } from "./_shared/food-journal-schema.mjs";
import { validateJournal } from "./_shared/travel-journal-schema.mjs";

export const config = { path: "/api/travel-meal" };

const newId = (prefix) => `${prefix}_${randomUUID()}`;
const EXTRAS = ["mood", "vibe", "with"];
// The Food Journal's photo limit per dish.
const MAX_PHOTOS = 20;
// Travel only needs to know a dish is counted, not its Brisket link.
const readableDish = ({ brisket, ...dish }) => (brisket ? { ...dish, counted: true } : dish);
const readable = (visit) => (visit ? { ...visit, dishes: withoutDeleted(visit.dishes).map(readableDish) } : null);

// Same naming as a Food Journal upload, so its photo read serves the copy.
// A source over the upload limit throws, so it counts as photo_failed.
async function defaultCopyPhoto(env, sourceKey, deps) {
  const id = `photo_${randomUUID()}`;
  const key = `food/photos/${id}.jpg`;
  const body = await readStoredPhoto(env, sourceKey, deps);
  await knowledgePutObject(env, { key, body, contentType: "image/jpeg", putObject: deps.putObject });
  return { id, key };
}

const isPhoto = (media) =>
  media && !isDeletedRecord(media) && (media.content_type == null || /^image\//i.test(media.content_type));

// The meal-link store reads both files itself, so the wrapper needs no travel repository.
export function createTravelMealHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    if (!["GET", "PUT", "DELETE"].includes(request.method))
      return errorResponse(405, "method_not_allowed", "Use GET, PUT or DELETE.", false, PRIVATE_CACHE);
    const url = new URL(request.url);
    const tripId = url.searchParams.get("trip");
    const momentId = url.searchParams.get("moment");
    if (!tripId || !momentId)
      return errorResponse(400, "validation_error", "trip and moment are required.", false, PRIVATE_CACHE);

    const store = (deps.createMealLinkStore ?? createMealLinkStore)({ env: ctx.env, fetchImpl: deps.fetchImpl, github: deps.github });
    const snap = await store.read(tripId);
    const moment = snap.travel.journal.moments.find((m) => m.id === momentId && !isDeletedRecord(m));
    if (!moment) return errorResponse(404, "not_found", "Moment not found.", false, PRIVATE_CACHE);
    const linked = snap.food.journal.visits.find((v) => v.id === moment.meal?.food_visit_id && !isDeletedRecord(v));

    if (request.method === "GET")
      return okResponse(200, { visit: readable(linked), travel_version: snap.travel.version, food_version: snap.food.version }, PRIVATE_CACHE);

    // Older moments have no author; they are Adam's. Any other author is not (parseMomentAuthor).
    if (moment.author && moment.author !== "adam")
      return errorResponse(403, "forbidden", "Only your own moments can be meals.", false, PRIVATE_CACHE);
    const body = await readJson(request);
    if (!body) return errorResponse(400, "validation_error", "Journal versions are required.", false, PRIVATE_CACHE);
    store.assertVersions(snap, { travel: body.travel_version, food: body.food_version });
    const revision = snap.travel.journal.revision + 1;

    if (request.method === "PUT") {
      if (!body.food || !Array.isArray(body.food.dishes) || !body.food.dishes.length)
        return errorResponse(400, "validation_error", "Add at least one dish.", false, PRIVATE_CACHE);
      const extras = Object.fromEntries(
        EXTRAS.filter((k) => typeof body.extras?.[k] === "string" && body.extras[k].trim()).map((k) => [k, body.extras[k].trim()]),
      );
      const build = (photos) => {
        const { journal: food, visitId } = upsertLinkedVisit(snap.food.journal, {
          tripId,
          moment,
          food: body.food,
          photos,
          visitId: linked?.id,
          newId,
        });
        const travel = {
          ...snap.travel.journal,
          revision,
          moments: snap.travel.journal.moments.map((m) => (m.id === momentId ? { ...m, meal: { food_visit_id: visitId, ...extras } } : m)),
        };
        return { food, travel, visitId };
      };
      // Check the save is valid before touching R2.
      const draft = build([]);
      validateFoodJournal(draft.food);
      validateJournal(draft.travel);

      const draftVisit = draft.food.visits.find((v) => v.id === draft.visitId);
      const already = new Set(draftVisit.dishes.flatMap((d) => d.photos.map((p) => p.from)).filter(Boolean));
      const room = Math.max(0, MAX_PHOTOS - (draftVisit.dishes[0]?.photos.length ?? 0));
      const media = new Map(snap.travel.journal.media.map((m) => [m.id, m]));
      const wanted = moment.media_ids
        .filter((id) => !already.has(id))
        .map((id) => ({ id, key: isPhoto(media.get(id)) ? pickFoodPhotoKey(media.get(id)) : null }))
        .filter((m) => m.key)
        .slice(0, room);
      // If the commit below loses a race, these copies are left orphaned in R2. That is accepted.
      const copy = deps.copyPhoto ?? ((key) => defaultCopyPhoto(ctx.env, key, deps));
      const copied = [];
      let photoFailed = false;
      for (const { id, key } of wanted) {
        try {
          const photo = await copy(key);
          if (photo) copied.push({ ...photo, from: id });
        } catch {
          photoFailed = true;
        }
      }
      const { food, travel, visitId } = copied.length ? build(copied) : draft;
      const saved = await store.write(snap, { food, travels: [{ tripId, journal: travel }], message: `travel-meal: link ${momentId}` });
      return okResponse(
        200,
        {
          visit: readable(food.visits.find((v) => v.id === visitId)),
          travel,
          travel_version: saved.travelVersions?.[tripId] ?? null,
          food_version: saved.foodVersion,
          photo_failed: photoFailed,
        },
        PRIVATE_CACHE,
      );
    }

    // DELETE: the visit is tombstoned for good and the moment stops pointing at it.
    if (!moment.meal) return okResponse(200, { visit: null, travel: snap.travel.journal, travel_version: snap.travel.version, food_version: snap.food.version }, PRIVATE_CACHE);
    const food = {
      ...snap.food.journal,
      visits: snap.food.journal.visits.map((v) => (v.id === moment.meal.food_visit_id && !isDeletedRecord(v) ? { ...v, status: "deleted" } : v)),
    };
    const travel = {
      ...snap.travel.journal,
      revision,
      moments: snap.travel.journal.moments.map(({ meal, ...m }) => (m.id === momentId || !meal ? m : { ...m, meal })),
    };
    const saved = await store.write(snap, { food, travels: [{ tripId, journal: travel }], message: `travel-meal: unlink ${momentId}` });
    return okResponse(
      200,
      { visit: null, travel, travel_version: saved.travelVersions?.[tripId] ?? null, food_version: saved.foodVersion },
      PRIVATE_CACHE,
    );
  }, { ...deps, createTravelRepository: deps.createTravelRepository ?? (() => null) });
}

export default createTravelMealHandler();
