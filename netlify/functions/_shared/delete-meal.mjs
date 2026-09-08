/**
 * Brisket meal-slot delete helpers.
 * Canonical slot files plus Notion-era variants (snack-2, snack-3, …).
 */

const MEAL_SLOTS = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const MEAL_PATH = /^data\/nutrition\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})-(.+)\.md$/;

export function isMealSlot(meal) {
  return typeof meal === 'string' && MEAL_SLOTS.has(meal);
}

export function parseNutritionMealPath(path) {
  if (typeof path !== 'string') return null;
  const match = MEAL_PATH.exec(path);
  if (!match) return null;
  const date = match[3];
  const slug = match[4];
  const slot = /^(breakfast|lunch|dinner|snack)(?:-\d+)?$/.exec(slug);
  if (!slot) return null;
  return { date, meal: slot[1], slug, path };
}

/** Paths to remove for one meal slot on a date (canonical + numbered variants). */
export function findMealDeletePaths(tree, date, meal) {
  if (!isMealSlot(meal) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return [];
  }
  const [year, month] = date.split('-');
  const prefix = `data/nutrition/${year}/${month}/${date}-`;
  const slotRe = new RegExp(`^${meal}(?:-\\d+)?$`);
  return (tree ?? [])
    .filter(item => item?.type === 'blob'
      && typeof item.path === 'string'
      && item.path.startsWith(prefix)
      && item.path.endsWith('.md')
      && slotRe.test(item.path.slice(prefix.length, -3)))
    .map(item => item.path)
    .sort();
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
