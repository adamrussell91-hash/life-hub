import assert from 'node:assert/strict';
import test from 'node:test';
import {
  constellationKey,
  getConstellation,
  listConstellations,
  saveConstellation
} from '../../netlify/functions/_shared/knowledge-stars.mjs';
import { createKnowledgeStarsHandler } from '../../netlify/functions/knowledge-stars.mjs';
import { runChatTurn } from '../../netlify/functions/_shared/knowledge-chat-turn.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };

function memoryStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

function proposal() {
  const notes = Array.from({ length: 5 }, (_, index) => ({
    pageId: `page_${index}`,
    title: `Note ${index}`,
    excerpt: `Evidence ${index}`,
    role: `Role ${index}`
  }));
  return {
    version: 1,
    query: 'models of reading',
    title: 'Models of Reading',
    symbol: { templateId: 'eye', label: 'Eye', meaning: 'Several ways of seeing reading.' },
    notes,
    relations: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [2, 4]].map(([source, target]) => ({
      sourceId: notes[source].pageId,
      targetId: notes[target].pageId,
      type: 'extends',
      explanation: 'A grounded connection.'
    })),
    synthesis: {
      summary: 'A connected account.',
      claims: [{ text: 'A grounded claim.', sourceIds: [notes[0].pageId] }],
      tensions: [],
      gaps: []
    }
  };
}

test('Stars persistence stores one approved object and lists it from the index', async () => {
  const store = memoryStore();
  const saved = await saveConstellation(store, proposal(), {
    id: 'abc123',
    now: '2026-09-11T10:00:00.000Z'
  });
  assert.equal(saved.id, 'stars_abc123');
  assert.equal(saved.notes.length, 5);
  assert.ok(saved.sky.x >= 0.08 && saved.sky.x <= 0.92);
  assert.deepEqual(await getConstellation(store, saved.id), saved);
  assert.deepEqual(await listConstellations(store), [saved]);
});

test('Stars persistence rejects an ungrounded relationship', async () => {
  const value = proposal();
  value.relations[0].targetId = 'page_missing';
  await assert.rejects(() => saveConstellation(memoryStore(), value), /complete Stars proposal/);
});

test('Stars storage keys reject path-like ids', () => {
  assert.throws(() => constellationKey('stars_../../secret'), /Valid constellation id/);
});

test('Stars API gates the archive and saves an approved proposal', async () => {
  const store = memoryStore();
  const unauthenticated = createKnowledgeStarsHandler({
    env,
    verifySessionToken: () => ({ valid: false }),
    getStore: async () => store
  });
  assert.equal((await unauthenticated(new Request('https://example.test/api/knowledge/stars'))).status, 401);

  const handler = createKnowledgeStarsHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    getStore: async () => store,
    id: () => 'api123',
    now: () => '2026-09-11T10:00:00.000Z'
  });
  const response = await handler(new Request('https://example.test/api/knowledge/stars', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(proposal())
  }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.data.constellation.id, 'stars_api123');
});

test('Clementine Stars reuses archive synthesis and writes the strict renderer protocol', async () => {
  let started;
  const findings = proposal().notes.map(note => ({
    pageId: note.pageId,
    title: note.title,
    excerpt: note.excerpt
  }));
  const result = await runChatTurn({
    voice: 'You are Clementine.',
    universityJob: 'Work only from the archive.',
    hat: 'stars',
    messages: [{ role: 'user', content: 'What do I have on models of reading?' }],
    compose: true,
    priorResearch: { query: 'models of reading', findings, gaps: [], followUpQueries: [] },
    write: {
      start: async input => {
        started = input;
        return { status: 'done', reply: JSON.stringify(proposal()) };
      }
    }
  });
  assert.equal(result.status, 'done');
  assert.equal(started.maxTokens, 4000);
  assert.match(started.system, /Return only one JSON object/);
  assert.match(started.system, /Every drawn line must have a defensible intellectual relationship/);
  assert.match(started.system, /Note 0/);
});
