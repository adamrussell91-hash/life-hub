import { createHubFilter } from "../../../../packages/design-kit/js/hub-filter-menu.js";
import { formatDisplayDate } from "../../../../packages/design-kit/js/format-display-date.js";
import {
  MEAL_TYPES,
  bookRecipes,
  filterRecipes,
  sortRecipes,
  recipeLetter,
  recipeSections,
} from "./model.js";
import { monthLabel } from "./pages.js";

// The Recipe Book tab: a masthead, the three newest recipes as a photo
// spread, then a cookbook index of every recipe. The view owns the filter
// state (ctx.book) and the recipe editor; this only builds DOM.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ#"];

function plate(ctx, dish, cls) {
  const box = el("div", cls);
  if (dish.photos[0]) box.append(ctx.photoNode(dish.photos[0]));
  else {
    box.classList.add("is-monogram");
    box.setAttribute("aria-hidden", "true");
    box.textContent = recipeLetter(dish.title || "").replace("#", "·");
  }
  return box;
}
function kickerText({ dish }) {
  return [dish.meal_type, dish.cuisine].filter(Boolean).join(" · ");
}
function spreadCard(ctx, entry) {
  const { recipe, dish } = entry;
  const card = el("article", "fj-book__card");
  card.append(
    plate(ctx, { ...dish, title: recipe.title }, "fj-book__card-media"),
    el("div", "fj-cover__shade"),
  );
  const body = el("div", "fj-book__card-body");
  const title = el("h3", "fj-book__card-title fj-serif");
  const open = el("button", "fj-stretch", recipe.title);
  open.type = "button";
  open.addEventListener("click", () => ctx.openBookRecipe(recipe, open));
  title.append(open);
  const meta = [
    `Serves ${recipe.servings}`,
    plural(recipe.ingredients.length, "ingredient", "ingredients"),
  ];
  if (recipe.added_at) meta.push(`added ${formatDisplayDate(recipe.added_at)}`);
  body.append(
    el("p", "fj-kicker", kickerText(entry)),
    title,
    el("p", "fj-book__card-meta", meta.join(" · ")),
  );
  card.append(body);
  return card;
}
function indexEntry(ctx, entry) {
  const { recipe, dish } = entry;
  const row = el("button", "fj-book__entry");
  row.type = "button";
  row.dataset.recipeId = recipe.id;
  row.addEventListener("click", () => ctx.openBookRecipe(recipe, row));
  const main = el("span", "fj-book__entry-main");
  const line = el("span", "fj-book__entry-line");
  line.append(
    el("span", "fj-book__entry-title fj-serif", recipe.title),
    el("span", "fj-leader"),
    el("span", "fj-book__serves", `serves ${recipe.servings}`),
  );
  const meta = el("span", "fj-book__entry-meta");
  if (dish.meal_type) meta.append(el("b", "", dish.meal_type));
  meta.append(
    [
      dish.cuisine,
      plural(recipe.ingredients.length, "ingredient", "ingredients"),
      plural(recipe.steps.length, "step", "steps"),
    ]
      .filter(Boolean)
      .join(" · "),
  );
  main.append(line, meta);
  row.append(plate(ctx, { ...dish, title: recipe.title }, "fj-book__thumb"), main);
  return row;
}

