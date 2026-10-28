// scripts/import-collaboration-book-glyphs.mjs
// Copies the Collaboration Book pack's graphics into packages/collaboration-book/glyphs/: one
// emblem per catalogue entry that has its own, the three section emblems and the book identity.
// The two variants (Postmortem on Problem Solver's after action review, Corporate Culture on
// Decision Maker's Maslow pyramids) have none in the pack; their emblems were drawn for the
// Collaboration Book in the pack's graphics language, and this script leaves them alone. The
// artwork was drawn for this project, so it may be committed; the pack's page text, figures and
// source files never are. The pack's screen palette is the one the tool uses.
// Usage: node scripts/import-collaboration-book-glyphs.mjs ~/Projects/life-hub-data/book-packs/collaboration-book
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, SECTIONS } from '../packages/collaboration-book/catalogue.mjs';

const pack = process.argv[2];
if (!pack) {
  console.error('Usage: node scripts/import-collaboration-book-glyphs.mjs <book pack folder>');
  process.exit(1);
}

const source = join(pack, 'graphics');
const out = fileURLToPath(new URL('../packages/collaboration-book/glyphs/', import.meta.url));
for (const sub of ['models', 'sections', 'identity']) await mkdir(join(out, sub), { recursive: true });

const own = CATALOGUE.filter((e) => !e.reuse);
for (const e of own) await copyFile(join(source, 'models', `${e.id}.svg`), join(out, 'models', `${e.id}.svg`));
for (const s of SECTIONS) await copyFile(join(source, 'sections', `${s.key}.svg`), join(out, 'sections', `${s.key}.svg`));
for (const name of ['book-emblem.svg', 'book-emblem-mono.svg', 'wordmark.svg']) await copyFile(join(source, 'identity', name), join(out, 'identity', name));
console.log(`Copied ${own.length} entry emblems, ${SECTIONS.length} section emblems and 3 identity marks.`);
