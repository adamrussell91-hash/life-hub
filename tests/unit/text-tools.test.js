import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanFryHtml,
  parseDictionaryResult,
  parseFryResult,
  richTextToPlain,
  runTextToolJob,
  startTextToolJob,
  textToolInputError,
  textToolKey,
  wordAppearsIn
} from '../../netlify/functions/_shared/text-tools.mjs';
import { buildFryExplainerSystem } from '../../netlify/functions/_shared/fry-explainer-prompt.mjs';
import { createTextToolsHandler } from '../../netlify/functions/teaching-text-tools.mjs';
import { createTextToolsRunHandler } from '../../netlify/functions/teaching-text-tools-run.mjs';
import { createPublishedWordHelpHandler } from '../../netlify/functions/published-word-help.mjs';
import { createPublishedWordHelpRunHandler } from '../../netlify/functions/published-word-help-run.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const LESSON = 'lesson_voice_1';
const PROSE = '<p>The <strong>juxtaposition</strong> of light and dark is ubiquitous in the poem.</p><p>It feels ephemeral, a fleeting zeitgeist.</p>';
const LONG_PROSE = `<p>${'Writers choose whether the doer of an action comes first or disappears entirely from the sentence. '.repeat(4)}</p>`;

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

const env = {
  SITE_ORIGIN: ORIGIN,
  SESSION_SECRET: 'x'.repeat(32),
  LIFE_HUB_PASSPHRASE_HASH: 'y',
  ANTHROPIC_API_KEY: 'test-key'
};

function deps(store, extra = {}) {
  return {
    getContentStore: async () => store,
    verifySessionToken: () => ({ valid: true }),
    env,
    ...extra
  };
}

