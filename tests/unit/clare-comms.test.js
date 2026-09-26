import test from 'node:test';
import assert from 'node:assert/strict';
import { CLARE_COMMS_MODEL, completeJson, extractJsonText } from '../../netlify/functions/_shared/clare-comms-model.mjs';

test('extractJsonText strips a stray fence', () => {
  assert.equal(extractJsonText('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJsonText(' {"a":1} '), '{"a":1}');
});

test('completeJson sends model, system and content, and parses the reply', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, JSON.parse(init.body), init.headers]);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"points":[]}' }] }), { status: 200 });
  };
  const out = await completeJson({ system: 'S', content: [{ type: 'text', text: 'U' }], apiKey: 'k', fetchImpl, maxTokens: 300 });
  assert.deepEqual(out, { points: [] });
  assert.equal(calls[0][0], 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0][1].model, CLARE_COMMS_MODEL);
  assert.equal(calls[0][1].max_tokens, 300);
  assert.deepEqual(calls[0][1].messages, [{ role: 'user', content: [{ type: 'text', text: 'U' }] }]);
  assert.equal(calls[0][2]['x-api-key'], 'k');
});

test('completeJson throws clare_failed on bad JSON or HTTP errors', async () => {
  const bad = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'not json' }] }), { status: 200 });
  await assert.rejects(() => completeJson({ system: 'S', content: [], apiKey: 'k', fetchImpl: bad }), { code: 'clare_failed' });
  const down = async () => new Response('{}', { status: 529 });
  await assert.rejects(() => completeJson({ system: 'S', content: [], apiKey: 'k', fetchImpl: down }), { code: 'clare_failed' });
});