export function paintRecipeBook(ctx, host) {
  const state = ctx.book;
  const all = bookRecipes(ctx.journal());
  const page = el("div", "fj-book");
  page.dataset.recipeBook = "";
  const mast = el("header", "fj-masthead");
  const word = el("h2", "fj-masthead__word fj-serif");
  word.append("The ", el("em", "", "Recipe"), " Book");
  const cuisines = [
    ...new Set(all.map((x) => x.dish.cuisine).filter(Boolean)),
  ].sort();
  const newest = sortRecipes(all, "recent")[0]?.recipe.added_at;
  const edition = el("p", "fj-masthead__edition");
  edition.append(
    el("span", "", plural(all.length, "recipe", "recipes")),
    el("span", "", plural(cuisines.length, "cuisine", "cuisines")),
  );
  if (newest) edition.append(el("span", "", `Newest ${formatDisplayDate(newest)}`));
  mast.append(word, edition);
  page.append(mast);
  host.append(page);
  if (!all.length) {
    page.append(
      el(
        "p",
        "canvas-status",
        "No recipes yet. Open a dish in Custom Menu and tap Recipe to research one.",
      ),
    );
    return;
  }

  const spread = el("section", "fj-section fj-book__spread");
  if (all.length > 3) {
    const head = el("div", "fj-section__head");
    const title = el("h2", "fj-section__title fj-serif");
    title.append("Just ", el("em", "", "added"));
    head.append(title);
    const grid = el("div", "fj-book__cards");
    for (const entry of sortRecipes(all, "recent").slice(0, 3))
      grid.append(spreadCard(ctx, entry));
    spread.append(head, grid);
    page.append(spread);
  }

  const controls = el("div", "fj-book__controls");
  const search = el("input", "hub-search");
  search.type = "search";
  search.placeholder = "Search recipes and ingredients";
  search.setAttribute("aria-label", "Search recipes");
  search.value = state.query || "";
  search.addEventListener("input", () => {
    state.query = search.value;
    refresh();
  });
  const chips = el("div", "fj-book__chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Meal type");
  const row = el("div", "fj-book__row");
  for (const [key, label, values] of [
    ["cuisine", "Cuisine", cuisines],
    ["tag", "Indicator", [...new Set(all.flatMap((x) => x.dish.tags))].sort()],
  ]) {
    if (!values.length) continue;
    const control = createHubFilter({
      key,
      label,
      value: state[key] || "",
      defaultValue: "",
      options: [
        { value: "", label },
        ...values.map((value) => ({ value, label: value })),
      ],
      onChange: (v) => {
        state[key] = v;
        refresh();
      },
    });
    ctx.addControl(control);
    row.append(control.el);
  }
  const sorts = el("div", "fj-book__sort");
  sorts.setAttribute("role", "group");
  sorts.setAttribute("aria-label", "Sort recipes");
  for (const [key, label] of [
    ["recent", "Recently added"],
    ["az", "A to Z"],
  ]) {
    const b = el("button", "fj-book__sort-btn", label);
    b.type = "button";
    b.dataset.sort = key;
    b.addEventListener("click", () => {
      state.sort = key;
      refresh();
    });
    sorts.append(b);
  }
  row.append(sorts);
  const count = el("p", "fj-meta");
  count.setAttribute("aria-live", "polite");
  controls.append(search, chips, row, count);
  page.append(controls);

  const index = el("div", "fj-book__index");
  const rail = el("nav", "fj-book__rail");
  rail.setAttribute("aria-label", "Jump to letter");
  const sections = el("div", "fj-book__sections");
  index.append(rail, sections);
  page.append(index);

  function refresh() {
    const sort = state.sort === "recent" ? "recent" : "az";
    const base = filterRecipes(all, { ...state, meal: "" });
    chips.replaceChildren();
    for (const meal of ["", ...MEAL_TYPES]) {
      const n = meal ? base.filter((x) => x.dish.meal_type === meal).length : base.length;
      if (meal && !n && state.meal !== meal) continue;
      const chip = el("button", "fj-book__chip", meal || "All");
      chip.type = "button";
      chip.setAttribute("aria-pressed", String((state.meal || "") === meal));
      chip.append(el("span", "fj-book__chip-count", String(n)));
      chip.addEventListener("click", () => {
        state.meal = meal;
        refresh();
      });
      chips.append(chip);
    }
    for (const b of sorts.children)
      b.setAttribute("aria-pressed", String(b.dataset.sort === sort));
    const found = sortRecipes(filterRecipes(all, state), sort);
    spread.hidden = Boolean(
      state.query?.trim() || state.meal || state.cuisine || state.tag,
    );
    count.textContent = `${found.length} of ${plural(all.length, "recipe", "recipes")}`;
    const groups = recipeSections(found, sort);
    rail.replaceChildren();
    rail.hidden = sort !== "az";
    index.classList.toggle("is-railless", rail.hidden);
    sections.replaceChildren();
    if (!found.length)
      sections.append(
        el("p", "canvas-status", "No recipes match. Try another word or clear a filter."),
      );
    for (const group of groups) {
      const section = el("section", "fj-book__section");
      section.dataset.letter = group.key;
      const head = el("h3", "fj-book__letter fj-serif");
      head.append(
        sort === "az"
          ? group.key
          : group.key === "earlier"
            ? "Earlier"
            : monthLabel(`${group.key}-01`),
        el("small", "", plural(group.entries.length, "recipe", "recipes")),
      );
      if (sort === "recent") head.classList.add("is-month");
      section.append(head);
      for (const entry of group.entries) section.append(indexEntry(ctx, entry));
      sections.append(section);
    }
    if (sort === "az") {
      const present = new Set(groups.map((g) => g.key));
      for (const letter of LETTERS) {
        const b = el("button", "fj-book__rail-btn fj-serif", letter);
        b.type = "button";
        b.disabled = !present.has(letter);
        b.setAttribute("aria-label", `Jump to ${letter === "#" ? "numbers" : letter}`);
        b.addEventListener("click", () =>
          sections
            .querySelector(`[data-letter="${letter}"]`)
            ?.scrollIntoView?.({ block: "start" }),
        );
        rail.append(b);
      }
    }
  }
  refresh();
}
