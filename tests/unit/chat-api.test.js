import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatApi } from '../../js/app/chat-api.js';

function sseResponse(frames) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of frames) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  return new Response(body, { status: 200 });
}

test('send yields each parsed SSE frame in order', async () => {
  const frames = [
    'data: {"type":"agent","slug":"chadwick"}\n\n',
    'data: {"type":"text","delta":"hi"}\n\n',
    'data: {"type":"done"}\n\n'
  ];
  const chatApi = createChatApi(async () => sseResponse(frames));

  const events = [];
  for await (const event of chatApi.send('hello')) events.push(event);
  assert.deepEqual(events, [
    { type: 'agent', slug: 'chadwick' },
    { type: 'text', delta: 'hi' },
    { type: 'done' }
  ]);
});

test('send throws a structured error for a non-OK response', async () => {
  const chatApi = createChatApi(async () => Response.json({ ok: false, error: { code: 'misconfigured' } }, { status: 503 }));
  await assert.rejects(
    (async () => { for await (const event of chatApi.send('hi')) void event; })(),
    error => error.status === 503 && error.code === 'misconfigured'
  );
});

test('confirm posts the candidate and returns the written path', async () => {
  const chatApi = createChatApi(async (url, init) => {
    assert.equal(url, '/api/chat/confirm');
    assert.equal(JSON.parse(init.body).slug, 'breakfast');
    return Response.json({ ok: true, data: { path: 'data/nutrition/x.md', sha: 'a', commitSha: 'b' } });
  });
  const result = await chatApi.confirm({ candidate: { type: 'meal' }, slug: 'breakfast' });
  assert.equal(result.path, 'data/nutrition/x.md');
});

test('confirm throws a structured error when the write fails', async () => {
  const chatApi = createChatApi(async () => Response.json({ ok: false, error: { code: 'write_conflict' } }, { status: 409 }));
  await assert.rejects(
    chatApi.confirm({ candidate: {}, slug: 'x' }),
    error => error.status === 409 && error.code === 'write_conflict'
  );
});

test('createChatApi requires a fetch implementation', () => {
  assert.throws(() => createChatApi(null), TypeError);
});
