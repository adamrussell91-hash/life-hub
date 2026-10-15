#!/usr/bin/env node
/**
 * Bulk-import a Day One Food Journal JSON export into life-hub-data.
 * Text and metadata only — no photo uploads.
 *
 * Usage:
 *   node scripts/import-dayone-food-journal.mjs "/path/to/Food Journal.json" \
 *     --out /path/to/life-hub-data/data/food-journal/journal.json
 *   node scripts/import-dayone-food-journal.mjs "/path/to/Food Journal.json" \
 *     --out /tmp/journal.json --write
 *
 * Without --write, prints a dry-run summary and does not touch the out file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { emptyJournal, importDayOne } from "../apps/life/js/food-journal/model.js";
import { validateFoodJournal } from "../netlify/functions/_shared/food-journal-schema.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.source || !args.out) {
  console.error(
    'Usage: node scripts/import-dayone-food-journal.mjs "/path/to/Food Journal.json" --out <journal.json> [--write]',
  );
  process.exit(1);
}

const source = resolve(args.source);
const out = resolve(args.out);
if (!existsSync(source)) {
  console.error(`Source not found: ${source}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(source, "utf8"));
const existing = existsSync(out)
  ? validateFoodJournal(JSON.parse(readFileSync(out, "utf8")))
  : emptyJournal();
const review = importDayOne(payload, existing);
const next = {
  ...existing,
  visits: [...existing.visits, ...review.visits],
};
validateFoodJournal(next);

const bytes = Buffer.byteLength(JSON.stringify(next), "utf8");
const summary = {
  source,
  out,
  write: Boolean(args.write),
  available: review.visits.length,
  skipped: review.skipped.length,
  journal_visits: next.visits.length,
  journal_bytes: bytes,
  photo_refs: review.visits.reduce(
    (n, v) => n + (v.import_media?.length || 0),
    0,
  ),
};

if (!args.write) {
  console.log(JSON.stringify({ ...summary, dry_run: true }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...summary, written: true }, null, 2));

function parseArgs(argv) {
  const result = { write: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") {
      result.write = true;
      continue;
    }
    if (arg === "--out") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing --out path");
      result.out = value;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    if (result.source) throw new Error("Only one source file is allowed");
    result.source = arg;
  }
  return result;
}
