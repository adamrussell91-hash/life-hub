import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeGetObject, knowledgeHeadObject } from '../../netlify/functions/_shared/knowledge-r2.mjs';

test('getObject uses an injected reader with the bucket config', async () => {
  const env = { R2_ACCOUNT_ID: 'a', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' };
  const bytes = await knowledgeGetObject(env, {
    key: 'travel/journal/t/a.jpg',
    getObject: async ({ bucket, key }) => Buffer.from(`${bucket}:${key}`),
  });
  assert.equal(String(bytes), 'b:travel/journal/t/a.jpg');
  await assert.rejects(() => knowledgeGetObject({}, { key: 'x' }), (e) => e.status === 503);
});

test('headObject uses an injected reader with the bucket config', async () => {
  const env = { R2_ACCOUNT_ID: 'a', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' };
  const head = await knowledgeHeadObject(env, {
    key: 'food/photos/p.jpg',
    headObject: async ({ bucket, key }) => ({ size: `${bucket}:${key}`.length }),
  });
  assert.equal(head.size, 'b:food/photos/p.jpg'.length);
  await assert.rejects(() => knowledgeHeadObject({}, { key: 'x' }), (e) => e.status === 503);
});
