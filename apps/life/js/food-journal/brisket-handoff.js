// What Brisket needs to count a Food Journal dish, and when a counted dish
// has changed enough to count again.
const MEAL = { Breakfast: "breakfast", Lunch: "lunch", Dinner: "dinner", Snack: "snack", Dessert: "dessert", Drinks: "snack" };
const NUTRITION = ["title", "title_en", "ingredients"];

const hasNumbers = (p) => [p?.calories, p?.protein_g, p?.fat_g].every((n) => typeof n === "number" && Number.isFinite(n));

export function handoffMessage({ visit, dish, portion, previous }) {
  const title = dish.title_en || dish.title;
  let opening = "Count this Food Journal dish for me.";
  if (previous) {
    opening = "Re-count this Food Journal dish.";
    if (hasNumbers(previous)) opening += ` Last time: ${previous.calories} kcal, ${previous.protein_g} g protein, ${previous.fat_g} g fat. Show old → new.`;
  }
  const lines = [
    opening,
    `Dish: ${title}${dish.title_en ? ` (${dish.title})` : ""}`,
    visit.venue?.name ? `Venue: ${visit.venue.name}` : null,
    dish.ingredients ? `Ingredients:\n${dish.ingredients}` : "Ingredients: not on the menu",
    `I had: ${portion.portion}${portion.note ? ` (${portion.note})` : ""}`,
    "",
    "For the log, copy exactly:",
    `food_dish_id: ${dish.id}`,
    `portion: ${portion.portion}`,
    `portion_fraction: ${portion.portion_fraction}`,
    `meal: ${MEAL[dish.meal_type] || "snack"}`,
    `date: ${visit.date}`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function needsRecount(before, after) {
  if (!before?.brisket) return false;
  if (NUTRITION.some((k) => String(before[k] || "") !== String(after[k] || ""))) return true;
  const keys = (d) => (d.photos || []).map((p) => p.key).sort().join("|");
  return keys(before) !== keys(after);
}
