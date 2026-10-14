import { scaleIngredient } from "../../apps/life/js/food-journal/view.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyJournal,
  newVisit,
  newDish,
  menuDishes,
  importDayOne,
  nearbyVenues,
  dayOneDate,
} from "../../apps/life/js/food-journal/model.js";
import {
  mergeCapture,
  captureBatches,
} from "../../apps/life/js/food-journal/capture.js";
import {
  validateFoodJournal,
  readableJournal,
} from "../../netlify/functions/_shared/food-journal-schema.mjs";
import { createFoodJournalHandler } from "../../netlify/functions/food-journal.mjs";
import { createFoodJournalMediaHandler } from "../../netlify/functions/food-journal-media.mjs";
import { createFoodJournalProcessHandler } from "../../netlify/functions/_shared/food-journal-process.mjs";
import { createFoodJournalAssistHandler } from "../../netlify/functions/food-journal-assist.mjs";
import { createFoodJournalRunHandler } from "../../netlify/functions/food-journal-run.mjs";
import { createMemoryChatJobStore } from "../../netlify/functions/_shared/chat-job-store.mjs";
import { resetRateLimits } from "../../netlify/functions/_shared/travel-rate-limit.mjs";

const env = {
  LIFE_HUB_PASSPHRASE_HASH: "configured",
  SESSION_SECRET: "x".repeat(32),
};
export function fixture() {
  const v = newVisit();
  v.title = "Tapas night";
  v.venue = {
    name: "Test restaurant",
    address: "Sydney",
    lat: -33.86,
    lon: 151.21,
  };
  v.dishes = [
    {
      ...newDish(),
      title: "Lasagne",
      cuisine: "Italian",
      tags: ["Comfort food"],
      rating: 5,
    },
    { ...newDish(), title: "Croquettes", cuisine: "Spanish", rating: 3 },
  ];
  v.menu_text = "Lasagne $25";
  return { ...emptyJournal(), visits: [v] };
}
function repo(initial = emptyJournal()) {
  let journal = structuredClone(initial),
    version = "a".repeat(40);
  return {
    async getJournal() {
      return { journal: structuredClone(journal), version };
    },
    async saveJournal(next, expected) {
      assert.equal(expected, version);
      journal = structuredClone(next);
      version = version === "a".repeat(40) ? "b".repeat(40) : "c".repeat(40);
      return { journal: structuredClone(journal), version };
    },
  };
}
const req = (method, body, path = "food-journal") =>
  new Request(`https://example.test/api/${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const deps = (r, more = {}) => ({
  env,
  verifySessionToken: () => ({ valid: true }),
  createFoodJournalRepository: () => r,
  ...more,
});

test("Custom Menu combines independent filters and searchable dish text", () => {
  const j = fixture();
  assert.equal(menuDishes(j).length, 2);
  assert.equal(
    menuDishes(j, {
      query: "Lasagne",
      cuisine: "Italian",
      meal: "Dinner",
      rating: 4,
      tag: "Comfort food",
    }).length,
    1,
  );
  assert.equal(menuDishes(j, { rating: 4 }).length, 1);
  assert.equal(menuDishes(j, { tag: "missing" }).length, 0);
  j.visits[0].status = "deleted";
  assert.equal(menuDishes(j).length, 0);
});
test("schema rejects invalid ratings, dates, duplicate dishes and foreign photo keys", () => {
  for (const mutate of [
    (j) => (j.visits[0].dishes[0].rating = 6),
    (j) => (j.visits[0].date = "2026-02-30"),
    (j) => j.visits[0].dishes.push(j.visits[0].dishes[0]),
    (j) =>
      j.visits[0].dishes[0].photos.push({
        id: "p",
        key: "knowledge/private.jpg",
      }),
  ]) {
    const j = fixture();
    mutate(j);
    assert.throws(() => validateFoodJournal(j));
  }
  assert.equal(validateFoodJournal(fixture()).visits.length, 1);
});
test("Day One review preserves complete prose and source ids, skips duplicates and reserved deleted sources", () => {
  const payload = {
    entries: [
      {
        uuid: "123",
        creationDate: "2026-01-12T12:00:00Z",
        text: "# Noodles\nLoved lunch",
        tags: ["food"],
        location: { placeName: "Cafe", latitude: 1, longitude: 2 },
        photos: [{ filename: "a.jpeg" }],
      },
      { uuid: "123", creationDate: "2026-01-12", text: "duplicate" },
      { text: "bad" },
    ],
  };
  const result = importDayOne(payload, emptyJournal());
  assert.equal(result.visits.length, 1);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.visits[0].notes, "# Noodles\nLoved lunch");
  assert.equal(result.visits[0].import_media[0].filename, "a.jpeg");
  assert.equal(
    importDayOne(
      {
        entries: [
          {
            uuid: "photo-md5",
            creationDate: "2026-01-13T12:00:00Z",
            text: "With md5",
            photos: [
              {
                identifier: "ABC",
                md5: "deadbeef",
                type: "jpeg",
              },
            ],
          },
        ],
      },
      emptyJournal(),
    ).visits[0].import_media[0].md5,
    "deadbeef",
  );
  assert.equal(
    importDayOne(payload, {
      ...emptyJournal(),
      reserved_source_ids: ["dayone:123"],
    }).visits.length,
    0,
  );
});
test("Day One bulk import keeps every available visit without requiring photos", () => {
  const payload = {
    entries: Array.from({ length: 5 }, (_, i) => ({
      uuid: `bulk-${i}`,
      creationDate: `2026-01-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
      text: `Meal ${i}\nNotes`,
      photos: i % 2 ? [{ filename: `p${i}.jpg` }] : [],
    })),
  };
  const { visits, skipped } = importDayOne(payload, emptyJournal());
  assert.equal(visits.length, 5);
  assert.equal(skipped.length, 0);
  assert.ok(visits.every((v) => Array.isArray(v.dishes[0].photos)));
  assert.ok(visits.every((v) => v.dishes[0].photos.length === 0));
  const journal = { ...emptyJournal(), visits: [...visits] };
  assert.equal(validateFoodJournal(journal).visits.length, 5);
});
test("capture fills blanks but preserves personal notes and ratings", () => {
  const j = fixture(),
    v = j.visits[0];
  const d = v.dishes[0];
  d.notes = "My own opinion";
  const next = mergeCapture(v, {
    title: "Other title",
    venue: { name: "Other", address: "Other" },
    menu_text: "replacement",
    dishes: [
      {
        title: "Lasagne",
        cuisine: "Other",
        meal_type: "Lunch",
        tags: ["new"],
        notes: "model opinion",
      },
      { title: "Salad", cuisine: "", meal_type: "Dinner", tags: [], notes: "" },
    ],
  });
  assert.equal(next.title, "Tapas night");
  assert.equal(next.dishes[0].notes, "My own opinion");
  assert.equal(next.dishes[0].rating, 5);
  assert.equal(next.dishes.length, 3);
  assert.equal(next.menu_text, "Lasagne $25");
});
test("venue suggestions use photo GPS and exclude distant or deleted venues", () => {
  const j = fixture();
  assert.equal(nearbyVenues(j, { lat: -33.86, lon: 151.21 }).length, 1);
  assert.equal(nearbyVenues(j, { lat: 0, lon: 0 }).length, 0);
  assert.equal(nearbyVenues(j, null).length, 0);
});
test("authenticated endpoint saves, rejects stale versions and reserves tombstones", async () => {
  const r = repo(fixture()),
    h = createFoodJournalHandler(deps(r));
  let res = await h(req("GET"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const first = (await res.json()).data;
  res = await h(
    req("PUT", { journal: first.journal, if_version: "f".repeat(40) }),
  );
  assert.equal(res.status, 409);
  first.journal.visits[0].source_id = "dayone:123";
  first.journal.visits[0].status = "deleted";
  res = await h(
    req("PUT", { journal: first.journal, if_version: first.version }),
  );
  assert.equal(res.status, 200);
  const deleted = (await res.json()).data;
  assert.equal(deleted.journal.visits.length, 0);
  assert.deepEqual(deleted.journal.reserved_source_ids, ["dayone:123"]);
  const next = fixture();
  next.visits[0].source_id = "dayone:123";
  res = await h(req("PUT", { journal: next, if_version: deleted.version }));
  assert.equal(res.status, 409);
});
test("private journal and media reject signed out requests", async () => {
  for (const factory of [
    createFoodJournalHandler,
    createFoodJournalMediaHandler,
  ]) {
    const h = factory(
      deps(repo(), { verifySessionToken: () => ({ valid: false }) }),
    );
    assert.equal((await h(req("GET"))).status, 401);
  }
});
test("media reads require a live journal reference and uploads use food namespace", async () => {
  resetRateLimits();
  const j = fixture();
  j.visits[0].dishes[0].photos = [
    { id: "photo_1", key: "food/photos/photo_1.jpg" },
  ];
  const h = createFoodJournalMediaHandler(
    deps(repo(j), {
      signPut: async (o) => {
        assert.match(o.key, /^food\/photos\//);
        return "https://r2.test/put";
      },
      signGet: async () => "https://r2.test/get",
      env: {
        ...env,
        R2_ACCOUNT_ID: "a",
        R2_BUCKET: "b",
        R2_ACCESS_KEY_ID: "k",
        R2_SECRET_ACCESS_KEY: "s",
      },
    }),
  );
  assert.equal(
    (await h(req("POST", { action: "read", key: "food/photos/other.jpg" })))
      .status,
    404,
  );
  assert.equal(
    (await h(req("POST", { action: "read", key: "food/photos/photo_1.jpg" })))
      .status,
    200,
  );
  assert.equal(
    (await h(req("POST", { action: "upload", mime: "image/jpeg", size: 20 })))
      .status,
    200,
  );
});
test("background capture lifecycle polls a result and strips input image payloads", async () => {
  resetRateLimits();
  const store = createMemoryChatJobStore();
  const d = deps(repo(), {
    getStore: async () => store,
    complete: async () =>
      JSON.stringify({
        title: "Food",
        venue: { name: "", address: "" },
        menu_text: "Menu",
        dishes: [],
      }),
  });
  const queue = createFoodJournalAssistHandler(d),
    runner = createFoodJournalRunHandler(d);
  const created = (
    await (
      await queue(
        req(
          "POST",
          {
            action: "capture",
            images: [{ role: "menu", mime: "image/jpeg", data: "YWJj" }],
          },
          "food-journal-assist",
        ),
      )
    ).json()
  ).data;
  const response = await runner(
    new Request("https://example.test/api/food-journal-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: created.id }),
    }),
  );
  assert.equal(response.status, 202);
  const result = (
    await (
      await queue(
        new Request(
          `https://example.test/api/food-journal-assist?id=${created.id}`,
        ),
      )
    ).json()
  ).data;
  assert.equal(result.status, "done");
  assert.equal(result.result.data.draft.menu_text, "Menu");
  assert.equal((await store.get(created.id)).body.input, undefined);
});
test("recipe research accepts ten verified candidates and three sources, rejects fabricated URLs", async () => {
  resetRateLimits();
  const j = fixture(),
    urls = Array.from({ length: 10 }, (_, i) => `https://recipe.test/${i}`);
  const result = {
    candidates: urls.map((url) => ({
      title: "Recipe",
      url,
      reason: "Suitable",
    })),
    shortlist: urls.slice(0, 3),
    recipe: {
      title: "Lasagne",
      servings: 2,
      ingredients: ["100 g pasta"],
      steps: ["Cook the pasta."],
      sources: urls.slice(0, 3).map((url) => ({ title: "Recipe", url })),
    },
  };
  let verified = urls;
  const client = {
    async *streamMessage() {
      yield { type: "sources", sources: verified.map((url) => ({ url })) };
      yield { type: "text", delta: JSON.stringify(result) };
    },
  };
  const h = createFoodJournalProcessHandler(deps(repo(j), { client }));
  const body = { action: "recipe", dish_id: j.visits[0].dishes[0].id };
  assert.equal((await h(req("POST", body))).status, 200);
  verified = [];
  assert.equal((await h(req("POST", body))).status, 503);
});

test("large photo captures batch below request budget and retain the menu in each batch", () => {
  const images = [
    { role: "menu", data: "x".repeat(500000) },
    ...Array.from({ length: 10 }, (_, i) => ({
      role: "dish",
      id: String(i),
      data: "x".repeat(500000),
    })),
  ];
  const batches = captureBatches(images);
  assert.equal(
    batches.flatMap((b) => b.filter((i) => i.role === "dish")).length,
    10,
  );
  assert.ok(
    batches.every(
      (b) =>
        b.length <= 6 && b.reduce((n, i) => n + i.data.length, 0) <= 3500000,
    ),
  );
  assert.ok(batches.every((b) => b.some((i) => i.role === "menu")));
});
test("capture assigns each photo to the identified dish", () => {
  const v = newVisit(),
    photos = [
      { id: "photo1", key: "food/photos/photo1.jpg" },
      { id: "photo2", key: "food/photos/photo2.jpg" },
    ];
  v.dishes[0].photos = photos;
  const next = mergeCapture(
    v,
    {
      title: "Dinner",
      venue: { name: "", address: "" },
      menu_text: "",
      dishes: [
        {
          title: "Lasagne",
          cuisine: "",
          meal_type: "Dinner",
          tags: [],
          notes: "",
          photo_ids: ["photo1"],
        },
        {
          title: "Salad",
          cuisine: "",
          meal_type: "Dinner",
          tags: [],
          notes: "",
          photo_ids: ["photo2"],
        },
      ],
    },
    photos,
  );
  assert.deepEqual(
    next.dishes.map((d) => d.photos.map((p) => p.id)),
    [["photo1"], ["photo2"]],
  );
});

test("cooking quantities scale decimals and common fractions without altering instructions", () => {
  assert.equal(scaleIngredient("1/2 cup flour", 2), "1 cup flour");
  assert.equal(scaleIngredient("1 1/2 cups stock", 2), "3 cups stock");
  assert.equal(scaleIngredient("½ tsp salt", 2), "1 tsp salt");
  assert.equal(scaleIngredient("100 g pasta", 2), "200 g pasta");
  assert.equal(scaleIngredient("Salt to taste", 2), "Salt to taste");
});

test("schema rejects missing ids and malformed optional recipe research", () => {
  const j = fixture();
  delete j.visits[0].id;
  assert.throws(() => validateFoodJournal(j), /identifier/);
  const k = fixture();
  k.recipes = [
    {
      id: "recipe_test",
      dish_id: k.visits[0].dishes[0].id,
      title: "Lasagne",
      servings: 2,
      ingredients: ["100 g pasta"],
      steps: ["Cook."],
      sources: [],
      candidates: { broken: true },
    },
  ];
  assert.throws(() => validateFoodJournal(k), /research/);
});

test("a platter photo stays associated with every identified dish", () => {
  const v = newVisit(),
    photo = { id: "platter", key: "food/photos/platter.jpg" };
  const next = mergeCapture(
    v,
    {
      title: "Tapas",
      venue: { name: "", address: "" },
      menu_text: "",
      dishes: ["Croquettes", "Olives"].map((title) => ({
        title,
        cuisine: "Spanish",
        meal_type: "Dinner",
        tags: [],
        notes: "",
        photo_ids: ["platter"],
      })),
    },
    [photo],
  );
  assert.deepEqual(
    next.dishes.map((d) => d.photos.map((p) => p.id)),
    [["platter"], ["platter"]],
  );
});

test("capture preserves personal notes on a dish whose title is still blank", () => {
  const v = newVisit();
  v.dishes[0].notes = "My own note";
  v.dishes[0].rating = 4;
  const next = mergeCapture(v, {
    title: "Meal",
    venue: { name: "", address: "" },
    menu_text: "",
    dishes: [
      {
        title: "Soba",
        cuisine: "Japanese",
        meal_type: "Dinner",
        tags: [],
        notes: "Model note",
      },
    ],
  });
  assert.equal(next.dishes[0].notes, "My own note");
  assert.equal(next.dishes[0].rating, 4);
});

test("Day One import uses each entry timezone across midnight and preserves date only values", () => {
  assert.equal(
    dayOneDate({
      creationDate: "2026-10-01T21:00:00Z",
      timeZone: "Australia/Sydney",
    }),
    "2026-10-02",
  );
  assert.equal(
    dayOneDate({
      creationDate: "2026-10-01T21:00:00Z",
      timeZone: "America/New_York",
    }),
    "2026-10-01",
  );
  assert.equal(dayOneDate({ creationDate: "2026-10-01" }), "2026-10-01");
  assert.equal(dayOneDate({ creationDate: "2026-02-30T21:00:00Z" }), "");
});

test("portion scaling handles ranges, mixed unicode fractions and compact units", () => {
  assert.equal(scaleIngredient("2 to 3 onions", 2), "4 to 6 onions");
  assert.equal(scaleIngredient("2–3 onions", 2), "4 to 6 onions");
  assert.equal(scaleIngredient("1½ cups flour", 2), "3 cups flour");
  assert.equal(scaleIngredient("100g pasta", 2), "200g pasta");
});
