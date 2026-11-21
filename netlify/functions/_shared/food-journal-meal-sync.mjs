import { load } from "js-yaml";
import { decodeBlob } from "./decode-blob.mjs";
import { parseNutritionMealPath } from "./delete-meal.mjs";
import { validateFoodJournal } from "./food-journal-schema.mjs";

const PATH = "data/food-journal/journal.json";

export function markDishCounted(journal, record, mealPath, nowIso) {
  const next = structuredClone(journal);
  const dish = next.visits
    .flatMap((v) => v.dishes)
    .find((d) => d.id === record.food_dish_id);
  if (!dish) return null;
  const fraction = record.portion_fraction;
  dish.brisket = {
    meal_path: mealPath,
    portion:
      typeof record.portion === "string" && record.portion.trim()
        ? record.portion.trim()
        : "All",
    portion_fraction:
      typeof fraction === "number" && fraction > 0 && fraction <= 1
        ? fraction
        : 1,
    counted_at: nowIso,
    needs_recount: false,
  };
  // Keep only numbers the schema accepts, so a stray value can't block the save.
  for (const k of ["calories", "protein_g", "fat_g"])
    if (Number.isFinite(record[k]) && record[k] >= 0) dish.brisket[k] = record[k];
  return next;
}

// Best effort, like the Central Node sync: the meal is already saved.
export async function syncFoodJournalAfterMeal(client, record, mealPath, nowIso) {
  const { tree } = await client.resolveTree();
  const blob = tree.find((b) => b.path === PATH && b.type === "blob");
  if (!blob) return { updated: false };
  const journal = validateFoodJournal(
    JSON.parse(decodeBlob(await client.readBlob(blob.sha))),
  );
  const next = markDishCounted(journal, record, mealPath, nowIso);
  if (!next) return { updated: false, reason: "dish_missing" };
  validateFoodJournal(next);
  await client.writeFile({
    path: PATH,
    content: `${JSON.stringify(next, null, 2)}\n`,
    sha: blob.sha,
    message: "food-journal: dish counted in Brisket",
  });
  return { updated: true };
}

// True only when a meal file's frontmatter says it is this dish's meal.
// Unreadable or odd frontmatter counts as someone else's meal.
export function mealNamesDish(text, dishId) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(
    typeof text === "string" ? text.trim() : "",
  );
  if (!match) return false;
  try {
    const front = load(match[1]);
    return front?.type === "meal" && front.food_dish_id === dishId;
  } catch {
    return false;
  }
}

async function blobNamesDish(client, sha, dishId) {
  try {
    return mealNamesDish(decodeBlob(await client.readBlob(sha)), dishId);
  } catch {
    return false;
  }
}

// The meal file a dish was last counted into, while it is still in the tree
// and still holds this dish's meal. Anything else at that path is left alone.
export async function findCountedMeal(client, tree, dishId) {
  const blob = tree.find((b) => b.path === PATH && b.type === "blob");
  if (!blob) return null;
  let journal;
  try {
    journal = JSON.parse(decodeBlob(await client.readBlob(blob.sha)));
  } catch {
    return null;
  }
  const dish = (journal?.visits ?? [])
    .flatMap((v) => v?.dishes ?? [])
    .find((d) => d?.id === dishId);
  const parsed = parseNutritionMealPath(dish?.brisket?.meal_path);
  if (!parsed) return null;
  const entry = tree.find((b) => b.path === parsed.path && b.type === "blob");
  if (!entry || !(await blobNamesDish(client, entry.sha, dishId))) return null;
  return { ...parsed, sha: entry.sha };
}

// After a re-count lands in a new file, remove the old one, but only when it
// still names this dish, so an unrelated meal is never deleted.
// Returns null when there was nothing of ours to remove.
export async function removeOldCountedMeal(client, prior, dishId) {
  if (!(await blobNamesDish(client, prior.sha, dishId))) return null;
  await client.deleteFile({
    path: prior.path,
    sha: prior.sha,
    message: `chore(nutrition): replace re-counted meal ${prior.path.split("/").pop()}`,
  });
  return { date: prior.date, meal: prior.meal };
}

// Where a Food Journal dish's meal is written. Dishes carry no time of their
// own, so dishes from one meal logged together derive the same path
// (dinner-1600). A file there that
// is not this dish's meal is someone else's: step the minute until the path is
// free or holds this dish, so a second dish never collides with or replaces
// the first. Returns { path, existingSha } (existingSha only for this dish's
// own file).
export async function resolveDishMealPath(client, tree, path, dishId) {
  const match = /^(.*-[a-z]+-)(\d{2})(\d{2})\.md$/.exec(path);
  if (!match) return { path, existingSha: undefined };
  const start = Number(match[2]) * 60 + Number(match[3]);
  for (let minute = start; minute < 24 * 60; minute += 1) {
    const hh = String(Math.floor(minute / 60)).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    const candidate = `${match[1]}${hh}${mm}.md`;
    const entry = (tree ?? []).find(
      (b) => b?.type === "blob" && b.path === candidate,
    );
    if (!entry) return { path: candidate, existingSha: undefined };
    if (await blobNamesDish(client, entry.sha, dishId))
      return { path: candidate, existingSha: entry.sha };
  }
  return { path, existingSha: undefined };
}
