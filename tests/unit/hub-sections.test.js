import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listHubSections } from '../../apps/life/js/shell/hub-sections.js';
import { hubSwitcherHost, hubSwitcherHtml, listUmbrellaHubs } from '../../packages/hub-switcher.js';

test('hub section registry names Teaching, Knowledge, and Tasks', () => {
  const ids = listHubSections().map(section => section.id);
  assert.deepEqual(ids, ['teaching', 'knowledge', 'tasks']);
});

test('Teaching mount is the same-origin SPA and keeps the student prefix', () => {
  const teaching = listHubSections().find(section => section.id === 'teaching');
  assert.equal(teaching.origin, '/teaching/');
  assert.equal(teaching.studentPublicPrefix, '/teaching/s/');
});

test('Knowledge mount is the same-origin SPA', () => {
  const knowledge = listHubSections().find(section => section.id === 'knowledge');
  assert.equal(knowledge.origin, '/knowledge/');
});

test('Tasks mount is the same-origin SPA', () => {
  const tasks = listHubSections().find(section => section.id === 'tasks');
  assert.equal(tasks.origin, '/tasks/');
});

test('Life shell links out to remounted hubs instead of stub dashboards', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\/teaching\/"/);
  assert.match(html, /href="\/knowledge\/"/);
  assert.match(html, /href="\/tasks\/"/);
  assert.match(html, /id="home-now"/);
  assert.match(html, /data-now-jump="teaching"/);
  assert.match(html, /data-now-jump="knowledge"/);
  assert.match(html, /data-now-jump="tasks"/);
  assert.match(html, /data-now-jump="professional"/);
  assert.doesNotMatch(html, /data-hub-pulse=/);
  assert.doesNotMatch(html, /id="clare-dump-form"/);
  assert.doesNotMatch(html, /id="teaching-dashboard"/);
  assert.doesNotMatch(html, /id="knowledge-dashboard"/);
  assert.doesNotMatch(html, /id="tasks-dashboard"/);
  assert.doesNotMatch(html, /data-section="teaching"/);
  assert.doesNotMatch(html, /data-section="knowledge"/);
  assert.doesNotMatch(html, /data-section="tasks"/);
  assert.doesNotMatch(html, /teaching-api|knowledge-api|tasks-api/i);
});

test('umbrella hub switcher lists Life plus the four remounted hubs, Professional exactly once', () => {
  const ids = listUmbrellaHubs().map(hub => hub.id);
  assert.deepEqual(ids, ['life', 'teaching', 'knowledge', 'tasks', 'professional']);
  assert.equal(ids.filter(id => id === 'professional').length, 1);
  const html = hubSwitcherHtml('knowledge');
  assert.match(html, /data-hub-switcher/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/teaching\/"/);
  assert.match(html, /href="\/knowledge\/"/);
  assert.match(html, /href="\/tasks\/"/);
  assert.match(html, /href="\/professional\/"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /data-hub-toggle="knowledge"/);
  assert.match(html, /class="hub-row is-active"/);
});

test('every hub switcher rendering includes Professional exactly once, for every current hub', () => {
  for (const currentId of ['life', 'teaching', 'knowledge', 'tasks', 'professional']) {
    const html = hubSwitcherHtml(currentId);
    const matches = html.match(/data-hub="professional"/g) ?? [];
    assert.equal(matches.length, 1, `expected exactly one Professional row when current hub is "${currentId}"`);
  }
});

test('Life desktop hub switcher and mobile More sheet include Professional', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\/professional\/"/);
  assert.match(html, /data-hub="professional"/);
  assert.match(html, /data-hub-toggle="professional"/);
  assert.match(html, /data-hub-panel="professional"/);
});

test('hub switcher host stays in the hub nav so it follows its pages', () => {
  const nav = { closest: () => ({ classList: { contains: () => true } }) };
  assert.equal(hubSwitcherHost(nav), nav);
  assert.equal(hubSwitcherHost(nav), nav);
});
