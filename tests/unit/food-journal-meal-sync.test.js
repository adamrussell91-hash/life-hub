import test from "node:test";
import assert from "node:assert/strict";
import {
  findCountedMeal,
  mealNamesDish,
  removeOldCountedMeal,
  markDishCounted,
  syncFoodJournalAfterMeal,
} from "../../netlify/functions/_shared/food-journal-meal-sync.mjs";
import { persistLogEntry } from "../../netlify/functions/_shared/persist-log.mjs";

const journal = () => ({
  schema_version: 1,
  recipes: [],
  visits: [
    {
      id: "v1",
      date: "2026-10-22",
      title: "",
      notes: "",
      menu_text: "",
      venue: { name: "", address: "" },
      dishes: [
        {
          id: "dish_1",
          title: "Margherita",
          cuisine: "",
          meal_type: "Dinner",
          tags: [],
          rating: null,
          notes: "",
          ingredients: "",
          photos: [],
        },
      ],
    },
  ],
});
const record = {
  type: "meal",
  date: "2026-10-22",
  meal: "dinner",
  food_dish_id: "dish_1",
  portion: "½",
  portion_fraction: 0.5,
  calories: 620,
  protein_g: 26,
  fat_g: 24,
};
const path = "data/nutrition/2026/10/2026-10-22-dinner-1930.md";
const JOURNAL_PATH = "data/food-journal/journal.json";
const blob = (value) => ({
  encoding: "base64",
  content: Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value),
    "utf8",
  ).toString("base64"),
});

test("marks the dish counted with the meal path, portion and numbers", () => {
  const out = markDishCounted(journal(), record, path, "2026-10-22T19:31:00+11:00");
  assert.deepEqual(out.visits[0].dishes[0].brisket, {
    meal_path: path,
    portion: "½",
    portion_fraction: 0.5,
    counted_at: "2026-10-22T19:31:00+11:00",
    needs_recount: false,
    calories: 620,
    protein_g: 26,
    fat_g: 24,
  });
});

test("an unknown dish leaves the journal alone", () => {
  assert.equal(
    markDishCounted(journal(), { ...record, food_dish_id: "dish_x" }, path, "2026-10-22T19:31:00+11:00"),
    null,
  );
});

test("a missing portion counts the whole dish and missing numbers are left out", () => {
  const out = markDishCounted(
    journal(),
    { type: "meal", date: "2026-10-22", food_dish_id: "dish_1", calories: Number.NaN },
    path,
    "2026-10-22T19:31:00+11:00",
  );
  assert.deepEqual(out.visits[0].dishes[0].brisket, {
    meal_path: path,
    portion: "All",
    portion_fraction: 1,
    counted_at: "2026-10-22T19:31:00+11:00",
    needs_recount: false,
  });
});

function fakeClient(files) {
  const writes = [];
  const shas = Object.fromEntries(Object.keys(files).map((p, i) => [p, String(i + 1).repeat(40)]));
  return {
    writes,
    async resolveTree() {
      return { tree: Object.keys(files).map((p) => ({ path: p, type: "blob", sha: shas[p] })) };
    },
    async readBlob(sha) {
      const p = Object.keys(shas).find((k) => shas[k] === sha);
      return blob(files[p]);
    },
    async writeFile(args) {
      writes.push(args);
      return { sha: "a".repeat(40), commitSha: "b".repeat(40) };
    },
  };
}

test("sync writes journal.json with its sha and the dish counted", async () => {
  const client = fakeClient({ [JOURNAL_PATH]: journal() });
  const out = await syncFoodJournalAfterMeal(client, record, path, "2026-10-22T19:31:00+11:00");
  assert.deepEqual(out, { updated: true });
  assert.equal(client.writes.length, 1);
  assert.equal(client.writes[0].path, JOURNAL_PATH);
  assert.equal(client.writes[0].sha, "1".repeat(40));
  const saved = JSON.parse(client.writes[0].content);
  assert.equal(saved.visits[0].dishes[0].brisket.meal_path, path);
});

test("sync without a journal or dish writes nothing", async () => {
  const none = fakeClient({});
  assert.deepEqual(await syncFoodJournalAfterMeal(none, record, path, "2026-10-22T19:31:00+11:00"), { updated: false });
  const other = fakeClient({ [JOURNAL_PATH]: journal() });
  assert.deepEqual(
    await syncFoodJournalAfterMeal(other, { ...record, food_dish_id: "dish_x" }, path, "2026-10-22T19:31:00+11:00"),
    { updated: false },
  );
  assert.equal(none.writes.length + other.writes.length, 0);
});

function persistClient(files) {
  const client = fakeClient(files);
  return client;
}

test("persistLogEntry marks the dish for a meal with food_dish_id", async () => {
  const client = persistClient({ [JOURNAL_PATH]: journal() });
  const result = await persistLogEntry(client, {
    record,
    notes: "Pizza, half",
    path,
    nowDateKey: "2026-10-22",
    now: new Date("2026-10-22T08:31:00Z"),
  });
  assert.equal(result.foodJournalUpdated, true);
  const journalWrite = client.writes.find((w) => w.path === JOURNAL_PATH);
  assert.ok(journalWrite, "expected a journal.json write");
  const brisket = JSON.parse(journalWrite.content).visits[0].dishes[0].brisket;
  assert.equal(brisket.counted_at, "2026-10-22T19:31:00+11:00");
  assert.equal(brisket.meal_path, path);
});

