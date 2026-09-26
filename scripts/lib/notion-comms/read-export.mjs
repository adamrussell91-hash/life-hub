import fs from 'node:fs/promises';
import path from 'node:path';

export function parseCsv(input) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < input.replace(/^\ufeff/, '').length; i += 1) { const text = input.replace(/^\ufeff/, ''); const ch = text[i]; const next = text[i + 1]; if (quoted) { if (ch === '"' && next === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch; } else if (ch === '"') quoted = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers = [], ...data] = rows;
  return data.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export function pageIdFromFilename(name) { return name.match(/([a-f0-9]{32})\.md$/i)?.[1]?.toLowerCase() ?? null; }

export function parseRelations(value) {
  if (!value) return [];
  return [...value.matchAll(/(?:([^,()]+?)\s*\([^)]*?([a-f0-9]{32})(?=\.md)[^)]*\)|https?:\/\/[^/]+\/([^?\s]+?)-([a-f0-9]{32})(?:\?|$))/gi)]
    .map((match) => ({ name: (match[1] ?? match[3] ?? '').trim().replace(/-/g, ' '), notionId: (match[2] ?? match[4]).toLowerCase() }))
    .filter((item) => item.name && item.notionId);
}

export async function readExport(exportDir) {
  const entries = await fs.readdir(exportDir);
  const csvName = entries.find((name) => /Communications .*_all\.csv$/i.test(name)) ?? entries.find((name) => /^Communications .*\.csv$/i.test(name));
  if (!csvName) throw new Error('No Communications CSV found in export directory.');
  const pages = new Map();
  const pagesByTitle = new Map();
  for (const name of entries.filter((entry) => entry.endsWith('.md'))) {
    const id = pageIdFromFilename(name); if (!id) continue;
    const page = { id, name, body: await fs.readFile(path.join(exportDir, name), 'utf8') };
    pages.set(id, page);
    pagesByTitle.set(name.replace(/\s+[a-f0-9]{32}\.md$/i, '').trim().toLowerCase(), page);
  }
  const rows = parseCsv(await fs.readFile(path.join(exportDir, csvName), 'utf8'));
  return { csvName, rows, pages, pagesByTitle };
}
