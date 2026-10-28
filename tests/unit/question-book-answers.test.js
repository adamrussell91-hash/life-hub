// tests/unit/question-book-answers.test.js
// The Question Book's answer shapes: every response type cleans to its documented value, empty
// answers become null, 0 is kept, shares make exactly 100 once filled, and bad values are a 400.
// Every question here is invented; the book's questions live only in the private data repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AnswerError, RESPONSE_TYPES, TEXT_BOX_TYPES, describeAnswer, isAnswered, normalizeAnswer } from '../../packages/question-book/answers.mjs';

const q = (response, parts = []) => ({ id: 'qb_question_900', chapter: 'qb_love', n: 900, prompt: 'An invented prompt?', parts, response });
const bad = (fn, code = 'bad_answer') => assert.throws(fn, (e) => e instanceof AnswerError && e.status === 400 && e.code === code);

test('every response type in the book is handled', () => {
  assert.equal(RESPONSE_TYPES.length, 25);
  assert.deepEqual([...TEXT_BOX_TYPES].sort(), ['body_markers', 'drawing', 'map_markers', 'relationship_map']);
});

test('null, empty strings and blank lists clear to null', () => {
  const text = q({ type: 'text' });
  assert.equal(normalizeAnswer(text, null), null);
  assert.equal(normalizeAnswer(text, { main: '   ' }), null);
  assert.equal(normalizeAnswer(q({ type: 'list', count: 3 }), { main: ['', ' ', ''] }), null);
  assert.equal(isAnswered(text, null), false);
  assert.equal(isAnswered(text, { main: 'yes' }), true);
});

test('text types trim and cap; the drawn types take a text box', () => {
  assert.deepEqual(normalizeAnswer(q({ type: 'text' }), { main: '  hello  ' }), { main: 'hello' });
  for (const type of TEXT_BOX_TYPES) assert.deepEqual(normalizeAnswer(q({ type }), { main: 'a sketch in words' }), { main: 'a sketch in words' });
  bad(() => normalizeAnswer(q({ type: 'text' }), { main: 'x'.repeat(6001) }));
  bad(() => normalizeAnswer(q({ type: 'text' }), { main: 5 }));
  bad(() => normalizeAnswer(q({ type: 'text' }), { main: 'a', extra: 1 }));
  bad(() => normalizeAnswer(q({ type: 'text' }), 'bare string'));
});

test('a bare response descriptor works as the question', () => {
  assert.deepEqual(normalizeAnswer({ type: 'gauge', min: 1, max: 10 }, { main: 4 }), { main: 4 });
  bad(() => normalizeAnswer({ type: 'mystery' }, { main: 1 }), 'bad_question');
});

test('choices with follow-ups: options parts take an option, label parts take text', () => {
  const question = q({ type: 'choices_with_followups' }, [{ options: ['often', 'rarely'] }, { label: 'Why?' }]);
  assert.deepEqual(normalizeAnswer(question, { parts: { 0: 'rarely', 1: ' busy ' } }), { parts: { 0: 'rarely', 1: 'busy' } });
  assert.deepEqual(normalizeAnswer(question, { parts: ['often'] }), { parts: { 0: 'often' } });
  bad(() => normalizeAnswer(question, { parts: { 0: 'sometimes' } }));
  bad(() => normalizeAnswer(question, { parts: { 2: 'x' } }));
  assert.equal(normalizeAnswer(question, { parts: { 0: '', 1: '' } }), null);
});

