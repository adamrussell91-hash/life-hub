import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';
import { createAlchemyBlocksHandler } from '../../netlify/functions/alchemy-blocks.mjs';
import { createAlchemyJob } from '../../netlify/functions/_shared/alchemy-check.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };

test('unit-notes scans are polled here; block checks have moved to the agent', async () => {
  const store = memoryAlchemyStore();
  const handler = createAlchemyBlocksHandler({ env, getContentStore: async () => store, verifySessionToken: t => ({ valid: t === 'ok' }) });
  const id = await createAlchemyJob(store, { type: 'gather', unit: 'u1' });
  const get = await handler(new Request('https://api.example/api/alchemy-blocks?job=' + id, { headers: { cookie: 'life_hub_session=ok' } }));
  assert.equal(get.status, 200);
  assert.equal((await get.json()).data.status, 'working');
  const post = await handler(new Request('https://api.example/api/alchemy-blocks', { method: 'POST', headers: { cookie: 'life_hub_session=ok', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(post.status, 405);
});
