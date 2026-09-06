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
    id: 'page_aotfw',
    title: 'Artist of the Floating World — sources',
    connected: ['teaching:unit:unit_aotfw', 'tasks:project:proj_aotfw', 'life:decision:aotfw-sources']
  },
  {
    id: 'page_aotfw_notes',
    title: 'AOTFW teaching notes',
    connected: ['page_aotfw', 'knowledge:page:page_aotfw']
  },
  {
    id: 'page_training_pulse',
    title: 'Training pulse',
    connected: []
  }
];

test('collectInverseLinks lists Knowledge pages that point at the target', () => {
  assert.deepEqual(collectInverseLinks(entries, 'page_aotfw'), [
    { id: 'page_aotfw_notes', title: 'AOTFW teaching notes' }
  ]);
});

test('collectInverseLinks does not treat outbound connected as inbound', () => {
  assert.deepEqual(collectInverseLinks(entries, 'page_training_pulse'), []);
  assert.deepEqual(collectInverseLinks(entries, 'page_aotfw_notes'), []);
});

test('collectDecisionBacklinks groups Knowledge pages that point at a Life decision', () => {
  assert.deepEqual(collectDecisionBacklinks(entries), [
    {
      target: 'life:decision:aotfw-sources',
      sources: [{ id: 'page_aotfw', title: 'Artist of the Floating World — sources' }]
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
    page: { id: 'page_aotfw' },
    listPages: async () => [
      { id: 'page_aotfw', title: 'Artist of the Floating World — sources' },
      { id: 'page_aotfw_notes', title: 'AOTFW teaching notes' }
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
    page: { id: 'page_aotfw' },
    listPages: async () => entries
  });
  assert.equal(loaded.status, 'ready');
  assert.deepEqual(loaded.links, [{ id: 'page_aotfw_notes', title: 'AOTFW teaching notes' }]);
  assert.equal(loaded.groups[0].target, 'life:decision:aotfw-sources');
});

test('defaultLoadInverseLinks hydrates page_aotfw on a large archive without connected rows', async () => {
  const listed = Array.from({ length: 25 }, (_, i) => ({
    id: `note-${i + 1}`,
    title: `Note ${i + 1}`
  }));
  listed[0] = { id: 'page_aotfw', title: 'Artist of the Floating World — sources' };
  const urls = [];
  const loaded = await defaultLoadInverseLinks({
    env: { GITHUB_TOKEN: 'token' },
    listPages: async () => listed,
    fetchImpl: async url => {
      urls.push(String(url));
      assert.match(String(url), /pages\/page_aotfw\.json/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'a'.repeat(40),
          encoding: 'base64',
          content: Buffer.from(JSON.stringify({
            id: 'page_aotfw',
            title: 'Artist of the Floating World — sources',
            connected: ['life:decision:aotfw-sources']
          })).toString('base64')
        })
      };
    }
  });
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.groups[0].target, 'life:decision:aotfw-sources');
  assert.equal(urls.length, 1);
});

test('defaultLoadInverseLinks is unavailable when the list fails', async () => {
  const loaded = await defaultLoadInverseLinks({
    page: { id: 'page_aotfw' },
    listPages: async () => {
      throw new Error('manifest down');
    }
  });
  assert.deepEqual(loaded, { links: [], groups: [], status: 'unavailable' });
});
