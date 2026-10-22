import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeGetObject } from '../../netlify/functions/_shared/knowledge-r2.mjs';

test('getObject uses an injected reader with the bucket config', async () => {
  const env = { R2_ACCOUNT_ID: 'a', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' };
  const bytes = await knowledgeGetObject(env, {
    key: 'travel/journal/t/a.jpg',
    getObject: async ({ bucket, key }) => Buffer.from(`${bucket}:${key}`),
  });
  assert.equal(String(bytes), 'b:travel/journal/t/a.jpg');
  await assert.rejects(() => knowledgeGetObject({}, { key: 'x' }), (e) => e.status === 503);
});
