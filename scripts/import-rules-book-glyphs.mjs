// scripts/import-rules-book-glyphs.mjs
// Copies the Rules Book pack's graphics into packages/rules-book/glyphs/: one emblem per
// catalogue entry that has its own, the four section emblems and the book identity. The
// Pareto and One-Step variants have none in the pack; theirs (rb_pareto.svg, rb_one_step.svg)
// were drawn for the Rules Book in the same style, and this script leaves them alone. The
// artwork was drawn for this project, so it may be committed; the pack's page text, figures and
// source files never are. The pack's screen palette is already the one the tool uses.
// Usage: node scripts/import-rules-book-glyphs.mjs ~/Projects/life-hub-data/book-packs/rules-book
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, SECTIONS } from '../packages/rules-book/catalogue.mjs';

const pack = process.argv[2];
if (!pack) {
  console.error('Usage: node scripts/import-rules-book-glyphs.mjs <book pack folder>');
  process.exit(1);
}

const source = join(pack, 'graphics');
const out = fileURLToPath(new URL('../packages/rules-book/glyphs/', import.meta.url));
for (const sub of ['models', 'sections', 'identity']) await mkdir(join(out, sub), { recursive: true });

const own = CATALOGUE.filter((e) => !e.reuse);
for (const e of own) await copyFile(join(source, 'models', `${e.id}.svg`), join(out, 'models', `${e.id}.svg`));
for (const s of SECTIONS) await copyFile(join(source, 'sections', `${s.key}.svg`), join(out, 'sections', `${s.key}.svg`));
for (const name of ['book-emblem.svg', 'book-emblem-mono.svg', 'wordmark.svg']) await copyFile(join(source, 'identity', name), join(out, 'identity', name));
console.log(`Copied ${own.length} entry emblems, ${SECTIONS.length} section emblems and 3 identity marks.`);
