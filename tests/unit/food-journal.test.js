import { scaleIngredient } from "../../apps/life/js/food-journal/view.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyJournal,
  newVisit,
  unshout,
  knownTags,
  newDish,
  menuDishes,
  importDayOne,
  nearbyVenues,
  dayOneDate,
  journalHighlights,
  venueHistory,
  editorialBasis,
  needsEditorial,
  fixupQueue,
  applyFixup,
  firstSentence,
  noteBlocks,
  sharedOnce,
  tidyImports,
  liveVisits,
  dayOneRating,
  dayOneLocation,
  dayOneTitle,
  visitTags,
  tagKey,
  tagLabel,
  plainNotes,
  bookRecipes,
  filterRecipes,
  sortRecipes,
  recipeLetter,
  recipeSections,
} from "../../apps/life/js/food-journal/model.js";
import {
  mergeCapture,
  toggleMenuDish,
  menuDishIndex,
  captureBatches,
} from "../../apps/life/js/food-journal/capture.js";
import {
  validateFoodJournal,
  readableJournal,
} from "../../netlify/functions/_shared/food-journal-schema.mjs";
import { createFoodJournalHandler } from "../../netlify/functions/food-journal.mjs";
import { createFoodJournalMediaHandler } from "../../netlify/functions/food-journal-media.mjs";
import {
  createFoodJournalProcessHandler,
  verbatimQuote,
} from "../../netlify/functions/_shared/food-journal-process.mjs";
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
  const stored = new Map();
  const h = createFoodJournalMediaHandler(
    deps(repo(j), {
      putObject: async (o) => {
        assert.match(o.key, /^food\/photos\//);
        assert.equal(o.contentType, "image/jpeg");
        stored.set(o.key, o.body);
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
  const batch = await h(
    req("POST", {
      action: "read",
      keys: ["food/photos/photo_1.jpg", "food/photos/other.jpg"],
    }),
  );
  assert.equal(batch.status, 200);
  assert.deepEqual((await batch.json()).data.urls, {
    "food/photos/photo_1.jpg": "https://r2.test/get",
  });
  assert.equal(
    (await h(req("POST", { action: "read", keys: ["../secret.jpg"] }))).status,
    400,
  );
  // The photo goes to the function itself, never a browser PUT to R2.
  const upload = (bytes) =>
    h(
      new Request("https://example.test/api/food-journal-media", {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: bytes,
      }),
    );
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const sent = await upload(jpeg);
  assert.equal(sent.status, 200);
  const { key } = (await sent.json()).data;
  assert.match(key, /^food\/photos\/photo_[\w-]+\.jpg$/);
  assert.deepEqual([...stored.get(key)], [...jpeg]);
  assert.equal((await upload(new Uint8Array([1, 2, 3, 4]))).status, 400);
});
// The page lives on life-hub.adam-russell.com and the API on another host, so
// Safari reports "Load failed" for any answer that lacks CORS headers.
test("research start and poll answer the Life Hub origin with CORS headers", async () => {
  resetRateLimits();
  const store = createMemoryChatJobStore();
  const origin = "https://life-hub.adam-russell.com";
  const handler = createFoodJournalAssistHandler(
    deps(repo(), { getStore: async () => store, invokeRun: async () => true }),
  );
  const started = await handler(
    new Request("https://example.test/api/food-journal-assist", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ action: "recipe", dish_id: "dish_1" }),
    }),
  );
  assert.equal(started.status, 202);
  assert.equal(started.headers.get("access-control-allow-origin"), origin);
  assert.equal(started.headers.get("access-control-allow-credentials"), "true");
  const { id } = (await started.json()).data;
  const polled = await handler(
    new Request(`https://example.test/api/food-journal-assist?id=${id}`, {
      headers: { origin },
    }),
  );
  assert.equal(polled.status, 200);
  assert.equal(polled.headers.get("access-control-allow-origin"), origin);
  let limited;
  for (let i = 0; i < 8; i++)
    limited = await handler(
      new Request("https://example.test/api/food-journal-assist", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ action: "recipe", dish_id: "dish_1" }),
      }),
    );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("access-control-allow-origin"), origin);
  assert.match((await limited.json()).error.message, /Try again in a minute/);
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
  const kicked = [];
  const queue = createFoodJournalAssistHandler({
      ...d,
      invokeRun: async (request, id) => {
        kicked.push(id);
        return true;
      },
    }),
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
  assert.deepEqual(kicked, [created.id]);
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

function dated(date, title, venue, dishes) {
  const v = newVisit();
  v.date = date;
  v.title = title;
  v.venue = { name: venue, address: "" };
  v.dishes = dishes.map(([dishTitle, rating, cuisine = ""]) => ({
    ...newDish(),
    title: dishTitle,
    rating,
    cuisine,
  }));
  return v;
}

test("magazine highlights count the month, rank the best dishes and find this day in earlier years", () => {
  const journal = {
    ...emptyJournal(),
    visits: [
      dated("2026-10-16", "Tapas", "Casa", [["Octopus", 5, "Spanish"], ["Bread", 2, "Spanish"]]),
      dated("2026-10-04", "Brunch", "Grove", [["Eggs", 4, "Cafe"]]),
      dated("2026-09-20", "Fish", "Wharf", [["Barramundi", 5, "Seafood"]]),
      dated("2025-10-17", "Ramen", "Ikko", [["Tonkotsu", 4, "Japanese"]]),
      dated("2024-03-01", "Old", "Casa", [["Octopus", 5, "Spanish"]]),
      { ...dated("2026-10-10", "Gone", "Ghost", [["Deleted", 5]]), status: "deleted" },
    ],
  };
  const h = journalHighlights(journal, "2026-10-17");
  assert.equal(h.cover.title, "Tapas");
  assert.deepEqual(h.recent.map((v) => v.title), ["Brunch", "Fish", "Ramen", "Old"]);
  assert.equal(h.month.meals, 2);
  assert.equal(h.month.newPlaces, 1, "Casa was first visited in 2024");
  assert.equal(h.month.average, 3.7);
  assert.equal(h.month.previousAverage, 5);
  assert.equal(h.month.best.dish.title, "Octopus");
  assert.deepEqual(h.yearBest.map((x) => x.dish.title), ["Octopus", "Barramundi", "Eggs", "Bread"]);
  assert.deepEqual(h.cuisines[0], ["Spanish", 2]);
  assert.equal(h.onThisDay.title, "Ramen");
  assert.equal(h.total, 5);
});

