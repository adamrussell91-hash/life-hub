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
  assert.deepEqual(parseHubRef('page_aotfw'), { hub: 'knowledge', kind: 'page', id: 'page_aotfw' });
  assert.equal(formatHubRef({ hub: 'knowledge', kind: 'page', id: 'page_aotfw' }), 'page_aotfw');
});

test('parses Teaching unit and Tasks project refs', () => {
  assert.deepEqual(parseHubRef('teaching:unit:unit_aotfw'), {
    hub: 'teaching',
    kind: 'unit',
    id: 'unit_aotfw'
  });
  assert.deepEqual(parseHubRef('tasks:project:proj_aotfw'), {
    hub: 'tasks',
    kind: 'project',
    id: 'proj_aotfw'
  });
  assert.equal(formatHubRef({ hub: 'teaching', kind: 'unit', id: 'unit_aotfw' }), 'teaching:unit:unit_aotfw');
  assert.equal(formatHubRef({ hub: 'tasks', kind: 'project', id: 'proj_aotfw' }), 'tasks:project:proj_aotfw');
});

test('parses Life decision refs', () => {
  assert.deepEqual(parseHubRef('life:decision:aotfw-sources'), {
    hub: 'life',
    kind: 'decision',
    id: 'aotfw-sources'
  });
  assert.equal(formatHubRef({ hub: 'life', kind: 'decision', id: 'aotfw-sources' }), 'life:decision:aotfw-sources');
  assert.equal(
    hrefForHubRef({ hub: 'life', kind: 'decision', id: 'aotfw-sources' }),
    'https://life-hub.adam-russell.com/#central-node'
  );
  assert.match(labelForHubRef({ hub: 'life', kind: 'decision', id: 'aotfw-sources' }), /aotfw-sources/);
});

test('rejects unknown hubs, kinds, and junk', () => {
  assert.equal(parseHubRef('life://diary/2026-09-05'), null);
  assert.equal(parseHubRef('teaching:lesson:lesson_aotfw_001'), null);
  assert.equal(parseHubRef('teaching:unit:'), null);
  assert.equal(parseHubRef('https://evil.example/x'), null);
  assert.equal(parseHubRef(''), null);
});

test('normalizeConnected stores Knowledge pages as bare ids and dedupes', () => {
  assert.deepEqual(
    normalizeConnected(['page_aotfw', 'knowledge:page:page_aotfw', 'teaching:unit:unit_aotfw']),
    ['page_aotfw', 'teaching:unit:unit_aotfw']
  );
});

test('normalizeConnected rejects an invalid ref instead of dropping it', () => {
  assert.throws(
    () => normalizeConnected(['page_aotfw', 'life://nope']),
    error => error.status === 400 && /Invalid connected ref/.test(error.message)
  );
});

test('hub ref hrefs point at the Teaching unit and Tasks project routes', () => {
  assert.equal(
    hrefForHubRef({ hub: 'teaching', kind: 'unit', id: 'unit_aotfw' }),
    'https://teaching-hub.adam-russell.com/units/unit_aotfw'
  );
  assert.equal(
    hrefForHubRef({ hub: 'tasks', kind: 'project', id: 'proj_aotfw' }),
    'https://tasks-hub.adam-russell.com/#/project/proj_aotfw'
  );
  assert.equal(
    hrefForHubRef({ hub: 'knowledge', kind: 'page', id: 'page_aotfw' }),
    'https://knowledge-hub.adam-russell.com/#page/page_aotfw'
  );
  assert.equal(labelForHubRef({ hub: 'teaching', kind: 'unit', id: 'unit_aotfw' }), 'Teaching unit unit_aotfw');
});

test('AOTFW seed page cites the Teaching unit and Tasks project that exist', () => {
  const knowledge = JSON.parse(readFileSync(join(root, 'apps/knowledge/fixtures/seed.json'), 'utf8'));
  const teaching = JSON.parse(readFileSync(join(root, 'apps/teaching/fixtures/seed.json'), 'utf8'));
  const tasks = JSON.parse(readFileSync(join(root, 'apps/tasks/fixtures/seed.json'), 'utf8'));
  const page = knowledge.find(item => item.id === 'page_aotfw');
  assert.ok(page);
  assert.ok(page.connected.includes('teaching:unit:unit_aotfw'));
  assert.ok(page.connected.includes('tasks:project:proj_aotfw'));
  assert.ok(page.connected.includes('life:decision:aotfw-sources'));
  assert.ok(teaching.units.some(unit => unit.id === 'unit_aotfw'));
  assert.ok(tasks.projects.some(project => project.id === 'proj_aotfw'));
  assert.deepEqual(
    page.connected.map(parseHubRef),
    [
      { hub: 'teaching', kind: 'unit', id: 'unit_aotfw' },
      { hub: 'tasks', kind: 'project', id: 'proj_aotfw' },
      { hub: 'life', kind: 'decision', id: 'aotfw-sources' }
    ]
  );
});
