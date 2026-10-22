// scripts/import-gear-shifter-glyphs.mjs
// Copies the Get Things Done book pack's graphics into packages/get-things-done/glyphs/: one
// emblem per catalogue entry that has its own (the Kanban and 5 Whys variants use Problem
// Solver's), the five section emblems and the book identity. The artwork was drawn for this
// project, so it may be committed; the pack's page text and figures never are.
// Usage: node scripts/import-gear-shifter-glyphs.mjs ~/Projects/life-hub-data/book-packs/get-things-done
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, SECTIONS } from '../packages/get-things-done/catalogue.mjs';

const pack = process.argv[2];
if (!pack) {
  console.error('Usage: node scripts/import-gear-shifter-glyphs.mjs <book pack folder>');
  process.exit(1);
}
// The pack's sampled cover colours, brightened to Adam's palette (22 Oct): cobalt, vermilion
// and ink. Paper is unchanged.
const PALETTE = Object.freeze({ '#367db0': '#2b7de9', '#d24c3a': '#ea4f2a', '#3e4852': '#2a3340' });

async function copyFile(from, to) {
  let svg = await readFile(from, 'utf8');
  for (const [pack, ours] of Object.entries(PALETTE)) svg = svg.replaceAll(new RegExp(pack, 'gi'), ours);
  await writeFile(to, svg);
}

const source = join(pack, 'graphics');
const out = fileURLToPath(new URL('../packages/get-things-done/glyphs/', import.meta.url));
for (const sub of ['models', 'sections', 'identity']) await mkdir(join(out, sub), { recursive: true });

const own = CATALOGUE.filter((e) => !e.reuse);
for (const e of own) await copyFile(join(source, 'models', `${e.id}.svg`), join(out, 'models', `${e.id}.svg`));
for (const s of SECTIONS) await copyFile(join(source, 'sections', `${s.key}.svg`), join(out, 'sections', `${s.key}.svg`));
for (const name of ['book-emblem.svg', 'book-emblem-mono.svg', 'wordmark.svg']) await copyFile(join(source, 'identity', name), join(out, 'identity', name));
console.log(`Copied ${own.length} entry emblems, ${SECTIONS.length} section emblems and 3 identity marks.`);