test("venue history lists earlier visits and the dish ordered every time", () => {
  const now = dated("2026-10-16", "Tapas", "Casa Olivo", [["Octopus", 5], ["Bread", 2]]);
  const journal = {
    ...emptyJournal(),
    visits: [
      now,
      dated("2025-06-01", "Birthday", "casa olivo ", [["octopus", 5], ["Croquetas", 5]]),
      dated("2024-01-01", "Elsewhere", "Other", [["Octopus", 3]]),
    ],
  };
  const history = venueHistory(journal, now);
  assert.deepEqual(history.visits.map((v) => v.title), ["Birthday"]);
  assert.equal(history.always, "Octopus");
  assert.deepEqual(venueHistory(journal, dated("2026-01-01", "Home", "", [["Toast", 3]])), { visits: [], always: "" });
});

test("editorial basis changes with the words, not the rating, and unfixed imports wait", () => {
  const v = dated("2026-10-16", "Tapas", "Casa", [["Octopus", 5]]);
  v.notes = "The octopus was the standout.";
  const basis = editorialBasis(v);
  assert.equal(needsEditorial(v), true);
  v.editorial = { headline: "H", standfirst: "S", pull_quote: "", basis };
  assert.equal(needsEditorial(v), false);
  v.dishes[0].rating = 3;
  assert.equal(editorialBasis(v), basis);
  v.notes += " More.";
  assert.notEqual(editorialBasis(v), basis);
  const imported = { ...dated("2026-01-01", "Import", "", [["Thing", null]]), source_id: "dayone:x" };
  assert.equal(needsEditorial(imported), false);
  assert.deepEqual(fixupQueue({ ...emptyJournal(), visits: [imported, v] }).map((x) => x.title), ["Import"]);
  assert.equal(needsEditorial({ ...imported, reviewed: true }), true);
  assert.equal(firstSentence("## Title\nFirst line here. Second."), "First line here.");
});

