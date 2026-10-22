import test from "node:test";
import assert from "node:assert/strict";
import { validateFoodJournal } from "../../netlify/functions/_shared/food-journal-schema.mjs";
import {
  travelSourceId,
  parseTravelSourceId,
  upsertLinkedVisit,
  pickFoodPhotoKey,
} from "../../netlify/functions/_shared/travel-meal-link.mjs";

const moment = {
  id: "mom_abcd1234", leg_id: "leg_x1234", local_date: "2026-11-03",
  local_time: "13:10", media_ids: [], display_order: 1, lifecycle: "live",
  author: "adam", place: { name: "Mercado Test" }, coordinates: { lat: 40.41, lon: -3.7 },
};
const food = {
  title: "Market lunch",
  dishes: [{ id: "dish_1", title: "Tortilla", title_en: "Spanish omelette", meal_type: "Lunch", rating: 4, cuisine: "", tags: [], notes: "", ingredients: "", photos: [] }],
};

test("source ids name the trip and the moment and parse back", () => {
  assert.equal(travelSourceId("trp_test1", "mom_abcd1234"), "travel:trp_test1:mom_abcd1234");
  assert.deepEqual(parseTravelSourceId("travel:trp_test1:mom_abcd1234"), { tripId: "trp_test1", momentId: "mom_abcd1234" });
  assert.equal(parseTravelSourceId("dayone:9"), null);
});

test("a new linked visit takes date, venue and place from the moment", () => {
  const journal = { schema_version: 1, visits: [], recipes: [] };
  const { journal: next, visitId } = upsertLinkedVisit(journal, { tripId: "trp_test1", moment, food, photos: [], newId: () => "visit_new" });
  const v = next.visits[0];
  assert.equal(visitId, "visit_new");
  assert.equal(v.source_id, "travel:trp_test1:mom_abcd1234");
  assert.equal(v.date, "2026-11-03");
  assert.deepEqual(v.venue, { name: "Mercado Test", address: "", lat: 40.41, lon: -3.7 });
  assert.equal(v.dishes[0].title_en, "Spanish omelette");
});

test("updating keeps the visit id, its other fields and photos already copied", () => {
  const journal = { schema_version: 1, visits: [], recipes: [] };
  let { journal: next } = upsertLinkedVisit(journal, { tripId: "trp_test1", moment, food, photos: [{ id: "p1", key: "food/photos/p1.jpg" }], newId: () => "visit_new" });
  next.visits[0].editorial = { headline: "H", standfirst: "S", pull_quote: "", basis: "b" };
  const edited = structuredClone(food);
  edited.dishes[0].rating = 5;
  ({ journal: next } = upsertLinkedVisit(next, { tripId: "trp_test1", moment, food: edited, photos: [], visitId: "visit_new", newId: () => "never" }));
  assert.equal(next.visits.length, 1);
  assert.equal(next.visits[0].dishes[0].rating, 5);
  assert.equal(next.visits[0].editorial.headline, "H");
  assert.deepEqual(next.visits[0].dishes[0].photos, [{ id: "p1", key: "food/photos/p1.jpg" }]);
});

test("the photo copied is the biggest derivative up to 1600, else a JPEG original", () => {
  assert.equal(pickFoodPhotoKey({ derivative_keys: { "320": "travel/journal/trp_test1/med_a/der/320.jpg", "960": "travel/journal/trp_test1/med_a/der/960.jpg", "1600": "travel/journal/trp_test1/med_a/der/1600.jpg" } }), "travel/journal/trp_test1/med_a/der/1600.jpg");
  assert.equal(pickFoodPhotoKey({ content_type: "image/jpeg", original_key: "travel/journal/t/a.jpg" }), "travel/journal/t/a.jpg");
  assert.equal(pickFoodPhotoKey({ content_type: "audio/mp4", original_key: "travel/journal/t/a.m4a" }), null);
});

test("the 1600 derivative is skipped when only smaller ones exist, and the largest small one wins", () => {
  assert.equal(pickFoodPhotoKey({ derivative_keys: { "320": "travel/journal/trp_test1/med_a/der/320.jpg", "960": "travel/journal/trp_test1/med_a/der/960.jpg" } }), "travel/journal/trp_test1/med_a/der/960.jpg");
});

test("a linked visit passes the Food Journal validator, with missing dish ids filled", () => {
  const journal = { schema_version: 1, visits: [], recipes: [] };
  const open = structuredClone(food);
  delete open.dishes[0].id;
  let n = 0;
  const { journal: next } = upsertLinkedVisit(journal, { tripId: "trp_test1", moment, food: open, photos: [{ id: "p1", key: "food/photos/p1.jpg", from: "travel/journal/trp_test1/med_a/der/1600.jpg" }], newId: (p) => `${p}_${++n}` });
  assert.ok(next.visits[0].dishes[0].id.startsWith("dish_"));
  assert.doesNotThrow(() => validateFoodJournal(next));
});