test('lists, fields and tables keep their length', () => {
  assert.deepEqual(normalizeAnswer(q({ type: 'list', count: 3 }), { main: ['tea', '', 'toast'] }), { main: ['tea', '', 'toast'] });
  assert.deepEqual(normalizeAnswer(q({ type: 'list', count: 3 }), { main: ['tea'] }), { main: ['tea', '', ''] });
  bad(() => normalizeAnswer(q({ type: 'list', count: 2 }), { main: ['a', 'b', 'c'] }));
  assert.deepEqual(normalizeAnswer(q({ type: 'paired_times', columns: ['First', 'Last'] }), { main: ['aged 9', '2025'] }), { main: ['aged 9', '2025'] });
  assert.deepEqual(normalizeAnswer(q({ type: 'three_circle_diagram', slots: 3 }), { main: ['calm', 'curious'] }), { main: ['calm', 'curious', ''] });
  assert.deepEqual(normalizeAnswer(q({ type: 'sibling_table', columns: ['A', 'B', 'C'], cellType: 'text' }), { main: ['x', 'y', 'z'] }), { main: ['x', 'y', 'z'] });
  assert.deepEqual(normalizeAnswer(q({ type: 'topic_fields', topics: ['work', 'home'] }), { main: ['', 'garden'] }), { main: ['', 'garden'] });
  assert.deepEqual(normalizeAnswer(q({ type: 'scenario_fields', fields: ['Best', 'Worst'], horizonYears: 10 }), { main: ['sea view', ''] }), { main: ['sea view', ''] });
  const table = q({ type: 'choice_table', columns: ['yes', 'no'], rows: ['row one', 'row two', 'row three'] });
  assert.deepEqual(normalizeAnswer(table, { main: ['yes', null, 'no'] }), { main: ['yes', null, 'no'] });
  bad(() => normalizeAnswer(table, { main: ['maybe'] }));
});

test('single choices, comparisons and times', () => {
  assert.deepEqual(normalizeAnswer(q({ type: 'choices', options: ['left', 'right'] }), { main: 'left' }), { main: 'left' });
  assert.deepEqual(normalizeAnswer(q({ type: 'image_choice', options: ['round', 'square'] }), { main: 'square' }), { main: 'square' });
  bad(() => normalizeAnswer(q({ type: 'choices', options: ['left'] }), { main: 'up' }));
  assert.deepEqual(normalizeAnswer(q({ type: 'comparison', questionRefs: ['qb_question_901', 'qb_question_902'] }), { main: 'qb_question_902' }), { main: 'qb_question_902' });
  assert.deepEqual(normalizeAnswer(q({ type: 'time', clockFace: true }), { main: '06:45' }), { main: '06:45' });
  bad(() => normalizeAnswer(q({ type: 'time' }), { main: '25:00' }));
  bad(() => normalizeAnswer(q({ type: 'time' }), { main: '6:45' }));
  assert.deepEqual(normalizeAnswer(q({ type: 'paired_choices', pairs: [['cats', 'dogs'], ['sea', 'hills']] }), { main: ['dogs', null] }), { main: ['dogs', null] });
  bad(() => normalizeAnswer(q({ type: 'paired_choices', pairs: [['cats', 'dogs']] }), { main: ['sea'] }));
});

test('ratings keep 0 and stay in range', () => {
  const numeric = q({ type: 'continuum', low: 'never', high: 'always', numeric: true, min: 0, max: 10, midpoint: 5 });
  assert.deepEqual(normalizeAnswer(numeric, { main: 0 }), { main: 0 });
  assert.equal(isAnswered(numeric, { main: 0 }), true);
  bad(() => normalizeAnswer(numeric, { main: 11 }));
  bad(() => normalizeAnswer(numeric, { main: 2.5 }));
  const line = q({ type: 'continuum', low: 'quiet', high: 'loud', numeric: false });
  assert.deepEqual(normalizeAnswer(line, { main: 0 }), { main: 0 });
  assert.deepEqual(normalizeAnswer(line, { main: 100 }), { main: 100 });
  bad(() => normalizeAnswer(line, { main: 101 }));
  const profile = q({ type: 'profile', min: 0, max: 10, midpoint: 5, scales: [{ low: 'a', high: 'b' }, { low: 'c', high: 'd' }] });
  assert.deepEqual(normalizeAnswer(profile, { main: [0, null] }), { main: [0, null] });
  assert.deepEqual(normalizeAnswer(q({ type: 'gauge', min: 1, max: 10 }), { main: 1 }), { main: 1 });
  bad(() => normalizeAnswer(q({ type: 'gauge', min: 1, max: 10 }), { main: 0 }));
  const ladder = q({ type: 'ladder_markers', markers: { A: 'now', B: 'wanted', C: 'highest' }, min: 0, max: 10, midpoint: 5 });
  assert.deepEqual(normalizeAnswer(ladder, { main: { A: 0, B: 7, C: null } }), { main: { A: 0, B: 7 } });
  bad(() => normalizeAnswer(ladder, { main: { D: 3 } }));
});

