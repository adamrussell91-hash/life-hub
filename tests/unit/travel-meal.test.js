import test from "node:test";
import assert from "node:assert/strict";
import { createTravelMealHandler } from "../../netlify/functions/travel-meal.mjs";
import { createFoodJournalHandler } from "../../netlify/functions/food-journal.mjs";
import { validateJournal } from "../../netlify/functions/_shared/travel-journal-schema.mjs";
import { validateFoodJournal, readableJournal } from "../../netlify/functions/_shared/food-journal-schema.mjs";
import { parseTravelSourceId } from "../../netlify/functions/_shared/travel-meal-link.mjs";

const env = { LIFE_HUB_PASSPHRASE_HASH: "configured", SESSION_SECRET: "x".repeat(32) };
const TRAVEL_V = "a".repeat(40);
const FOOD_V = "b".repeat(40);

function trip(author = "adam") {
  const moment = { id: "mom_abcd1234", leg_id: "leg_test01", local_date: "2026-11-03", media_ids: [], display_order: 1, lifecycle: "live", place: { name: "Mercado Test" } };
  if (author !== undefined) moment.author = author;
  return {
    id: "jrn_abcd", schema_version: 1, trip_id: "trp_test1", title: "", revision: 0, lifecycle: "live",
    leg_ids: ["leg_test01"], preferences: {},
    legs: [{ id: "leg_test01", trip_id: "trp_test1", destination: "Test", timezone: "UTC", pattern_id: "generic", order: 0, lifecycle: "live" }],
    days: [], media: [], transitions: [], operations: [],
    moments: [moment],
  };
}

// Versions stay fixed so a test can save twice; validation runs as the real store does.
function store(travel, food = { schema_version: 1, visits: [], recipes: [] }) {
  const state = { travel: validateJournal(travel), food, writes: 0 };
  return {
    state,
    async read() {
      return { tripId: "trp_test1", base: {}, travel: { journal: structuredClone(state.travel), version: TRAVEL_V }, food: { journal: structuredClone(state.food), version: FOOD_V } };
    },
    assertVersions(snap, v) {
      if (v.travel !== TRAVEL_V || v.food !== FOOD_V) throw Object.assign(new Error("conflict"), { status: 409, code: "conflict" });
    },
    async write(_snap, { food, travels }) {
      validateFoodJournal(food);
      for (const t of travels) validateJournal(t.journal);
      state.food = food;
      state.travel = travels[0].journal;
      state.writes += 1;
      return { commitSha: "d".repeat(40), foodVersion: "e".repeat(40) };
    },
  };
}
const deps = (s, more = {}) => ({ env, verifySessionToken: () => ({ valid: true }), createMealLinkStore: () => s, copyPhoto: async () => null, ...more });
const req = (method, query, body) => new Request(`https://example.test/api/travel-meal?${query}`, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const Q = "trip=trp_test1&moment=mom_abcd1234";
const food = { title: "Market lunch", dishes: [{ id: "dish_1", title: "Tortilla", meal_type: "Lunch", rating: 4 }] };
const versions = { travel_version: TRAVEL_V, food_version: FOOD_V };

test("PUT links a moment to a new visit in one write", async () => {
  const s = store(trip());
  const h = createTravelMealHandler(deps(s));
  const res = await h(req("PUT", Q, { ...versions, food, extras: { mood: "buzzing" } }));
  assert.equal(res.status, 200);
  assert.equal(s.state.writes, 1);
  const visit = s.state.food.visits[0];
  assert.equal(visit.source_id, "travel:trp_test1:mom_abcd1234");
  assert.deepEqual(s.state.travel.moments[0].meal, { food_visit_id: visit.id, mood: "buzzing" });
  assert.equal((await res.json()).data.food_version, "e".repeat(40));
});

test("a second PUT updates the same visit", async () => {
  const s = store(trip());
  const h = createTravelMealHandler(deps(s));
  await h(req("PUT", Q, { ...versions, food }));
  const id = s.state.food.visits[0].id;
  await h(req("PUT", Q, { ...versions, food: { ...food, title: "Long lunch" } }));
  assert.equal(s.state.food.visits.length, 1);
  assert.equal(s.state.food.visits[0].id, id);
  assert.equal(s.state.food.visits[0].title, "Long lunch");
});

test("Corey's moments cannot be meals", async () => {
  const s = store(trip("corey"));
  const res = await createTravelMealHandler(deps(s))(req("PUT", Q, { ...versions, food }));
  assert.equal(res.status, 403);
  assert.equal(s.state.writes, 0);
});

test("an older moment with no author is Adam's", async () => {
  const s = store(trip(undefined));
  const res = await createTravelMealHandler(deps(s))(req("PUT", Q, { ...versions, food }));
  assert.equal(res.status, 200);
  assert.equal(s.state.writes, 1);
});

test("a stale version writes nothing", async () => {
  const s = store(trip());
  const res = await createTravelMealHandler(deps(s))(req("PUT", Q, { ...versions, travel_version: "f".repeat(40), food }));
  assert.equal(res.status, 409);
  assert.equal(s.state.writes, 0);
});

test("PUT needs at least one dish; unknown or deleted moments are 404", async () => {
  const t = trip();
  const s = store(t);
  const h = createTravelMealHandler(deps(s));
  assert.equal((await h(req("PUT", Q, { ...versions, food: { title: "x", dishes: [] } }))).status, 400);
  assert.equal((await h(req("GET", "trip=trp_test1&moment=mom_zzzz9999"))).status, 404);
  assert.equal((await h(req("GET", "trip=trp_test1"))).status, 400);
  s.state.travel.moments[0].lifecycle = "deleted";
  assert.equal((await h(req("PUT", Q, { ...versions, food }))).status, 404);
  assert.equal(s.state.writes, 0);
});

test("GET returns the linked visit; DELETE tombstones it and clears the link", async () => {
  const s = store(trip());
  const h = createTravelMealHandler(deps(s));
  await h(req("PUT", Q, { ...versions, food }));
  let res = await h(req("GET", Q));
  const got = (await res.json()).data;
  assert.equal(got.visit.dishes[0].title, "Tortilla");
  assert.equal(got.travel_version, TRAVEL_V);
  assert.equal(got.food_version, FOOD_V);
  res = await h(req("DELETE", Q, versions));
  assert.equal(res.status, 200);
  assert.equal(s.state.travel.moments[0].meal, undefined);
  assert.equal(s.state.food.visits[0].status, "deleted");
  res = await h(req("GET", Q));
  assert.equal((await res.json()).data.visit, null);
});

test("re-linking after unlink makes a new visit, leaves the tombstone, and the Food Journal still saves", async () => {
  const s = store(trip());
  const h = createTravelMealHandler(deps(s));
  await h(req("PUT", Q, { ...versions, food }));
  const oldId = s.state.food.visits[0].id;
  await h(req("DELETE", Q, versions));
  const res = await h(req("PUT", Q, { ...versions, food: { ...food, title: "Second try" } }));
  assert.equal(res.status, 200);
  const [old, fresh] = s.state.food.visits;
  assert.equal(s.state.food.visits.length, 2);
  assert.equal(old.id, oldId);
  assert.equal(old.status, "deleted");
  assert.equal(old.title, "Market lunch");
  assert.notEqual(fresh.id, oldId);
  assert.equal(fresh.status, undefined);
  assert.equal(fresh.title, "Second try");
  assert.equal(s.state.travel.moments[0].meal.food_visit_id, fresh.id);
  assert.notEqual(fresh.source_id, old.source_id);
  assert.deepEqual(parseTravelSourceId(fresh.source_id), { tripId: "trp_test1", momentId: "mom_abcd1234" });

  // The Food Journal refuses a live visit that reuses a tombstone's source_id.
  let journal = s.state.food, version = "c".repeat(40);
  const fj = createFoodJournalHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createFoodJournalRepository: () => ({
      async getJournal() { return { journal: structuredClone(journal), version }; },
      async saveJournal(next) { journal = next; return { journal: next, version: "9".repeat(40) }; },
    }),
  });
  const put = await fj(new Request("https://example.test/api/food-journal", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ journal: readableJournal(s.state.food), if_version: version }),
  }));
  assert.equal(put.status, 200);
});

