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
