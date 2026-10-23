import test from 'node:test';
import assert from 'node:assert/strict';
import { checkQuestion, markResponse, splitQuestion } from '../../netlify/functions/_shared/quiz-core.mjs';
import { answerEvidence, techTag } from '../../netlify/functions/_shared/quiz-evidence.mjs';

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const split = (q) => {
  const checked = checkQuestion(q);
  assert.equal(checked.ok, true, checked.message);
  return splitQuestion(checked.question, seeded());
};
const idOf = (question, text) => question.options.find((o) => o.text === text).id;
const run = ({ question, key }, response, extra = {}) => {
  const mark = markResponse(key, response);
  return answerEvidence({ question, key, response, awarded: mark.score, ...extra });
};

test('techTag uses the id, else the normalised name', () => {
  assert.equal(techTag('simile', 'Simile'), 'tech:simile');
  assert.equal(techTag(undefined, '  Personification. '), 'tech:~personification');
});

test('quote_technique: a wrong pick is named-as the picked technique', () => {
  const s = split({
    id: 'q1', kind: 'quote_technique', prompt: 'Which?', marks: 2, quote: 'The wind sang.', outcomes: ['EN5-RVL-01'], skills: ['reading.inference'],
    options: [{ id: 'a', text: 'Personification', technique_id: 'personification' }, { id: 'b', text: 'Metaphor', technique_id: 'metaphor' }],
    correct: ['a']
  });
  const [item] = run(s, { selected: [idOf(s.question, 'Metaphor')] });
  assert.equal(item.item, 'q1');
  assert.equal(item.share, 0);
  assert.deepEqual(item.tags.sort(), ['out:EN5-RVL-01', 'skill:reading.inference', 'tech:personification'].sort());
  assert.deepEqual(item.why, [{ type: 'named', as: 'tech:metaphor', target: 'tech:personification' }]);
  const [right] = run(s, { selected: [idOf(s.question, 'Personification')] });
  assert.equal(right.share, 1);
  assert.deepEqual(right.why, []);
});

test('options without technique ids fall back to name tags', () => {
  const s = split({ id: 'q2', kind: 'quote_technique', prompt: 'Which?', marks: 1, quote: 'Buzz.', options: [{ id: 'a', text: 'Onomatopoeia' }, { id: 'b', text: 'Simile' }], correct: ['a'] });
  const [item] = run(s, { selected: [idOf(s.question, 'Simile')] });
  assert.deepEqual(item.why, [{ type: 'named', as: 'tech:~simile', target: 'tech:~onomatopoeia' }]);
});

test('multiple choice: a wrong pick is an option why with its text', () => {
  const s = split({ id: 'q3', kind: 'multiple_choice', prompt: 'Which?', marks: 1, options: [{ id: 'a', text: 'Red' }, { id: 'b', text: 'Blue' }], correct: ['a'] });
  const blue = idOf(s.question, 'Blue');
  const [item] = run(s, { selected: [blue] }, { fallbackOutcomes: ['EN5-ECA-01'] });
  assert.deepEqual(item.tags, ['out:EN5-ECA-01']);
  assert.deepEqual(item.why, [{ type: 'option', id: blue, text: 'Blue' }]);
});

test('spot_technique: one item per target, found-but-misnamed is half, unfound is not_found', () => {
  const s = split({
    id: 'q4', kind: 'spot_technique', prompt: 'Find both.', marks: 2, passage: 'The sea roared like a lion. The moon was a coin.',
    options: [{ id: 'o1', text: 'Simile', technique_id: 'simile' }, { id: 'o2', text: 'Metaphor', technique_id: 'metaphor' }],
    targets: [{ id: 't1', quote: 'roared like a lion', correct: ['o1'] }, { id: 't2', quote: 'was a coin', correct: ['o2'] }]
  });
  // Words: The(0) sea(1) roared(2) like(3) a(4) lion.(5) The(6) moon(7) was(8) a(9) coin.(10)
  const items = run(s, { spots: [{ from: 2, to: 5, option: idOf(s.question, 'Metaphor') }] });
  assert.equal(items.length, 2);
  const [simile, metaphor] = items;
  assert.equal(simile.item, 'q4#0');
  assert.equal(simile.share, 0.5);
  assert.deepEqual(simile.why, [{ type: 'named', as: 'tech:metaphor', target: 'tech:simile' }]);
  assert.equal(metaphor.item, 'q4#1');
  assert.equal(metaphor.share, 0);
  assert.deepEqual(metaphor.why, [{ type: 'not_found', target: 'tech:metaphor' }]);
});

test('ordering and matching: misplaced items are placement whys', () => {
  const s = split({ id: 'q5', kind: 'ordering', prompt: 'Order them.', marks: 1, items: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }, { id: 'c', text: 'Third' }] });
  const ids = s.key.answer.ids;
  const [item] = run(s, { order: [ids[1], ids[0], ids[2]] });
  assert.deepEqual(item.why.map((w) => w.text).sort(), ['First', 'Second']);
});

test('matching: a wrong pairing is a placement why with the left-hand text', () => {
  const s = split({
    id: 'q7', kind: 'matching', prompt: 'Match.', marks: 2,
    pairs: [{ id: 'p1', left: 'Simile', right: 'Uses like or as' }, { id: 'p2', left: 'Metaphor', right: 'Says one thing is another' }]
  });
  const lefts = s.question.left;
  const rights = s.question.right;
  const leftId = lefts.find((l) => l.text === 'Simile').id;
  const otherLeft = lefts.find((l) => l.text === 'Metaphor').id;
  const map = s.key.answer.map;
  const wrong = rights.find((r) => r.id !== map[leftId]).id;
  const [item] = run(s, { map: { [leftId]: wrong, [otherLeft]: map[leftId] } });
  assert.deepEqual(item.why.map((w) => w.type), ['placement', 'placement']);
  assert.ok(item.why.some((w) => w.text === 'Simile'));
});

test('spot_technique with find 1: one found target gives one item, the unfound one is not emitted', () => {
  const s = split({
    id: 'q8', kind: 'spot_technique', prompt: 'Find one.', marks: 1, find: 1, passage: 'The sea roared like a lion. The moon was a coin.',
    options: [{ id: 'o1', text: 'Simile', technique_id: 'simile' }, { id: 'o2', text: 'Metaphor', technique_id: 'metaphor' }],
    targets: [{ id: 't1', quote: 'roared like a lion', correct: ['o1'] }, { id: 't2', quote: 'was a coin', correct: ['o2'] }]
  });
  const items = run(s, { spots: [{ from: 2, to: 5, option: idOf(s.question, 'Simile') }] });
  assert.equal(items.length, 1);
  assert.equal(items[0].share, 1);
  assert.deepEqual(items[0].why, []);
});

test('hand-marked answers: codes are the why, only below full marks', () => {
  const s = split({ id: 'q6', kind: 'extended_response', prompt: 'Explain.', marks: 4 });
  const [low] = answerEvidence({ ...s, response: { text: 'Because.' }, awarded: 2, codes: ['code-e'] });
  assert.equal(low.share, 0.5);
  assert.deepEqual(low.why, [{ type: 'code', id: 'code-e' }]);
  const [full] = answerEvidence({ ...s, response: { text: 'Because.' }, awarded: 4, codes: ['code-e'] });
  assert.deepEqual(full.why, []);
  const [waiting] = answerEvidence({ ...s, response: { text: 'Because.' }, awarded: null });
  assert.equal(waiting.share, null);
});
