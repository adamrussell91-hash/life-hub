#!/usr/bin/env node
/**
 * Mandatory pre-PR gate for life-hub.
 *
 * Agents MUST run this and get exit 0 before opening or updating any
 * life-hub PR (ManagePullRequest, gh pr create/edit, etc.).
 *
 * Usage (repo root):
 *   node scripts/pre-pr-check.mjs
 *   npm run pre-pr-check
 *
 * Options:
 *   --docs-only   Skip Professional typecheck. Still runs npm test + static
 *                 guards. Only for PRs with zero runtime / test / type impact.
 *   --help
 *
 * This script is the source of truth for which commands agents must run.
 * Keep steps aligned with `.github/workflows/pages.yml`:
 *   - Pages runs `npm test` with pipefail, then the Tasks Hub vitest suite
 *     (`cd apps/tasks && npx vitest run`), then `npm run build`
 *   - `build:professional` runs `npm run typecheck` (`tsc --noEmit`) first
 *
 * Agent checklist (Project store): docs/mandatory-pre-pr-check.md
 * Principle: never weaken Pages / hide failures to go green.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  console.log(`Usage: node scripts/pre-pr-check.mjs [--docs-only]

Mandatory before any life-hub PR. Exit 0 required.

Steps:
  1. Static guards (rail IDs, registry count parity, Contents mock sha)
  2. npm test          (same as Pages)
  3. Tasks Hub vitest  (same as Pages; installs apps/tasks deps if missing)
  4. Professional typecheck  (same as build:professional; skipped with --docs-only)
`);
  process.exit(0);
}

const docsOnly = args.has('--docs-only');
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error(`FAIL  ${msg}`);
}

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function listTestFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listTestFiles(full, out);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function run(label, command, commandArgs, { cwd = root } = {}) {
  console.log(`\n==> ${label}`);
  console.log(`$ ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: false
  });
  if (result.error) {
    fail(`${label}: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    fail(`${label}: exit ${result.status ?? 1}`);
    return false;
  }
  pass(label);
  return true;
}

/** Calendar-comms rail destinations must stay on RailViewId (#526). */
function checkRailViewIds() {
  const rel = 'apps/professional/src/app/router.ts';
  const src = read(rel);
  const match = src.match(/export type RailViewId\s*=([\s\S]*?);/);
  if (!match) {
    fail(`${rel}: could not find export type RailViewId`);
    return;
  }
  const body = match[1];
  for (const id of ['communications', 'meetings', 'events']) {
    if (!body.includes(`'${id}'`)) {
      fail(`${rel}: RailViewId missing '${id}' — never delete calendar-comms rail IDs to silence tsc`);
    }
  }
  if (failures.length === 0 || !failures.some((f) => f.includes('RailViewId'))) {
    pass('RailViewId keeps communications | meetings | events');
  }
}

/**
 * Unit + integration relationship-registry projection counts must match
 * (#512, #525). Drift after Career/People registry edits is a recurring Pages red.
 */
function checkRegistryCountParity() {
  const unitRel = 'tests/unit/relationship-registry.test.js';
  const integRel = 'tests/integration/relationship-registry.test.js';
  const unit = read(unitRel);
  const integ = read(integRel);
  const unitCount = unit.match(/assert\.equal\(\s*projected\.length\s*,\s*(\d+)\s*\)/);
  const integCount = integ.match(/assert\.equal\(\s*body\.data\.relationships\.length\s*,\s*(\d+)\s*\)/);
  if (!unitCount || !integCount) {
    fail('relationship-registry: could not parse projection length asserts in unit/integration tests');
    return;
  }
  if (unitCount[1] !== integCount[1]) {
    fail(
      `relationship-registry count drift: unit expects ${unitCount[1]}, integration expects ${integCount[1]} — update both after Career/People/registry changes`
    );
    return;
  }
  pass(`relationship-registry projection count parity (${unitCount[1]})`);
}

/**
 * After #531, fetchDataFile requires typeof payload.sha === 'string'.
 * Contents mocks that only return `{ content: base64 }` make GitHub import
 * return null (#531/#532 people-collection 1 !== 3).
 */
function checkProfessionalContentsMocks() {
  const testsRoot = join(root, 'tests');
  const files = listTestFiles(testsRoot).filter((abs) => {
    const src = readFileSync(abs, 'utf8');
    return (
      src.includes('github-professional-data') ||
      src.includes('/data/professional/') ||
      src.includes('data/professional/')
    );
  });

  const offenders = [];
  for (const abs of files) {
    const src = readFileSync(abs, 'utf8');
    // One-liner Contents mocks: ({ content: Buffer.from(...) }) with no sha.
    const bareContent = /\(\s*\{\s*content\s*:/g;
    let m;
    while ((m = bareContent.exec(src))) {
      const window = src.slice(m.index, m.index + 280);
      if (!/\bsha\s*:/.test(window)) {
        offenders.push(`${relative(root, abs)}:${lineAt(src, m.index)}`);
      }
    }
  }

  if (offenders.length) {
    fail(
      `Professional Contents mocks missing sha (blob fallback contract #531): ${offenders.join(', ')}`
    );
    return;
  }
  pass(`Professional Contents mocks include sha (${files.length} scanned files)`);
}

function lineAt(src, index) {
  return src.slice(0, index).split('\n').length;
}

console.log('life-hub pre-PR check');
console.log(`root: ${root}`);
if (docsOnly) console.log('mode: --docs-only (typecheck skipped)');

checkRailViewIds();
checkRegistryCountParity();
checkProfessionalContentsMocks();

if (failures.length) {
  console.error(`\nStatic guards failed (${failures.length}). Fix before npm test.`);
  process.exit(1);
}

const testOk = run('npm test (Pages)', 'npm', ['test']);
if (!testOk) {
  console.error('\npre-pr-check FAILED at npm test');
  process.exit(1);
}

const tasksDir = join(root, 'apps', 'tasks');
if (!existsSync(join(tasksDir, 'node_modules'))) {
  const installOk = run('Install Tasks Hub dependencies', 'npm', ['ci', '--ignore-scripts'], {
    cwd: tasksDir
  });
  if (!installOk) {
    console.error('\npre-pr-check FAILED installing Tasks Hub dependencies');
    process.exit(1);
  }
}
const tasksOk = run('Tasks Hub vitest (Pages)', 'npx', ['vitest', 'run'], { cwd: tasksDir });
if (!tasksOk) {
  console.error('\npre-pr-check FAILED at Tasks Hub vitest');
  process.exit(1);
}

if (!docsOnly) {
  const typeOk = run(
    'Professional typecheck (Pages build:professional)',
    'npm',
    ['run', 'typecheck'],
    { cwd: join(root, 'apps', 'professional') }
  );
  if (!typeOk) {
    console.error('\npre-pr-check FAILED at Professional typecheck');
    process.exit(1);
  }
} else {
  console.log('\nSKIP  Professional typecheck (--docs-only)');
}

console.log('\npre-pr-check PASSED — safe to open/update the life-hub PR.');
process.exit(0);
