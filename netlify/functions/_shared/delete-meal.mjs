/**
 * Brisket meal-slot delete helpers.
 * Canonical timed files (snack-1530), slot-only legacy, and Notion-era variants (snack-2).
 */

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];
const MEAL_SLOT_SET = new Set(MEAL_SLOTS);
const MEAL_PATH = /^data\/nutrition\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})-(.+)\.md$/;
const SLOT_SLUG = /^(breakfast|lunch|dinner|snack|dessert)(?:-\d+)?$/;

export function isMealSlot(meal) {
  return typeof meal === 'string' && MEAL_SLOT_SET.has(meal);
}

export function parseNutritionMealPath(path) {
  if (typeof path !== 'string') return null;
  const match = MEAL_PATH.exec(path);
  if (!match) return null;
  const date = match[3];
  const slug = match[4];
  const slot = SLOT_SLUG.exec(slug);
  if (!slot) return null;
  return { date, meal: slot[1], slug, path };
}

/**
 * Paths to remove for one meal type on a date.
 * Optional `slug` targets one file (e.g. snack-1530); otherwise all variants.
 */
export function findMealDeletePaths(tree, date, meal, { slug } = {}) {
  if (!isMealSlot(meal) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return [];
  }
  const [year, month] = date.split('-');
  const prefix = `data/nutrition/${year}/${month}/${date}-`;
  const slotRe = new RegExp(`^${meal}(?:-\\d+)?$`);
  const wantSlug = typeof slug === 'string' && slug ? slug : null;
  return (tree ?? [])
    .filter(item => item?.type === 'blob'
      && typeof item.path === 'string'
      && item.path.startsWith(prefix)
      && item.path.endsWith('.md')
      && (() => {
        const fileSlug = item.path.slice(prefix.length, -3);
        if (wantSlug) return fileSlug === wantSlug;
        return slotRe.test(fileSlug);
      })())
    .map(item => item.path)
    .sort();
}

/** Prefer timed path; on overwrite, fall back to legacy slot-only file when present. */
export function resolveMealWritePath(tree, { date, meal, slug, overwrite = false } = {}) {
  if (!isMealSlot(meal) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  if (typeof slug !== 'string' || !slug) return null;
  const [year, month] = date.split('-');
  const preferred = `data/nutrition/${year}/${month}/${date}-${slug}.md`;
  const blobs = (tree ?? []).filter(item => item?.type === 'blob' && typeof item.path === 'string');
  const preferredHit = blobs.find(item => item.path === preferred);
  if (preferredHit) {
    return overwrite
      ? { path: preferred, existingSha: preferredHit.sha }
      : { path: preferred, existingSha: undefined };
  }
  if (overwrite) {
    const legacy = `data/nutrition/${year}/${month}/${date}-${meal}.md`;
    const legacyHit = blobs.find(item => item.path === legacy);
    if (legacyHit) {
      return { path: legacy, existingSha: legacyHit.sha };
    }
  }
  return { path: preferred, existingSha: undefined };
}

export function mealDeletesFromWrites(writes) {
  const byDate = new Map();
  for (const write of writes ?? []) {
    if (write?.mode !== 'delete') continue;
    const parsed = parseNutritionMealPath(write.path);
    if (!parsed) continue;
    const entry = byDate.get(parsed.date) ?? { date: parsed.date, meals: new Set(), paths: [] };
    entry.meals.add(parsed.meal);
    entry.paths.push(parsed.path);
    byDate.set(parsed.date, entry);
  }
  return [...byDate.values()].map(entry => ({
    date: entry.date,
    meals: [...entry.meals],
    paths: entry.paths
  }));
}