test("Day One Markdown reads as headings and paragraphs, not raw symbols", () => {
  const notes = [
    "## Toastie",
    "",
    "---",
    "",
    "###### Description",
    "Ham, cheese, mustard",
    "",
    "---",
    "",
    "###### Rating and recommendation",
    "4\\.5/5 a good one\\! Would order again\\.",
    "#Lunch",
    "",
    "![](dayone-moment://ABC123)",
  ].join("\n");
  assert.deepEqual(noteBlocks(notes, { title: "Toastie" }), [
    { kind: "heading", text: "Description" },
    { kind: "para", text: "Ham, cheese, mustard" },
    { kind: "heading", text: "Rating and recommendation" },
    { kind: "para", text: "4.5/5 a good one! Would order again." },
  ]);
  assert.equal(firstSentence(notes), "Ham, cheese, mustard 4.5/5 a good one!");
  assert.deepEqual(noteBlocks("So good.#pie Corner pies"), [
    { kind: "para", text: "So good. Corner pies" },
  ]);
  assert.doesNotMatch(plainNotes(notes), /#{2,}|---|\\|dayone-moment/);
  assert.deepEqual(noteBlocks("Plain words.\n\nMore words."), [
    { kind: "para", text: "Plain words." },
    { kind: "para", text: "More words." },
  ]);
});

// Merged Day One entries each carry the same Location and Shared with
// sections; the entry shows them once, after the dishes.
test("merged notes show shared sections once, after the dishes", () => {
  const part = (dish, text, rating) =>
    [
      `### ${dish}`,
      "### Description",
      text,
      "### Rating and recommendation",
      rating,
      "### Location",
      "Ibby's Burgers and Shakes",
      "### Shared with/occasion",
      "Day outing with Redacted!",
    ].join("\n");
  const notes = [
    part("The Cheese", "Smashed beef", "4.5/5 great"),
    part("Nashville Tenders", "Crispy fried", "4/5 very hot"),
    part("Oklahoma", "Double smashed beef", "4/5 was good"),
  ].join("\n\n---\n\n");
  const blocks = sharedOnce(noteBlocks(notes));
  const text = (b) => b.text;
  assert.deepEqual(blocks.map(text), [
    "The Cheese", "Description", "Smashed beef", "Rating and recommendation", "4.5/5 great",
    "Nashville Tenders", "Description", "Crispy fried", "Rating and recommendation", "4/5 very hot",
    "Oklahoma", "Description", "Double smashed beef", "Rating and recommendation", "4/5 was good",
    "Location", "Ibby's Burgers and Shakes",
    "Shared with/occasion", "Day outing with Redacted!",
  ]);
  // A single entry is unchanged.
  const one = noteBlocks(part("The Cheese", "Smashed beef", "4.5/5 great"));
  assert.deepEqual(sharedOnce(one), one);
});
test("fix-up splits dishes, keeps the original text, photos and tags, and never sets ratings", () => {
  const v = { ...dated("2026-09-13", "Late dumplings", "", [["Late dumplings", null]]), source_id: "dayone:x" };
  v.notes = "Late dumplings\nPork gyoza, chilli wontons.";
  v.dishes[0].photos = [{ id: "p1", key: "food/photos/p1.jpg" }];
  v.dishes[0].tags = ["food"];
  const next = applyFixup(v, {
    title: "Dumpling supper",
    venue: { name: "Golden Lantern", address: "Ashfield" },
    dishes: [
      { title: "Pork gyoza", cuisine: "Chinese", meal_type: "Dinner", tags: [], notes: "crisp" },
      { title: "Chilli wontons", cuisine: "Chinese", meal_type: "Brunch", tags: [], notes: "" },
    ],
  });
  assert.equal(next.title, "Dumpling supper");
  assert.equal(next.notes, v.notes);
  assert.deepEqual(next.venue, { name: "Golden Lantern", address: "Ashfield" });
  assert.deepEqual(next.dishes.map((d) => d.title), ["Pork gyoza", "Chilli wontons"]);
  assert.deepEqual(next.dishes[0].photos, v.dishes[0].photos);
  assert.deepEqual(next.dishes[0].tags, ["food"]);
  assert.equal(next.dishes[1].meal_type, "Dinner");
  assert.ok(next.dishes.every((d) => d.rating === null));
  assert.notEqual(next.dishes[0].id, next.dishes[1].id);
  assert.deepEqual(applyFixup(v, { title: "", dishes: [] }).dishes, v.dishes);
});

test("fix-up keeps a rating Adam gave a dish of the same name", () => {
  const v = { ...dated("2026-06-07", "Toastie & Fries", "Corner Cafe", [["Toastie", 4.5], ["Fries", null]]), source_id: "dayone:y" };
  v.dishes[1].photos = [{ id: "p2", key: "food/photos/p2.jpg" }];
  const next = applyFixup(v, {
    dishes: [
      { title: "toastie", meal_type: "Lunch", tags: [], notes: "" },
      { title: "Shake", meal_type: "Lunch", tags: [], notes: "" },
    ],
  });
  assert.deepEqual(next.dishes.map((d) => d.rating), [4.5, null]);
  assert.deepEqual(next.dishes[0].photos.map((p) => p.id), ["p2"]);
});

test("Day One entries from one day at one venue become one rated visit", () => {
  const entry = (id, created, title, notes, venue = "Corner Cafe") => {
    const v = dated("2026-06-07", title, venue, [[title, null]]);
    v.source_id = `dayone:${id}`;
    v.notes = notes;
    v.dishes[0].notes = notes;
    v.dishes[0].photos = [{ id: `p_${id}`, key: `food/photos/p_${id}.jpg` }];
    v.import_metadata = { original_created_at: created };
    v.import_media = [{ identifier: id }];
    return v;
  };
  const journal = {
    ...emptyJournal(),
    visits: [
      entry("b", "2026-06-07T03:00:00Z", "Fries", "###### Rating\n3/5 crisp"),
      entry("a", "2026-06-07T02:00:00Z", "Toastie", "###### Rating\n4\\.5/5 great\\!"),
      entry("c", "2026-06-07T09:00:00Z", "Ramen", "5/5", "Noodle Bar"),
      { ...dated("2026-06-07", "Home pasta", "Corner Cafe", [["Pasta", null]]), notes: "2/5" },
    ],
  };
  journal.recipes = [{ id: "r1", dish_id: journal.visits[0].dishes[0].id, title: "Fries" }];
  const { journal: next, changed } = tidyImports(journal);
  assert.equal(changed, true);
  const live = liveVisits(next);
  assert.equal(live.length, 3);
  const cafe = live.find((v) => v.source_id === "dayone:a");
  assert.equal(cafe.title, "Toastie & Fries");
  assert.deepEqual(cafe.dishes.map((d) => [d.title, d.rating]), [["Toastie", 4.5], ["Fries", 3]]);
  assert.deepEqual(cafe.dishes.flatMap((d) => d.photos.map((p) => p.id)), ["p_a", "p_b"]);
  assert.equal(cafe.import_media.length, 2);
  assert.equal(next.visits.find((v) => v.source_id === "dayone:b").status, "deleted");
  assert.equal(next.recipes[0].dish_id, cafe.dishes[1].id);
  assert.equal(live.find((v) => v.source_id === "dayone:c").dishes[0].rating, 5);
  assert.equal(live.find((v) => v.title === "Home pasta").dishes[0].rating, null);
  assert.equal(tidyImports(next).changed, false);
  validateFoodJournal({ ...next, recipes: [] });
  assert.equal(dayOneRating("Visited 21/5/26"), null);
});

test("the Location Adam wrote replaces Day One's GPS place, then same-day entries merge", () => {
  const entry = (id, created, title, place) => {
    const v = dated("2026-06-07", title, "Car Park Entrance", [[title, null]]);
    v.venue = { name: "Car Park Entrance", address: "Hillside", lat: -33.7, lon: 151.0 };
    v.source_id = `dayone:${id}`;
    v.notes = `## ${title}\n\n---\n\n###### Location\n${place}\n\n---\n\n###### Shared with\nFriends`;
    v.dishes[0].notes = v.notes;
    v.import_metadata = { original_created_at: created };
    return v;
  };
  const journal = {
    ...emptyJournal(),
    visits: [
      entry("a", "2026-06-07T02:00:00Z", "Burger", "Corner Burgers"),
      entry("b", "2026-06-07T02:10:00Z", "Fries", "Corner Burgers"),
      entry("c", "2026-06-07T02:20:00Z", "Shake", "Corner  Burgers."),
      entry("d", "2026-06-07T09:00:00Z", "Ramen", "Noodle Bar"),
    ],
  };
  const blank = entry("e", "2026-06-08T09:00:00Z", "Toast", "x");
  blank.notes = "###### Location\n\n---\n\n###### Shared with\nNobody";
  journal.visits.push(blank);
  const { journal: next } = tidyImports(journal);
  const live = liveVisits(next);
  const burgers = live.find((v) => v.source_id === "dayone:a");
  // The entry's point stays so the venue backfill can look there.
  assert.deepEqual(burgers.venue, { name: "Corner Burgers", address: "Hillside", lat: -33.7, lon: 151 });
  assert.deepEqual(burgers.dishes.map((d) => d.title), ["Burger", "Fries", "Shake"]);
  assert.equal(live.find((v) => v.source_id === "dayone:d").venue.name, "Noodle Bar");
  assert.equal(live.find((v) => v.source_id === "dayone:e").venue.name, "Car Park Entrance");
  assert.equal(live.length, 3);
  // A venue Adam corrects by hand afterwards is left alone.
  burgers.venue.name = "Corner Burgers Hillside";
  assert.equal(tidyImports(next).journal.visits.find((v) => v.id === burgers.id).venue.name, "Corner Burgers Hillside");
  assert.equal(dayOneLocation("###### Location\nCafe One\n\n###### Rating\n4/5"), "Cafe One");
  assert.equal(dayOneLocation("No headings here"), "");
});

test("hashtags come from dish tags and #words, ignoring case", () => {
  const v = dated("2026-06-07", "Lunch", "Cafe", [["Toastie", null]]);
  v.dishes[0].tags = ["Pizza", "pizza"];
  v.notes = "Great day! #Burger and #pizza.\nNot a tag: C# or #1";
  assert.deepEqual(visitTags(v), ["pizza", "burger"]);
  assert.equal(tagLabel("burger"), "#Burger");
  assert.equal(tagKey("#Burger"), "burger");
});

test("imported titles that are a photo link or the template placeholder get a real name", () => {
  const entry = (id, created, title, notes, venue = "Cafe One") => {
    const v = dated("2026-04-14", title, venue, [[title, null]]);
    v.source_id = `dayone:${id}`;
    v.notes = notes;
    v.import_metadata = { original_created_at: created };
    return v;
  };
  const journal = {
    ...emptyJournal(),
    visits: [
      entry("a", "2026-04-14T01:00:00Z", "![](dayone-moment://ABC)", "![](dayone-moment://ABC)\nCheese pie\nSo good.#pie"),
      entry("b", "2026-04-14T05:00:00Z", "Title", "## Title\n\n---\n\n###### Description\n\n---\n\n###### Location\nNoodle Bar\n#ramen", "12 Main St"),
      entry("c", "2026-04-14T09:00:00Z", "Title", "## Title\n\n###### Description", ""),
    ],
  };
  const { journal: next } = tidyImports(journal);
  const titles = liveVisits(next).map((v) => [v.title, v.dishes[0].title]);
  assert.deepEqual(titles.sort(), [
    ["Cheese pie", "Cheese pie"],
    ["Meal", "Meal"],
    ["Ramen at Noodle Bar", "Ramen at Noodle Bar"],
  ]);
  assert.equal(dayOneTitle("![](dayone-moment://X)\n\n## Toastie\n"), "Toastie");
});

test("same address, same day, hours apart stays two meals", () => {
  const entry = (id, created, title) => {
    const v = dated("2026-04-14", title, "12 Home St", [[title, null]]);
    v.source_id = `dayone:${id}`;
    v.import_metadata = { original_created_at: created };
    return v;
  };
  const journal = {
    ...emptyJournal(),
    visits: [
      entry("a", "2026-04-14T00:00:00Z", "Eggs"),
      entry("b", "2026-04-14T00:20:00Z", "Coffee"),
      entry("c", "2026-04-14T09:00:00Z", "Curry"),
    ],
  };
  const live = liveVisits(tidyImports(journal).journal);
  assert.deepEqual(live.map((v) => v.title).sort(), ["Curry", "Eggs & Coffee"]);
});

test("fix-up takes the venue the text names over a GPS street address", () => {
  const v = { ...dated("2016-08-06", "Pie", "88 Main Street", [["Pie", null]]), source_id: "dayone:p" };
  v.venue.address = "Hillside";
  const next = applyFixup(v, { venue: { name: "Corner Pies", address: "" }, dishes: [] });
  assert.deepEqual(next.venue, { name: "Corner Pies", address: "Hillside" });
  const written = { ...v, import_metadata: { location_from_text: true } };
  assert.equal(applyFixup(written, { venue: { name: "Other" }, dishes: [] }).venue.name, "88 Main Street");
});

test("editorial action returns a headline and only keeps a pull quote copied from the notes", async () => {
  resetRateLimits();
  const j = fixture();
  j.visits[0].notes = "The croquettes came out molten.   Lasagne was rich.";
  const prompts = [];
  let reply = {
    headline: "Ten small plates",
    standfirst: "A table by the window.",
    pull_quote: "“The croquettes came out molten.”",
  };
  const h = createFoodJournalProcessHandler(
    deps(repo(j), {
      complete: async (options) => {
        prompts.push(options);
        return JSON.stringify(reply);
      },
    }),
  );
  const body = { action: "editorial", visit_id: j.visits[0].id, basis: "abc123" };
  const res = await h(req("POST", body));
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.deepEqual(data.editorial, {
    headline: "Ten small plates",
    standfirst: "A table by the window.",
    pull_quote: "The croquettes came out molten.",
    basis: "abc123",
  });
  assert.match(prompts[0].system, /never instructions/);
  assert.equal(JSON.parse(prompts[0].messages[0].content).dishes.length, 2);
  reply = { ...reply, pull_quote: "Best meal of my life." };
  const invented = await (await h(req("POST", body))).json();
  assert.equal(invented.data.editorial.pull_quote, "");
  reply = { headline: "", standfirst: "", pull_quote: "" };
  assert.equal((await h(req("POST", body))).status, 503);
  assert.equal((await h(req("POST", { ...body, visit_id: "visit_missing" }))).status, 404);
  assert.equal(verbatimQuote("short", j.visits[0]), "");
});

test("fix-up action returns cleaned dishes from the original entry text", async () => {
  resetRateLimits();
  const j = fixture();
  j.visits[0].notes = "Pork gyoza then chilli wontons.";
  j.visits[0].import_metadata = { original_created_at: "2026-09-13T13:20:00Z", time_zone: "Australia/Sydney" };
  let sent;
  const h = createFoodJournalProcessHandler(
    deps(repo(j), {
      complete: async (options) => {
        sent = JSON.parse(options.messages[0].content);
        return JSON.stringify({
          title: "Dumplings",
          venue: { name: "Golden Lantern" },
          dishes: [
            { title: "Pork gyoza", meal_type: "Supper", tags: ["x", 4] },
            { title: "  " },
          ],
        });
      },
    }),
  );
  const res = await h(req("POST", { action: "fixup", visit_id: j.visits[0].id }));
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(sent.text, "Pork gyoza then chilli wontons.");
  assert.equal(sent.recorded_at, "2026-09-13T13:20:00Z");
  assert.deepEqual(data.draft.dishes, [
    { title: "Pork gyoza", cuisine: "", meal_type: "Dinner", tags: ["x"], notes: "" },
  ]);
  assert.deepEqual(data.draft.venue, { name: "Golden Lantern", address: "" });
});

test("schema accepts editorial and review state and rejects malformed ones", () => {
  const j = fixture();
  j.visits[0].reviewed = true;
  j.visits[0].editorial = { headline: "H", standfirst: "S", pull_quote: "", basis: "abc" };
  assert.doesNotThrow(() => validateFoodJournal(j));
  for (const broken of [
    { reviewed: "yes" },
    { editorial: { headline: 1, standfirst: "", pull_quote: "", basis: "" } },
    { editorial: { headline: "H", standfirst: "S", pull_quote: "", basis: "x".repeat(65) } },
  ]) {
    const bad = fixture();
    Object.assign(bad.visits[0], broken);
    assert.throws(() => validateFoodJournal(bad), /invalid/i);
  }
});

// A menu photo is the fast path: it lists every item, and ticking one adds it
// as a dish.
test("capture action returns the items on a menu photo, cleaned", async () => {
  resetRateLimits();
  const h = createFoodJournalProcessHandler(
    deps(repo(fixture()), {
      complete: async () =>
        JSON.stringify({
          title: "",
          venue: { name: "Ibby's", address: "" },
          menu_text: "The Cheese $16\nOklahoma $18",
          dishes: [],
          menu_items: [
            { name: "The Cheese", description: "Smashed beef, pickles", price: "$16" },
            { name: "  Oklahoma ", price: 18 },
            { name: "Add bacon", price: "+5", kind: "extra" },
            { name: "Fries", kind: "side" },
            { name: "" },
            "Fries",
          ],
        }),
    }),
  );
  const res = await h(
    req("POST", {
      action: "capture",
      images: [{ role: "menu", id: "m1", mime: "image/jpeg", data: "YWJj" }],
    }),
  );
  assert.equal(res.status, 200);
  const { draft } = (await res.json()).data;
  assert.deepEqual(draft.menu_items, [
    { name: "The Cheese", description: "Smashed beef, pickles", price: "$16", kind: "dish" },
    { name: "Oklahoma", description: "", price: "18", kind: "dish" },
    { name: "Add bacon", description: "", price: "+5", kind: "extra" },
    { name: "Fries", description: "", price: "", kind: "dish" },
  ]);
});
test("translate action returns English for non-English notes and nothing for English", async () => {
  resetRateLimits();
  const calls = [];
  const complete = async (opts) => {
    calls.push(opts.model);
    return opts.messages[0].content.includes("riquísimo")
      ? JSON.stringify({ english: false, text: "delicious, very garlicky" })
      : JSON.stringify({ english: true, text: "" });
  };
  const h = createFoodJournalProcessHandler(deps(repo(fixture()), { complete }));
  let res = await h(req("POST", { action: "translate", text: "riquísimo, mucho ajo" }));
  assert.deepEqual((await res.json()).data, { text_en: "delicious, very garlicky" });
  res = await h(req("POST", { action: "translate", text: "Great chips" }));
  assert.deepEqual((await res.json()).data, { text_en: "" });
  assert.equal(calls.length, 1, "plain ASCII English skips the model");
  assert.equal(calls[0], "claude-haiku-5-5");
  res = await h(req("POST", { action: "translate", text: "x".repeat(20001) }));
  assert.equal(res.status, 400);
});
test("menu items merge across photos without repeats and are kept on the visit", () => {
  const v = newVisit();
  let next = mergeCapture(v, {
    title: "", venue: { name: "", address: "" }, menu_text: "",
    dishes: [],
    menu_items: [{ name: "The Cheese", description: "", price: "$16" }],
  });
  next = mergeCapture(next, {
    title: "", venue: { name: "", address: "" }, menu_text: "",
    dishes: [],
    menu_items: [
      { name: "the cheese", description: "Smashed", price: "$16" },
      { name: "Oklahoma", description: "", price: "$18" },
    ],
  });
  assert.deepEqual(next.menu_items.map((i) => i.name), ["The Cheese", "Oklahoma"]);
  assert.equal(next.dishes.length, 1);
  assert.equal(next.dishes[0].title, "");
  assert.doesNotThrow(() => validateFoodJournal({ ...emptyJournal(), visits: [{ ...next, dishes: [{ ...next.dishes[0], title: "x" }] }] }));
});
test("ticking a menu item adds it as a dish; unticking removes it only if untouched", () => {
  const v = newVisit();
  v.menu_items = [
    { name: "The Cheese", description: "Smashed beef", price: "$16" },
    { name: "Oklahoma", description: "", price: "$18" },
  ];
  // The blank starter dish is used first.
  let next = toggleMenuDish(v, v.menu_items[0]);
  assert.deepEqual(next.dishes.map((d) => d.title), ["The Cheese"]);
  assert.equal(menuDishIndex(next, v.menu_items[0]), 0);
  next = toggleMenuDish(next, v.menu_items[1]);
  assert.deepEqual(next.dishes.map((d) => d.title), ["The Cheese", "Oklahoma"]);
  // Untouched: unticking removes it.
  next = toggleMenuDish(next, v.menu_items[1]);
  assert.deepEqual(next.dishes.map((d) => d.title), ["The Cheese"]);
  assert.equal(menuDishIndex(next, v.menu_items[1]), -1);
  // Rated: unticking keeps it.
  next.dishes[0].rating = 4;
  assert.equal(toggleMenuDish(next, v.menu_items[0]).dishes.length, 1);
  // The last dish never goes; it becomes blank again instead.
  const plain = toggleMenuDish(toggleMenuDish(v, v.menu_items[1]), v.menu_items[1]);
  assert.equal(plain.dishes.length, 1);
  assert.equal(plain.dishes[0].title, "");
});
test("ticking a menu dish puts its ingredients in ingredients and leaves notes alone", () => {
  const v = newVisit();
  v.menu_items = [
    { name: "Morning steak", description: "150g sirloin, hash, chimichurri", price: "32", kind: "dish" },
    { name: "Smashed avo", description: "Poached eggs, feta", price: "22", kind: "dish" },
  ];
  let next = toggleMenuDish(v, v.menu_items[0]);
  assert.equal(next.dishes[0].ingredients, "150g sirloin, hash, chimichurri");
  assert.equal(next.dishes[0].notes, "");
  next = toggleMenuDish(next, v.menu_items[1]);
  assert.equal(next.dishes[1].ingredients, "Poached eggs, feta");
  next = toggleMenuDish(next, v.menu_items[1]);
  assert.deepEqual(next.dishes.map((d) => d.title), ["Morning steak"]);
  // Adam's own words make it stay.
  next.dishes[0].notes = "Cooked perfectly";
  assert.equal(toggleMenuDish(next, v.menu_items[0]).dishes.length, 1);
  // A dish that already has notes still gets the ingredients.
  const noted = newVisit();
  noted.menu_items = v.menu_items;
  noted.dishes[0].title = "Morning steak";
  noted.dishes[0].notes = "From the photo";
  const filled = toggleMenuDish(noted, v.menu_items[0]);
  assert.equal(filled.dishes[0].ingredients, "150g sirloin, hash, chimichurri");
  assert.equal(filled.dishes[0].notes, "From the photo");
  const plain = toggleMenuDish(toggleMenuDish(v, v.menu_items[1]), v.menu_items[1]);
  assert.deepEqual([plain.dishes[0].title, plain.dishes[0].ingredients], ["", ""]);
});
test("unticking keeps a dish whose ingredients were typed over", () => {
  const v = newVisit();
  v.menu_items = [{ name: "Morning steak", description: "150g sirloin, hash", price: "32", kind: "dish" }];
  const ticked = toggleMenuDish(v, v.menu_items[0]);
  ticked.dishes[0].ingredients = "Sirloin, no hash";
  const next = toggleMenuDish(ticked, v.menu_items[0]);
  assert.equal(next.dishes.length, 1);
  assert.equal(next.dishes[0].title, "Morning steak");
  assert.equal(next.dishes[0].ingredients, "Sirloin, no hash");
});
test("an extra ticks onto the last dish, and is its own dish when nothing else is ticked", () => {
  const v = newVisit();
  v.menu_items = [
    { name: "Big breakfast", description: "Bacon, eggs", price: "29", kind: "dish" },
    { name: "Hash brown", description: "", price: "6", kind: "extra" },
    { name: "Add avocado", description: "", price: "+4", kind: "extra" },
  ];
  const [breakfast, hash, avo] = v.menu_items;
  // Alone, an extra is a dish of its own.
  const alone = toggleMenuDish(v, hash);
  assert.deepEqual(alone.dishes.map((d) => d.title), ["Hash brown"]);
  assert.equal(menuDishIndex(alone, hash), 0);
  let next = toggleMenuDish(v, breakfast);
  next = toggleMenuDish(next, hash);
  next = toggleMenuDish(next, avo);
  assert.equal(next.dishes.length, 1);
  assert.equal(next.dishes[0].ingredients, "Bacon, eggs\n+ Hash brown\n+ Add avocado");
  assert.equal(menuDishIndex(next, avo), 0);
  // Unticking an extra takes only its line.
  next = toggleMenuDish(next, hash);
  assert.equal(next.dishes[0].ingredients, "Bacon, eggs\n+ Add avocado");
  assert.equal(menuDishIndex(next, hash), -1);
  // Extras do not count as Adam's own notes.
  next = toggleMenuDish(next, breakfast);
  assert.deepEqual([next.dishes[0].title, next.dishes[0].ingredients], ["", ""]);
});
test("older dishes with extras in notes are still found and unticked", () => {
  const v = newVisit();
  v.menu_items = [{ name: "Hash brown", description: "", price: "6", kind: "extra" }];
  v.dishes[0].title = "Big breakfast";
  v.dishes[0].notes = "Bacon, eggs\n+ Hash brown";
  assert.equal(menuDishIndex(v, v.menu_items[0]), 0);
  const next = toggleMenuDish(v, v.menu_items[0]);
  assert.equal(next.dishes[0].notes, "Bacon, eggs");
});
test("every page of a menu is read when no dish photos are chosen", () => {
  const menus = Array.from({ length: 3 }, (_, i) => ({ role: "menu", id: `m${i}`, data: "x".repeat(10) }));
  assert.deepEqual(captureBatches(menus), [menus]);
});
test("schema checks stored menu items", () => {
  const ok = fixture();
  ok.visits[0].menu_items = [
    { name: "Lasagne", description: "", price: "$25" },
    { name: "Garlic bread", description: "", price: "$6", kind: "extra" },
  ];
  assert.doesNotThrow(() => validateFoodJournal(ok));
  for (const broken of [
    "Lasagne",
    [{ name: 4, description: "", price: "" }],
    [{ name: "x".repeat(201), description: "", price: "" }],
    [{ name: "Bacon", description: "", price: "", kind: "side" }],
    Array.from({ length: 201 }, () => ({ name: "a", description: "", price: "" })),
  ]) {
    const bad = fixture();
    bad.visits[0].menu_items = broken;
    assert.throws(() => validateFoodJournal(bad), /invalid/i);
  }
});
test("menu text printed in capitals reads as names and sentences", () => {
  assert.equal(unshout("CHICKEN SCHNITZEL WRAP"), "Chicken Schnitzel Wrap");
  assert.equal(unshout("FISH AND CHIPS (GF)"), "Fish and Chips (GF)");
  assert.equal(
    unshout("CHICKEN SCHNITZEL, LETTUCE, MAYO", { sentence: true }),
    "Chicken schnitzel, lettuce, mayo",
  );
  assert.equal(unshout("BBQ pork"), "BBQ pork");
  assert.equal(unshout("Soba noodles"), "Soba noodles");
  const merged = mergeCapture(newVisit(), {
    title: "",
    venue: { name: "THE BAY CAFE", address: "" },
    menu_text: "",
    menu_items: [{ name: "PORK GYOZA", description: "FIVE PIECES", price: "9" }],
    dishes: [{ title: "PORK GYOZA", cuisine: "", meal_type: "Lunch", tags: [], notes: "" }],
  });
  assert.equal(merged.venue.name, "The Bay Cafe");
  assert.deepEqual(merged.menu_items[0], {
    name: "Pork Gyoza",
    description: "Five pieces",
    price: "9",
  });
  assert.equal(merged.dishes[0].title, "Pork Gyoza");
});
test("known tags come from earlier visits, most used first", () => {
  const j = fixture();
  j.visits[0].dishes[0].tags = ["Spicy", "share"];
  j.visits.push({
    ...structuredClone(j.visits[0]),
    id: "visit_2",
    notes: "",
    dishes: [{ ...structuredClone(j.visits[0].dishes[0]), id: "dish_2", tags: ["spicy"] }],
  });
  assert.deepEqual(knownTags(j).slice(0, 2), ["spicy", "share"]);
});

function bookFixture() {
  const j = fixture();
  const [lasagne, croquettes] = j.visits[0].dishes;
  croquettes.meal_type = "Snack";
  croquettes.tags = ["Fried"];
  const gone = newVisit();
  gone.status = "deleted";
  gone.dishes = [{ ...newDish(), title: "Old soup" }];
  j.visits.push(gone);
  const recipe = (dish, title, more = {}) => ({
    id: `recipe_${title.replace(/\W+/g, "_")}`,
    dish_id: dish.id,
    title,
    servings: 2,
    ingredients: ["1 cup flour"],
    steps: ["Cook."],
    sources: [],
    ...more,
  });
  j.recipes = [
    recipe(croquettes, "zucchini croquettes", { ingredients: ["2 zucchini", "Panko"] }),
    recipe(lasagne, "Lasagne al forno", { added_at: "2026-09-30T15:30:00.000Z" }),
    recipe(gone.dishes[0], "Old soup"),
  ];
  return j;
}

test("recipe book lists recipes with live dishes and filters on title, ingredients and the dish", () => {
  const j = bookFixture();
  const all = bookRecipes(j);
  assert.deepEqual(all.map((x) => x.recipe.title), ["zucchini croquettes", "Lasagne al forno"]);
  assert.equal(all[1].dish.title, "Lasagne");
  assert.equal(filterRecipes(all, { query: "PANKO" }).length, 1);
  assert.equal(filterRecipes(all, { query: "forno" })[0].recipe.title, "Lasagne al forno");
  assert.equal(filterRecipes(all, { meal: "Snack" }).length, 1);
  assert.equal(filterRecipes(all, { cuisine: "Italian", tag: "Comfort food" }).length, 1);
  assert.equal(filterRecipes(all, { meal: "Snack", cuisine: "Italian" }).length, 0);
});

test("recipe book sorts A to Z by letter and recently added by date, then save order", () => {
  const j = bookFixture();
  j.recipes.push({ ...j.recipes[0], id: "recipe_new", dish_id: j.visits[0].dishes[1].id, title: "3 bean salad" });
  const all = bookRecipes(j);
  const az = sortRecipes(all, "az");
  assert.deepEqual(az.map((x) => x.recipe.title), ["3 bean salad", "Lasagne al forno", "zucchini croquettes"]);
  assert.deepEqual(recipeSections(az, "az").map((s) => s.key), ["#", "L", "Z"]);
  const recent = sortRecipes(all, "recent");
  assert.deepEqual(recent.map((x) => x.recipe.title), ["Lasagne al forno", "3 bean salad", "zucchini croquettes"]);
  // 15:30 UTC on 30 Sep is 1 Oct in Sydney.
  assert.deepEqual(recipeSections(recent, "recent").map((s) => s.key), ["2026-10", "earlier"]);
  assert.equal(recipeLetter("Éclairs"), "E");
  assert.equal(recipeLetter(""), "#");
});

test("schema accepts a recipe added date and rejects a malformed one", () => {
  const j = bookFixture();
  j.recipes.pop();
  validateFoodJournal(j);
  j.recipes[0].added_at = "yesterday";
  assert.throws(() => validateFoodJournal(j), /added date/);
  j.recipes[0].added_at = 5;
  assert.throws(() => validateFoodJournal(j), /added date/);
});

test("schema accepts dish ingredients, English text and a Brisket link, and rejects bad ones", () => {
  const j = fixture();
  const v = j.visits[0];
  v.menu_text_en = "Lasagne $25";
  v.menu_items = [
    { name: "Lasaña", name_en: "Lasagne", description: "Carne, bechamel", description_en: "Beef, bechamel", price: "$25", kind: "dish" },
  ];
  Object.assign(v.dishes[0], {
    title_en: "Lasagne",
    ingredients: "Beef, bechamel\n+ Extra cheese",
    ingredients_original: "Carne, bechamel",
    notes_en: "",
    brisket: {
      meal_path: "data/nutrition/2026/10/2026-10-22-dinner-1930.md",
      portion: "½",
      portion_fraction: 0.5,
      counted_at: "2026-10-22T19:31:00+11:00",
      needs_recount: false,
      calories: 620,
      protein_g: 26,
      fat_g: 24,
    },
  });
  v.dishes[0].photos = [{ id: "photo_1", key: "food/photos/photo_1.jpg", from: "med_abcd1234" }];
  assert.doesNotThrow(() => validateFoodJournal(j));
  for (const [broken, message] of [
    [(d) => (d.ingredients = 5), /Ingredients/],
    [(d) => (d.ingredients = "x".repeat(2001)), /Ingredients/],
    [(d) => (d.brisket = { ...d.brisket, portion_fraction: 1.5 }), /Brisket portion/],
    [(d) => (d.brisket = { ...d.brisket, portion_fraction: 0 }), /Brisket portion/],
    [(d) => (d.brisket = { ...d.brisket, meal_path: "data/other/x.md" }), /Brisket link/],
    [(d) => (d.brisket = { ...d.brisket, needs_recount: "yes" }), /Brisket link/],
    [(d) => (d.brisket = { ...d.brisket, counted_at: "2026" }), /Brisket link/],
    [(d) => (d.brisket = "x"), /Brisket link/],
    [(d) => (d.brisket = { ...d.brisket, calories: -5 }), /Brisket numbers/],
  ]) {
    const copy = structuredClone(j);
    broken(copy.visits[0].dishes[0]);
    assert.throws(() => validateFoodJournal(copy), message);
  }
});

test("a dish from the photo read takes the ingredients of the menu item with its name", () => {
  const v = newVisit();
  const draft = {
    title: "",
    venue: { name: "", address: "" },
    menu_text: "",
    menu_items: [
      {
        name: "Fish tacos",
        description: "Battered snapper, slaw, lime",
        price: "$19",
        kind: "dish",
      },
    ],
    dishes: [
      {
        title: "Fish tacos",
        cuisine: "Mexican",
        meal_type: "Lunch",
        tags: [],
        notes: "Two tacos on a tray",
        photo_ids: [],
      },
    ],
  };
  const next = mergeCapture(v, draft);
  assert.equal(next.dishes[0].ingredients, "Battered snapper, slaw, lime");
  assert.equal(next.dishes[0].notes, "Two tacos on a tray");
  // Ingredients Adam already has are kept.
  next.dishes[0].ingredients = "Snapper, cabbage";
  assert.equal(
    mergeCapture(next, draft).dishes[0].ingredients,
    "Snapper, cabbage",
  );
});
test("capture keeps the original and the English for a non-English menu", async () => {
  const r = repo(fixture());
  const complete = async () =>
    JSON.stringify({
      title: "", venue: { name: "Bar Test", address: "" },
      menu_text: "Tortilla 6€", menu_text_en: "Spanish omelette 6€",
      menu_items: [{ name: "Tortilla", name_en: "Spanish omelette", description: "Huevo, patata", description_en: "Egg, potato", price: "6€", kind: "dish" }],
      dishes: [{ title: "Tortilla", title_en: "Spanish omelette", cuisine: "Spanish", meal_type: "Lunch", tags: [], notes: "", photo_ids: [] }],
    });
  resetRateLimits();
  const h = createFoodJournalProcessHandler(deps(r, { complete }));
  const res = await h(req("POST", { action: "capture", images: [{ role: "menu", id: "m1", mime: "image/jpeg", data: "YWJj" }] }));
  const { draft } = (await res.json()).data;
  assert.equal(draft.menu_text_en, "Spanish omelette 6€");
  assert.equal(draft.menu_items[0].name_en, "Spanish omelette");
  assert.equal(draft.menu_items[0].description_en, "Egg, potato");
  assert.equal(draft.dishes[0].title_en, "Spanish omelette");
});
test("capture leaves English fields out for an English menu", async () => {
  const r = repo(fixture());
  const complete = async () =>
    JSON.stringify({
      title: "", venue: { name: "", address: "" }, menu_text: "Chips $6",
      menu_items: [{ name: "Chips", description: "", price: "$6", kind: "dish" }],
      dishes: [],
    });
  resetRateLimits();
  const h = createFoodJournalProcessHandler(deps(r, { complete }));
  const res = await h(req("POST", { action: "capture", images: [{ role: "menu", id: "m1", mime: "image/jpeg", data: "YWJj" }] }));
  const { draft } = (await res.json()).data;
  assert.equal("menu_text_en" in draft, false);
  assert.equal("name_en" in draft.menu_items[0], false);
});
test("a translated menu item gives English ingredients and keeps the original", () => {
  const item = { name: "Tortilla", name_en: "Spanish omelette", description: "Huevo, patata", description_en: "Egg, potato", price: "6€", kind: "dish" };
  const v = newVisit();
  v.menu_items = [item];
  // A tick.
  const ticked = toggleMenuDish(v, item);
  assert.equal(ticked.dishes[0].ingredients, "Egg, potato");
  assert.equal(ticked.dishes[0].ingredients_original, "Huevo, patata");
  // Unticking an untouched translated dish removes it again.
  assert.equal(toggleMenuDish(ticked, item).dishes[0].title, "");
  // A photo-read name match.
  const merged = mergeCapture(newVisit(), {
    title: "", venue: { name: "", address: "" },
    menu_text: "Tortilla 6€", menu_text_en: "Spanish omelette 6€",
    menu_items: [item],
    dishes: [{ title: "Tortilla", title_en: "Spanish omelette", cuisine: "", meal_type: "Lunch", tags: [], notes: "", photo_ids: [] }],
  });
  assert.equal(merged.menu_text_en, "Spanish omelette 6€");
  assert.equal(merged.dishes[0].title_en, "Spanish omelette");
  assert.equal(merged.dishes[0].ingredients, "Egg, potato");
  assert.equal(merged.dishes[0].ingredients_original, "Huevo, patata");
});
test("a dish that goes blank loses its English title and original ingredients", () => {
  const item = { name: "Tortilla", name_en: "Spanish omelette", description: "Huevo, patata", description_en: "Egg, potato", price: "6€", kind: "dish" };
  const draft = (title, title_en) => ({
    title: "", venue: { name: "", address: "" }, menu_text: "",
    menu_items: [item],
    dishes: [{ title, title_en, cuisine: "", meal_type: "Lunch", tags: [], notes: "", photo_ids: [] }],
  });
  const v = mergeCapture(newVisit(), draft("Tortilla", "Spanish omelette"));
  assert.equal(v.dishes.length, 1);
  assert.equal(v.dishes[0].title_en, "Spanish omelette");
  const blank = toggleMenuDish(v, item);
  assert.equal(blank.dishes[0].title, "");
  assert.equal("title_en" in blank.dishes[0], false);
  assert.equal("ingredients_original" in blank.dishes[0], false);
  const next = mergeCapture(blank, draft("Paella", "Rice dish"));
  assert.equal(next.dishes[0].title_en, "Rice dish");
});
