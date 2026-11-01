import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseTechniqueResult,
  quoteAppearsIn,
  requestTechniqueScan
} from '../../netlify/functions/_shared/technique-scan.mjs';
import {
  TextToolError,
  readTextToolJob,
  runTextToolJob,
  startTextToolJob,
  textToolInputError,
  textToolKey
} from '../../netlify/functions/_shared/text-tools.mjs';
import { createTextToolsHandler } from '../../netlify/functions/teaching-text-tools.mjs';
import { createTextToolsRunHandler } from '../../netlify/functions/teaching-text-tools-run.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const PASSAGE = 'The morning was clear and sunny, with the fresh warmth of a full-summer day.\nThe children gathered first, of course.';

const REPLY = JSON.stringify([
  {
    quote: 'clear and sunny',
    techniques: [
      { technique: 'Visual Imagery', confidence: 82, explanation: 'Plain sight detail.' },
      { technique: 'Foreshadowing', confidence: 35, explanation: 'Too bright, if you know the ending.' },
      { technique: 'Simile', confidence: 10, explanation: 'Below the floor.' }
    ]
  },
  { quote: 'not in the passage at all', techniques: [{ technique: 'Irony', confidence: 90, explanation: 'x' }] },
  { quote: 'of course', techniques: [{ technique: 'Understatement', confidence: 55, explanation: 'Casual tone.' }] }
]);

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    }
  };
}

const env = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' };

function deps(store, extra = {}) {
  return { getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env, ...extra };
}

function req(method, path, body) {
  return new Request(`https://api.adam-russell.com${path}`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'life_hub_session=ok' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('parseTechniqueResult keeps quotes in the passage and hits above the floor', () => {
  const { findings } = parseTechniqueResult(REPLY, PASSAGE);
  assert.deepEqual(findings.map((f) => f.quote), ['clear and sunny', 'of course']);
  assert.deepEqual(findings[0].techniques.map((t) => [t.technique, t.confidence]), [['Visual Imagery', 82], ['Foreshadowing', 35]]);
});

test('parseTechniqueResult reads fenced, wrapped and flat replies the widget accepts', () => {
  const fenced = '```json\n' + REPLY + '\n```';
  assert.equal(parseTechniqueResult(fenced, PASSAGE).findings.length, 2);
  const wrapped = JSON.stringify({ findings: JSON.parse(REPLY) });
  assert.equal(parseTechniqueResult(wrapped, PASSAGE).findings.length, 2);
  const flat = JSON.stringify([
    { quote: 'of course', technique: 'Understatement', confidence: 60, explanation: 'a' },
    { quote: 'of course', technique: 'Irony', explanation: 'no confidence given, widget assumes 70' }
  ]);
  assert.deepEqual(parseTechniqueResult(flat, PASSAGE).findings[0].techniques.map((t) => t.technique), ['Irony', 'Understatement']);
  assert.throws(() => parseTechniqueResult('Sorry, I cannot help.', PASSAGE), TextToolError);
});

test('quoteAppearsIn ignores case, spacing and curly quotes', () => {
  assert.equal(quoteAppearsIn('He said ‘no’  twice.', "said 'NO' twice"), true);
  assert.equal(quoteAppearsIn(PASSAGE, 'winter'), false);
});

const scanEnv = { OPENAI_API_KEY: 'test-only-placeholder' };
const configurationMessage = 'The technique scan is not configured (OPENAI_API_KEY).';

function mockOpenAI(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    assert.ok(calls.length <= replies.length, 'unexpected extra model call');
    const reply = replies[calls.length - 1];
    if (reply instanceof Error) throw reply;
    if (reply instanceof Response) return reply;
    return Response.json({ choices: [{ message: { content: reply } }] });
  });
  return calls;
}

test('scan calls OpenAI on the server with the widget prompt, chosen model and signal', async (t) => {
  const calls = mockOpenAI(t, [REPLY]);
  const signal = new AbortController().signal;
  assert.equal(await requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'chosen-model', signal }), REPLY);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.authorization, `Bearer ${scanEnv.OPENAI_API_KEY}`);
  assert.equal(call.body.model, 'chosen-model');
  assert.equal(call.body.max_tokens, 1400);
  assert.equal(call.signal, signal);
  const prompt = call.body.messages.map((message) => message.content).join('\n');
  assert.ok(prompt.includes(PASSAGE));
  for (const phrase of ['MULTIPLE techniques', 'confidence 0-100', 'zero techniques', '"like" is NOT a simile']) {
    assert.ok(prompt.includes(phrase), phrase);
  }
  const table = JSON.parse(readFileSync(new URL('../../apps/teaching/src/data/literary-elements.json', import.meta.url)));
  assert.equal(table.techniques.length, 314);
  for (const { name } of table.techniques) assert.ok(prompt.includes(name), name);
});

