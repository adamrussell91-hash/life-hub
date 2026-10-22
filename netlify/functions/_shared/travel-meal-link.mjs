// A Travel meal moment and its Food Journal visit. Food Journal owns the
// meal; the moment only points at it. These helpers are pure so the
// endpoint can read both files, change them and commit once.
const SOURCE = /^travel:(trp_[a-z0-9_]{4,64}):(mom_[a-z0-9_]{4,64})$/i;

export const travelSourceId = (tripId, momentId) => `travel:${tripId}:${momentId}`;

export function parseTravelSourceId(sourceId) {
  const m = SOURCE.exec(String(sourceId || ""));
  return m ? { tripId: m[1], momentId: m[2] } : null;
}

const DISH_FIELDS = ["title", "title_en", "meal_type", "rating", "cuisine", "tags", "notes", "notes_en", "ingredients", "ingredients_original"];

function dishFrom(input, old, newId) {
  const dish = old ? structuredClone(old) : { id: input.id || newId("dish"), cuisine: "", tags: [], notes: "", ingredients: "", rating: null, meal_type: "Dinner", photos: [] };
  for (const key of DISH_FIELDS) if (input[key] !== undefined) dish[key] = input[key];
  return dish;
}

export function upsertLinkedVisit(journal, { tripId, moment, food, photos, visitId, newId }) {
  const next = structuredClone(journal);
  const sourceId = travelSourceId(tripId, moment.id);
  let visit = next.visits.find((v) => v.id === visitId || v.source_id === sourceId);
  if (!visit) {
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
  visit.dishes = food.dishes.map((d) => dishFrom(d, before.get(d.id), newId));
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
