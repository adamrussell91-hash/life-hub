import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatHubRef,
  hrefForHubRef,
  labelForHubRef,
  normalizeConnected,
  parseHubRef
} from '../../netlify/functions/_shared/hub-ref.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('bare Knowledge page ids stay Knowledge page refs', () => {
  assert.deepEqual(parseHubRef('page_lkeep'), { hub: 'knowledge', kind: 'page', id: 'page_lkeep' });
  assert.equal(formatHubRef({ hub: 'knowledge', kind: 'page', id: 'page_lkeep' }), 'page_lkeep');
});

test('parses Teaching unit and Tasks project refs', () => {
  assert.deepEqual(parseHubRef('teaching:unit:unit_lkeep'), {
    hub: 'teaching',
    kind: 'unit',
    id: 'unit_lkeep'
  });
  assert.deepEqual(parseHubRef('tasks:project:proj_lkeep'), {
    hub: 'tasks',
    kind: 'project',
    id: 'proj_lkeep'
  });
  assert.equal(formatHubRef({ hub: 'teaching', kind: 'unit', id: 'unit_lkeep' }), 'teaching:unit:unit_lkeep');
  assert.equal(formatHubRef({ hub: 'tasks', kind: 'project', id: 'proj_lkeep' }), 'tasks:project:proj_lkeep');
});

test('parses Life decision refs', () => {
  assert.deepEqual(parseHubRef('life:decision:lkeep-sources'), {
    hub: 'life',
    kind: 'decision',
    id: 'lkeep-sources'
  });
  assert.equal(formatHubRef({ hub: 'life', kind: 'decision', id: 'lkeep-sources' }), 'life:decision:lkeep-sources');
  assert.equal(
    hrefForHubRef({ hub: 'life', kind: 'decision', id: 'lkeep-sources' }),
    '/#central-node'
  );
  assert.match(labelForHubRef({ hub: 'life', kind: 'decision', id: 'lkeep-sources' }), /lkeep-sources/);
});

test('rejects unknown hubs, kinds, and junk', () => {
  assert.equal(parseHubRef('life://diary/2026-09-05'), null);
  assert.equal(parseHubRef('teaching:lesson:lesson_lkeep_001'), null);
  assert.equal(parseHubRef('teaching:unit:'), null);
  assert.equal(parseHubRef('https://evil.example/x'), null);
  assert.equal(parseHubRef(''), null);
});

test('normalizeConnected stores Knowledge pages as bare ids and dedupes', () => {
  assert.deepEqual(
    normalizeConnected(['page_lkeep', 'knowledge:page:page_lkeep', 'teaching:unit:unit_lkeep']),
    ['page_lkeep', 'teaching:unit:unit_lkeep']
  );
});

test('normalizeConnected rejects an invalid ref instead of dropping it', () => {
  assert.throws(
    () => normalizeConnected(['page_lkeep', 'life://nope']),
    error => error.status === 400 && /Invalid connected ref/.test(error.message)
  );
});

test('hub ref hrefs point at relative umbrella paths, not a per-hub subdomain', () => {
  assert.equal(
    hrefForHubRef({ hub: 'teaching', kind: 'unit', id: 'unit_lkeep' }),
    '/teaching/units/unit_lkeep'
  );
  assert.equal(
    hrefForHubRef({ hub: 'tasks', kind: 'project', id: 'proj_lkeep' }),
    '/tasks/#/project/proj_lkeep'
  );
  assert.equal(
    hrefForHubRef({ hub: 'knowledge', kind: 'page', id: 'page_lkeep' }),
    '/knowledge/#page/page_lkeep'
  );
  assert.equal(
    hrefForHubRef({ hub: 'tasks', kind: 'program', id: 'program_1' }),
    '/tasks/#/programs?id=program_1'
  );
  assert.equal(labelForHubRef({ hub: 'teaching', kind: 'unit', id: 'unit_lkeep' }), 'Teaching unit unit_lkeep');
});

test('LKEEP seed page cites the Teaching unit and Tasks project that exist', () => {
  const knowledge = JSON.parse(readFileSync(join(root, 'apps/knowledge/fixtures/seed.json'), 'utf8'));
  const teaching = JSON.parse(readFileSync(join(root, 'apps/teaching/fixtures/seed.json'), 'utf8'));
  const tasks = JSON.parse(readFileSync(join(root, 'apps/tasks/fixtures/seed.json'), 'utf8'));
  const page = knowledge.find(item => item.id === 'page_lkeep');
  assert.ok(page);
  assert.ok(page.connected.includes('teaching:unit:unit_lkeep'));
  assert.ok(page.connected.includes('tasks:project:proj_lkeep'));
  assert.ok(page.connected.includes('life:decision:lkeep-sources'));
  assert.ok(teaching.units.some(unit => unit.id === 'unit_lkeep'));
  assert.ok(tasks.projects.some(project => project.id === 'proj_lkeep'));
  assert.deepEqual(
    page.connected.map(parseHubRef),
    [
      { hub: 'teaching', kind: 'unit', id: 'unit_lkeep' },
      { hub: 'tasks', kind: 'project', id: 'proj_lkeep' },
      { hub: 'life', kind: 'decision', id: 'lkeep-sources' }
    ]
  );
});
