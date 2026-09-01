#!/usr/bin/env node
/**
 * Import a Notion Mind export folder into data/mind markdown records.
 *
 * Usage:
 *   node scripts/import-mind-notion.mjs "/path/to/ExportBlock-..."
 *   node scripts/import-mind-notion.mjs "/path/to/ExportBlock-..." --out /tmp/preview
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendGovernanceEntry } from '../apps/life/js/core/governance-log.js';
import { planImport, slug } from '../apps/life/js/core/mind-import.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));

if (!args.source) {
  console.error('Usage: node scripts/import-mind-notion.mjs "/path/to/ExportBlock-..." [--out <dir>]');
  process.exit(1);
}

const sourceDir = resolve(args.source);
const destRoot = resolve(args.out || repoRoot);

if (!existsSync(sourceDir)) {
  console.error(`Source folder not found: ${sourceDir}`);
  process.exit(1);
}

const files = collectExportFiles(sourceDir).map(file => ({
  name: file.name,
  text: readFileSync(file.path, 'utf8')
}));
const existingIds = collectExistingIds(destRoot);
const plan = planImport(files, { existingIds });

let written = 0;
let skipped = 0;
for (const item of plan.planned) {
  const relative = eventPath(item.record);
  const full = join(destRoot, relative);
  if (existsSync(full) || existingIds.has(item.record.id)) {
    skipped += 1;
    continue;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, renderEventDocument(item.record, item.body), 'utf8');
  existingIds.add(item.record.id);
  written += 1;
}

let insightCount = 0;
if (plan.insights.length) {
  const logPath = join(destRoot, 'data/governance/governance-log.md');
  mkdirSync(dirname(logPath), { recursive: true });
  let log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  for (const insight of plan.insights) {
    log = appendGovernanceEntry(log, {
      dateKey: insight.dateKey,
      entryType: 'Mind Insight',
      title: insight.title,
      body: insight.body
    });
    insightCount += 1;
  }
  writeFileSync(logPath, log, 'utf8');
}

console.log(JSON.stringify({
  sourceDir,
  destRoot,
  scanned: files.length,
  planned: plan.records.length,
  written,
  skipped,
  insights: insightCount
}, null, 2));

function parseArgs(argv) {
  const parsed = { source: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--out') {
      parsed.out = argv[i + 1];
      i += 1;
    } else if (!token.startsWith('-') && !parsed.source) {
      parsed.source = token;
    }
  }
  return parsed;
}

function collectExportFiles(root) {
  const found = [];
  const top = safeEntries(root);
  for (const entry of top) {
    if (entry.isFile() && isImportFile(entry.name)) {
      found.push({ name: entry.name, path: join(root, entry.name) });
    }
  }
  for (const entry of top) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const child = join(root, entry.name);
    for (const nested of safeEntries(child)) {
      if (nested.isFile() && isImportFile(nested.name)) {
        found.push({ name: nested.name, path: join(child, nested.name) });
      }
    }
  }
  return found;
}

function safeEntries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isImportFile(name) {
  return /\.(md|csv)$/i.test(name);
}

function collectExistingIds(dest) {
  const ids = new Set();
  const mindRoot = join(dest, 'data/mind');
  if (!existsSync(mindRoot)) return ids;
  for (const file of walkMarkdown(mindRoot)) {
    const text = readFileSync(file, 'utf8');
    const match = /^id:\s*(.+)$/m.exec(text);
    if (!match) continue;
    ids.add(match[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return ids;
}

function walkMarkdown(dir) {
  const out = [];
  for (const entry of safeEntries(dir)) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function eventPath(record) {
  const [year, month] = record.date.split('-');
  const titleSlug = slug(record.title || record.theme || record.type);
  return `data/mind/${year}/${month}/${record.date}-${titleSlug}.md`;
}

function renderEventDocument(record, body) {
  const yaml = Object.entries(record)
    .filter(([, value]) => value != null && value !== '')
    .filter(([, value]) => !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  const notes = typeof body === 'string' && body.trim() ? `${body.trim()}\n` : '';
  return `---\n${yaml}\n---\n${notes}`;
}