test("persistLogEntry leaves the journal alone for a meal without food_dish_id", async () => {
  const client = persistClient({ [JOURNAL_PATH]: journal() });
  const { food_dish_id, portion, portion_fraction, ...plain } = record;
  const result = await persistLogEntry(client, {
    record: plain,
    notes: "",
    path,
    nowDateKey: "2026-10-22",
    now: new Date("2026-10-22T08:31:00Z"),
  });
  assert.equal(result.foodJournalUpdated, null);
  assert.equal(client.writes.some((w) => w.path === JOURNAL_PATH), false);
});

test("a journal that can't be read reports foodJournalUpdated:false and keeps the meal", async () => {
  const client = persistClient({ [JOURNAL_PATH]: "{not json" });
  const result = await persistLogEntry(client, {
    record,
    notes: "",
    path,
    nowDateKey: "2026-10-22",
    now: new Date("2026-10-22T08:31:00Z"),
  });
  assert.equal(result.foodJournalUpdated, false);
  assert.equal(client.writes[0].path, path);
  assert.equal(client.writes.some((w) => w.path === JOURNAL_PATH), false);
});

function countedJournal(mealPath) {
  const j = journal();
  j.visits[0].dishes[0].brisket = {
    meal_path: mealPath,
    portion: "All",
    portion_fraction: 1,
    counted_at: "2026-10-22T19:31:00+11:00",
    needs_recount: false,
  };
  return j;
}

const ownMeal = '---\ntype: "meal"\nmeal: "dinner"\nfood_dish_id: "dish_1"\n---\n';

test("mealNamesDish is true only for this dish's meal", () => {
  assert.equal(mealNamesDish(ownMeal, "dish_1"), true);
  assert.equal(mealNamesDish(ownMeal, "dish_2"), false);
  assert.equal(mealNamesDish('---\ntype: "meal"\nmeal: "dinner"\n---\n', "dish_1"), false);
  assert.equal(mealNamesDish('---\ntype: "diary"\nfood_dish_id: "dish_1"\n---\n', "dish_1"), false);
  assert.equal(mealNamesDish("---\nfood_dish_id: [unclosed\n---\n", "dish_1"), false);
  assert.equal(mealNamesDish("no frontmatter", "dish_1"), false);
  assert.equal(mealNamesDish(null, "dish_1"), false);
});

test("findCountedMeal won't return a file that now holds another meal", async () => {
  for (const other of ['---\ntype: "meal"\nmeal: "dinner"\n---\n', '---\ntype: "meal"\nfood_dish_id: "dish_2"\n---\n', "---\n: : bad\n---\n"]) {
    const client = fakeClient({ [JOURNAL_PATH]: countedJournal(path), [path]: other });
    assert.equal(await findCountedMeal(client, (await client.resolveTree()).tree, "dish_1"), null);
  }
});

test("findCountedMeal returns the counted meal while it is still in the tree", async () => {
  const client = fakeClient({ [JOURNAL_PATH]: countedJournal(path), [path]: ownMeal });
  const { tree } = await client.resolveTree();
  assert.deepEqual(await findCountedMeal(client, tree, "dish_1"), {
    path,
    date: "2026-10-22",
    meal: "dinner",
    slug: "dinner-1930",
    sha: "2".repeat(40),
  });
});

test("findCountedMeal returns null when the file is gone, the dish is uncounted or unknown", async () => {
  const gone = fakeClient({ [JOURNAL_PATH]: countedJournal(path) });
  assert.equal(await findCountedMeal(gone, (await gone.resolveTree()).tree, "dish_1"), null);
  const fresh = fakeClient({ [JOURNAL_PATH]: journal(), [path]: "x" });
  assert.equal(await findCountedMeal(fresh, (await fresh.resolveTree()).tree, "dish_1"), null);
  const counted = fakeClient({ [JOURNAL_PATH]: countedJournal(path), [path]: "x" });
  assert.equal(await findCountedMeal(counted, (await counted.resolveTree()).tree, "dish_x"), null);
  const noJournal = fakeClient({ [path]: "x" });
  assert.equal(await findCountedMeal(noJournal, (await noJournal.resolveTree()).tree, "dish_1"), null);
  const broken = fakeClient({ [JOURNAL_PATH]: "{not json", [path]: "x" });
  assert.equal(await findCountedMeal(broken, (await broken.resolveTree()).tree, "dish_1"), null);
});

function deletingClient(files) {
  const client = fakeClient(files);
  client.deletes = [];
  client.deleteFile = async (args) => {
    client.deletes.push(args);
    return { commitSha: "e".repeat(40) };
  };
  return client;
}

test("removeOldCountedMeal deletes the old file with its sha when it names this dish", async () => {
  const client = deletingClient({ [path]: '---\ntype: "meal"\nmeal: "dinner"\nfood_dish_id: "dish_1"\n---\n' });
  const prior = { path, date: "2026-10-22", meal: "dinner", sha: "1".repeat(40) };
  assert.deepEqual(await removeOldCountedMeal(client, prior, "dish_1"), { date: "2026-10-22", meal: "dinner" });
  assert.equal(client.deletes.length, 1);
  assert.equal(client.deletes[0].path, path);
  assert.equal(client.deletes[0].sha, "1".repeat(40));
});

test("removeOldCountedMeal leaves a meal for another dish, or no dish, alone", async () => {
  for (const front of ['food_dish_id: "dish_2"\n', ""]) {
    const client = deletingClient({ [path]: `---\ntype: "meal"\nmeal: "dinner"\n${front}---\n` });
    const prior = { path, date: "2026-10-22", meal: "dinner", sha: "1".repeat(40) };
    assert.equal(await removeOldCountedMeal(client, prior, "dish_1"), null);
    assert.equal(client.deletes.length, 0);
  }
});
