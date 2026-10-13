import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublishedFeedbackHandler } from '../../netlify/functions/published-feedback.mjs';
import {
  createFeedbackDoc,
  createFeedbackLink,
  feedbackDocKey,
  feedbackTokenKey,
  hashFeedbackToken,
  revokeFeedbackLink
} from '../../netlify/functions/_shared/teaching-feedback.mjs';

function memoryStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    async get(key, options = {}) {
      if (!data.has(key)) return null;
      const value = data.get(key);
      if (options.type === 'arrayBuffer') return value;
      return value;
    },
    async getWithMetadata(key, options = {}) {
      const value = await this.get(key, options);
      if (value == null) return null;
      return { data: value, metadata: null };
    },
    async setJSON(key, value) {
      data.set(key, value);
    },
    async set(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
    async list({ prefix } = {}) {
      const blobs = [];
      for (const key of data.keys()) {
        if (!prefix || key.startsWith(prefix)) blobs.push({ key });
      }
      return { blobs };
    }
  };
}

function notFoundBody(json) {
  assert.equal(json.ok, false);
  assert.equal(json.error.code, 'not_found');
  assert.equal(json.error.message, 'This feedback link is not available.');
}

test('published feedback: wrong, expired, and revoked tokens share one 404', async () => {
  const store = memoryStore();
  const created = await createFeedbackDoc(store, { title: 'Essay notes', body_html: '<p>Tighten.</p>' });
  const linked = await createFeedbackLink(store, created.id, {
    randomToken: () => 'live-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    nowIso: () => '2026-10-13T00:00:00.000Z'
  });

  const expired = await createFeedbackDoc(store, { title: 'Expired', body_html: '<p>x</p>' });
  const expiredLink = await createFeedbackLink(store, expired.id, {
    randomToken: () => 'expired-token-bbbbbbbbbbbbbbbbbbbbbbbbbb',
    nowIso: () => '2026-10-01T00:00:00.000Z',
    expires_at: '2026-10-02T00:00:00.000Z'
  });

  const revoked = await createFeedbackDoc(store, { title: 'Revoked', body_html: '<p>y</p>' });
  const revokedLink = await createFeedbackLink(store, revoked.id, {
    randomToken: () => 'revoked-token-cccccccccccccccccccccccc',
    nowIso: () => '2026-10-13T00:00:00.000Z'
  });
  await revokeFeedbackLink(store, revoked.id, { nowIso: () => '2026-10-13T01:00:00.000Z' });

  const handler = createPublishedFeedbackHandler({
    getContentStore: async () => store,
    nowMs: Date.parse('2026-10-13T12:00:00.000Z')
  });

  const wrong = await handler(
    new Request('https://example.com/api/published/feedback/not-a-real-token')
  );
  const expiredRes = await handler(
    new Request(`https://example.com/api/published/feedback/${expiredLink.token}`)
  );
  const revokedRes = await handler(
    new Request(`https://example.com/api/published/feedback/${revokedLink.token}`)
  );

  assert.equal(wrong.status, 404);
  assert.equal(expiredRes.status, 404);
  assert.equal(revokedRes.status, 404);
  notFoundBody(await wrong.json());
  notFoundBody(await expiredRes.json());
  notFoundBody(await revokedRes.json());

  const ok = await handler(
    new Request(`https://example.com/api/published/feedback/${linked.token}`)
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, {
    title: 'Essay notes',
    body_html: '<p>Tighten.</p>',
    student_label: null
  });
  assert.equal(body.data.token_hash, undefined);
  assert.equal(body.data.audio_media_id, undefined);
  assert.equal(body.data.id, undefined);
});

test('lesson-publish and published-* never read feedback_docs / feedback_tokens prefixes', () => {
  const files = [
    'netlify/functions/lesson-publish.mjs',
    'netlify/functions/published-lesson.mjs',
    'netlify/functions/published-unit.mjs',
    'netlify/functions/published-class.mjs',
    'netlify/functions/_shared/teaching-student.mjs'
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /feedback_docs\//);
    assert.doesNotMatch(source, /feedback_tokens\//);
    assert.doesNotMatch(source, /FEEDBACK_DOC_PREFIX/);
    assert.doesNotMatch(source, /FEEDBACK_TOKEN_PREFIX/);
    assert.doesNotMatch(source, /teaching-feedback/);
  }
  // Sanity: the index keys exist for the feedback module itself.
  assert.equal(feedbackDocKey('x').startsWith('feedback_docs/'), true);
  assert.equal(feedbackTokenKey(hashFeedbackToken('t')).startsWith('feedback_tokens/'), true);
});
