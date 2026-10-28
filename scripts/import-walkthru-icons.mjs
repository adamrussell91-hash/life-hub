#!/usr/bin/env node
// Imports the traced WalkThrus menu icons (Drive: WalkThrus_SVG_Assets) as technique glyphs.
//
//   node scripts/import-walkthru-icons.mjs <folder-with-the-svgs>
//
// Looks for files named like `p111_menu_icon_quizzing.svg` anywhere under the folder, matches the
// name part to a catalogue technique, tidies the markup (drops the outline title/description, the
// scan's white background, the fixed width and height) and writes packages/walkthrus/glyphs/<id>.svg.
// Prints what matched and what didn't. Safe to run again.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../packages/walkthrus/catalogue.mjs';

const OUT = fileURLToPath(new URL('../packages/walkthrus/glyphs/', import.meta.url));
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The scan's white page: a path filled near-white with no offset. Removed so the icon sits on the tile. */
export function tidy(svg) {
  let out = svg.replace(/<\?xml[^>]*\?>\s*/g, '').replace(/<title[^>]*>[\s\S]*?<\/title>/g, '').replace(/<desc[^>]*>[\s\S]*?<\/desc>/g, '');
  const open = out.match(/<svg[^>]*>/)?.[0];
  if (!open) return null;
  const viewBox = open.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) return null;
  const cleanOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" focusable="false">`;
  let body = out.slice(out.indexOf(open) + open.length, out.lastIndexOf('</svg>'));
  body = body.replace(/<path\b[^>]*fill="#F[C-F]F[C-F]F[C-F]"[^>]*transform="translate\(0,\s*0\)"[^>]*\/>\s*/i, '');
  body = body.replace(/(\d+\.\d{2})\d+/g, '$1');
  return `${cleanOpen}${body.trim()}</svg>\n`;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.svg')) yield full;
  }
}

async function main(folder) {
  if (!folder) throw new Error('Pass the folder that holds the unzipped WalkThrus SVGs.');
  const techniques = new Map(CATALOGUE.filter((e) => e.kind === 'technique').map((e) => [slug(e.name), e]));
  await mkdir(OUT, { recursive: true });
  const done = new Set();
  const unmatched = [];
  for await (const file of walk(folder)) {
    const m = basename(file).match(/^p\d+_menu_icon_(.+)\.svg$/);
    if (!m) continue;
    const entry = techniques.get(slug(m[1]));
    if (!entry) { unmatched.push(basename(file)); continue; }
    const markup = tidy(await readFile(file, 'utf8'));
    if (!markup) { unmatched.push(`${basename(file)} (no viewBox)`); continue; }
    await writeFile(join(OUT, `${entry.id}.svg`), markup);
    done.add(entry.id);
  }
  console.log(`Wrote ${done.size} glyphs.`);
  const missing = [...techniques.values()].filter((e) => !done.has(e.id)).map((e) => e.name);
  if (missing.length) console.log(`No icon found for ${missing.length}: ${missing.join(', ')}`);
  if (unmatched.length) console.log(`Menu icons with no catalogue match (${unmatched.length}): ${unmatched.join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv[2]);
