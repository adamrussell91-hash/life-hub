import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteMatrix,
  isDictionaryWord,
  listMatrices,
  lookupMatrixWord,
  matrixWordKey,
  normaliseMatrixWord,
  parseMorphemicResult,
  saveMatrixResult,
  updateMatrix
} from '../../netlify/functions/_shared/morphemic-matrix.mjs';
import { textToolKey } from '../../netlify/functions/_shared/text-tools.mjs';
import { createMorphemicHandler } from '../../netlify/functions/teaching-morphemic.mjs';
import { createTextToolsRunHandler } from '../../netlify/functions/teaching-text-tools-run.mjs';
import { createPublishedMorphemicHandler } from '../../netlify/functions/published-morphemic.mjs';
import { createPublishedWordHelpRunHandler } from '../../netlify/functions/published-word-help-run.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const LESSON = 'lesson_ono_1';

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

const env = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y', ANTHROPIC_API_KEY: 'test-key' };

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

const w = (word, prefix_1, prefix_2, suffix, definition = `Meaning of ${word}.`) => ({ word, prefix_1, prefix_2, suffix, definition, example: `An example with ${word}.` });

const CRITIC_REPLY = JSON.stringify({
  head_word: 'critical',
  has_matrix: true,
  base: 'critic',
  source: 'Greek kritikos',
  meaning: 'able to judge',
  words: [
    w('critic', '', '', ''),
    w('critical', '', '', '-al'),
    w('criticise', '', '', '-ise'),
    w('uncritical', 'un-', '', '-al'),
    w('hypercritical', '', 'hyper-', '-al'),
    w('criticalise', '', '', '-alise'),
    w('critique', '', '', '-que'),
    w('criticism', '', '', '-ism', '')
  ]
});

test('normaliseMatrixWord keeps words and short phrases only', () => {
  assert.equal(normaliseMatrixWord('  Critical   Attitudes '), 'critical attitudes');
  assert.equal(normaliseMatrixWord('Ono’s'), "ono's");
  assert.equal(normaliseMatrixWord('<b>x</b>'), null);
  assert.equal(normaliseMatrixWord('a'), null);
});

test('the en-AU dictionary knows Australian spellings and rejects invented words', () => {
  assert.equal(isDictionaryWord('criticise'), true);
  assert.equal(isDictionaryWord('criticize'), false);
  assert.equal(isDictionaryWord('criticalise'), false);
});

test('parseMorphemicResult keeps only real words that spell from their morphemes', () => {
  const { head_word, matrix, dropped } = parseMorphemicResult(CRITIC_REPLY, 'critical attitudes');
  assert.equal(head_word, 'critical');
  assert.deepEqual(matrix.words.map((entry) => entry.word), ['critic', 'critical', 'criticise', 'uncritical', 'hypercritical']);
  assert.deepEqual(
    dropped.map((entry) => [entry.word, entry.reason]),
    [
      ['criticalise', 'not in the Australian English dictionary'],
      ['critique', 'does not spell from its morphemes'],
      ['criticism', 'no meaning given']
    ]
  );
  // No word stacks two prefixes, so un- and hyper- share one Prefix row.
  assert.deepEqual(matrix.fronts, []);
  assert.deepEqual(matrix.prefixes, [{ id: 'un', label: 'un-' }, { id: 'hyper', label: 'hyper-' }]);
  assert.deepEqual(matrix.endings.map((slot) => slot.label), ['-al', '-ise']);
  assert.deepEqual(matrix.words[3], { word: 'uncritical', front: '', prefix: 'un', ending: 'al', definition: 'Meaning of uncritical.', example: 'An example with uncritical.' });
});

test('too few real words, or has_matrix false, means no matrix', () => {
  assert.equal(parseMorphemicResult('{"head_word":"glow","has_matrix":false}', 'glow').matrix, null);
  const thin = JSON.stringify({ head_word: 'critic', has_matrix: true, base: 'critic', words: [w('critic', '', '', ''), w('criticalise', '', '', '-alise')] });
  assert.equal(parseMorphemicResult(thin, 'critic').matrix, null);
  assert.throws(() => parseMorphemicResult('not json', 'critic'), /could not be read/);
});

test('saving points every word and the phrase at one matrix, and a second build of the base merges', async () => {
  const store = memoryStore();
  const first = await saveMatrixResult(store, 'critical attitudes', parseMorphemicResult(CRITIC_REPLY, 'critical attitudes'));
  assert.equal(first.status, 'new');
  for (const word of ['critical attitudes', 'critical', 'criticise', 'uncritical']) {
    assert.equal((await lookupMatrixWord(store, word)).matrix.id, 'critic');
  }
  assert.equal(await lookupMatrixWord(store, 'never-seen'), undefined);

  await updateMatrix(store, 'critic', { status: 'checked' });
  const more = JSON.stringify({ head_word: 'criticism', has_matrix: true, base: 'critic', words: [w('critic', '', '', ''), w('critics', '', '', '-s'), w('criticism', '', '', '-ism')] });
  const merged = await saveMatrixResult(store, 'criticism', parseMorphemicResult(more, 'criticism'));
  assert.deepEqual(merged.words.map((entry) => entry.word), ['critic', 'critical', 'criticise', 'uncritical', 'hypercritical', 'critics', 'criticism']);
  assert.equal(merged.status, 'new', 'new words send it back for review');

  await saveMatrixResult(store, 'glow', { head_word: 'glow', matrix: null, dropped: [] });
  assert.deepEqual(await lookupMatrixWord(store, 'glow'), { matrix: null });
});

