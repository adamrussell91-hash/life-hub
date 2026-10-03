#!/usr/bin/env node
/**
 * Count Knowledge book-origin notes, and write Atlas themes for the ones
 * that do not have any yet.
 *
 *   node scripts/shelf-book-notes.mjs --data-dir ../knowledge-hub-data
 *   node scripts/shelf-book-notes.mjs --data-dir ../knowledge-hub-data --apply
 *
 * Reads manifest.json (the archive the shelf groups by book origin).
 * --apply reads the knowledge-shelf Blobs store, then savePlacements — the
 * same merge as POST /api/knowledge/shelf {op:"place"}. It sends themes only,
 * and only when that field is empty. Requires NETLIFY_BLOBS_TOKEN.
 * Never prints the token.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getStore } from '@netlify/blobs';
import { KNOWLEDGE_SHELF_STORE, readShelf, savePlacements } from '../netlify/functions/_shared/knowledge-shelf.mjs';
import { placeBodies, planShelfThemes } from '../netlify/functions/_shared/knowledge-shelf-themes.mjs';
import { UMBRELLA_BLOBS_SITE_ID } from '../netlify/functions/_shared/teaching-blobs.mjs';

function parseArgs(argv) {
  const index = argv.indexOf('--data-dir');
  const dataDir = index >= 0 ? argv[index + 1] : '';
  if (!dataDir) {
    console.error('Pass --data-dir pointing at the knowledge-hub-data checkout.');
    process.exit(1);
  }
  return { dataDir: resolve(dataDir), apply: argv.includes('--apply') };
}

function cell(value) {
  return String(value).replace(/\|/g, '/');
}

function table(headers, rows) {
  const head = `| ${headers.map(cell).join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${row.map(cell).join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

function shelfStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN ?? '';
  if (!token) return null;
  return getStore({ name: KNOWLEDGE_SHELF_STORE, siteID: UMBRELLA_BLOBS_SITE_ID, token });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pages = JSON.parse(readFileSync(resolve(args.dataDir, 'manifest.json'), 'utf8'));
  const store = shelfStore();
  let placements = [];
  let placementsRead = false;
  if (store) {
    placements = (await readShelf(store)).placements;
    placementsRead = true;
  }
  if (args.apply && !placementsRead) {
    console.error('Refusing to write: NETLIFY_BLOBS_TOKEN is required so existing themes can be read first.');
    process.exit(1);
  }
  const plan = planShelfThemes(pages, placements);
  const notes = plan.books.reduce((sum, book) => sum + book.notes, 0);
  console.log(`Book notes: ${notes} across ${plan.books.length} books. Placements read: ${placementsRead ? 'yes' : 'no'}.`);
  if (!placementsRead) {
    console.log('The shelf store was not read, so "Already set" is unknown. "Themes to write" is the count if every themes field is still empty.');
  }
  console.log();
  console.log(table(['Book', 'Notes'], plan.books.map(book => [book.label, book.notes])));
  console.log();
  console.log(table(
    ['Book', 'Notes', 'Themes to write', 'Already set', 'No vocabulary tag'],
    plan.books.map(book => [book.label, book.notes, book.themed, book.already, book.untagged])
  ));
  const bodies = placeBodies(plan.patches);
  console.log();
  console.log(`Place requests: ${bodies.length}, notes: ${plan.patches.length}.`);
  if (!args.apply) {
    console.log('Dry run. Pass --apply to write themes.');
    return;
  }
  let written = 0;
  for (const body of bodies) {
    await savePlacements(store, body.placements);
    written += body.placements.length;
  }
  console.log(`Wrote themes for ${written} notes.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
