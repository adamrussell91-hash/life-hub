#!/usr/bin/env node
// scripts/generate-decision-book-provenance.mjs
// The provenance graphics a decision record's image block shows: for every catalogue model, its
// emblem on a paper disc, with its section's emblem as a badge at the lower right. Written to the Tasks
// build's static files (apps/tasks/public/decision-book/provenance/<model>.svg), so a page keeps
// a stable address for them. Run after changing an emblem; a unit test fails if they drift.
//   node scripts/generate-decision-book-provenance.mjs          write the files
//   node scripts/generate-decision-book-provenance.mjs --check  exit 1 if any differs
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { CATALOGUE, SECTIONS } from '../packages/decision-book/catalogue.mjs';

const root = new URL('../', import.meta.url);
const glyphs = new URL('packages/decision-book/glyphs/', root);
export const PROVENANCE_DIR = new URL('apps/tasks/public/decision-book/provenance/', root);

const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** An emblem's drawing without its outer svg, title or description. */
const inner = (svg) => svg.replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title[^>]*>.*?<\/title>/s, '').replace(/<desc[^>]*>.*?<\/desc>/s, '');

/** The composite for one catalogue entry. */
export function provenanceSvg(entry, sectionSvg, modelSvg) {
  const section = SECTIONS.find((s) => s.id === entry.section);
  const label = `${entry.title}, from ${section.title}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><circle cx="112" cy="112" r="104" fill="#faf8ef" stroke="#171813" stroke-width="2"/><svg x="22" y="22" width="180" height="180" viewBox="0 0 140 140">${inner(modelSvg)}</svg><circle cx="190" cy="190" r="46" fill="#faf8ef"/><svg x="146" y="146" width="88" height="88" viewBox="0 0 240 240">${inner(sectionSvg)}</svg></svg>\n`;
}

/** File name → contents for every catalogue model. */
export async function provenanceFiles() {
  const out = {};
  for (const entry of CATALOGUE) {
    const key = SECTIONS.find((s) => s.id === entry.section).key;
    const sectionSvg = await readFile(new URL(`sections/${key}.svg`, glyphs), 'utf8');
    const modelSvg = await readFile(new URL(`models/${entry.id}.svg`, glyphs), 'utf8');
    out[`${entry.id}.svg`] = provenanceSvg(entry, sectionSvg, modelSvg);
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
      console.error(`Provenance graphics are out of date: ${[...differs, ...extra].join(', ')}. Run node scripts/generate-decision-book-provenance.mjs`);
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
