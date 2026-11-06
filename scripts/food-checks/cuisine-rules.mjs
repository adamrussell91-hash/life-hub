#!/usr/bin/env node
/**
 * Prepares cuisine quick checks from rules, with no AI: a dish with no cuisine
 * whose food tag or name says what it is (Schnitzel, Ramen, Eggs Benedict)
 * gets that cuisine suggested. Dishes sharing a rule share one card, so Adam
 * ticks through them in groups. Read only: it writes the batch file and
 * nothing else. Whatever no rule covers is left for a Codex dish batch.
 *
 * Usage:
 *   node scripts/food-checks/cuisine-rules.mjs \
 *     --journal /path/to/life-hub-data/data/food-journal/journal.json \
 *     --out /path/to/life-hub-data/data/food-journal/quick-checks/batch-cuisine-rules.json
 *
 * Then prove it with scripts/food-checks/check.mjs before pushing.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { withoutDeleted } from "../../packages/design-kit/js/record-liveness.js";
import { CUISINE_RULES, cuisineRuleFor } from "../../apps/life/js/food-journal/cuisine-rules.js";
import { validateFoodJournal } from "../../netlify/functions/_shared/food-journal-schema.mjs";

const MAX_GROUP = 40;
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
if (!args.journal || !args.out) {
  console.error("Usage: node scripts/food-checks/cuisine-rules.mjs --journal journal.json --out batch-cuisine-rules.json");
  process.exit(1);
}
const journal = validateFoodJournal(JSON.parse(readFileSync(resolve(args.journal), "utf8")));
const out = resolve(args.out);

// Ids already used by other batches, so a rerun picks fresh ones.
const taken = new Set();
const dir = dirname(out);
if (existsSync(dir))
  for (const name of readdirSync(dir))
    if (/^batch-.*\.json$/.test(name) && name !== basename(out))
      for (const c of JSON.parse(readFileSync(join(dir, name), "utf8")).checks || []) taken.add(c.id);

const groups = new Map();
let left = 0;
for (const visit of withoutDeleted(journal.visits))
  for (const dish of withoutDeleted(visit.dishes)) {
    if (dish.cuisine?.trim()) continue;
    const rule = cuisineRuleFor(dish);
    if (!rule) {
      left++;
      continue;
    }
    if (!groups.has(rule.key)) groups.set(rule.key, { rule, members: [] });
    groups.get(rule.key).members.push({
      visit_id: visit.id,
      dish_id: dish.id,
      before: { cuisine: dish.cuisine || "", tags: [...dish.tags] },
    });
  }

const checks = [];
for (const { rule, members } of [...groups.values()].sort((a, b) => b.members.length - a.members.length))
  for (let i = 0, part = 1; i < members.length; i += MAX_GROUP, part++) {
    let id = `chk_cuisine_${rule.key}_${part}`;
    for (let n = 2; taken.has(id); n++) id = `chk_cuisine_${rule.key}_${part}_${n}`;
    taken.add(id);
    checks.push({
      id,
      kind: "dish",
      dishes: members.slice(i, i + MAX_GROUP),
      suggestion: { cuisine: rule.cuisine, tags: [] },
      reason: `Tagged or named ${rule.words.slice(0, 4).join(", ")}, so ${rule.cuisine}.`.slice(0, 200),
      evidence: [{ kind: "note", text: `Rule: ${rule.words.join(", ")} → ${rule.cuisine}`.slice(0, 300) }],
    });
  }

writeFileSync(out, JSON.stringify({ schema_version: 1, checks }, null, 2) + "\n");
const covered = checks.reduce((n, c) => n + c.dishes.length, 0);
console.log(
  `Wrote ${checks.length} cards covering ${covered} dishes (${CUISINE_RULES.length} rules). ${left} dishes with no cuisine match no rule; leave those for a Codex dish batch.`,
);
