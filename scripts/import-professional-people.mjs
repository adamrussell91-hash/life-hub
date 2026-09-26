#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { buildProfessionalPeopleImport, markdownPagesFromEntries } from './lib/professional-people-import.mjs';

const execFileAsync = promisify(execFile);

function usage() {
  return [
    'Usage:',
    '  node scripts/import-professional-people.mjs --people <people.json> --csv <People_all.csv> --pages-dir <export-directory> --out <people.json> [--write]',
    '  node scripts/import-professional-people.mjs --people <people.json> --zip <Notion-export.zip> --out <people.json> [--write]'
  ].join('\n');
}

function parseArgs(argv) {
  const result = { write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') {
      result.write = true;
      continue;
    }
    if (!['--people', '--csv', '--pages-dir', '--zip', '--out'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    result[arg.slice(2).replace(/-/g, '_')] = value;
    index += 1;
  }
  if (!result.people || !result.out || (!result.zip && (!result.csv || !result.pages_dir))) throw new Error(usage());
  return result;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function markdownPagesFromDirectory(directory) {
  const files = await listFiles(directory);
  const entries = await Promise.all(
    files
      .filter((path) => path.toLowerCase().endsWith('.md'))
      .map(async (path) => ({ path, body: await readFile(path, 'utf8') }))
  );
  return markdownPagesFromEntries(entries);
}

async function exportInputs(args) {
  if (!args.zip) {
    return { csvPath: args.csv, pagesDirectory: args.pages_dir, cleanup: async () => {} };
  }
  const directory = await mkdtemp(join(tmpdir(), 'life-hub-professional-people-'));
  try {
    await execFileAsync('bsdtar', ['-xf', args.zip, '-C', directory]);
    const files = await listFiles(directory);
    const csvPath = files.find((path) => /^People .*_all\.csv$/i.test(basename(path)));
    if (!csvPath) throw new Error('Could not find the People _all.csv file in the export ZIP.');
    return { csvPath, pagesDirectory: directory, cleanup: async () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { csvPath, pagesDirectory, cleanup } = await exportInputs(args);
  try {
    const [peopleText, csvText, markdownByTitle] = await Promise.all([
      readFile(args.people, 'utf8'),
      readFile(csvPath, 'utf8'),
      markdownPagesFromDirectory(pagesDirectory)
    ]);
    const people = JSON.parse(peopleText);
    if (!Array.isArray(people)) throw new Error('--people must contain a JSON array.');
    const result = buildProfessionalPeopleImport({ people, csvText, markdownByTitle });
    const hasUnresolvedRows = result.report.unmatched_rows.length > 0 || result.report.ambiguous_rows.length > 0;
    if (args.write && hasUnresolvedRows) {
      throw new Error('Refusing to write: the import report contains unmatched or ambiguous People rows.');
    }
    if (args.write) await writeFile(args.out, `${JSON.stringify(result.people, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(result.report)}\n`);
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
