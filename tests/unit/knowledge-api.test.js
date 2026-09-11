import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeApi } from '../../apps/life/js/app/knowledge-api.js';

test('createPage POSTs title and body to /api/knowledge/pages and returns the saved page', async () => {
  const request = { title: 'Belonging notes', body: 'Belonging notes\nSome detail.' };
  const saved = { id: 'p1', ...request };
  const api = createKnowledgeApi(async (url, init) => {
    assert.equal(url, '/api/knowledge/pages');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), request);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: saved })
    };
  });
  assert.deepEqual(await api.createPage(request), saved);
});

test('createPage surfaces a missing-title validation error', async () => {
  const api = createKnowledgeApi(async () => ({
    ok: false,
    status: 400,
    json: async () => ({ ok: false, error: { code: 'validation_error' } })
  }));
  await assert.rejects(
    () => api.createPage({ title: '', body: '' }),
    error => error.status === 400 && error.code === 'validation_error'
  );
});

test('tidyPage POSTs the page id with apply:true and returns the applied page', async () => {
  const applied = { id: 'p1', tags: ['belonging', 'year-10'] };
  const api = createKnowledgeApi(async (url, init) => {
    assert.equal(url, '/api/knowledge/tidy');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { id: 'p1', apply: true });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: applied })
    };
  });
  assert.deepEqual(await api.tidyPage('p1'), applied);
});

test('tidyPage surfaces a failure without throwing on the caller unexpectedly', async () => {
  const api = createKnowledgeApi(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ ok: false, error: { code: 'knowledge_anthropic_unbound' } })
  }));
  await assert.rejects(
    () => api.tidyPage('p1'),
    error => error.status === 503 && error.code === 'knowledge_anthropic_unbound'
  );
});