function req(method, path, body) {
  return new Request(`https://api.adam-russell.com${path}`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'life_hub_session=ok' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

const DICTIONARY_REPLY = JSON.stringify({
  words: [
    { word: 'juxtaposition', kind: 'technical', part_of_speech: 'noun', pronunciation: 'juk-stuh-puh-ZISH-un', definition: 'Placing two things side by side to show a contrast.', etymology: 'From Latin juxta, near, and French position.', example: 'The film uses a juxtaposition of rich and poor.' },
    { word: 'Ubiquitous', kind: 'uncommon', part_of_speech: 'adjective', pronunciation: 'yoo-BIK-wit-us', definition: 'Found everywhere.', etymology: 'From Latin ubique, everywhere.', example: 'Phones are ubiquitous at school.' },
    { word: 'serendipity', kind: 'uncommon', definition: 'Not in the text, so it must be dropped.' },
    { word: 'juxtaposition', kind: 'technical', definition: 'A duplicate that must be dropped.' },
    { word: 'zeitgeist', kind: 'made-up', definition: 'The spirit of a time.' }
  ]
});

test('richTextToPlain keeps paragraphs and decodes entities', () => {
  assert.equal(
    richTextToPlain('<p>Fish &amp; chips</p><ul><li>one</li><li>two&nbsp;three</li></ul><script>x()</script>'),
    'Fish & chips\n- one\n- two three'
  );
});

test('wordAppearsIn matches whole words and phrases only', () => {
  assert.equal(wordAppearsIn('A fleeting zeitgeist.', 'Zeitgeist'), true);
  assert.equal(wordAppearsIn('Told in medias\nres here', 'in medias res'), true);
  assert.equal(wordAppearsIn('ubiquitously', 'ubiquitous'), false);
});

test('parseDictionaryResult keeps real, unique words and normalises kinds', () => {
  const text = richTextToPlain(PROSE);
  const { words } = parseDictionaryResult(`Here you go ${DICTIONARY_REPLY}`, text);
  assert.deepEqual(words.map(w => w.word), ['juxtaposition', 'Ubiquitous', 'zeitgeist']);
  assert.equal(words[2].kind, 'uncommon');
  assert.equal(words[0].etymology, 'From Latin juxta, near, and French position.');
  assert.throws(() => parseDictionaryResult('no json here', text), /could not be read/);
});

test('parseFryResult returns clean HTML or a decline reason', () => {
  const html = parseFryResult('<explainer>\n<p class="x">Just do it.</p>\n<h2>Title</h2><p onclick="y()">Which <b>sounds</b> stronger?</p>\n</explainer>');
  assert.deepEqual(html, { declined: false, html: '<p>Just do it.</p>Title<p>Which sounds stronger?</p>' });
  assert.deepEqual(parseFryResult('<declined>This is a procedure.</declined>'), { declined: true, reason: 'This is a procedure.' });
  assert.throws(() => parseFryResult('<explainer></explainer>'), /came back empty/);
  assert.equal(cleanFryHtml('<blockquote><p>A</p></blockquote><br/>'), '<blockquote><p>A</p></blockquote><br>');
});

test('the Fry framework is copied in full and never names its old home', () => {
  const system = buildFryExplainerSystem();
  for (const marker of ['Step 0', '### 8. Push past the obvious', '## Interleaving rule', '## Done criteria', '<declined>']) {
    assert.ok(system.includes(marker), marker);
  }
  assert.doesNotMatch(system, /notion/i);
});

test('textToolInputError refuses empty, oversized and too-short Fry input', () => {
  assert.match(textToolInputError('dictionary', ''), /no text/);
  assert.match(textToolInputError('dictionary', 'a'.repeat(12_001)), /too long/);
  assert.match(textToolInputError('fry', 'Too short.'), /not enough/);
  assert.equal(textToolInputError('fry', richTextToPlain(LONG_PROSE)), null);
});

test('startTextToolJob reuses a running or finished job instead of paying twice', async () => {
  const store = memoryStore();
  let now = Date.parse('2026-10-17T00:00:00Z');
  const first = await startTextToolJob({ store, env, tool: 'dictionary', text: 'hello', now: () => now });
  assert.equal(first.kick, true);
  const second = await startTextToolJob({ store, env, tool: 'dictionary', text: 'hello', now: () => now });
  assert.equal(second.kick, false);
  assert.equal(second.key, first.key);
  now += 4 * 60_000;
  const stale = await startTextToolJob({ store, env, tool: 'dictionary', text: 'hello', now: () => now });
  assert.equal(stale.kick, true, 'a job stuck working restarts');
  assert.equal(stale.job.attempts, 2);
  assert.notEqual(textToolKey('fry', 'hello', env), first.key);
});

test('runTextToolJob writes the result, and records a readable error on failure', async () => {
  const store = memoryStore();
  const text = richTextToPlain(PROSE);
  const { key } = await startTextToolJob({ store, env, tool: 'dictionary', text });
  const calls = [];
  const done = await runTextToolJob({
    store,
    env,
    key,
    completeMessage: async (args) => {
      calls.push(args);
      return DICTIONARY_REPLY;
    }
  });
  assert.equal(done.status, 'done');
  assert.equal(done.result.words.length, 3);
  assert.equal(calls[0].model, 'claude-haiku-4-5');
  assert.match(calls[0].messages[0].content, /juxtaposition/);
  // A second run is a no-op.
  await runTextToolJob({ store, env, key, completeMessage: async () => { throw new Error('should not run'); } });

  const fry = await startTextToolJob({ store, env, tool: 'fry', text: 'some text' });
  const failed = await runTextToolJob({ store, env, key: fry.key, completeMessage: async () => { throw new Error('boom'); } });
  assert.equal(failed.status, 'error');
  assert.match(failed.error, /did not answer/);

  const unconfigured = await startTextToolJob({ store, env, tool: 'fry', text: 'other text' });
  const noKey = await runTextToolJob({ store, env: {}, key: unconfigured.key });
  assert.match(noKey.error, /ANTHROPIC_API_KEY/);
});

test('teacher text tools: start, kick the background run, then poll to done', async () => {
  const store = memoryStore();
  const kicked = [];
  const handler = createTextToolsHandler(deps(store, {
    kickTextToolRun: async (_request, path, key) => {
      kicked.push({ path, key });
      return true;
    }
  }));
  const started = await handler(req('POST', '/api/text-tools', { tool: 'fry', html: LONG_PROSE }), {});
  assert.equal(started.status, 200);
  const view = (await started.json()).data;
  assert.equal(view.status, 'working');
  assert.equal(view.text, undefined, 'source text is never echoed back');
  assert.deepEqual(kicked, [{ path: '/api/text-tools-run', key: view.key }]);

  const run = createTextToolsRunHandler(deps(store, {
    completeMessage: async () => '<explainer><p>Just do it.</p><p>Which sounds stronger?</p></explainer>'
  }));
  assert.equal((await run(req('POST', '/api/text-tools-run', { key: view.key }), {})).status, 200);

  const polled = await handler(req('GET', `/api/text-tools/${view.key}`), { params: { key: view.key } });
  const result = (await polled.json()).data;
  assert.equal(result.status, 'done');
  assert.equal(result.result.html, '<p>Just do it.</p><p>Which sounds stronger?</p>');

  const bad = await handler(req('POST', '/api/text-tools', { tool: 'fry', html: '<p>Hi</p>' }), {});
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error.message, /not enough/);
});

test('teacher text tools refuse a request without a session', async () => {
  const handler = createTextToolsHandler({ ...deps(memoryStore()), verifySessionToken: () => ({ valid: false }) });
  const response = await handler(req('POST', '/api/text-tools', { tool: 'dictionary', html: PROSE }), {});
  assert.equal(response.status, 401);
});

test('student dictionary scan reads the published block, never the request text', async () => {
  const store = memoryStore({
    [`published/lessons/${LESSON}`]: {
      lesson_id: LESSON,
      blocks: [
        { id: 'b_text', block_type: 'rich_text', content: { html: PROSE }, settings: {} },
        { id: 'b_heading', block_type: 'heading', content: { text: 'Voice' }, settings: {} }
      ]
    }
  });
  const kicked = [];
  const handler = createPublishedWordHelpHandler(deps(store, {
    kickTextToolRun: async (_request, path, key) => {
      kicked.push({ path, key });
      return true;
    }
  }));
  const res = await handler(
    req('POST', `/api/published/word-help/${LESSON}`, { block_id: 'b_text', html: '<p>ignored</p>' }),
    { params: { id: LESSON } }
  );
  const view = (await res.json()).data;
  assert.equal(view.status, 'working');
  assert.equal(view.key, textToolKey('dictionary', richTextToPlain(PROSE), env));
  assert.deepEqual(kicked, [{ path: '/api/published/word-help-run', key: view.key }]);

  // A second student in the same class shares the job: no second kick.
  await handler(req('POST', `/api/published/word-help/${LESSON}`, { block_id: 'b_text' }), { params: { id: LESSON } });
  assert.equal(kicked.length, 1);

  const run = createPublishedWordHelpRunHandler(deps(store, { completeMessage: async () => DICTIONARY_REPLY }));
  await run(req('POST', '/api/published/word-help-run', { key: view.key }), {});

  const polled = await handler(
    req('GET', `/api/published/word-help/${LESSON}/${view.key}`),
    { params: { id: LESSON, key: view.key } }
  );
  assert.equal((await polled.json()).data.result.words[0].word, 'juxtaposition');

  const heading = await handler(req('POST', `/api/published/word-help/${LESSON}`, { block_id: 'b_heading' }), { params: { id: LESSON } });
  assert.equal(heading.status, 404);
  const missing = await handler(req('POST', '/api/published/word-help/nope', { block_id: 'b_text' }), { params: { id: 'nope' } });
  assert.equal(missing.status, 404);
});

test('the public run and poll never touch a teacher Fry job', async () => {
  const store = memoryStore();
  const fry = await startTextToolJob({ store, env, tool: 'fry', text: 'teacher only text' });
  const run = createPublishedWordHelpRunHandler(deps(store, {
    completeMessage: async () => { throw new Error('must not run'); }
  }));
  assert.equal((await run(req('POST', '/api/published/word-help-run', { key: fry.key }), {})).status, 404);
  const poll = createPublishedWordHelpHandler(deps(store));
  const res = await poll(
    req('GET', `/api/published/word-help/${LESSON}/${fry.key}`),
    { params: { id: LESSON, key: fry.key } }
  );
  assert.equal(res.status, 404);
});
