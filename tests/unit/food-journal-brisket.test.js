import test from "node:test";
import assert from "node:assert/strict";
import { handoffMessage, needsRecount } from "../../apps/life/js/food-journal/brisket-handoff.js";

const visit = { id: "visit_1", date: "2026-10-22", venue: { name: "Test Pizzeria" } };
const dish = { id: "dish_1", title: "Margherita", meal_type: "Dinner", ingredients: "Tomato, mozzarella, basil\n+ Add prosciutto", notes: "Wood-fired", rating: 4, tags: [], photos: [] };

test("the hand-off names the dish, ingredients, portion and the ids to copy", () => {
  const text = handoffMessage({ visit, dish, portion: { portion: "2 of 8", portion_fraction: 0.25, note: "skipped the crusts" } });
  assert.match(text, /Margherita/);
  assert.match(text, /Test Pizzeria/);
  assert.match(text, /Tomato, mozzarella, basil/);
  assert.match(text, /\+ Add prosciutto/);
  assert.match(text, /2 of 8/);
  assert.match(text, /skipped the crusts/);
  assert.match(text, /food_dish_id: dish_1/);
  assert.match(text, /portion_fraction: 0\.25/);
  assert.match(text, /meal: dinner/);
  assert.match(text, /date: 2026-10-22/);
});

test("the English title is sent beside the original", () => {
  const text = handoffMessage({ visit, dish: { ...dish, title: "Pizza Margherita", title_en: "Margherita pizza" }, portion: { portion: "All", portion_fraction: 1 } });
  assert.match(text, /Dish: Margherita pizza \(Pizza Margherita\)/);
});

test("drinks map to the snack meal", () => {
  const text = handoffMessage({ visit, dish: { ...dish, meal_type: "Drinks" }, portion: { portion: "All", portion_fraction: 1 } });
  assert.match(text, /meal: snack/);
});

test("a re-count hand-off carries the previous numbers", () => {
  const text = handoffMessage({ visit, dish, portion: { portion: "½", portion_fraction: 0.5 }, previous: { calories: 620, protein_g: 26, fat_g: 24 } });
  assert.match(text, /Re-count/);
  assert.match(text, /620 kcal, 26 g protein, 24 g fat/);
});

test("a re-count without previous numbers still asks for a re-count", () => {
  const text = handoffMessage({ visit, dish, portion: { portion: "½", portion_fraction: 0.5 }, previous: {} });
  assert.match(text, /Re-count this Food Journal dish\./);
  assert.doesNotMatch(text, /Last time|undefined|NaN/);
});

test("only nutrition fields trigger a re-count", () => {
  const counted = { ...dish, brisket: { meal_path: "data/nutrition/2026/10/2026-10-22-dinner-1930.md", portion: "½", portion_fraction: 0.5, counted_at: "2026-10-22T19:31:00+11:00", needs_recount: false } };
  assert.equal(needsRecount(counted, { ...counted, rating: 5, notes: "x", tags: ["a"], cuisine: "Italian" }), false);
  assert.equal(needsRecount(counted, { ...counted, title: "Marinara" }), true);
  assert.equal(needsRecount(counted, { ...counted, title_en: "Marinara" }), true);
  assert.equal(needsRecount(counted, { ...counted, ingredients: "Tomato" }), true);
  assert.equal(needsRecount(counted, { ...counted, photos: [{ id: "p", key: "food/photos/p.jpg" }] }), true);
  assert.equal(needsRecount(dish, { ...dish, title: "Marinara" }), false, "uncounted dishes never need a re-count");
});
