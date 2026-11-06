import test from "node:test";
import assert from "node:assert/strict";
import {
  answerProblem,
  applyAnswers,
  batchProblems,
  openChecks,
} from "../../apps/life/js/food-journal/quick-checks.js";
import { runApply, readPending, saveAnswer, undoAnswer, answerStats, readDone } from "../../netlify/functions/_shared/food-checks.mjs";
import { createFoodChecksHandler } from "../../netlify/functions/food-checks.mjs";
import { createFoodChecksApplyHandler } from "../../netlify/functions/food-checks-apply-scheduled.mjs";
import { validateFoodJournal } from "../../netlify/functions/_shared/food-journal-schema.mjs";

// Invented meals at an invented point.
const point = { lat: -32.9, lon: 151.7 };
const near = { lat: point.lat + 0.0002, lon: point.lon };
const far = { lat: point.lat + 0.01, lon: point.lon };
const before = { name: "12 Quay Street", address: "Harbourside" };
const visit = (id, over = {}) => ({
  id,
  date: "2026-03-14",
  title: "A meal",
  venue: { ...before },
  menu_text: "",
  notes: "",
  status: "active",
  dishes: [
    { id: `${id}_dish`, title: "Soup", cuisine: "", meal_type: "Dinner", tags: [], rating: null, notes: "", ingredients: "", photos: [] },
  ],
  ...over,
});
const journal = (...visits) => ({ schema_version: 1, visits, recipes: [] });
const venueCheck = (over = {}) => ({
  id: "chk_one",
  kind: "venue",
  visits: [
    { id: "v1", before, point },
    { id: "v2", before, point },
  ],
  suggestion: { name: "Two Herons Cafe", address: "4 Quay Street", ...near },
  alternatives: [{ name: "Corner Bodega", address: "6 Quay Street", ...near }],
  reason: "GPS sits on this cafe.",
  evidence: [{ kind: "map", text: "Nearest food place" }],
  ...over,
});
const dishCheck = (over = {}) => ({
  id: "chk_dish",
  kind: "dish",
  dishes: [{ visit_id: "v1", dish_id: "v1_dish", before: { cuisine: "", tags: [] } }],
  suggestion: { cuisine: "Thai", tags: ["Soup"] },
  reason: "Tom yum in the note.",
  evidence: [{ kind: "note", text: "Named in the note" }],
  ...over,
});
function memoryStore() {
  const blobs = new Map();
  return {
    blobs,
    get: async (key) => (blobs.has(key) ? structuredClone(blobs.get(key)) : null),
    setJSON: async (key, value) => void blobs.set(key, structuredClone(value)),
    delete: async (key) => void blobs.delete(key),
    list: async ({ prefix }) => ({
      blobs: [...blobs.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })),
    }),
  };
}
function memoryRepo(start) {
  let saved = structuredClone(start),
    version = "a".repeat(40),
    saves = 0;
  return {
    get saved() {
      return saved;
    },
    get saves() {
      return saves;
    },
    getJournal: async () => ({ journal: structuredClone(saved), version }),
    saveJournal: async (next, v) => {
      if (v !== version) throw Object.assign(new Error("conflict"), { code: "conflict", status: 409 });
      validateFoodJournal(next);
      saved = structuredClone(next);
      version = "b".repeat(40);
      saves++;
      return { journal: saved, version };
    },
  };
}

test("a suggestion settles every visit in the group at its own place", () => {
  const out = applyAnswers(journal(visit("v1"), visit("v2")), [venueCheck()], [
    { check_id: "chk_one", pick: "suggestion" },
  ]);
  assert.equal(out.changed, true);
  validateFoodJournal(out.journal);
  for (const v of out.journal.visits) {
    assert.equal(v.venue.name, "Two Herons Cafe");
    assert.equal(v.venue.address, "4 Quay Street");
    assert.equal(v.venue.lat, near.lat);
    assert.equal(v.venue.match.basis, "picked");
  }
  assert.deepEqual(out.results[0], {
    check_id: "chk_one",
    pick: "suggestion",
    outcome: "applied",
    applied: 2,
    held: 0,
  });
});

