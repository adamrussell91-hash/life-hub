#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exerciseLibraryEntryFromCsvRow } from '../netlify/functions/_shared/exercise-library.mjs';

const csvPath = process.argv[2];
const outPath = process.argv[3] || 'data/exercise-library.json';
if (!csvPath) {
  console.error('Usage: node scripts/import-exercise-library.mjs <notion.csv> [out.json]');
  process.exit(1);
}

const text = readFileSync(resolve(csvPath), 'utf8');
const rows = parseCsv(text);
const entries = [];
const seen = new Set();
for (const row of rows) {
  const entry = exerciseLibraryEntryFromCsvRow(row);
  if (!entry) continue;
  const key = entry.name.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  entries.push(entry);
}

entries.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(resolve(outPath), `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
console.log(`Wrote ${entries.length} exercises to ${outPath}`);

function parseCsv(text) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells;
}
