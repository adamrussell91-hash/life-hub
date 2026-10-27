import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyJournal,
  newVisit,
  FOOD_TAGS,
  foodTagOptions,
  cuisineFor,
  mealAt,
  pastVenues,
} from "../../apps/life/js/food-journal/model.js";
import {
  menuIngredientsFor,
  ingredientsFromMenu,
} from "../../apps/life/js/food-journal/capture.js";
import { validateFoodJournal } from "../../netlify/functions/_shared/food-journal-schema.mjs";

test("food tags offer foods, the person's own food tags first", () => {
  const options = foodTagOptions(["ramen", "spicy", "burger"], [], "");
  assert.deepEqual(options.slice(0, 3), ["Ramen", "Burger", "Sandwich"]);
  // Moods used before are not offered as foods.
  assert.ok(!options.includes("Spicy"));
  assert.equal(options.length, FOOD_TAGS.length);
});

test("food tags leave out what the dish already has, ignoring case", () => {
  const options = foodTagOptions([], ["burger", "Chips"], "");
  assert.ok(!options.includes("Burger"));
  assert.ok(!options.includes("Chips"));
});

test("searching food tags finds foods and the person's other tags", () => {
  assert.deepEqual(foodTagOptions([], [], "nood"), ["Noodles"]);
  assert.deepEqual(foodTagOptions(["laksa"], [], "lak"), ["Laksa"]);
  assert.deepEqual(foodTagOptions([], [], "zzz"), []);
});

test("a food tag suggests a cuisine", () => {
  assert.equal(cuisineFor(["Chips", "burger"]), "American");
  assert.equal(cuisineFor(["Ramen"]), "Japanese");
  assert.equal(cuisineFor(["Salad"]), "");
  assert.equal(cuisineFor(), "");
});

test("the meal follows the time of day in Sydney", () => {
  // 27 Oct 2026 is daylight time, UTC+11.
  assert.equal(mealAt(new Date("2026-10-26T21:00:00Z")), "Breakfast"); // 8:00
  assert.equal(mealAt(new Date("2026-10-27T01:30:00Z")), "Lunch"); // 12:30
  assert.equal(mealAt(new Date("2026-10-27T05:00:00Z")), "Snack"); // 16:00
  assert.equal(mealAt(new Date("2026-10-27T08:00:00Z")), "Dinner"); // 19:00
});

test("typed venues match places logged before, latest first", () => {
  const j = emptyJournal();
  const add = (date, name, address) => {
    const v = newVisit();
    v.date = date;
    v.venue = { name, address };
    v.dishes[0].title = "Dish";
    j.visits.push(v);
  };
  add("2026-10-01", "Ramen Bar", "1 Old St");
  add("2026-10-20", "Ramen Bar", "2 New St");
  add("2026-10-10", "Bar Italia", "3 Leichhardt Rd");
  add("2026-10-05", "Corner Café", "");
  const found = pastVenues(j, "bar");
  assert.deepEqual(
    found.map((v) => [v.name, v.address]),
    [
      ["Ramen Bar", "2 New St"],
      ["Bar Italia", "3 Leichhardt Rd"],
    ],
  );
  // Nothing typed, or the exact name already typed, offers nothing.
  assert.deepEqual(pastVenues(j, ""), []);
  assert.deepEqual(pastVenues(j, "corner café"), []);
});

test("a dish typed by name picks up the menu's ingredients", () => {
  const visit = {
    ...newVisit(),
    menu_items: [
      { name: "Smash burger", description: "Beef, cheese, pickles", kind: "dish" },
      { name: "Add bacon", description: "Streaky bacon", kind: "extra" },
      { name: "唐揚げ", name_en: "Karaage", description: "鶏肉", description_en: "Fried chicken", kind: "dish" },
    ],
  };
  assert.deepEqual(menuIngredientsFor(visit, " smash BURGER "), {
    ingredients: "Beef, cheese, pickles",
  });
  assert.deepEqual(menuIngredientsFor(visit, "Karaage"), {
    ingredients: "Fried chicken",
    ingredients_original: "鶏肉",
  });
  assert.equal(menuIngredientsFor(visit, "Add bacon"), null);
  assert.equal(menuIngredientsFor(visit, "Pizza"), null);
  assert.equal(menuIngredientsFor(visit, ""), null);
});

test("ingredients read as from the menu until they are edited", () => {
  const visit = {
    ...newVisit(),
    menu_items: [{ name: "Smash burger", description: "Beef, cheese", kind: "dish" }],
  };
  const dish = { ...visit.dishes[0], ingredients: "Beef, cheese\n+ Add bacon" };
  assert.equal(ingredientsFromMenu(visit, dish), true);
  assert.equal(ingredientsFromMenu(visit, { ...dish, ingredients: "Beef only" }), false);
  assert.equal(ingredientsFromMenu(visit, { ...dish, ingredients: "" }), false);
});

test("would order again saves as yes or no only", () => {
  const j = emptyJournal();
  const v = newVisit();
  v.dishes[0].title = "Burger";
  v.dishes[0].order_again = true;
  j.visits.push(v);
  assert.doesNotThrow(() => validateFoodJournal(j));
  v.dishes[0].order_again = "yes";
  assert.throws(() => validateFoodJournal(j), /Order again/);
});
