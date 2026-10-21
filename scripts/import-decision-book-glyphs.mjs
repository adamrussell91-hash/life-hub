// scripts/import-decision-book-glyphs.mjs
// Copies the approved Decision Book graphics into packages/decision-book/glyphs/: one emblem
// per catalogue model (renamed to its id), the four section emblems (renamed to section keys)
// and the book identity. The artwork is original to this project, so it may be committed;
// book scans never are.
// Usage: node scripts/import-decision-book-glyphs.mjs "/path/to/Decision Book Graphics"
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, SECTIONS } from '../packages/decision-book/catalogue.mjs';

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/import-decision-book-glyphs.mjs "<Decision Book Graphics folder>"');
  process.exit(1);
}
// The kit's red and green, lifted a little brighter and more saturated (Adam, 21 Oct), with
// their tints. Ink and paper are unchanged.
const PALETTE = { '#ef402b': '#e4301c', '#60aa36': '#398000', '#e5edda': '#e3f1d8', '#f8e1d8': '#fcdfd5' };
async function copyFile(from, to) {
  let svg = await readFile(from, 'utf8');
  for (const [kit, ours] of Object.entries(PALETTE)) svg = svg.replaceAll(new RegExp(kit, 'gi'), ours);
  await writeFile(to, svg);
}

const out = fileURLToPath(new URL('../packages/decision-book/glyphs/', import.meta.url));
for (const sub of ['models', 'sections', 'identity']) await mkdir(join(out, sub), { recursive: true });

for (const entry of CATALOGUE) {
  await copyFile(join(source, `decision-book-section-0${entry.section}`, 'tools', entry.kit, 'emblem.svg'), join(out, 'models', `${entry.id}.svg`));
}
const sectionDir = join(source, 'decision-book-assets', 'sections');
const sectionFiles = await readdir(sectionDir);
for (const section of SECTIONS) {
  const file = sectionFiles.find((name) => name.startsWith(`0${section.id}-`) && name.endsWith('.svg'));
  if (!file) throw new Error(`No section emblem for section ${section.id} in ${sectionDir}`);
  await copyFile(join(sectionDir, file), join(out, 'sections', `${section.key}.svg`));
}
for (const name of ['book-emblem.svg', 'book-emblem-mono.svg', 'wordmark.svg']) {
  await copyFile(join(source, 'decision-book-completion-kit', 'identity', name), join(out, 'identity', name));
}
console.log(`Copied ${CATALOGUE.length} model emblems, ${SECTIONS.length} section emblems and 3 identity marks.`);
