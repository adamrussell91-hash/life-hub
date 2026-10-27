import { withoutDeleted } from "./record-liveness.mjs";
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
function bad(message) {
  throw Object.assign(new Error(message), {
    code: "validation_error",
    status: 400,
  });
}
function text(value, label, max = 20000) {
  if (typeof value !== "string" || value.length > max)
    bad(`${label} is invalid.`);
}
function id(value) {
  if (typeof value !== "string" || !ID.test(value))
    bad("Record identifier is invalid.");
}
function unique(rows) {
  const seen = new Set();
  for (const r of rows) {
    if (!r || typeof r !== "object") bad("Record is invalid.");
    id(r.id);
    if (seen.has(r.id)) bad("Duplicate identifier.");
    seen.add(r.id);
  }
}
const MEAL_PATH = /^data\/nutrition\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;
function optionalText(value, label, max) {
  if (value != null) text(value, label, max);
}
function brisketLink(b) {
  if (b == null) return;
  if (typeof b !== "object" || Array.isArray(b)) bad("Brisket link is invalid.");
  if (typeof b.meal_path !== "string" || !MEAL_PATH.test(b.meal_path))
    bad("Brisket link is invalid.");
  text(b.portion, "Brisket portion", 40);
  if (
    typeof b.portion_fraction !== "number" ||
    !(b.portion_fraction > 0 && b.portion_fraction <= 1)
  )
    bad("Brisket portion is invalid.");
  if (
    typeof b.counted_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(b.counted_at) ||
    Number.isNaN(Date.parse(b.counted_at))
  )
    bad("Brisket link is invalid.");
  if (typeof b.needs_recount !== "boolean") bad("Brisket link is invalid.");
  // The numbers Brisket confirmed, so a re-count can show old → new.
  for (const k of ["calories", "protein_g", "fat_g"])
    if (b[k] != null && (!Number.isFinite(b[k]) || b[k] < 0)) bad("Brisket numbers are invalid.");
}
export function validateFoodJournal(j) {
  if (
    !j ||
    j.schema_version !== 1 ||
    !Array.isArray(j.visits) ||
    !Array.isArray(j.recipes) ||
    j.visits.length > 10000 ||
    j.recipes.length > 10000
  )
    bad("Journal is invalid.");
  if (Buffer.byteLength(JSON.stringify(j), "utf8") > 4 * 1024 * 1024)
    bad("Journal exceeds 4 MB.");
  unique(j.visits);
  unique(j.recipes);
  const dishes = new Set();
  for (const v of j.visits) {
    text(v.title, "Title", 200);
    if (v.source_id != null) text(v.source_id, "Source identifier", 200);
    text(v.notes, "Notes");
    text(v.menu_text, "Menu", 100000);
    optionalText(v.menu_text_en, "Menu", 100000);
    if (v.menu_items != null) {
      if (!Array.isArray(v.menu_items) || v.menu_items.length > 200)
        bad("Menu items are invalid.");
      for (const item of v.menu_items) {
        if (!item || typeof item !== "object") bad("Menu items are invalid.");
        text(item.name, "Menu item", 200);
        text(item.description, "Menu item description", 1000);
        text(item.price, "Menu item price", 40);
        optionalText(item.name_en, "Menu item", 200);
        optionalText(item.description_en, "Menu item description", 1000);
        if (item.kind != null && !["dish", "extra"].includes(item.kind))
          bad("Menu items are invalid.");
      }
    }
    if (v.reviewed != null && typeof v.reviewed !== "boolean")
      bad("Review state is invalid.");
    if (v.editorial != null) {
      if (typeof v.editorial !== "object") bad("Editorial is invalid.");
      text(v.editorial.headline, "Headline", 200);
      text(v.editorial.standfirst, "Standfirst", 600);
      text(v.editorial.pull_quote, "Pull quote", 600);
      text(v.editorial.basis, "Editorial basis", 64);
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
      Number.isNaN(Date.parse(v.date)) ||
      new Date(v.date).toISOString().slice(0, 10) !== v.date
    )
      bad("Date is invalid.");
    if (!v.venue || typeof v.venue !== "object") bad("Venue is invalid.");
    text(v.venue.name, "Venue", 200);
    text(v.venue.address, "Address", 1000);
    for (const [k, bound] of [
      ["lat", 90],
      ["lon", 180],
    ])
      if (
        v.venue[k] != null &&
        (!Number.isFinite(v.venue[k]) || Math.abs(v.venue[k]) > bound)
      )
        bad("Location is invalid.");
    if (v.venue.match != null) {
      const m = v.venue.match;
      if (
        typeof m !== "object" ||
        !["sure", "check"].includes(m.confidence) ||
        (m.candidates != null &&
          (!Array.isArray(m.candidates) || m.candidates.length > 5))
      )
        bad("Venue match is invalid.");
      for (const c of m.candidates || []) {
        if (!c || typeof c !== "object") bad("Venue match is invalid.");
        text(c.name, "Venue", 200);
        text(c.address, "Address", 1000);
        if (![c.lat, c.lon, c.distance].every(Number.isFinite))
          bad("Venue match is invalid.");
      }
    }
    if (!Array.isArray(v.dishes) || !v.dishes.length || v.dishes.length > 100)
      bad("Add between one and 100 dishes.");
    unique(v.dishes);
    for (const d of v.dishes) {
      if (dishes.has(d.id)) bad("Duplicate dish identifier.");
      dishes.add(d.id);
      text(d.title, "Dish title", 200);
      if (!d.title.trim()) bad("Dish title is required.");
      text(d.cuisine, "Cuisine", 100);
      text(d.meal_type, "Meal type", 30);
      text(d.notes, "Dish notes");
      optionalText(d.title_en, "Dish title", 200);
      optionalText(d.notes_en, "Dish notes", 20000);
      optionalText(d.ingredients, "Ingredients", 2000);
      optionalText(d.ingredients_original, "Ingredients", 2000);
      brisketLink(d.brisket);
      if (d.order_again != null && typeof d.order_again !== "boolean")
        bad("Order again must be yes or no.");
      if (
        ![
          "Breakfast",
          "Lunch",
          "Dinner",
          "Snack",
          "Dessert",
          "Drinks",
        ].includes(d.meal_type)
      )
        bad("Meal type is invalid.");
      if (
        d.rating != null &&
        (!Number.isInteger(d.rating * 2) || d.rating < 1 || d.rating > 5)
      )
        bad("Rating must be 1 to 5, in half steps.");
      if (
        !Array.isArray(d.tags) ||
        d.tags.length > 40 ||
        d.tags.some((t) => typeof t !== "string" || t.length > 100)
      )
        bad("Tags are invalid.");
      if (!Array.isArray(d.photos) || d.photos.length > 20)
        bad("Photos are invalid.");
      for (const p of d.photos) {
        id(p.id);
        text(p.key, "Photo key", 300);
        if (!/^food\/photos\/[a-zA-Z0-9_-]+\.jpg$/.test(p.key))
          bad("Photo key is invalid.");
      }
    }
  }
  for (const r of j.recipes) {
    if (!dishes.has(r.dish_id)) bad("Recipe dish is missing.");
    text(r.title, "Recipe title", 200);
    if (
      r.added_at != null &&
      (typeof r.added_at !== "string" ||
        r.added_at.length > 40 ||
        !/^\d{4}-\d{2}-\d{2}T/.test(r.added_at) ||
        Number.isNaN(Date.parse(r.added_at)))
    )
      bad("Recipe added date is invalid.");
    if (r.candidates != null) {
      if (!Array.isArray(r.candidates) || r.candidates.length > 10)
        bad("Recipe research is invalid.");
      for (const c of r.candidates) {
        if (!c || typeof c !== "object") bad("Recipe research is invalid.");
        text(c.title, "Candidate title", 500);
        text(c.reason, "Candidate reason", 2000);
        try {
          if (new URL(c.url).protocol !== "https:")
            bad("Candidate URL is invalid.");
        } catch {
          bad("Candidate URL is invalid.");
        }
      }
    }
    if (
      r.shortlist != null &&
      (!Array.isArray(r.shortlist) ||
        r.shortlist.length > 3 ||
        r.shortlist.some(
          (url) =>
            typeof url !== "string" ||
            !r.candidates?.some((c) => c.url === url),
        ))
    )
      bad("Recipe shortlist is invalid.");
    if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > 100)
      bad("Servings are invalid.");
    if (
      !Array.isArray(r.ingredients) ||
      !r.ingredients.length ||
      r.ingredients.length > 100 ||
      !Array.isArray(r.steps) ||
      !r.steps.length ||
      r.steps.length > 100
    )
      bad("Recipe is incomplete.");
    for (const line of [...r.ingredients, ...r.steps])
      text(line, "Recipe line", 2000);
    if (!Array.isArray(r.sources) || r.sources.length > 10)
      bad("Recipe sources are invalid.");
    for (const s of r.sources) {
      text(s.title, "Source title", 500);
      try {
        if (new URL(s.url).protocol !== "https:") bad("Source URL is invalid.");
      } catch {
        bad("Source URL is invalid.");
      }
    }
  }
  return j;
}
export function readableJournal(j) {
  const visits = withoutDeleted(j.visits).map((v) => ({
    ...v,
    dishes: withoutDeleted(v.dishes),
  }));
  const ids = new Set(visits.flatMap((v) => v.dishes.map((d) => d.id)));
  return {
    ...j,
    reserved_source_ids: j.visits.map((v) => v.source_id).filter(Boolean),
    reserved_visit_ids: j.visits.map((v) => v.id),
    visits,
    recipes: withoutDeleted(j.recipes).filter((r) => ids.has(r.dish_id)),
  };
}