test('generated server names stay in step with the teaching table', async () => {
  const { LITERARY_TECHNIQUE_NAMES } = await import('../../netlify/functions/_shared/literary-technique-names.mjs');
  const table = JSON.parse(readFileSync(new URL('../../apps/teaching/src/data/literary-elements.json', import.meta.url)));
  assert.deepEqual(LITERARY_TECHNIQUE_NAMES, table.techniques.map(({ name }) => name));
});

test('an empty readable scan retries once and returns the successful raw reply', async (t) => {
  const calls = mockOpenAI(t, ['[]', REPLY]);
  assert.equal(await requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'gpt-4o' }), REPLY);
  assert.equal(calls.length, 2);
});

test('two empty scans return the raw empty result without a third call', async (t) => {
  const calls = mockOpenAI(t, ['[]', '{"findings":[]}']);
  const raw = await requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'gpt-4o' });
  assert.equal(raw, '{"findings":[]}');
  assert.deepEqual(parseTechniqueResult(raw, PASSAGE), { findings: [] });
  assert.equal(calls.length, 2);
});

test('scans with only discarded quotes or low confidence retry', async (t) => {
  const discarded = JSON.stringify([
    { quote: 'not in this passage', techniques: [{ technique: 'Simile', confidence: 90 }] },
    { quote: 'of course', techniques: [{ technique: 'Irony', confidence: 10 }] }
  ]);
  const calls = mockOpenAI(t, [discarded, REPLY]);
  assert.equal(await requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'gpt-4o' }), REPLY);
  assert.equal(calls.length, 2);
});

test('a reply containing only unknown table names retries like the widget', async (t) => {
  const unknown = JSON.stringify([{ quote: 'of course', techniques: [{ technique: 'Invented Device', confidence: 90 }] }]);
  const calls = mockOpenAI(t, [unknown, REPLY]);
  assert.equal(await requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'gpt-4o' }), REPLY);
  assert.equal(calls.length, 2);
});

test('an unreadable reply is returned raw for the parser without an empty-result retry', async (t) => {
  const calls = mockOpenAI(t, ['not JSON']);
  const raw = await requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'gpt-4o' });
  assert.equal(raw, 'not JSON');
  assert.throws(() => parseTechniqueResult(raw, PASSAGE), TextToolError);
  assert.equal(calls.length, 1);
});

test('a missing or blank key gives a plain configuration error without fetching', async (t) => {
  const calls = mockOpenAI(t, []);
  for (const env of [{}, { OPENAI_API_KEY: '  ' }]) {
    await assert.rejects(requestTechniqueScan({ env, text: PASSAGE }), { name: 'TextToolError', message: configurationMessage });
  }
  assert.equal(calls.length, 0);
});

test('upstream HTTP and network errors give a plain message without leaking the response', async (t) => {
  const calls = mockOpenAI(t, [new Response('private upstream details', { status: 429 }), new Error('private network details')]);
  for (let i = 0; i < 2; i++) {
    await assert.rejects(requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'gpt-4o' }), {
      name: 'TextToolError', message: 'The AI service did not answer. Try again in a minute.'
    });
  }
  assert.equal(calls.length, 2);
});

test('an upstream response without text is rejected', async (t) => {
  mockOpenAI(t, [Response.json({ choices: [] })]);
  await assert.rejects(requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'gpt-4o' }), TextToolError);
});

test('cancellation reaches fetch and is not retried', async (t) => {
  const controller = new AbortController();
  controller.abort();
  const abort = controller.signal.reason;
  const calls = mockOpenAI(t, [abort]);
  await assert.rejects(requestTechniqueScan({ env: scanEnv, text: PASSAGE, model: 'gpt-4o', signal: controller.signal }), (error) => error === abort);
  assert.equal(calls.length, 1);
});

test('scanning the same text twice reuses the completed job and one model call', async (t) => {
  const calls = mockOpenAI(t, [REPLY]);
  const store = memoryStore();
  const first = await startTextToolJob({ store, env: scanEnv, tool: 'techniques', text: PASSAGE });
  assert.equal(first.kick, true);
  await runTextToolJob({ store, env: scanEnv, key: first.key });
  const second = await startTextToolJob({ store, env: scanEnv, tool: 'techniques', text: PASSAGE });
  assert.equal(second.kick, false);
  assert.equal(second.job.status, 'done');
  await runTextToolJob({ store, env: scanEnv, key: second.key });
  assert.equal(calls.length, 1);
});

