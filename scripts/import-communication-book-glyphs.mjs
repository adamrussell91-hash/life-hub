// scripts/import-communication-book-glyphs.mjs
// Copies the Communication Book pack's graphics into packages/communication-book/glyphs/: one
// emblem per catalogue entry (the pack draws the Second-Order Observation variant itself, so
// every entry has its own), the five section emblems and the book identity. The emblems of the
// seven merged and three cut entries are left in the pack. The artwork was drawn for this project,
// so it may be committed; the pack's page text, figures and source files never are. The pack's
// screen palette is the one the tool uses.
// Usage: node scripts/import-communication-book-glyphs.mjs ~/Projects/life-hub-data/book-packs/communication-book
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, SECTIONS } from '../packages/communication-book/catalogue.mjs';

const pack = process.argv[2];
if (!pack) {
  console.error('Usage: node scripts/import-communication-book-glyphs.mjs <book pack folder>');
  process.exit(1);
}

const source = join(pack, 'graphics');
const out = fileURLToPath(new URL('../packages/communication-book/glyphs/', import.meta.url));
for (const sub of ['models', 'sections', 'identity']) await mkdir(join(out, sub), { recursive: true });

for (const e of CATALOGUE) await copyFile(join(source, 'models', `${e.id}.svg`), join(out, 'models', `${e.id}.svg`));
for (const s of SECTIONS) await copyFile(join(source, 'sections', `${s.key}.svg`), join(out, 'sections', `${s.key}.svg`));
for (const name of ['book-emblem.svg', 'book-emblem-mono.svg', 'wordmark.svg']) await copyFile(join(source, 'identity', name), join(out, 'identity', name));
console.log(`Copied ${CATALOGUE.length} entry emblems, ${SECTIONS.length} section emblems and 3 identity marks.`);
