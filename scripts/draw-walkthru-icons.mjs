#!/usr/bin/env node
// Draws the WalkThrus technique icons as plain SVG, two sets per technique:
//
//   figure/<id>.svg  little stick people acting the technique out (Professional board hexes)
//   symbol/<id>.svg  the same idea as a symbol, no people (Teaching cards and planning strips)
//
//   node scripts/draw-walkthru-icons.mjs
//
// One grammar for every icon: black line art in currentColor, one stroke weight, round ends,
// open heads with no faces or hands, and at most one filled shape as the focus. Figures use a
// 120 × 90 frame so a classroom scene fits the hex; symbols use 100 × 100 for the small badge.
// The drawings live in scripts/walkthru-icons/, one file per series, built from parts.mjs.
// They are original. Never trace or copy the book's artwork.
import { writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../packages/walkthrus/catalogue.mjs';

const OUT = fileURLToPath(new URL('../packages/walkthrus/glyphs/', import.meta.url));
const SERIES = ['qf', 'pr', 'em', 'cp', 'br', 'mb'];

const sets = { figure: {}, symbol: {} };
for (const key of SERIES) {
  const mod = await import(`./walkthru-icons/${key}.mjs`).catch(() => null);
  if (!mod) continue;
  Object.assign(sets.figure, mod.figures);
  Object.assign(sets.symbol, mod.symbols);
}

const known = new Set(CATALOGUE.map((e) => e.id));
for (const [dir, set] of Object.entries(sets)) {
  const strays = Object.keys(set).filter((id) => !known.has(id));
  if (strays.length) throw new Error(`${dir}: not in the catalogue: ${strays.join(', ')}`);
  await mkdir(`${OUT}${dir}`, { recursive: true });
  for (const file of await readdir(`${OUT}${dir}`)) if (!set[file.replace(/\.svg$/, '')]) await rm(`${OUT}${dir}/${file}`);
  for (const [id, markup] of Object.entries(set)) await writeFile(`${OUT}${dir}/${id}.svg`, markup);
  const missing = CATALOGUE.filter((e) => e.kind === 'technique' && !set[e.id]).map((e) => e.id);
  console.log(`${dir}: ${Object.keys(set).length} drawn${missing.length ? `, ${missing.length} still to draw` : ''}`);
}