test('techniques jobs: own model setting, own length limit, no Anthropic key needed', async () => {
  assert.notEqual(textToolKey('techniques', PASSAGE, env), textToolKey('techniques', PASSAGE, { TEXT_TOOLS_TECHNIQUES_MODEL: 'other' }));
  assert.equal(textToolInputError('techniques', PASSAGE), null);
  assert.match(textToolInputError('techniques', 'x'.repeat(6_001)), /too long for a technique scan/);

  const store = memoryStore();
  const { key } = await startTextToolJob({ store, env, tool: 'techniques', text: PASSAGE });
  const calls = [];
  const done = await runTextToolJob({
    store,
    env,
    key,
    requestTechniqueScan: async (args) => {
      calls.push(args);
      return REPLY;
    }
  });
  assert.equal(done.status, 'done');
  assert.equal(done.result.findings.length, 2);
  assert.equal(calls[0].text, PASSAGE);
  assert.equal(calls[0].model, 'gpt-4o');

  const other = await startTextToolJob({ store, env, tool: 'techniques', text: 'Another passage, of course.' });
  const failed = await runTextToolJob({ store, env, key: other.key });
  assert.equal(failed.status, 'error');
  assert.equal(failed.error, configurationMessage);
  assert.equal((await readTextToolJob(store, other.key)).status, 'error');
});

test('teacher technique scan runs through /api/text-tools end to end', async () => {
  const store = memoryStore();
  const kicked = [];
  const handler = createTextToolsHandler(deps(store, {
    kickTextToolRun: async (_request, path, key) => {
      kicked.push({ path, key });
      return true;
    }
  }));
  const html = '<p>The morning was clear and sunny, with the fresh warmth of a full-summer day.</p><p>The children gathered first, of course.</p>';
  const started = await handler(req('POST', '/api/text-tools', { tool: 'techniques', html }), {});
  assert.equal(started.status, 200);
  const view = (await started.json()).data;
  assert.equal(view.status, 'working');
  assert.equal(kicked.length, 1);

  const run = createTextToolsRunHandler(deps(store, { requestTechniqueScan: async () => REPLY }));
  assert.equal((await run(req('POST', '/api/text-tools-run', { key: view.key }), {})).status, 200);

  const polled = await handler(req('GET', `/api/text-tools/${view.key}`), { params: { key: view.key } });
  const result = (await polled.json()).data;
  assert.equal(result.status, 'done');
  assert.deepEqual(result.result.findings.map((f) => f.quote), ['clear and sunny', 'of course']);

  const unknown = await handler(req('POST', '/api/text-tools', { tool: 'spells', html }), {});
  assert.equal(unknown.status, 400);
  assert.match((await unknown.json()).error.message, /dictionary, fry, question_first or techniques/);
});

test('students only ever receive the approved techniques', () => {
  const blocks = [
    {
      id: 'b1',
      type: 'block',
      block_type: 'rich_text',
      visibility: 'student_teacher',
      content: { html: '<p>x</p>' },
      settings: {
        word_help: { words: [] },
        technique_scan: {
          scanned_at: '2026-10-17T09:00:00.000Z',
          approved_at: '2026-10-17T09:05:00.000Z',
          approved_ids: ['foreshadowing'],
          findings: [
            { quote: 'clear and sunny', techniques: [
              { id: 'visual-imagery', confidence: 82, explanation: 'unreviewed' },
              { id: 'foreshadowing', confidence: 35, explanation: 'model wording' }
            ] },
            { quote: 'of course', techniques: [{ id: 'understatement', confidence: 55, explanation: 'unreviewed' }] }
          ]
        }
      }
    },
    {
      id: 'b2',
      type: 'block',
      block_type: 'rich_text',
      visibility: 'student_teacher',
      content: { html: '<p>y</p>' },
      settings: { technique_scan: { scanned_at: 'x', approved_ids: [], findings: [{ quote: 'y', techniques: [{ id: 'irony', confidence: 90 }] }] } }
    }
  ];
  const [first, second] = filterBlocksForStudent(blocks);
  assert.deepEqual(first.settings.technique_scan.findings, [{ quote: 'clear and sunny', techniques: [{ id: 'foreshadowing', confidence: 35 }] }]);
  assert.deepEqual(first.settings.technique_scan.approved_ids, ['foreshadowing']);
  assert.ok(first.settings.word_help, 'other settings ride along');
  assert.equal(second.settings.technique_scan, undefined, 'nothing approved means nothing shipped');
  assert.ok(blocks[0].settings.technique_scan.findings[1], 'the teacher copy is untouched');
});
