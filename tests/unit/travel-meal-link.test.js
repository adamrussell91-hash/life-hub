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

test("a tombstoned visit is never revived; the new one takes a free source id that still parses", () => {
  const journal = { schema_version: 1, visits: [], recipes: [] };
  let { journal: next } = upsertLinkedVisit(journal, { tripId: "trp_test1", moment, food, photos: [], newId: () => "visit_old" });
  next.visits[0].status = "deleted";
  ({ journal: next } = upsertLinkedVisit(next, { tripId: "trp_test1", moment, food, photos: [], newId: () => "visit_two" }));
  next.visits[1].status = "deleted";
  const out = upsertLinkedVisit(next, { tripId: "trp_test1", moment, food, photos: [], visitId: "visit_old", newId: () => "visit_three" });
  const [a, b, c] = out.journal.visits;
  assert.equal(out.visitId, "visit_three");
  assert.equal(a.status, "deleted");
  assert.equal(b.status, "deleted");
  assert.deepEqual([a.source_id, b.source_id, c.source_id], ["travel:trp_test1:mom_abcd1234", "travel:trp_test1:mom_abcd1234:2", "travel:trp_test1:mom_abcd1234:3"]);
  assert.deepEqual(parseTravelSourceId(c.source_id), { tripId: "trp_test1", momentId: "mom_abcd1234" });
  assert.doesNotThrow(() => validateFoodJournal(out.journal));
});

test("an incoming dish id taken elsewhere, or repeated, gets a new dish rather than the old one", () => {
  const journal = { schema_version: 1, visits: [{ id: "visit_other", date: "2026-11-01", title: "", notes: "", menu_text: "", venue: { name: "", address: "" }, dishes: [{ ...food.dishes[0], id: "dish_taken", title: "Other" }] }], recipes: [] };
  let { journal: next } = upsertLinkedVisit(journal, { tripId: "trp_test1", moment, food, photos: [], newId: () => "visit_mine" });
  let n = 0;
  const twice = { title: "x", dishes: [{ id: "dish_1", title: "Kept", rating: 5 }, { id: "dish_1", title: "Repeat" }, { id: "dish_taken", title: "Stolen" }] };
  ({ journal: next } = upsertLinkedVisit(next, { tripId: "trp_test1", moment, food: twice, photos: [], visitId: "visit_mine", newId: (p) => `${p}_n${++n}` }));
  const dishes = next.visits[1].dishes;
  assert.deepEqual(dishes.map((d) => d.id), ["dish_1", "dish_n1", "dish_n2"]);
  assert.equal(dishes[0].title_en, "Spanish omelette");
  assert.equal(dishes[1].title_en, undefined);
  assert.equal(dishes[2].title, "Stolen");
  assert.equal(next.visits[0].dishes[0].title, "Other");
  assert.doesNotThrow(() => validateFoodJournal(next));
});

test("the visit with the linked id wins over another live visit for the moment", () => {
  const blank = { title: "", notes: "", menu_text: "", venue: { name: "", address: "" }, dishes: [] };
  const journal = { schema_version: 1, recipes: [], visits: [
    { ...blank, id: "visit_a", source_id: "travel:trp_test1:mom_abcd1234" },
    { ...blank, id: "visit_b", source_id: "travel:trp_test1:mom_abcd1234:2" },
  ] };
  assert.equal(upsertLinkedVisit(journal, { tripId: "trp_test1", moment, food, photos: [], visitId: "visit_b", newId: () => "never" }).visitId, "visit_b");
  assert.equal(upsertLinkedVisit(journal, { tripId: "trp_test1", moment, food, photos: [], newId: () => "never" }).visitId, "visit_a");
});

test("re-saving a meal flags a counted dish whose name or ingredients changed", () => {
  const journal = { schema_version: 1, visits: [], recipes: [] };
  let { journal: next } = upsertLinkedVisit(journal, { tripId: "trp_test1", moment, food, photos: [], newId: () => "visit_new" });
  next.visits[0].dishes[0].brisket = {
    meal_path: "data/nutrition/2026/11/2026-11-03-lunch.md", portion: "All", portion_fraction: 1,
    counted_at: "2026-11-03T13:30:00.000Z", needs_recount: false,
  };
  const same = upsertLinkedVisit(next, { tripId: "trp_test1", moment, food, photos: [], visitId: "visit_new", newId: () => "x" });
  assert.equal(same.journal.visits[0].dishes[0].brisket.needs_recount, false);
  for (const change of [{ title: "Tortilla de patatas" }, { title_en: "Potato omelette" }, { ingredients: "Egg, potato" }]) {
    const edited = { ...food, dishes: [{ ...food.dishes[0], ...change }] };
    const out = upsertLinkedVisit(next, { tripId: "trp_test1", moment, food: edited, photos: [], visitId: "visit_new", newId: () => "x" });
    assert.equal(out.journal.visits[0].dishes[0].brisket.needs_recount, true, JSON.stringify(change));
  }
  // The rating is not nutrition.
  const rated = { ...food, dishes: [{ ...food.dishes[0], rating: 2 }] };
  const out = upsertLinkedVisit(next, { tripId: "trp_test1", moment, food: rated, photos: [], visitId: "visit_new", newId: () => "x" });
  assert.equal(out.journal.visits[0].dishes[0].brisket.needs_recount, false);
});
