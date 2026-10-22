#!/usr/bin/env node
// scripts/book-pack/copy-check.mjs
// The public-repo copy check: no string we ship may share eight words in a row with the book.
// It compares against a private pack's fact anchors and page text, so it runs locally, never
// in CI (tests/unit/get-things-done-copy.test.js skips where the pack is absent).
//
//   node scripts/book-pack/copy-check.mjs <pack-dir>   check Gear Shifter's shipped strings
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COPY_RUN = 8;

/** Words as the pack checker counts them: lower case, apostrophes dropped. */
export const wordsOf = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) ?? [];

/** Every run of `n` words in the texts. */
export function shinglesOf(texts, n = COPY_RUN) {
  const out = new Set();
  for (const text of texts) {
    const list = wordsOf(text);
    for (let i = 0; i + n <= list.length; i++) out.add(list.slice(i, i + n).join(' '));
  }
  return out;
}

/** The first run of `text` found in `shingles`, or null. */
export function copiedRun(text, shingles, n = COPY_RUN) {
  const list = wordsOf(text);
  for (let i = 0; i + n <= list.length; i++) {
    const run = list.slice(i, i + n).join(' ');
    if (shingles.has(run)) return run;
  }
  return null;
}

/** Every string inside a value (a tool definition, a catalogue entry), recursively. */
export function shippedStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const inner of value) shippedStrings(inner, out);
  else if (value && typeof value === 'object') for (const inner of Object.values(value)) shippedStrings(inner, out);
  return out;
}

/** A pack's anchors and page text: what nothing shipped may copy. */
export function readPackTexts(dir) {
  const texts = [];
  for (const file of readdirSync(join(dir, 'entries')).filter((name) => name.endsWith('.json'))) {
    const entry = JSON.parse(readFileSync(join(dir, 'entries', file), 'utf8'));
    for (const fact of entry.facts ?? []) texts.push(fact.anchor);
  }
  const pages = join(dir, 'pages');
  if (existsSync(pages)) for (const file of readdirSync(pages).filter((name) => name.endsWith('.txt'))) texts.push(readFileSync(join(pages, file), 'utf8'));
  return texts;
}

/** Gear Shifter's shipped strings, each with where it came from: techniques, the Commit and Review tools, the coach's knowledge and rubric, the catalogue and the glyph titles. */
export async function gearShifterStrings() {
  const { GEAR_TOOLS } = await import('../../packages/get-things-done/tools/index.mjs');
  const { gtCommit } = await import('../../packages/get-things-done/tools/commit.mjs');
  const { gtReview } = await import('../../packages/get-things-done/tools/review.mjs');
  const knowledge = await import('../../netlify/functions/_shared/problem-solver/knowledge/get-things-done.mjs');
  const { GEAR_RUBRIC } = await import('../../netlify/functions/_shared/problem-solver/get-things-done-prompts.mjs');
  const { CATALOGUE, SECTIONS } = await import('../../packages/get-things-done/catalogue.mjs');
  const glyphs = fileURLToPath(new URL('../../packages/get-things-done/glyphs/', import.meta.url));
  const out = [];
  for (const [id, tool] of Object.entries({ ...GEAR_TOOLS, gt_commit: gtCommit, gt_review: gtReview })) for (const text of shippedStrings(tool)) out.push([id, text]);
  for (const key of ['STANCE', 'ROUTE_GUIDE', 'OBSTACLE_GUIDE', 'GEAR_TRAPS']) out.push([`knowledge ${key}`, knowledge[key]]);
  out.push(['rubric GEAR_RUBRIC', GEAR_RUBRIC]);
  for (const entry of [...CATALOGUE, ...SECTIONS]) for (const text of shippedStrings(entry)) out.push([`catalogue ${entry.id ?? entry.key}`, text]);
  for (const folder of readdirSync(glyphs, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of readdirSync(join(glyphs, folder.name)).filter((name) => name.endsWith('.svg'))) {
      const title = /<title>([^<]*)<\/title>/.exec(readFileSync(join(glyphs, folder.name, file), 'utf8'))?.[1];
      if (title) out.push([`glyph ${folder.name}/${file}`, title]);
    }
  }
  return out;
}

/** Copied runs in Gear Shifter's shipped strings: [where, run] pairs, empty when clean. */
export async function checkGearShifter(dir) {
  const shingles = shinglesOf(readPackTexts(dir));
  const found = [];
  for (const [where, text] of await gearShifterStrings()) {
    const run = copiedRun(text, shingles);
    if (run) found.push([where, run]);
  }
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] && resolve(process.argv[2]);
  if (!dir || !existsSync(join(dir, 'entries'))) {
    console.error('Usage: node scripts/book-pack/copy-check.mjs <pack-dir>');
    process.exit(2);
  }
  const found = await checkGearShifter(dir);
  for (const [where, run] of found) console.log(`COPIED ${where}: "${run}…"`);
  console.log(found.length ? `${found.length} copied runs` : 'No copied runs.');
  process.exit(found.length ? 1 : 0);
}
