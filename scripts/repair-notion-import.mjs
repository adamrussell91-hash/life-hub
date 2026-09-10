#!/usr/bin/env node
/**
 * Repair Notion-imported events in life-hub-data.
 *
 * Usage:
 *   node scripts/repair-notion-import.mjs --out ../life-hub-data           # dry-run (default)
 *   node scripts/repair-notion-import.mjs --out ../life-hub-data --apply
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { parseCanonicalPath, parseEventDocument } from '../apps/life/js/core/records.js';
import {
  spacedDuplicateCandidates,
  repairRecordFrontmatter,
  rebuildEventFile
} from './lib/repair-notion-import.mjs';

const args = parseArgs(process.argv.slice(2));
const outRoot = resolve(args.out || '../life-hub-data');
const apply = args.apply === true;

const summary = {
  scanned: 0,
  deletedDupes: 0,
  repaired: 0,
  skippedTemplates: 0,
  stillInvalid: 0,
  differingDupes: 0,
  samples: []
};

walk(join(outRoot, 'data'));

if (apply) {
  summary.stillInvalid = 0;
  recountInvalid(join(outRoot, 'data'));
}

console.log(JSON.stringify({ outRoot, apply, ...summary }, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') out.out = argv[++i];
    else if (arg === '--apply') out.apply = true;
  }
  return out;
}

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!name.endsWith('.md')) continue;
    const rel = full.slice(outRoot.length + 1).replaceAll('\\', '/');
    if (!rel.startsWith('data/')) continue;
    if (rel.includes('/templates/')) {
      summary.skippedTemplates += 1;
      continue;
    }
    if (rel.includes('library') || basename(rel) === 'central-node.md') continue;
    summary.scanned += 1;

    if (/\s/.test(name)) {
      handleSpaced(full, rel, name);
      continue;
    }

    try {
      parseCanonicalPath(rel);
    } catch {
      continue;
    }

    const text = readFileSync(full, 'utf8');
    let record;
    let body = '';
    try {
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
      if (!match) continue;
      record = load(match[1]);
      body = match[2] ?? '';
    } catch {
      continue;
    }
    if (!record || typeof record !== 'object') continue;

    const { record: next, changed } = repairRecordFrontmatter(record);
    if (!changed) continue;

    summary.repaired += 1;
    if (summary.samples.length < 8) {
      summary.samples.push({ action: 'repair', path: rel });
    }
    if (apply) {
      writeFileSync(full, rebuildEventFile(next, body), 'utf8');
    }
  }
}

function handleSpaced(full, rel, name) {
  const candidates = spacedDuplicateCandidates(name);
  if (!candidates) return;
  const dir = dirname(full);
  let sibling = null;
  for (const candidate of candidates) {
    const path = join(dir, candidate);
    if (existsSync(path)) {
      sibling = path;
      break;
    }
  }
  if (!sibling) {
    summary.differingDupes += 1;
    summary.samples.push({ action: 'orphan-space', path: rel });
    return;
  }
  const a = readFileSync(full);
  const b = readFileSync(sibling);
  if (!a.equals(b)) {
    summary.differingDupes += 1;
    summary.samples.push({ action: 'differing-space', path: rel, sibling: basename(sibling) });
    return;
  }
  summary.deletedDupes += 1;
  if (summary.samples.length < 8) {
    summary.samples.push({ action: 'delete-dupe', path: rel });
  }
  if (apply) unlinkSync(full);
}

function recountInvalid(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      recountInvalid(full);
      continue;
    }
    if (!name.endsWith('.md') || /\s/.test(name)) continue;
    const rel = full.slice(outRoot.length + 1).replaceAll('\\', '/');
    if (!rel.startsWith('data/') || rel.includes('/templates/') || rel.includes('library')) continue;
    try {
      parseCanonicalPath(rel);
      parseEventDocument(readFileSync(full, 'utf8'), rel, load);
    } catch {
      summary.stillInvalid += 1;
      if (summary.samples.length < 15) {
        summary.samples.push({ action: 'still-invalid', path: rel });
      }
    }
  }
}
