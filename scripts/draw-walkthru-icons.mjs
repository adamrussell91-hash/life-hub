#!/usr/bin/env node
// Draws the WalkThrus symbol icons as plain SVG, one per technique:
//
//   symbol/<id>.svg  the technique as a symbol, no people (Teaching cards and planning strips)
//
//   node scripts/draw-walkthru-icons.mjs
//
// Black line art in currentColor, one stroke weight, round ends, at most one filled shape as the
// focus, in a 100 × 100 frame. The drawings live in scripts/walkthru-icons/, one file per series,
// built from parts.mjs.
//
// figure/<id>.svg (the people in the board hexes and on a block's WalkThru bar) is not drawn here.
// It is the hexagon from the same set as the step pictures, drawn in the private data repo
// (data/teaching/walkthrus/pictures/source) and copied in from pictures/hexagons/.
import { writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../packages/walkthrus/catalogue.mjs';

const OUT = fileURLToPath(new URL('../packages/walkthrus/glyphs/', import.meta.url));
const SERIES = ['qf', 'pr', 'em', 'cp', 'br', 'mb'];

const sets = { symbol: {} };
for (const key of SERIES) {
  const mod = await import(`./walkthru-icons/${key}.mjs`).catch(() => null);
  if (!mod) continue;
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
