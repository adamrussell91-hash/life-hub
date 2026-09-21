import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { load } from 'js-yaml';
import { parseEventDocument } from '../apps/life/js/core/records.js';
import { getSydneyDateKey } from '../apps/life/js/core/time.js';
import { buildForecast } from '../apps/life/js/core/forecast-engine.js';

const args = process.argv.slice(2);
const dataRoot = args.find(arg => !arg.startsWith('--'));
if (!dataRoot) {
  console.error('Usage: node scripts/forecast-report.mjs <life-hub-data-root> [--as-of=YYYY-MM-DD] [--rmr=1946]');
  process.exit(1);
}
const asOf = args.find(arg => arg.startsWith('--as-of='))?.split('=')[1] ?? getSydneyDateKey();
const rmrArg = args.find(arg => arg.startsWith('--rmr='))?.split('=')[1];
const measuredRmrKcal = rmrArg == null ? null : Number(rmrArg);

async function markdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  }))).flat();
}

const domains = ['nutrition', 'fitness', 'body', 'mind'];
const paths = (await Promise.all(domains.map(async domain => {
  try {
    return await markdownFiles(join(dataRoot, 'data', domain));
  } catch {
    return [];
  }
}))).flat().filter(path => !path.includes(`${sep}templates${sep}`)).sort();

const events = [];
const unclassified = [];
for (const path of paths) {
  const repoPath = relative(dataRoot, path).split(sep).join('/');
  try {
    events.push(parseEventDocument(await readFile(path, 'utf8'), repoPath, load));
  } catch (error) {
    unclassified.push({ path: repoPath, error: error.message });
  }
}

const targetsConfig = load(await readFile(join(dataRoot, 'config', 'targets.yml'), 'utf8'));
let libraryByName = null;
try {
  const library = JSON.parse(await readFile(join(dataRoot, 'data', 'exercise-library.json'), 'utf8'));
  libraryByName = new Map(library.map(entry => [entry.name, entry]));
} catch {
  libraryByName = null;
}

const forecast = buildForecast({
  items: events,
  asOf,
  targetsConfig,
  libraryByName,
  measuredRmrKcal: Number.isFinite(measuredRmrKcal) ? measuredRmrKcal : null
});

console.log(JSON.stringify({
  as_of: asOf,
  measured_rmr_kcal_day: Number.isFinite(measuredRmrKcal) ? measuredRmrKcal : null,
  parsed_records: events.length,
  unclassified,
  forecast
}, null, 2));
