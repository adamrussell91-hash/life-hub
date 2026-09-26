#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { readExport } from './lib/notion-comms/read-export.mjs';
import { parseRow } from './lib/notion-comms/parse-row.mjs';
import { buildImportPlan } from './lib/notion-comms/plan.mjs';

const args = process.argv.slice(2); const value = (flag) => args[args.indexOf(flag) + 1]; const exportDir = value('--export');
if (!exportDir) throw new Error('Usage: node scripts/import-notion-comms.mjs --export <directory> [--report <path>] [--apply]');
if (args.includes('--apply')) throw new Error('Apply wiring requires NETLIFY_BLOBS_TOKEN and repository configuration; use the reviewed implementation before writing.');
const source = await readExport(exportDir); const rows = source.rows.flatMap((row, index) => {
  const page = source.matches[index];
  return page ? [parseRow(row, page.body, page.id)] : [];
});
const plan = buildImportPlan({ rows, people: [], importMap: { pages: {}, people: {}, threads: {} }, todayKey: new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }) });
const report = `# Notion communications import preview\n\n- Rows read: ${source.rows.length}\n- Rows matched to pages: ${rows.length}\n- Rows skipped (unmatched page): ${source.unmatchedRows.length}\n- Records to create: ${plan.report.records}\n- People to create: ${plan.report.peopleToCreate}\n- Ambiguous people: ${plan.report.ambiguous.length}\n`;
const reportPath = value('--report') ?? path.join(os.tmpdir(), 'notion-comms-import-report.md'); await fs.writeFile(reportPath, report); console.log(`Preview complete. Report: ${reportPath}`);