test('teacher edits reword or remove words, never add them; delete clears the pointers', async () => {
  const store = memoryStore();
  await saveMatrixResult(store, 'critical', parseMorphemicResult(CRITIC_REPLY, 'critical'));
  const matrix = await updateMatrix(store, 'critic', {
    status: 'checked',
    words: [
      { word: 'critic' },
      { word: 'critical', definition: 'Judging something carefully.' },
      { word: 'criticise' },
      { word: 'made-up', definition: 'Should never be added.' }
    ]
  });
  assert.deepEqual(matrix.words.map((entry) => entry.word), ['critic', 'critical', 'criticise']);
  assert.equal(matrix.words[1].definition, 'Judging something carefully.');
  assert.deepEqual(matrix.prefixes, [], 'un- and hyper- went with their words');
  assert.equal(matrix.status, 'checked');
  assert.deepEqual(await lookupMatrixWord(store, 'uncritical'), { matrix: null });
  assert.equal((await listMatrices(store)).length, 1);

  assert.equal(await deleteMatrix(store, 'critic'), true);
  assert.equal(await lookupMatrixWord(store, 'critical'), undefined);
  assert.equal(store.map.has(matrixWordKey('criticise')), false);
});

test('teacher route: build once, poll to done, then answer from the library with no job', async () => {
  const store = memoryStore();
  const kicked = [];
  const handler = createMorphemicHandler(deps(store, { kickTextToolRun: async (_r, path, key) => kicked.push({ path, key }) }));
  const started = (await (await handler(req('POST', '/api/morphemic', { word: 'Critical attitudes' }), {})).json()).data;
  assert.equal(started.status, 'working');
  assert.deepEqual(kicked, [{ path: '/api/text-tools-run', key: textToolKey('morphemic', 'critical attitudes', env) }]);

  let request;
  const run = createTextToolsRunHandler(deps(store, { completeMessage: async (args) => ((request = args), CRITIC_REPLY) }));
  await run(req('POST', '/api/text-tools-run', { key: started.key }), {});
  assert.equal(request.model, 'claude-sonnet-5-5');
  assert.deepEqual(request.thinking, { type: 'adaptive' });

  const polled = (await (await handler(req('GET', `/api/morphemic/job/${started.key}`), {})).json()).data;
  assert.equal(polled.result.matrix.id, 'critic');

  const again = (await (await handler(req('POST', '/api/morphemic', { word: 'uncritical' }), {})).json()).data;
  assert.equal(again.status, 'done');
  assert.equal(again.result.matrix.id, 'critic');
  assert.equal(kicked.length, 1, 'a word in a built matrix costs nothing');

  const list = (await (await handler(req('GET', '/api/morphemic/matrices'), {})).json()).data;
  assert.equal(list.matrices[0].status, 'new');

  // Rebuild: delete, then the same word builds again even though its old job finished.
  await handler(req('DELETE', '/api/morphemic/matrices/critic'), {});
  const rebuilt = (await (await handler(req('POST', '/api/morphemic', { word: 'critical attitudes' }), {})).json()).data;
  assert.equal(rebuilt.status, 'working');
  assert.equal(kicked.length, 2);
});

test('student route only builds words that are in the published block', async () => {
  const store = memoryStore({
    [`published/lessons/${LESSON}`]: {
      blocks: [
        {
          id: 'b_text',
          block_type: 'rich_text',
          content: { html: '<p>Ono’s critical attitudes emerge slowly.</p>' },
          settings: { word_help: { words: [{ word: 'Anomaly', definition: 'Something unusual.', added: true }] } }
        }
      ]
    }
  });
  const kicked = [];
  const handler = createPublishedMorphemicHandler(deps(store, { kickTextToolRun: async (_r, path, key) => kicked.push({ path, key }) }));
  const post = (word) => handler(req('POST', `/api/published/morphemic/${LESSON}`, { block_id: 'b_text', word }), { params: { id: LESSON } });

  const view = (await (await post('critical attitudes')).json()).data;
  assert.equal(view.status, 'working');
  assert.equal(kicked[0].path, '/api/published/word-help-run');
  assert.equal((await post('photosynthesis')).status, 404);
  assert.equal((await post('anomaly')).status, 200, 'a teacher-added word may be built');

  const run = createPublishedWordHelpRunHandler(deps(store, { completeMessage: async () => CRITIC_REPLY }));
  await run(req('POST', '/api/published/word-help-run', { key: view.key }), {});
  const polled = (await (await handler(req('GET', `/api/published/morphemic/${LESSON}/${view.key}`), { params: { id: LESSON, key: view.key } })).json()).data;
  assert.equal(polled.result.matrix.base, 'critic');
});
