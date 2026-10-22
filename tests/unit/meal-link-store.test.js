import test from "node:test";
import assert from "node:assert/strict";
import { createMealLinkStore, blobSha } from "../../netlify/functions/_shared/meal-link-store.mjs";
import { GitHubClientError } from "../../netlify/functions/_shared/github-client.mjs";

const sha = (c) => c.repeat(40);
function fakeGithub(files, { failWith } = {}) {
  const commits = [];
  return {
    commits,
    async resolveTree() {
      return { commitSha: sha("c"), treeSha: sha("t"), tree: Object.keys(files).map((path, i) => ({ path, type: "blob", sha: String(i).repeat(40) })) };
    },
    async readBlob(s) {
      const path = Object.keys(files)[Number(s[0])];
      return { content: Buffer.from(files[path]).toString("base64"), encoding: "base64" };
    },
    async commitFiles(args) {
      if (failWith) throw failWith;
      commits.push(args);
      return { commitSha: sha("d") };
    },
  };
}

const passthrough = { validateFood: (j) => j, validateTravel: (j) => j };

test("reads both journals at one snapshot and writes them in one commit", async () => {
  const travel = { trip_id: "trp_test1" };
  const gh = fakeGithub({
    "data/food-journal/journal.json": JSON.stringify({ schema_version: 1, visits: [], recipes: [] }),
    "data/travel/journals/trp_test1.json": JSON.stringify(travel),
  });
  const store = createMealLinkStore({ github: gh, ...passthrough });
  const snap = await store.read("trp_test1");
  assert.deepEqual(snap.travel.journal, travel);
  assert.equal(snap.food.version, "0".repeat(40));
  const out = await store.write(snap, { food: snap.food.journal, travels: [{ tripId: "trp_test1", journal: snap.travel.journal }], message: "travel-meal: link" });
  assert.equal(gh.commits.length, 1);
  assert.deepEqual(gh.commits[0].files.map((f) => f.path).sort(), ["data/food-journal/journal.json", "data/travel/journals/trp_test1.json"]);
  assert.equal(gh.commits[0].parentSha, sha("c"));
  assert.equal(gh.commits[0].baseTreeSha, sha("t"));
  assert.equal(out.commitSha, sha("d"));
  assert.equal(out.foodVersion, blobSha(gh.commits[0].files.find((f) => f.path.startsWith("data/food")).content));
  assert.deepEqual(out.travelVersions, { trp_test1: blobSha(gh.commits[0].files.find((f) => f.path.startsWith("data/travel")).content) });
});

test("blobSha matches git hash-object", () => {
  assert.equal(blobSha("hi\n"), "45b983be36b73c0788dc9cbcb76cbb80fc7bb057");
});

test("a client version that does not match either file is a conflict", async () => {
  const gh = fakeGithub({
    "data/food-journal/journal.json": JSON.stringify({ schema_version: 1, visits: [], recipes: [] }),
    "data/travel/journals/trp_test1.json": "{}",
  });
  const store = createMealLinkStore({ github: gh, ...passthrough });
  const snap = await store.read("trp_test1");
  assert.throws(() => store.assertVersions(snap, { travel: "f".repeat(40), food: snap.food.version }), (e) => e.status === 409 && e.code === "conflict");
  assert.throws(() => store.assertVersions(snap, { travel: snap.travel.version, food: "f".repeat(40) }), (e) => e.status === 409);
  store.assertVersions(snap, { travel: snap.travel.version, food: snap.food.version });
});

test("a missing Food Journal reads as empty with a null version, and undefined matches null", async () => {
  const gh = fakeGithub({ "data/travel/journals/trp_test1.json": "{}" });
  const store = createMealLinkStore({ github: gh, ...passthrough });
  const snap = await store.read("trp_test1");
  assert.equal(snap.food.version, null);
  assert.deepEqual(snap.food.journal, { schema_version: 1, visits: [], recipes: [] });
  store.assertVersions(snap, { travel: snap.travel.version, food: undefined });
  store.assertVersions(snap, { travel: snap.travel.version, food: null });
});

test("a missing trip journal is a 404", async () => {
  const gh = fakeGithub({});
  const store = createMealLinkStore({ github: gh, ...passthrough });
  await assert.rejects(() => store.read("trp_test1"), (e) => e.status === 404 && e.code === "not_found");
});

test("a moved branch on commit becomes a 409 conflict", async () => {
  const gh = fakeGithub(
    { "data/travel/journals/trp_test1.json": "{}" },
    { failWith: new GitHubClientError("write_conflict", true) },
  );
  const store = createMealLinkStore({ github: gh, ...passthrough });
  const snap = await store.read("trp_test1");
  await assert.rejects(
    () => store.write(snap, { food: snap.food.journal, travels: [{ tripId: "trp_test1", journal: snap.travel.journal }], message: "m" }),
    (e) => e.status === 409 && e.code === "conflict",
  );
});

// The branch moves once between read and write; `changed` names the files the other commit touched.
function movedGithub(changed = []) {
  const files = {
    "data/food-journal/journal.json": JSON.stringify({ schema_version: 1, visits: [], recipes: [] }),
    "data/travel/journals/trp_test1.json": "{}",
    "data/notes/other.md": "x",
  };
  const paths = Object.keys(files);
  let moved = false;
  const gh = {
    commits: [],
    attempts: 0,
    async resolveTree() {
      return {
        commitSha: sha(moved ? "e" : "c"),
        treeSha: sha(moved ? "u" : "t"),
        tree: paths.map((path, i) => ({ path, type: "blob", sha: (moved && (changed.includes(path) || path === "data/notes/other.md") ? "9" : String(i)).repeat(40) })),
      };
    },
    async readBlob(s) {
      return { content: Buffer.from(files[paths[Number(s[0])]]).toString("base64"), encoding: "base64" };
    },
    async commitFiles(args) {
      gh.attempts += 1;
      if (!moved) {
        moved = true;
        throw new GitHubClientError("write_conflict", true);
      }
      gh.commits.push(args);
      return { commitSha: sha("d") };
    },
  };
  return gh;
}

test("a branch moved only by unrelated files retries once on the new commit", async () => {
  const gh = movedGithub();
  const store = createMealLinkStore({ github: gh, ...passthrough });
  const snap = await store.read("trp_test1");
  const out = await store.write(snap, { food: snap.food.journal, travels: [{ tripId: "trp_test1", journal: snap.travel.journal }], message: "m" });
  assert.equal(gh.attempts, 2);
  assert.equal(gh.commits[0].parentSha, sha("e"));
  assert.equal(gh.commits[0].baseTreeSha, sha("u"));
  assert.equal(out.commitSha, sha("d"));
});

test("a branch that moved either journal stays a 409", async () => {
  for (const path of ["data/food-journal/journal.json", "data/travel/journals/trp_test1.json"]) {
    const gh = movedGithub([path]);
    const store = createMealLinkStore({ github: gh, ...passthrough });
    const snap = await store.read("trp_test1");
    await assert.rejects(
      () => store.write(snap, { food: snap.food.journal, travels: [{ tripId: "trp_test1", journal: snap.travel.journal }], message: "m" }),
      (e) => e.status === 409 && e.code === "conflict",
    );
    assert.equal(gh.attempts, 1, path);
  }
});
