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

test('send omits history and priorAgentSlug entirely when there is nothing to carry forward', async () => {
  let sentBody;
  const chatApi = createChatApi(async (url, init) => {
    sentBody = JSON.parse(init.body);
    return sseResponse(['data: {"type":"done"}\n\n']);
  });
  for await (const event of chatApi.send('hello')) void event;
  assert.deepEqual(sentBody, { message: 'hello' });
});

test('send forwards a non-empty history and priorAgentSlug alongside the message', async () => {
  let sentBody;
  const chatApi = createChatApi(async (url, init) => {
    sentBody = JSON.parse(init.body);
    return sseResponse(['data: {"type":"done"}\n\n']);
  });
  const history = [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }];
  for await (const event of chatApi.send('hello', { history, priorAgentSlug: 'brisket' })) void event;
  assert.deepEqual(sentBody, { message: 'hello', history, priorAgentSlug: 'brisket' });
});

test('send includes protocolId in the JSON body when provided', async () => {
  let sentBody;
  const chatApi = createChatApi(async (url, init) => {
    sentBody = JSON.parse(init.body);
    return sseResponse(['data: {"type":"done"}\n\n']);
  });
  for await (const event of chatApi.send('hello', { protocolId: 'flare-up' })) void event;
  assert.deepEqual(sentBody, { message: 'hello', protocolId: 'flare-up' });
});

test('send includes auditSession in the JSON body when provided', async () => {
  let sentBody;
  const chatApi = createChatApi(async (url, init) => {
    sentBody = JSON.parse(init.body);
    return sseResponse(['data: {"type":"done"}\n\n']);
  });
  const auditSession = { kind: 'cn_audit', phase: 'triage', intakeCount: 0 };
  for await (const event of chatApi.send('hello', { auditSession })) void event;
  assert.deepEqual(sentBody, { message: 'hello', auditSession });
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

test('confirm passes kind through when provided', async () => {
  let sentBody;
  const chatApi = createChatApi(async (url, init) => {
    sentBody = JSON.parse(init.body);
    return Response.json({ ok: true, data: { path: 'central-node.md', summary: 'Remove taper' } });
  });
  const patch = {
    section: 'constraints',
    op: 'delete_lines',
    payload: { match: 'Steroid taper', summary: 'Remove taper' }
  };
  const result = await chatApi.confirm({ kind: 'cn_patch', candidate: patch, slug: 'hammond' });
  assert.equal(sentBody.kind, 'cn_patch');
  assert.equal(sentBody.slug, 'hammond');
  assert.deepEqual(sentBody.candidate, patch);
  assert.equal(result.path, 'central-node.md');
});

test('confirm passes id through when provided, and can omit candidate entirely', async () => {
  let sentBody;
  const chatApi = createChatApi(async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return Response.json({ ok: true, data: { path: 'central-node.md', summary: 'Condense Trends' } });
  });
  await chatApi.confirm({ kind: 'cn_patch', id: 'cnp_abc123', slug: 'hammond' });
  assert.equal(sentBody.id, 'cnp_abc123');
  assert.equal('candidate' in sentBody, false);
});

test('confirm omits id from the body when not provided', async () => {
  let sentBody;
  const chatApi = createChatApi(async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return Response.json({ ok: true, data: { path: 'data/nutrition/x.md' } });
  });
  await chatApi.confirm({ candidate: { type: 'meal' }, slug: 'breakfast' });
  assert.equal('id' in sentBody, false);
});

test('confirm omits kind from the body when not provided', async () => {
  let sentBody;
  const chatApi = createChatApi(async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return Response.json({ ok: true, data: { path: 'data/nutrition/x.md' } });
  });
  await chatApi.confirm({ candidate: { type: 'meal' }, slug: 'breakfast' });
  assert.equal('kind' in sentBody, false);
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

test('send throws a structured error when an ok response has no body', async () => {
  const chatApi = createChatApi(async () => new Response(null, { status: 200 }));
  await assert.rejects(
    (async () => { for await (const event of chatApi.send('hi')) void event; })(),
    error => error.status === 200 && error.code === 'no_body'
  );
});

test('send silently skips a malformed SSE frame and keeps yielding valid ones', async () => {
  const frames = [
    'data: {"type":"agent","slug":"chadwick"}\n\n',
    'data: {not valid json\n\n',
    'data: {"type":"done"}\n\n'
  ];
  const chatApi = createChatApi(async () => sseResponse(frames));

  const events = [];
  for await (const event of chatApi.send('hello')) events.push(event);
  assert.deepEqual(events, [
    { type: 'agent', slug: 'chadwick' },
    { type: 'done' }
  ]);
});

test('confirm throws a structured error when the response body is not JSON', async () => {
  const chatApi = createChatApi(async () => new Response('<html>Bad Gateway</html>', {
    status: 502, headers: { 'content-type': 'text/html' }
  }));
  await assert.rejects(
    chatApi.confirm({ candidate: {}, slug: 'x' }),
    error => error.status === 502 && error.code === 'request_failed'
  );
});