test("an alternative, a typed name and keep each settle the venue", () => {
  const one = [venueCheck({ visits: [{ id: "v1", before, point }] })];
  const run = (answer) =>
    applyAnswers(journal(visit("v1")), one, [{ check_id: "chk_one", ...answer }]).journal.visits[0].venue;
  assert.equal(run({ pick: "alt:0" }).name, "Corner Bodega");
  const typed = run({ pick: "typed", name: " Somewhere New " });
  assert.equal(typed.name, "Somewhere New");
  assert.equal(typed.lat, point.lat, "a typed name stays at the meal's GPS point");
  const kept = run({ pick: "keep" });
  assert.equal(kept.name, before.name);
  assert.equal(kept.lat, point.lat);
  assert.equal(kept.match.basis, "picked");
});

test("unticked visits are left alone and stay open for later", () => {
  const out = applyAnswers(journal(visit("v1"), visit("v2")), [venueCheck()], [
    { check_id: "chk_one", pick: "suggestion", exclude: ["v2"] },
  ]);
  assert.equal(out.journal.visits[0].venue.name, "Two Herons Cafe");
  assert.deepEqual(out.journal.visits[1].venue, before);
  assert.equal(out.results[0].applied, 1);
});

test("a visit edited since the check was prepared is held, never overwritten", () => {
  const edited = visit("v2", { venue: { name: "Fixed by hand", address: "" } });
  const out = applyAnswers(journal(visit("v1"), edited), [venueCheck()], [
    { check_id: "chk_one", pick: "suggestion" },
  ]);
  assert.equal(out.journal.visits[1].venue.name, "Fixed by hand");
  assert.deepEqual(
    [out.results[0].outcome, out.results[0].applied, out.results[0].held],
    ["applied", 1, 1],
  );
  const allGone = applyAnswers(journal(edited), [venueCheck({ visits: [{ id: "v2", before, point }] })], [
    { check_id: "chk_one", pick: "suggestion" },
  ]);
  assert.equal(allGone.changed, false);
  assert.equal(allGone.results[0].outcome, "held");
});

test("a venue Adam already picked is never replaced", () => {
  const picked = visit("v1", {
    venue: { ...before, match: { confidence: "sure", basis: "picked", source: "saved" } },
  });
  const out = applyAnswers(journal(picked), [venueCheck({ visits: [{ id: "v1", before, point }] })], [
    { check_id: "chk_one", pick: "suggestion" },
  ]);
  assert.equal(out.journal.visits[0].venue.name, before.name);
  assert.equal(out.results[0].outcome, "held");
  assert.equal(openChecks([venueCheck()], journal(picked)).length, 0);
});

test("applying the same answers twice changes nothing the second time", () => {
  const first = applyAnswers(journal(visit("v1"), visit("v2")), [venueCheck(), dishCheck()], [
    { check_id: "chk_one", pick: "suggestion" },
    { check_id: "chk_dish", pick: "apply" },
  ]);
  const second = applyAnswers(first.journal, [venueCheck(), dishCheck()], [
    { check_id: "chk_one", pick: "suggestion" },
    { check_id: "chk_dish", pick: "apply" },
  ]);
  assert.equal(second.changed, false);
  assert.ok(second.results.every((r) => r.outcome === "applied"));
});

test("dish answers fill blanks, keep existing tags, and never flag a Brisket re-count", () => {
  const start = visit("v1");
  start.dishes[0].brisket = { meal_path: "x", needs_recount: false };
  const out = applyAnswers(journal(start), [dishCheck()], [{ check_id: "chk_dish", pick: "apply" }]);
  const dish = out.journal.visits[0].dishes[0];
  assert.equal(dish.cuisine, "Thai");
  assert.deepEqual(dish.tags, ["Soup"]);
  assert.equal(dish.brisket.needs_recount, false);
  const rejected = applyAnswers(journal(visit("v1")), [dishCheck()], [{ check_id: "chk_dish", pick: "reject" }]);
  assert.equal(rejected.changed, false);
  assert.equal(rejected.results[0].outcome, "rejected");
});

test("an answer to a check that is gone is held", () => {
  const out = applyAnswers(journal(visit("v1")), [], [{ check_id: "chk_gone", pick: "suggestion" }]);
  assert.equal(out.results[0].outcome, "held");
});

