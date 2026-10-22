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
