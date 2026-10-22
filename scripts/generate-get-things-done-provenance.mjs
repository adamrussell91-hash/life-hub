#!/usr/bin/env node
// scripts/generate-get-things-done-provenance.mjs
// The provenance graphics a Gear Shifter action record's image block shows: for every catalogue
// technique, its emblem on a paper disc inside a cobalt ring, with its section's emblem as a
// badge at the lower right. An entry without an emblem would show the book's. Written to the Tasks build's static files
// (apps/tasks/public/get-things-done/provenance/<id>.svg), so a page keeps a stable address for
// them. Run after changing an emblem; a unit test fails if they drift.
//   node scripts/generate-get-things-done-provenance.mjs          write the files
//   node scripts/generate-get-things-done-provenance.mjs --check  exit 1 if any differs
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { CATALOGUE, SECTIONS } from '../packages/get-things-done/catalogue.mjs';

const root = new URL('../', import.meta.url);
const glyphs = new URL('packages/get-things-done/glyphs/', root);
export const PROVENANCE_DIR = new URL('apps/tasks/public/get-things-done/provenance/', root);

const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** An emblem's drawing without its outer svg, title or description. */
const inner = (svg) => svg.replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title[^>]*>.*?<\/title>/s, '').replace(/<desc[^>]*>.*?<\/desc>/s, '');

/** The composite for one catalogue entry. */
export function provenanceSvg(entry, sectionSvg, entrySvg) {
  const section = SECTIONS.find((s) => s.key === entry.section);
  const label = `${entry.title}, from ${section.title}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><circle cx="112" cy="112" r="102" fill="#fefdf6" stroke="#2b7de9" stroke-width="8"/><svg x="27" y="27" width="170" height="170" viewBox="0 0 140 140">${inner(entrySvg)}</svg><circle cx="190" cy="190" r="46" fill="#fefdf6" stroke="#c9cbc4" stroke-width="2"/><svg x="150" y="150" width="80" height="80" viewBox="0 0 240 240">${inner(sectionSvg)}</svg></svg>\n`;
}

/** File name → contents for every catalogue technique. */
export async function provenanceFiles() {
  const book = await readFile(new URL('identity/book-emblem.svg', glyphs), 'utf8');
  const out = {};
  for (const entry of CATALOGUE) {
    const sectionSvg = await readFile(new URL(`sections/${entry.section}.svg`, glyphs), 'utf8');
    const entrySvg = await readFile(new URL(`models/${entry.id}.svg`, glyphs), 'utf8').catch(() => book);
    out[`${entry.id}.svg`] = provenanceSvg(entry, sectionSvg, entrySvg);
  }
  return out;
}

async function main() {
  const files = await provenanceFiles();
  if (process.argv.includes('--check')) {
    const have = (await readdir(PROVENANCE_DIR).catch(() => [])).sort();
    const differs = [];
    for (const [name, text] of Object.entries(files)) {
      const current = await readFile(new URL(name, PROVENANCE_DIR), 'utf8').catch(() => null);
      if (current !== text) differs.push(name);
    }
    const extra = have.filter((name) => !files[name]);
    if (differs.length || extra.length) {
      console.error(`Provenance graphics are out of date: ${[...differs, ...extra].join(', ')}. Run node scripts/generate-get-things-done-provenance.mjs`);
      process.exit(1);
    }
    return;
  }
  await rm(PROVENANCE_DIR, { recursive: true, force: true });
  await mkdir(PROVENANCE_DIR, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(new URL(name, PROVENANCE_DIR), text);
  console.log(`Wrote ${Object.keys(files).length} provenance graphics.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