test("open checks drop answered checks and changed or deleted members", () => {
  const edited = visit("v2", { venue: { name: "Fixed by hand", address: "" } });
  const cards = openChecks([venueCheck(), dishCheck()], journal(visit("v1"), edited), new Set(["chk_dish"]));
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].visits.map((v) => v.visit.id), ["v1"]);
  const gone = visit("v1", { deleted_at: "2026-04-01T00:00:00Z" });
  assert.equal(openChecks([venueCheck({ visits: [{ id: "v1", before, point }] })], journal(gone)).length, 0);
});

test("the batch checker passes good work and names every broken rule", () => {
  const j = journal(visit("v1"), visit("v2"));
  const batch = (...checks) => ({ schema_version: 1, checks });
  assert.deepEqual(batchProblems(batch(venueCheck(), dishCheck()), j), []);
  const fails = (check, words, taken) => {
    const problems = batchProblems(batch(check), j, { takenIds: new Set(taken) });
    assert.ok(problems.some((p) => p.includes(words)), `${words}: ${problems}`);
  };
  fails(venueCheck({ id: "bad" }), "id must");
  fails(venueCheck(), "already used", ["chk_one"]);
  fails(venueCheck({ rating: 5 }), "field rating is not allowed");
  fails(venueCheck({ reason: "" }), "reason");
  fails(venueCheck({ evidence: [] }), "evidence");
  fails(venueCheck({ evidence: [{ kind: "guess", text: "x" }] }), "evidence kind");
  fails(venueCheck({ suggestion: { name: "9 Quay Street" } }), "is an address");
  fails(venueCheck({ visits: [{ id: "nope", before, point }] }), "not in the journal");
  fails(venueCheck({ visits: [{ id: "v1", before: { name: "Other" }, point }] }), "before does not match");
  fails(venueCheck({ suggestion: { name: "Far Cafe", ...far } }), "far_reason");
  assert.deepEqual(
    batchProblems(batch(venueCheck({ suggestion: { name: "Far Cafe", ...far }, far_reason: "Photo taken at home later." })), j),
    [],
  );
  fails(venueCheck({ alternatives: Array(5).fill({ name: "Cafe" }) }), "at most 4");
  const picked = journal(visit("v1", { venue: { ...before, match: { confidence: "sure", basis: "picked" } } }), visit("v2"));
  assert.ok(batchProblems(batch(venueCheck()), picked).some((p) => p.includes("already picked")));
  fails(dishCheck({ suggestion: {} }), "suggest a cuisine");
  const hasCuisine = visit("v1");
  hasCuisine.dishes[0].cuisine = "Greek";
  assert.ok(
    batchProblems(
      batch(dishCheck({ dishes: [{ visit_id: "v1", dish_id: "v1_dish", before: { cuisine: "Greek", tags: [] } }] })),
      journal(hasCuisine),
    ).some((p) => p.includes("only fill blanks")),
  );
});

test("answers are shape checked as they arrive", () => {
  assert.equal(answerProblem({ check_id: "chk_one", pick: "alt:2" }), null);
  assert.ok(answerProblem({ check_id: "../x", pick: "keep" }));
  assert.ok(answerProblem({ check_id: "chk_one", pick: "rating" }));
  assert.ok(answerProblem({ check_id: "chk_one", pick: "typed", name: "  " }));
  assert.ok(answerProblem({ check_id: "chk_one", pick: "keep", exclude: "v1" }));
});

test("runApply saves once, clears the queue and leaves answers waiting on a conflict", async () => {
  const store = memoryStore();
  const repo = memoryRepo(journal(visit("v1"), visit("v2")));
  const readChecks = async () => [venueCheck()];
  assert.deepEqual(await runApply({ repo, store, readChecks }), { applied: 0, held: 0, rejected: 0, version: null });
  await saveAnswer(store, { check_id: "chk_one", pick: "suggestion" });
  const conflicted = {
    ...repo,
    getJournal: repo.getJournal,
    saveJournal: async () => {
      throw Object.assign(new Error("conflict"), { code: "conflict", status: 409 });
    },
  };
  await assert.rejects(runApply({ repo: conflicted, store, readChecks }));
  assert.equal((await readPending(store)).length, 1, "still waiting");
  const out = await runApply({ repo, store, readChecks });
  assert.equal(out.applied, 1);
  assert.equal(repo.saves, 1);
  assert.equal(repo.saved.visits[0].venue.name, "Two Herons Cafe");
  assert.equal((await readPending(store)).length, 0);
  assert.equal((await readDone(store)).checks.chk_one.outcome, "applied");
  assert.equal(await undoAnswer(store, "chk_one"), false, "too late to undo");
  assert.equal(answerStats(await readDone(store), []).suggestion, 1);
});

