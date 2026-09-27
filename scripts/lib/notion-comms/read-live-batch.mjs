import fs from 'node:fs/promises';
import { normaliseLivePage } from './live-page.mjs';

export async function readLiveBatch(file) {
  const input = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!Array.isArray(input.pages) || !input.relationNames || typeof input.relationNames !== 'object') throw new Error('Live batch requires pages and relationNames.');
  return { rows: input.pages.map((page) => normaliseLivePage(page, input.relationNames)), unmatchedRows: [] };
}
