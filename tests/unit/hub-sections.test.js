import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listHubSections } from '../../apps/life/js/shell/hub-sections.js';

test('hub section registry names Teaching, Knowledge, and Tasks', () => {
  const ids = listHubSections().map(section => section.id);
  assert.deepEqual(ids, ['teaching', 'knowledge', 'tasks']);
});

test('Teaching mount keeps the public Pages origin and student prefix', () => {
  const teaching = listHubSections().find(section => section.id === 'teaching');
  assert.equal(teaching.origin, 'https://teaching-hub.adam-russell.com');
  assert.equal(teaching.studentPublicPrefix, '/s/');
});

test('Knowledge mount links to the existing Pages origin', () => {
  const knowledge = listHubSections().find(section => section.id === 'knowledge');
  assert.equal(knowledge.origin, 'https://knowledge-hub.adam-russell.com');
});

test('Tasks mount has no API origin yet', () => {
  const tasks = listHubSections().find(section => section.id === 'tasks');
  assert.equal(tasks.origin, null);
});

test('Life shell mounts hub dashboards and rail destinations', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  for (const id of ['teaching', 'knowledge', 'tasks']) {
    assert.match(html, new RegExp(`data-section="${id}"`));
    assert.match(html, new RegExp(`id="${id}-dashboard"`));
  }
  assert.match(html, /data-hub-open="teaching"/);
  assert.match(html, /data-hub-open="knowledge"/);
  assert.doesNotMatch(html, /teaching-api|knowledge-api|tasks-api/i);
});