test("the API takes answers without touching the journal, and hides answered checks", async () => {
  const store = memoryStore();
  const repo = memoryRepo(journal(visit("v1"), visit("v2")));
  const handler = createFoodChecksHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: "configured", SESSION_SECRET: "x".repeat(32) },
    verifySessionToken: () => ({ valid: true }),
    createFoodJournalRepository: () => repo,
    getCheckStore: async () => store,
    readChecks: async () => [venueCheck(), dishCheck()],
  });
  const call = async (method, body) => {
    const res = await handler(
      new Request("https://x.test/api/food-checks", {
        method,
        ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
      }),
    );
    return { status: res.status, body: await res.json() };
  };
  assert.equal((await call("GET")).body.data.checks.length, 2);
  const bad = await call("POST", { action: "answer", answer: { check_id: "chk_one", pick: "nope" } });
  assert.equal(bad.status, 400);
  assert.equal((await call("POST", { action: "answer", answer: { check_id: "chk_one", pick: "suggestion" } })).status, 200);
  assert.equal(repo.saves, 0, "a tap never writes the journal");
  const after = (await call("GET")).body.data;
  assert.deepEqual(after.checks.map((c) => c.id), ["chk_dish"]);
  assert.equal(after.waiting, 1);
  assert.equal(after.stats.suggestion, 1);
  assert.equal((await call("POST", { action: "undo", check_id: "chk_one" })).status, 200);
  assert.equal((await call("POST", { action: "undo", check_id: "chk_one" })).status, 409);
  await call("POST", { action: "answer", answer: { check_id: "chk_one", pick: "suggestion" } });
  assert.equal((await call("POST", { action: "apply" })).body.data.applied, 1);
  assert.equal(repo.saved.visits[1].venue.name, "Two Herons Cafe");
  const signedOut = createFoodChecksHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: "configured", SESSION_SECRET: "x".repeat(32) },
    verifySessionToken: () => ({ valid: false }),
    createFoodJournalRepository: () => repo,
    getCheckStore: async () => store,
  });
  assert.equal((await signedOut(new Request("https://x.test/api/food-checks"))).status, 401);
});

test("the scheduled run does nothing with no answers and waits out a conflict", async () => {
  const store = memoryStore();
  let reads = 0;
  const repo = memoryRepo(journal(visit("v1"), visit("v2")));
  const handler = createFoodChecksApplyHandler({
    env: {},
    getCheckStore: async () => store,
    repo: {
      ...repo,
      getJournal: async () => {
        reads++;
        return repo.getJournal();
      },
      saveJournal: async () => {
        throw Object.assign(new Error("conflict"), { code: "conflict" });
      },
    },
    readChecks: async () => [venueCheck()],
  });
  assert.equal((await handler()).status, 202);
  assert.equal(reads, 0, "no GitHub read when nothing waits");
  await saveAnswer(store, { check_id: "chk_one", pick: "suggestion" });
  const res = await handler();
  assert.equal(res.status, 202);
  assert.equal((await res.json()).data.retry, true);
  assert.equal((await readPending(store)).length, 1);
});

test("rating cards come from unrated dishes, newest first, and skip can't-remember ones", async () => {
  const { openRatings, rateCheckId } = await import("../../apps/life/js/food-journal/quick-checks.js");
  const old = visit("v1", { date: "2020-01-01" });
  const recent = visit("v2", { date: "2026-05-01" });
  const rated = visit("v3");
  rated.dishes[0].rating = 4;
  const forgotten = visit("v4");
  forgotten.dishes[0].rating_unknown = true;
  const cards = openRatings(journal(old, recent, rated, forgotten));
  assert.deepEqual(cards.map((c) => c.dish.id), ["v2_dish", "v1_dish"]);
  assert.equal(cards[0].check.id, rateCheckId("v2_dish"));
  assert.deepEqual(
    openRatings(journal(old, recent), new Set([rateCheckId("v2_dish")])).map((c) => c.dish.id),
    ["v1_dish"],
  );
});