test('rankings hold each listed item once', () => {
  const ranking = q({ type: 'ranking', items: ['speed', 'care', 'humour'] });
  assert.deepEqual(normalizeAnswer(ranking, { main: ['care', 'speed'] }), { main: ['care', 'speed'] });
  bad(() => normalizeAnswer(ranking, { main: ['care', 'care'] }));
  bad(() => normalizeAnswer(ranking, { main: ['luck'] }));
});

test('shares never pass 100 and make exactly 100 once every share is filled', () => {
  const shares = q({ type: 'shares', labels: ['one', 'two', 'three'], total: null, proposedTotal: 100 });
  assert.deepEqual(normalizeAnswer(shares, { main: [50, 30, 20] }), { main: [50, 30, 20] });
  assert.deepEqual(normalizeAnswer(shares, { main: [60, null, null] }), { main: [60, null, null] });
  assert.deepEqual(normalizeAnswer(shares, { main: [100, 0, 0] }), { main: [100, 0, 0] });
  bad(() => normalizeAnswer(shares, { main: [50, 30, 10] }), 'shares_total');
  bad(() => normalizeAnswer(shares, { main: [80, 30, null] }), 'shares_total');
  bad(() => normalizeAnswer(shares, { main: [-5, 50, 55] }));
});

test('quadrant charts take labelled items in the chart’s cells; the plot takes 1–10 positions', () => {
  const quad = q({ type: 'chart', chart: 'qb_friendship_map' });
  assert.deepEqual(normalizeAnswer(quad, { main: { items: [{ label: 'Robin', cell: 'upper_left' }, { label: ' ', cell: 'lower_left' }] } }), { main: { items: [{ label: 'Robin', cell: 'upper_left' }] } });
  bad(() => normalizeAnswer(quad, { main: { items: [{ label: 'Robin', cell: 'middle' }] } }));
  const plot = q({ type: 'chart', chart: 'qb_possessions_map' });
  assert.deepEqual(normalizeAnswer(plot, { main: { points: [{ label: 'bike', x: 1, y: 10 }, { label: 'mug' }] } }), { main: { points: [{ label: 'bike', x: 1, y: 10 }, { label: 'mug', x: null, y: null }] } });
  bad(() => normalizeAnswer(plot, { main: { points: [{ label: 'bike', x: 0, y: 3 }] } }));
  bad(() => normalizeAnswer(plot, { main: { points: Array.from({ length: 6 }, (_, i) => ({ label: `p${i}` })) } }));
  bad(() => normalizeAnswer(q({ type: 'chart', chart: 'qb_nowhere' }), { main: { items: [] } }), 'bad_question');
});

test('answers read as plain text for the Notice call', () => {
  const question = q({ type: 'choices_with_followups' }, [{ options: ['often', 'rarely'] }, { label: 'Why?' }]);
  assert.equal(describeAnswer(question, { parts: { 0: 'often', 1: 'it helps' } }), 'often\nWhy? it helps');
  assert.equal(describeAnswer(q({ type: 'shares', labels: ['a', 'b'] }), { main: [70, 30] }), 'a 70%; b 30%');
  assert.match(describeAnswer(q({ type: 'chart', chart: 'qb_friendship_map' }), { main: { items: [{ label: 'Robin', cell: 'upper_right' }] } }), /Robin: older than me \/ happier than me/);
  assert.equal(describeAnswer(q({ type: 'text' }), null), '');
});
