import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { load } from 'js-yaml';
import { parseEventDocument } from '../apps/life/js/core/records.js';
import { aggregateNutrition, calculateWorkoutStreak, resolveDayType } from '../apps/life/js/core/aggregate.js';
import { validateUniqueIds } from '../apps/life/js/core/validate.js';

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(join(dir, entry.name))
    : [join(dir, entry.name)]))).flat();
}

const root = process.argv[2] ?? 'tests/fixtures/valid';
const paths = (await files(join(root, 'data'))).filter(path => path.endsWith('.md')).sort();
const events = paths.map(async path => parseEventDocument(
  await readFile(path, 'utf8'), relative(root, path).split(sep).join('/'), load
));
const parsed = await Promise.all(events);
const uniqueIdErrors = validateUniqueIds(parsed);
if (uniqueIdErrors.length) throw new TypeError(uniqueIdErrors.join('; '));
const records = parsed.map(event => event.record);
const nutrition = aggregateNutrition(records, '2026-07-30');
console.log(JSON.stringify({
  files: paths.length, valid: parsed.length, invalid: 0,
  home: {
    calories: nutrition.calories, protein_g: nutrition.protein_g, fat_g: nutrition.fat_g,
    day_type: resolveDayType(records, '2026-07-30'),
    workout_streak: calculateWorkoutStreak(records, '2026-07-30')
  }
}));
