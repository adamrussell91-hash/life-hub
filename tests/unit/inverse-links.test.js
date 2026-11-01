import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDecisionBacklinks,
  collectInverseLinks,
  defaultLoadInverseLinks,
  normalizeInverseLinks
} from '../../netlify/functions/_shared/inverse-links.mjs';

const entries = [
  {
    id: 'page_lkeep',
    title: 'The Lantern Keeper — sources',
    connected: ['teaching:unit:unit_lkeep', 'tasks:project:proj_lkeep', 'life:decision:lkeep-sources']
  },
  {
    id: 'page_lkeep_notes',
    title: 'LKEEP teaching notes',
    connected: ['page_lkeep', 'knowledge:page:page_lkeep']
  },
  {
    id: 'page_training_pulse',
    title: 'Training pulse',
    connected: []
  }
];

test('collectInverseLinks lists Knowledge pages that point at the target', () => {
  assert.deepEqual(collectInverseLinks(entries, 'page_lkeep'), [
    { id: 'page_lkeep_notes', title: 'LKEEP teaching notes' }
  ]);
});

test('collectInverseLinks does not treat outbound connected as inbound', () => {
  assert.deepEqual(collectInverseLinks(entries, 'page_training_pulse'), []);
  assert.deepEqual(collectInverseLinks(entries, 'page_lkeep_notes'), []);
});

test('collectDecisionBacklinks groups Knowledge pages that point at a Life decision', () => {
  assert.deepEqual(collectDecisionBacklinks(entries), [
    {
      target: 'life:decision:lkeep-sources',
      sources: [{ id: 'page_lkeep', title: 'The Lantern Keeper — sources' }]
    }
  ]);
});

test('normalizeInverseLinks is fail-visible when the archive cannot be read', () => {
  assert.deepEqual(normalizeInverseLinks({ links: [], groups: [], status: 'unavailable' }), {
    links: [],
    groups: [],
    status: 'unavailable'
  });
});

test('defaultLoadInverseLinks does not invent inbound links when page hydration misses', async () => {
  const loaded = await defaultLoadInverseLinks({
    page: { id: 'page_lkeep' },
    listPages: async () => [
      { id: 'page_lkeep', title: 'The Lantern Keeper — sources' },
      { id: 'page_lkeep_notes', title: 'LKEEP teaching notes' }
    ],
    env: {},
    fetchImpl: async () => {
      throw new Error('page hydration failed');
    }
  });
  assert.equal(loaded.status, 'ready');
  assert.deepEqual(loaded.links, []);
  assert.deepEqual(loaded.groups, []);
});

test('defaultLoadInverseLinks uses connected on the list when present', async () => {
  const loaded = await defaultLoadInverseLinks({
    page: { id: 'page_lkeep' },
    listPages: async () => entries
  });
  assert.equal(loaded.status, 'ready');
  assert.deepEqual(loaded.links, [{ id: 'page_lkeep_notes', title: 'LKEEP teaching notes' }]);
  assert.equal(loaded.groups[0].target, 'life:decision:lkeep-sources');
});

test('defaultLoadInverseLinks uses backfilled connected on a large archive without fetching pages', async () => {
  const listed = Array.from({ length: 25 }, (_, i) => ({
    id: `note-${i + 1}`,
    title: `Note ${i + 1}`
  }));
  listed[0] = { id: 'page_ethics', title: 'Ethics', connected: ['page_training_pulse'] };
  listed[1] = { id: 'page_training_pulse', title: 'Training pulse' };
  const loaded = await defaultLoadInverseLinks({
    page: { id: 'page_training_pulse' },
    listPages: async () => listed,
    fetchImpl: async () => {
      throw new Error('must not hydrate pages when the manifest already has connected');
    }
  });
  assert.equal(loaded.status, 'ready');
  assert.deepEqual(loaded.links, [{ id: 'page_ethics', title: 'Ethics' }]);
});

test('defaultLoadInverseLinks hydrates page_lkeep on a large archive without connected rows', async () => {
  const listed = Array.from({ length: 25 }, (_, i) => ({
    id: `note-${i + 1}`,
    title: `Note ${i + 1}`
  }));
  listed[0] = { id: 'page_lkeep', title: 'The Lantern Keeper — sources' };
  const urls = [];
  const loaded = await defaultLoadInverseLinks({
    env: { GITHUB_TOKEN: 'token' },
    listPages: async () => listed,
    fetchImpl: async url => {
      urls.push(String(url));
      assert.match(String(url), /pages\/page_lkeep\.json/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'a'.repeat(40),
          encoding: 'base64',
          content: Buffer.from(JSON.stringify({
            id: 'page_lkeep',
            title: 'The Lantern Keeper — sources',
            connected: ['life:decision:lkeep-sources']
          })).toString('base64')
        })
      };
    }
  });
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.groups[0].target, 'life:decision:lkeep-sources');
  assert.equal(urls.length, 1);
});

test('defaultLoadInverseLinks is unavailable when the list fails', async () => {
  const loaded = await defaultLoadInverseLinks({
    page: { id: 'page_lkeep' },
    listPages: async () => {
      throw new Error('manifest down');
    }
  });
  assert.equal(loaded.status, 'unavailable');
  assert.deepEqual(loaded.links, []);
  assert.deepEqual(loaded.groups, []);
});
