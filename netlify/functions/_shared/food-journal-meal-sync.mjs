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
  if (!next) return { updated: false };
  validateFoodJournal(next);
  await client.writeFile({
    path: PATH,
    content: `${JSON.stringify(next, null, 2)}\n`,
    sha: blob.sha,
    message: "food-journal: dish counted in Brisket",
  });
  return { updated: true };
}

// The meal file a dish was last counted into, when a re-count can safely
// replace it: still in the tree, and the same date and meal slot, since
// both are part of the path that delete-meal reads.
export async function findCountedMealPath(client, tree, dishId, { date, meal } = {}) {
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
  const mealPath = dish?.brisket?.meal_path;
  const parsed = parseNutritionMealPath(mealPath);
  if (!parsed || parsed.date !== date || parsed.meal !== meal) return null;
  return tree.some((b) => b.path === mealPath && b.type === "blob")
    ? mealPath
    : null;
}
