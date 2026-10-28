// scripts/import-question-book-glyphs.mjs
// Copies the Question Book pack's graphics into packages/question-book/glyphs/: one emblem per
// chapter (the rules card and Your questions included), one per chart drawn inside a chapter,
// the five group emblems and the book identity. The artwork was drawn for this project, so it
// may be committed; the pack's questions, page text, figures and source files never are. The
// pack's screen palette is the one the tool uses (question-book.css).
// Usage: node scripts/import-question-book-glyphs.mjs ~/Projects/life-hub-data/book-packs/question-book
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, CHARTS, GROUPS } from '../packages/question-book/catalogue.mjs';

const pack = process.argv[2];
if (!pack) {
  console.error('Usage: node scripts/import-question-book-glyphs.mjs <book pack folder>');
  process.exit(1);
}

const source = join(pack, 'graphics');
const out = fileURLToPath(new URL('../packages/question-book/glyphs/', import.meta.url));
for (const sub of ['models', 'sections', 'identity']) await mkdir(join(out, sub), { recursive: true });

const ids = [...CHAPTERS, ...CHARTS].map((e) => e.id);
for (const id of ids) await copyFile(join(source, 'models', `${id}.svg`), join(out, 'models', `${id}.svg`));
for (const g of GROUPS) await copyFile(join(source, 'sections', `${g.key}.svg`), join(out, 'sections', `${g.key}.svg`));
for (const name of ['book-emblem.svg', 'book-emblem-mono.svg', 'wordmark.svg']) await copyFile(join(source, 'identity', name), join(out, 'identity', name));
console.log(`Copied ${CHAPTERS.length} chapter emblems, ${CHARTS.length} chart emblems, ${GROUPS.length} group emblems and 3 identity marks.`);
