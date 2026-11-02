#!/usr/bin/env node
/**
 * Proves a batch of quick checks before Adam sees it. Exit 0 means it passed.
 *
 * Usage:
 *   node scripts/food-checks/check.mjs \
 *     --journal /path/to/life-hub-data/data/food-journal/journal.json \
 *     --batch /path/to/quick-checks/batch-01.json
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { batchProblems } from "../../apps/life/js/food-journal/quick-checks.js";
import { validateFoodJournal } from "../../netlify/functions/_shared/food-journal-schema.mjs";

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
if (!args.journal || !args.batch) {
  console.error("Usage: node scripts/food-checks/check.mjs --journal journal.json --batch batch-01.json");
  process.exit(1);
}
const batchPath = resolve(args.batch);
const journal = validateFoodJournal(JSON.parse(readFileSync(resolve(args.journal), "utf8")));
const problems = [];
if (!/^batch-[a-z0-9-]+\.json$/.test(basename(batchPath)))
  problems.push("The file must be named batch-<name>.json.");
const dir = dirname(batchPath);
const takenIds = new Set();
if (existsSync(dir))
  for (const name of readdirSync(dir))
    if (/^batch-.*\.json$/.test(name) && name !== basename(batchPath))
      for (const c of JSON.parse(readFileSync(join(dir, name), "utf8")).checks || [])
        takenIds.add(c.id);
const batch = JSON.parse(readFileSync(batchPath, "utf8"));
problems.push(...batchProblems(batch, journal, { takenIds }));
if (problems.length) {
  for (const p of problems) console.error(`- ${p}`);
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}. Fix them and run this again.`);
  process.exit(1);
}
const count = (kind) => batch.checks.filter((c) => c.kind === kind).length;
console.log(`Passed: ${count("venue")} venue checks, ${count("dish")} dish checks.`);
