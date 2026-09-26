#!/usr/bin/env node
/**
 * Read-only Professional network health report.
 *
 * Usage:
 *   node scripts/professional-network-health.mjs --data-dir <life-hub-data/data/professional>
 *
 * Prints JSON to stdout. Never writes.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildProfessionalNetworkHealthReport } from './lib/professional-network-health.mjs';

function parseArgs(argv) {
  const args = { dataDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--data-dir') {
      args.dataDir = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return args;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const { dataDir } = parseArgs(process.argv.slice(2));
if (!dataDir) {
  console.error('Usage: node scripts/professional-network-health.mjs --data-dir <path-to-data/professional>');
  process.exit(1);
}

const dir = resolve(dataDir);
const report = buildProfessionalNetworkHealthReport({
  people: loadJson(join(dir, 'people.json')),
  organisations: loadJson(join(dir, 'organisations.json')),
  relationships: loadJson(join(dir, 'relationships.json'))
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