test("rating answers: half steps, can't remember, never over a rating Adam gave", async () => {
  const { rateCheckId } = await import("../../apps/life/js/food-journal/quick-checks.js");
  const id = rateCheckId("v1_dish");
  assert.equal(answerProblem({ check_id: id, pick: "rate", rating: 3.5 }), null);
  assert.equal(answerProblem({ check_id: id, pick: "unknown" }), null);
  assert.match(answerProblem({ check_id: id, pick: "rate", rating: 5.5 }), /half steps/);
  assert.match(answerProblem({ check_id: id, pick: "rate", rating: "4" }), /half steps/);
  assert.ok(answerProblem({ check_id: id, pick: "apply" }), "rating cards take ratings only");
  assert.ok(answerProblem({ check_id: "chk_dish", pick: "rate", rating: 4 }), "batch checks take no rating");

  const j = journal(visit("v1"), visit("v2"));
  const first = applyAnswers(j, [], [
    { check_id: id, pick: "rate", rating: 4.5 },
    { check_id: rateCheckId("v2_dish"), pick: "unknown" },
  ]);
  assert.equal(first.changed, true);
  assert.equal(first.journal.visits[0].dishes[0].rating, 4.5);
  assert.equal(first.journal.visits[1].dishes[0].rating_unknown, true);
  assert.equal(first.journal.visits[1].dishes[0].rating, null);
  assert.deepEqual(first.results.map((r) => r.outcome), ["applied", "applied"]);
  validateFoodJournal(first.journal);

  const again = applyAnswers(first.journal, [], [{ check_id: id, pick: "rate", rating: 4.5 }]);
  assert.equal(again.changed, false);
  assert.equal(again.results[0].outcome, "applied");
  const clash = applyAnswers(first.journal, [], [{ check_id: id, pick: "rate", rating: 2 }]);
  assert.equal(clash.results[0].outcome, "held");
  assert.equal(clash.journal.visits[0].dishes[0].rating, 4.5);
  const gone = applyAnswers(j, [], [{ check_id: rateCheckId("missing"), pick: "rate", rating: 3 }]);
  assert.equal(gone.results[0].outcome, "held");
});

test("batches cannot borrow rating card ids, and the API saves the rating", async () => {
  const problems = batchProblems({ schema_version: 1, checks: [dishCheck({ id: "chk_rate_v1_dish" })] }, journal(visit("v1")));
  assert.ok(problems.some((p) => /rating cards/.test(p)));
  const store = memoryStore();
  const handler = createFoodChecksHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: "configured", SESSION_SECRET: "x".repeat(32) },
    verifySessionToken: () => ({ valid: true }),
    createFoodJournalRepository: () => memoryRepo(journal(visit("v1"))),
    getCheckStore: async () => store,
    readChecks: async () => [],
  });
  const res = await handler(
    new Request("https://x.test/api/food-checks", {
      method: "POST",
      body: JSON.stringify({ action: "answer", answer: { check_id: "chk_rate_v1_dish", pick: "rate", rating: 3 } }),
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual((await readPending(store))[0], { check_id: "chk_rate_v1_dish", pick: "rate", rating: 3 });
  const got = (await (await handler(new Request("https://x.test/api/food-checks"))).json()).data;
  assert.deepEqual(got.waiting_ids, ["chk_rate_v1_dish"]);
  assert.equal(got.stats.rate, 1);
});

test("cuisine rules: named cuisines win over plate types", async () => {
  const { cuisineRuleFor } = await import("../../apps/life/js/food-journal/cuisine-rules.js");
  const dish = (title, tags = []) => ({ title, tags });
  assert.equal(cuisineRuleFor(dish("Chicken schnitzel"))?.cuisine, "Pub");
  assert.equal(cuisineRuleFor(dish("Something", ["Eggs Benedict"]))?.cuisine, "Café");
  assert.equal(cuisineRuleFor(dish("Thai fried chicken"))?.cuisine, "Thai");
  assert.equal(cuisineRuleFor(dish("Tonkotsu ramen"))?.cuisine, "Japanese");
  assert.equal(cuisineRuleFor(dish("Piemonte salad"))?.cuisine, undefined, "whole words only");
  assert.equal(cuisineRuleFor(dish("Garden salad", ["salad"])), null);
});