test("a visit deleted in the Food Journal is not revived by the next Travel save", async () => {
  const s = store(trip());
  const h = createTravelMealHandler(deps(s));
  await h(req("PUT", Q, { ...versions, food }));
  s.state.food.visits[0].status = "deleted";
  await h(req("PUT", Q, { ...versions, food }));
  assert.equal(s.state.food.visits.length, 2);
  assert.equal(s.state.food.visits[0].status, "deleted");
  assert.equal(s.state.travel.moments[0].meal.food_visit_id, s.state.food.visits[1].id);
});

test("a failed photo copy still saves the meal", async () => {
  const t = trip();
  t.media = [{ id: "med_abcd1234", trip_id: "trp_test1", lifecycle: "live", content_type: "image/jpeg", original_key: "travel/journal/trp_test1/a.jpg" }];
  t.moments[0].media_ids = ["med_abcd1234"];
  const s = store(t);
  const h = createTravelMealHandler(deps(s, { copyPhoto: async () => { throw new Error("r2 down"); } }));
  const res = await h(req("PUT", Q, { ...versions, food }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.photo_failed, true);
  assert.equal(s.state.writes, 1);
});

test("photos copy once, under Food Journal names; deleted and audio media are skipped", async () => {
  const t = trip();
  t.media = [
    { id: "med_live0001", trip_id: "trp_test1", lifecycle: "live", content_type: "image/jpeg", original_key: "travel/journal/trp_test1/a.jpg" },
    { id: "med_gone0001", trip_id: "trp_test1", lifecycle: "deleted", content_type: "image/jpeg", original_key: "travel/journal/trp_test1/b.jpg" },
    { id: "med_audio001", trip_id: "trp_test1", lifecycle: "live", content_type: "audio/mp4", original_key: "travel/journal/trp_test1/c.m4a", derivative_keys: { w800: "travel/journal/trp_test1/c-800.jpg" } },
  ];
  t.moments[0].media_ids = ["med_live0001", "med_gone0001", "med_audio001"];
  const s = store(t);
  const gets = [];
  const puts = [];
  const r2 = {
    R2_ACCOUNT_ID: "acct", R2_BUCKET: "bucket", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret",
  };
  const h = createTravelMealHandler({
    env: { ...env, ...r2 },
    verifySessionToken: () => ({ valid: true }),
    createMealLinkStore: () => s,
    getObject: async ({ key }) => { gets.push(key); return Buffer.from([0xff, 0xd8, 0xff]); },
    putObject: async ({ key, contentType }) => { puts.push({ key, contentType }); },
  });
  await h(req("PUT", Q, { ...versions, food }));
  assert.deepEqual(gets, ["travel/journal/trp_test1/a.jpg"]);
  const [photo] = s.state.food.visits[0].dishes[0].photos;
  assert.match(photo.id, /^photo_[0-9a-f-]{36}$/);
  assert.equal(photo.key, `food/photos/${photo.id}.jpg`);
  assert.equal(photo.from, "med_live0001");
  assert.deepEqual(puts, [{ key: photo.key, contentType: "image/jpeg" }]);
  await h(req("PUT", Q, { ...versions, food }));
  assert.equal(gets.length, 1);
  assert.equal(s.state.food.visits[0].dishes[0].photos.length, 1);
});
