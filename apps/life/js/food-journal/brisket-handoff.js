// What Brisket needs to count a Food Journal dish, and when a counted dish
// has changed enough to count again.
const MEAL = { Breakfast: "breakfast", Lunch: "lunch", Dinner: "dinner", Snack: "snack", Dessert: "dessert", Drinks: "snack" };
const NUTRITION = ["title", "title_en", "ingredients"];

const hasNumbers = (p) => [p?.calories, p?.protein_g, p?.fat_g].every((n) => typeof n === "number" && Number.isFinite(n));

// The lines Brisket copies into one dish's log_entry.
function dishBlock({ visit, dish, portion }) {
  const title = dish.title_en || dish.title;
  return [
    `Dish: ${title}${dish.title_en ? ` (${dish.title})` : ""}`,
    dish.ingredients ? `Ingredients:\n${dish.ingredients}` : "Ingredients: not on the menu",
    `I had: ${portion.portion}${portion.note ? ` (${portion.note})` : ""}`,
    "For the log, copy exactly:",
    `food_dish_id: ${dish.id}`,
    `portion: ${portion.portion}`,
    `portion_fraction: ${portion.portion_fraction}`,
    `meal: ${MEAL[dish.meal_type] || "snack"}`,
    `date: ${visit.date}`,
  ];
}

// Several dishes from one meal in one message, so Brisket researches them
// together and proposes every log in one turn instead of one turn per dish.
// `photos` lists the 1-based numbers of the dishes whose photo rides along,
// in attachment order.
export function handoffBatchMessage({ visit, items, photos = [] }) {
  if (items.length === 1)
    return handoffMessage({ visit, ...items[0] });
  const recount = items.some((i) => i.previous);
  const lines = [
    `Count these ${items.length} Food Journal dishes for me, all from one meal. Research them together and propose every dish in this one turn: one log_entry per dish, in this order.`,
    visit.venue?.name ? `Venue: ${visit.venue.name}` : null,
    photos.length
      ? `Photos attached, in order, for dish${photos.length === 1 ? "" : "es"} ${photos.join(", ")}.`
      : null,
  ];
  items.forEach((item, n) => {
    lines.push("", `${n + 1}.${item.previous ? " Re-count." : ""}`);
    if (item.previous && hasNumbers(item.previous))
      lines.push(`Last time: ${item.previous.calories} kcal, ${item.previous.protein_g} g protein, ${item.previous.fat_g} g fat. Show old → new.`);
    lines.push(...dishBlock({ visit, ...item }));
  });
  if (recount) lines.push("", "A dish marked Re-count replaces its earlier log; every other dish is a new log.");
  return lines.filter((l) => l !== null).join("\n");
}

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
