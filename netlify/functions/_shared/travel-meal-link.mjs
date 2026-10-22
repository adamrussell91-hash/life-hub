// A Travel meal moment and its Food Journal visit. Food Journal owns the
// meal; the moment only points at it. These helpers are pure so the
// endpoint can read both files, change them and commit once.
import { isDeletedRecord } from "./record-liveness.mjs";

// A deleted visit keeps its source id reserved, so a re-link after an unlink
// takes the next free one: travel:<trip>:<moment>:2, :3 and so on.
const SOURCE = /^travel:(trp_[a-z0-9_]{4,64}):(mom_[a-z0-9_]{4,64})(?::\d{1,4})?$/i;

export const travelSourceId = (tripId, momentId) => `travel:${tripId}:${momentId}`;

export function parseTravelSourceId(sourceId) {
  const m = SOURCE.exec(String(sourceId || ""));
  return m ? { tripId: m[1], momentId: m[2] } : null;
}

const DISH_FIELDS = ["title", "title_en", "meal_type", "rating", "cuisine", "tags", "notes", "notes_en", "ingredients", "ingredients_original"];

// Dish ids are unique across the whole journal, tombstones included.
// An id already taken, even by an earlier dish in the same save, starts a new dish.
function dishFrom(input, old, newId, taken) {
  const fresh = !input.id || taken.has(input.id);
  const id = fresh ? newId("dish") : input.id;
  const dish = old && !fresh ? structuredClone(old) : { id, cuisine: "", tags: [], notes: "", ingredients: "", rating: null, meal_type: "Dinner", photos: [] };
  for (const key of DISH_FIELDS) if (input[key] !== undefined) dish[key] = input[key];
  return dish;
}

export function upsertLinkedVisit(journal, { tripId, moment, food, photos, visitId, newId }) {
  const next = structuredClone(journal);
  const base = travelSourceId(tripId, moment.id);
  const forMoment = (v) => {
    const s = parseTravelSourceId(v.source_id);
    return s?.tripId === tripId && s.momentId === moment.id;
  };
  const live = next.visits.filter((v) => !isDeletedRecord(v));
  let visit = (visitId && live.find((v) => v.id === visitId)) || live.find(forMoment);
  if (!visit) {
    const taken = new Set(next.visits.map((v) => v.source_id));
    let sourceId = base;
    for (let n = 2; taken.has(sourceId); n += 1) sourceId = `${base}:${n}`;
    visit = { id: newId("visit"), source_id: sourceId, title: "", notes: "", menu_text: "", dishes: [], venue: { name: "", address: "" } };
    next.visits.push(visit);
  }
  visit.date = moment.local_date;
  visit.title = String(food.title ?? visit.title ?? "").slice(0, 200);
  visit.venue = {
    ...visit.venue,
    name: food.venue_name ?? moment.place?.name ?? visit.venue.name ?? "",
    address: visit.venue.address ?? "",
    ...(moment.coordinates ? { lat: moment.coordinates.lat, lon: moment.coordinates.lon } : {}),
  };
  const before = new Map(visit.dishes.map((d) => [d.id, d]));
  const taken = new Set(next.visits.filter((v) => v !== visit).flatMap((v) => v.dishes.map((d) => d.id)));
  visit.dishes = food.dishes.map((d) => {
    const dish = dishFrom(d, before.get(d.id), newId, taken);
    taken.add(dish.id);
    return dish;
  });
  // New copies of the moment's photos go on the first dish, once each.
  const first = visit.dishes[0];
  if (first) for (const p of photos) if (!visit.dishes.some((d) => d.photos.some((q) => q.key === p.key))) first.photos.push(p);
  return { journal: next, visitId: visit.id };
}

export function pickFoodPhotoKey(media) {
  const sized = Object.entries(media?.derivative_keys || {})
    .map(([w, key]) => [Number(String(w).replace(/\D/g, "")), key])
    .filter(([w]) => Number.isFinite(w) && w <= 1600)
    .sort((a, b) => b[0] - a[0]);
  if (sized.length) return sized[0][1];
  if (media?.content_type === "image/jpeg" && media.original_key) return media.original_key;
  return null;
}
