import test from "node:test";
import assert from "node:assert/strict";
import { handoffBatchMessage, handoffMessage, needsRecount } from "../../apps/life/js/food-journal/brisket-handoff.js";

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

// Tapas: every dish goes in one message, so Brisket proposes them in one turn.
test("several dishes go to Brisket in one message, each with its own ids", () => {
  const second = { ...dish, id: "dish_2", title: "Patatas bravas", ingredients: "" };
  const third = { ...dish, id: "dish_3", title: "Croquetas", title_en: "Croquettes" };
  const text = handoffBatchMessage({
    visit,
    photos: [1, 3],
    items: [
      { dish, portion: { portion: "All", portion_fraction: 1 } },
      { dish: second, portion: { portion: "½", portion_fraction: 0.5 } },
      { dish: third, portion: { portion: "All", portion_fraction: 1 }, previous: { calories: 300, protein_g: 10, fat_g: 15 } },
    ],
  });
  assert.match(text, /^Count these 3 Food Journal dishes/);
  assert.match(text, /one log_entry per dish/);
  assert.match(text, /Photos attached, in order, for dishes 1, 3\./);
  assert.equal(text.match(/Venue: Test Pizzeria/g).length, 1);
  for (const id of ["dish_1", "dish_2", "dish_3"]) assert.match(text, new RegExp(`food_dish_id: ${id}`));
  assert.equal(text.match(/date: 2026-10-22/g).length, 3);
  assert.match(text, /portion_fraction: 0\.5/);
  assert.match(text, /Ingredients: not on the menu/);
  assert.match(text, /3\. Re-count\.\nLast time: 300 kcal/);
  assert.match(text, /Dish: Croquettes \(Croquetas\)/);
  assert.match(text, /replaces its earlier log; every other dish is a new log/);
  assert.ok(text.indexOf("dish_1") < text.indexOf("dish_2") && text.indexOf("dish_2") < text.indexOf("dish_3"));
});

test("one dish sent as a batch is the plain single-dish hand-off", () => {
  const portion = { portion: "All", portion_fraction: 1 };
  assert.equal(handoffBatchMessage({ visit, items: [{ dish, portion }], photos: [1] }), handoffMessage({ visit, dish, portion }));
});
