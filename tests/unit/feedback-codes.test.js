import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FEEDBACK_CODES,
  FeedbackCodesError,
  cleanFeedbackCodes,
  readFeedbackCodes,
  writeFeedbackCodes
} from '../../netlify/functions/_shared/feedback-codes.mjs';
import { createFeedbackCodesHandler } from '../../netlify/functions/feedback-codes.mjs';
import { memoryStore, operatorEnv, operatorNow, operatorRequest } from './voice-test-helpers.mjs';

test('seed codes are unique, and speaking codes carry unique number keys', () => {
  const letters = DEFAULT_FEEDBACK_CODES.map((c) => c.code);
  assert.equal(new Set(letters).size, letters.length);
  const keys = DEFAULT_FEEDBACK_CODES.filter((c) => c.key).map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(cleanFeedbackCodes({ codes: DEFAULT_FEEDBACK_CODES }), DEFAULT_FEEDBACK_CODES);
});

test('the library refuses duplicate letters and bad codes', () => {
  assert.throws(() => cleanFeedbackCodes({ codes: [{ code: 'AR', label: 'A' }, { code: 'ar', label: 'B' }] }), FeedbackCodesError);
  assert.throws(() => cleanFeedbackCodes({ codes: [{ code: 'A1', label: 'A' }] }), FeedbackCodesError);
  assert.throws(() => cleanFeedbackCodes({ codes: [{ code: 'AR', label: '' }] }), FeedbackCodesError);
  assert.throws(() => cleanFeedbackCodes({ codes: [] }), FeedbackCodesError);
});

test('speaking codes drop criteria; keys stay unique; ids stay stable', () => {
  const codes = cleanFeedbackCodes({
    codes: [
      { id: 'speak_fw', code: 'fw', label: 'Filler', group: 'speaking', criterion: 2, key: '1' },
      { code: 'PF', label: 'Fast', group: 'speaking', key: '1' },
      { code: 'E', label: 'Evidence', group: 'composition', criterion: 2, key: '3' }
    ]
  });
  assert.equal(codes[0].id, 'speak_fw');
  assert.equal(codes[0].code, 'FW');
  assert.equal(codes[0].criterion, null);
  assert.equal(codes[0].key, '1');
  assert.equal(codes[1].key, undefined);
  assert.equal(codes[1].id, 'code_pf');
  assert.equal(codes[2].key, undefined);
  assert.equal(codes[2].criterion, 2);
});

test('reads the seed until the teacher saves, then the saved library', async () => {
  const store = memoryStore();
  assert.equal((await readFeedbackCodes(store)).length, DEFAULT_FEEDBACK_CODES.length);
  await writeFeedbackCodes(store, { codes: [{ code: 'TS', label: 'Topic sentence', criterion: 1 }] });
  const saved = await readFeedbackCodes(store);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].code, 'TS');
});

test('the route is behind the teacher session and saves the library', async () => {
  const store = memoryStore();
  const handler = createFeedbackCodesHandler({ env: operatorEnv, now: operatorNow, getContentStore: async () => store });
  assert.equal((await handler(operatorRequest('/api/feedback-codes', 'GET', undefined, { cookie: false }))).status, 401);
  const got = await (await handler(operatorRequest('/api/feedback-codes'))).json();
  assert.equal(got.data.codes.length, DEFAULT_FEEDBACK_CODES.length);
  assert.equal((await handler(operatorRequest('/api/feedback-codes', 'PUT', { codes: [] }))).status, 400);
  const saved = await (await handler(operatorRequest('/api/feedback-codes', 'PUT', { codes: [{ code: 'fw', label: 'Filler', group: 'speaking', key: '1' }] }))).json();
  assert.equal(saved.data.codes[0].code, 'FW');
  assert.equal((await readFeedbackCodes(store))[0].key, '1');
});

test('a code can carry a See how resource', () => {
  const [code] = cleanFeedbackCodes({ codes: [{ code: 'TS', label: 'Topic sentence', resource: { kind: 'video', url: 'https://example.com/v', title: 'Topic sentences', start: 12 } }] });
  assert.deepEqual(code.resource, { kind: 'video', url: 'https://example.com/v', title: 'Topic sentences', start: 12 });
  const [plain] = cleanFeedbackCodes({ codes: [{ code: 'TS', label: 'Topic sentence', resource: { kind: 'link', url: 'javascript:alert(1)' } }] });
  assert.equal(plain.resource, undefined);
});
