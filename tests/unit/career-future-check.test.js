import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFutureWithAnn, parseFutureCheck } from '../../netlify/functions/_shared/career-future-check.mjs';
import { createCareerRepository } from '../../netlify/functions/_shared/career-repository.mjs';

const A = 'fcrit_00000000-0000-4000-8000-00000000000a';
const B = 'fcrit_00000000-0000-4000-8000-00000000000b';
const future = {
  title: 'Head of Programs',
  criteria: [
    { id: A, text: 'Leads teams', order: 0, source: 'ad' },
    { id: B, text: 'Holds a licence', order: 1, source: 'ad' }
  ]
};

test('parse keeps known lines, and an odd status becomes unknown', () => {
  const out = parseFutureCheck(
    JSON.stringify({
      suggestions: [
        { criterion_id: A, status: 'have', evidence: 'Led a faculty.' },
        { criterion_id: A, status: 'partly', evidence: 'A repeat.' },
        { criterion_id: B, status: 'probably', evidence: '' },
        { criterion_id: 'fcrit_made_up', status: 'have', evidence: 'Invented.' }
      ]
    }),
    future.criteria
  );
  assert.deepEqual(out, [
    { criterion_id: A, status: 'have', evidence: 'Led a faculty.' },
    { criterion_id: B, status: 'unknown', evidence: '' }
  ]);
  assert.equal(parseFutureCheck('not json', future.criteria), null);
});

test('with no key Ann refuses, and never guesses', async () => {
  await assert.rejects(checkFutureWithAnn({ future, apiKey: '' }), { code: 'ann_unavailable' });
});

test('Ann reads the record, the prompt asks for evidence, and a missing Central Node is reported', async () => {
  let prompt = '';
  const fetchImpl = async (url, init) => {
    if (String(url).includes('api.anthropic.com')) {
      prompt = JSON.parse(init.body).messages[0].content;
      return Response.json({
        content: [{ text: JSON.stringify({ suggestions: [{ criterion_id: A, status: 'have', evidence: 'Led a faculty.' }] }) }],
        usage: { input_tokens: 10, output_tokens: 5 }
      });
    }
    return new Response('', { status: 404 });
  };
  const result = await checkFutureWithAnn({
    future,
    cards: [{ title: 'Ran the example program', skills: ['Coaching'], star: { result: 'It grew.' } }],
    roles: [{ role: 'Example Teacher', label: 'Example School', valid_from: '2020-01-01', valid_to: null }],
    env: { PROFESSIONAL_DATA_TOKEN: 'test' },
    apiKey: 'test',
    fetchImpl
  });
  assert.equal(result.read_central_node, false);
  assert.equal(result.suggestions.length, 1);
  for (const part of ['Ran the example program', 'Example Teacher', A, 'unknown']) assert.ok(prompt.includes(part), part);
});

function memoryRepo() {
  const data = new Map();
  const store = {
    get: async (key) => data.get(key) ?? null,
    setJSON: async (key, value) => void data.set(key, value),
    list: async () => ({ blobs: [...data.keys()].map((key) => ({ key })), directories: [] })
  };
  return createCareerRepository({ store, now: () => '2026-11-05T00:00:00.000Z' });
}

test('answers survive editing the text, clear on null, and bad ones are refused quietly', async () => {
  const repo = memoryRepo();
  const created = await repo.createFuture({ title: 'Lead', status: 'active', criteria: [{ text: 'Leads teams', order: 0, source: 'ad' }] });
  const id = created.criteria[0].id;

  let saved = await repo.updateFuture(created.id, {
    criteria: [{ id, text: 'Leads teams', order: 0, source: 'ad', met: { status: 'have', evidence: 'Led a faculty.', extra: 1 } }]
  });
  assert.deepEqual(saved.criteria[0].met, { status: 'have', evidence: 'Led a faculty.' });

  saved = await repo.updateFuture(created.id, { criteria: [{ id, text: 'Leads large teams', order: 0, source: 'ad' }] });
  assert.equal(saved.criteria[0].text, 'Leads large teams');
  assert.equal(saved.criteria[0].met.status, 'have');
  assert.deepEqual((await repo.listFutures())[0].criteria[0].met.status, 'have');

  saved = await repo.updateFuture(created.id, { criteria: [{ id, text: 'Leads large teams', order: 0, source: 'ad', met: null }] });
  assert.equal('met' in saved.criteria[0], false);

  saved = await repo.updateFuture(created.id, { criteria: [{ id, text: 'Leads large teams', order: 0, source: 'ad', met: { status: 'maybe' } }] });
  assert.equal('met' in saved.criteria[0], false);
});
