import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUIZ_QUESTION_KINDS,
  QuizQuestionSchema,
  afterHint,
  checkQuestion,
  cleanResponse,
  markResponse,
  matchText,
  parseGapPassage,
  segmentPassage,
  splitQuestion,
  writeGapPassage
} from '../../netlify/functions/_shared/quiz-core.mjs';

/** Deterministic random so shuffles are repeatable. */
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const base = { prompt: 'Question?', marks: 2 };
const samples = {
  multiple_choice: { ...base, id: 'q1', kind: 'multiple_choice', options: [{ id: 'a', text: 'Simile' }, { id: 'b', text: 'Metaphor' }, { id: 'c', text: 'Alliteration' }], correct: ['b'] },
  multi_select: { ...base, id: 'q2', kind: 'multi_select', options: [{ id: 'a', text: 'Red' }, { id: 'b', text: 'Blue' }, { id: 'c', text: 'Cat' }, { id: 'd', text: 'Green' }], correct: ['a', 'b', 'd'], marks: 3 },
  true_false: { ...base, id: 'q3', kind: 'true_false', answer: false },
  // AI marking off here, so these show the automatic marks; the AI marking test turns it on.
  short_answer: { ...base, id: 'q4', kind: 'short_answer', accepted: ['personification'], ai_mark: false },
  fill_gap: { ...base, id: 'q5', kind: 'fill_gap', prompt: '', passage: 'Shall I [[compare]] thee to a summer’s [[day|morning]]?', word_bank: true, ai_mark: false },
  odd_one_out: { ...base, id: 'q6', kind: 'odd_one_out', options: [{ id: 'a', text: 'Sonnet' }, { id: 'b', text: 'Haiku' }, { id: 'c', text: 'Novel' }], correct: ['c'] },
  matching: { ...base, id: 'q7', kind: 'matching', pairs: [{ id: 'p1', left: 'Simile', right: 'like or as' }, { id: 'p2', left: 'Metaphor', right: 'is something else' }, { id: 'p3', left: 'Onomatopoeia', right: 'sound word' }] },
  ordering: { ...base, id: 'q8', kind: 'ordering', items: [{ id: 'i1', text: 'Exposition' }, { id: 'i2', text: 'Rising action' }, { id: 'i3', text: 'Climax' }, { id: 'i4', text: 'Resolution' }] },
  categorise: { ...base, id: 'q9', kind: 'categorise', groups: [{ id: 'g1', name: 'Simile' }, { id: 'g2', name: 'Metaphor' }], items: [{ id: 'x1', text: 'brave as a lion', group: 'g1' }, { id: 'x2', text: 'time is a thief', group: 'g2' }, { id: 'x3', text: 'like a ghost', group: 'g1' }, { id: 'x4', text: 'a sea of troubles', group: 'g2' }] },
  quote_technique: { ...base, id: 'q10', kind: 'quote_technique', quote: 'The wind howled.', options: [{ id: 'a', text: 'Personification', technique_id: 'personification' }, { id: 'b', text: 'Simile' }], correct: ['a'] },
  find_it: { ...base, id: 'q11', kind: 'find_it', segments: [{ id: 's1', text: 'Line one.' }, { id: 's2', text: 'The answer line.' }, { id: 's3', text: 'Line three.' }], correct: ['s2'] },
  label_image: { ...base, id: 'q12', kind: 'label_image', image: { url: 'https://example.com/a.png', alt: 'A heart' }, pins: [{ id: 'p1', x: 0.2, y: 0.3, label: 'Atrium' }, { id: 'p2', x: 0.7, y: 0.6, label: 'Ventricle' }] },
  extended_response: { ...base, id: 'q13', kind: 'extended_response', model_answer: 'A good answer.' },
  explain_effect: { ...base, id: 'q14', kind: 'explain_effect', quote: 'The wind howled.', technique: 'Personification' },
  spot_technique: { ...base, id: 'q15', kind: 'spot_technique', passage: 'The wind howled.\nHer heart was a stone.', options: [{ id: 'a', text: 'Personification' }, { id: 'b', text: 'Metaphor' }, { id: 'c', text: 'Simile' }], targets: [{ id: 't1', quote: 'wind howled', correct: ['a'] }, { id: 't2', quote: 'heart was a stone', correct: ['b'] }] }
};

test('every kind has a valid sample and splits without leaking its answer', () => {
  assert.deepEqual(Object.keys(samples).sort(), [...QUIZ_QUESTION_KINDS].sort());
  for (const [kind, sample] of Object.entries(samples)) {
    const q = QuizQuestionSchema.parse(sample);
    const { question, key } = splitQuestion(q, seeded());
    assert.equal(question.kind, kind);
    assert.equal(key.kind, kind);
    const text = JSON.stringify(question);
    for (const leak of ['correct', 'accepted', 'answer', 'model_answer', 'guide', 'explanation', 'hint"', 'group"', 'label"']) {
      assert.ok(!text.includes(`"${leak.replace('"', '')}"`), `${kind} public question leaks ${leak}`);
    }
    for (const oldId of ['"a"', '"b"', '"p1"', '"i1"', '"x1"', '"s2"', '"g1"']) {
      assert.ok(!text.includes(`"id":${oldId}`), `${kind} keeps an original id ${oldId}`);
    }
  }
});

test('orderings that would give the answer away are scrambled', () => {
  for (let seed = 1; seed < 40; seed++) {
    const { question } = splitQuestion(QuizQuestionSchema.parse(samples.ordering), seeded(seed));
    assert.notDeepEqual(question.items.map(i => i.text), samples.ordering.items.map(i => i.text));
  }
});

test('marks each kind: right answers earn full marks, wrong ones zero, partial ones a share', () => {
  const split = kind => splitQuestion(QuizQuestionSchema.parse(samples[kind]), seeded());
  const mark = (kind, response) => markResponse(split(kind).key, response);

  {
    const { question, key } = split('multiple_choice');
    const right = question.options.find(o => o.text === 'Metaphor').id;
    assert.deepEqual(markResponse(key, { selected: [right] }).score, 2);
    assert.equal(markResponse(key, { selected: [question.options[0].id === right ? question.options[1].id : question.options[0].id] }).score, 0);
    assert.equal(markResponse(key, { selected: question.options.map(o => o.id) }).score, 0, 'ticking every option is wrong');
  }
  {
    const { question, key } = split('multi_select');
    const id = t => question.options.find(o => o.text === t).id;
    assert.equal(markResponse(key, { selected: [id('Red'), id('Blue'), id('Green')] }).score, 3);
    assert.equal(markResponse(key, { selected: [id('Red'), id('Blue')] }).score, 2);
    assert.equal(markResponse(key, { selected: [id('Red'), id('Cat')] }).score, 0, 'a wrong pick cancels a right one');
    assert.equal(markResponse(key, { selected: [id('Cat')] }).score, 0, 'never below zero');
  }
  assert.equal(mark('true_false', { value: false }).score, 2);
  assert.equal(mark('true_false', { value: true }).score, 0);
  assert.equal(mark('short_answer', { text: '  Personification. ' }).score, 2);
  assert.deepEqual(mark('short_answer', { text: 'personifcation' }), { score: null, max: 2, correct: null, pending: 'near_miss' });
  assert.equal(mark('short_answer', { text: 'simile' }).score, 0);
  {
    const { question, key } = split('fill_gap');
    const gaps = question.parts.filter(p => p.type === 'gap').map(p => p.id);
    assert.deepEqual([...question.bank].sort(), ['compare', 'day']);
    assert.equal(markResponse(key, { gaps: { [gaps[0]]: 'Compare', [gaps[1]]: 'morning' } }).score, 2);
    assert.equal(markResponse(key, { gaps: { [gaps[0]]: 'compare' } }).score, 1);
  }
  {
    const { question, key } = split('matching');
    const byText = Object.fromEntries(question.right.map(r => [r.text, r.id]));
    const answer = { 'Simile': 'like or as', 'Metaphor': 'is something else', 'Onomatopoeia': 'sound word' };
    const full = Object.fromEntries(question.left.map(l => [l.id, byText[answer[l.text]]]));
    assert.equal(markResponse(key, { map: full }).score, 2);
    const [first, second] = question.left;
    const swapped = { ...full, [first.id]: full[second.id], [second.id]: full[first.id] };
    assert.equal(markResponse(key, { map: swapped }).score, 0.5, 'one of three right is a third of 2, rounded to halves');
  }
  {
    const { question, key } = split('ordering');
    const order = ['Exposition', 'Rising action', 'Climax', 'Resolution'].map(t => question.items.find(i => i.text === t).id);
    assert.equal(markResponse(key, { order }).score, 2);
    assert.equal(markResponse(key, { order: [order[1], order[0], order[2], order[3]] }).score, 1);
  }
  {
    const { question, key } = split('categorise');
    const g = Object.fromEntries(question.groups.map(x => [x.text, x.id]));
    const want = { 'brave as a lion': 'Simile', 'time is a thief': 'Metaphor', 'like a ghost': 'Simile', 'a sea of troubles': 'Metaphor' };
    const map = Object.fromEntries(question.items.map(i => [i.id, g[want[i.text]]]));
    assert.equal(markResponse(key, { map }).score, 2);
  }
  {
    const { question, key } = split('find_it');
    assert.equal(question.pick, 1);
    assert.equal(markResponse(key, { selected: [question.segments[1].id] }).score, 2);
    assert.equal(markResponse(key, { selected: [question.segments[0].id] }).score, 0);
  }
  {
    const { question, key } = split('label_image');
    const labels = Object.fromEntries(question.labels.map(l => [l.text, l.id]));
    const map = { [question.pins[0].id]: labels.Atrium, [question.pins[1].id]: labels.Ventricle };
    assert.equal(markResponse(key, { map }).score, 2);
  }
  assert.deepEqual(mark('extended_response', { text: 'My paragraph.' }), { score: null, max: 2, correct: null, pending: 'manual' });
  assert.equal(mark('extended_response', { text: '   ' }).score, 0, 'blank written answers score zero without waiting');
  assert.equal(mark('multiple_choice', 'nonsense').score, 0);
});

test('readable problems for question writers', () => {
  assert.deepEqual(checkQuestion({ ...samples.multiple_choice, correct: ['zzz'] }), { ok: false, message: 'Tick the right answer.' });
  assert.deepEqual(checkQuestion({ ...samples.multiple_choice, prompt: '' }), { ok: false, message: 'Write the question.' });
  assert.deepEqual(checkQuestion({ ...samples.fill_gap, passage: 'No gaps here.' }), { ok: false, message: 'Blank out at least one word.' });
  assert.deepEqual(checkQuestion({ ...samples.matching, pairs: [{ id: 'p1', left: 'A', right: '' }, { id: 'p2', left: 'B', right: 'x' }] }), { ok: false, message: 'Fill in both sides of every pair.' });
  assert.deepEqual(checkQuestion({ ...samples.find_it, correct: ['s1', 's2', 's3'] }), { ok: false, message: 'Leave at least one line that isn’t an answer.' });
  assert.equal(checkQuestion({ ...samples.true_false, marks: 50 }).ok, false);
  assert.equal(checkQuestion(samples.categorise).ok, true);
});

test('text matching, gap markup, passages, hint cost and response cleaning', () => {
  assert.equal(matchText('“Metaphor”', ['metaphor']), 'exact');
  assert.equal(matchText('Metaphor', ['metaphor'], true), 'near');
  assert.equal(matchText('cat', ['car']), 'wrong', 'short words get no typo allowance');
  const parts = parseGapPassage('A [[b|c]] d [[]] e');
  assert.deepEqual(parts, [{ type: 'text', text: 'A ' }, { type: 'gap', answers: ['b', 'c'] }, { type: 'text', text: ' d ' }, { type: 'text', text: '[[]]' }, { type: 'text', text: ' e' }]);
  assert.equal(writeGapPassage(parts.filter(p => p.type === 'gap' || !p.text.includes('['))), 'A [[b|c]] d  e');
  assert.deepEqual(segmentPassage('One.\nTwo.\n\nThree.'), ['One.', 'Two.', 'Three.']);
  assert.deepEqual(segmentPassage('First sentence. Second one! Third?'), ['First sentence.', 'Second one!', 'Third?']);
  assert.equal(afterHint(2, 2, true, 0.5), 1);
  assert.equal(afterHint(0.5, 2, true, 0.5), 0);
  assert.equal(afterHint(2, 2, false, 0.5), 2);
  assert.deepEqual(cleanResponse('multi_select', { selected: ['a', 'a', 3, 'b'] }), { selected: ['a', 'b'] });
  assert.equal(cleanResponse('true_false', { value: 'yes' }), null);
  assert.equal(cleanResponse('short_answer', { text: 'x'.repeat(9000) }).text.length, 6000);
});

test('keys carry skills and the technique of each public option', () => {
  const q = {
    id: 'qt', kind: 'quote_technique', prompt: 'Which technique?', marks: 1, quote: 'The wind sang.',
    skills: ['reading.inference'],
    options: [{ id: 'a', text: 'Personification', technique_id: 'personification' }, { id: 'b', text: 'Simile', technique_id: 'simile' }, { id: 'c', text: 'Rhyme' }],
    correct: ['a']
  };
  const checked = checkQuestion(q);
  assert.equal(checked.ok, true);
  const { question, key } = splitQuestion(checked.question, seeded());
  assert.deepEqual(key.skills, ['reading.inference']);
  const byText = Object.fromEntries(question.options.map((o) => [o.text, o.id]));
  assert.deepEqual(key.techniques, { [byText.Personification]: 'personification', [byText.Simile]: 'simile' });
});

test('the public question never carries technique ids or skills', () => {
  const checked = checkQuestion({
    id: 'qp', kind: 'quote_technique', prompt: 'Which technique?', marks: 1, quote: 'The wind sang.',
    skills: ['reading.inference'],
    options: [{ id: 'a', text: 'Personification', technique_id: 'personification' }, { id: 'b', text: 'Simile', technique_id: 'simile' }],
    correct: ['a']
  });
  assert.equal(checked.ok, true);
  const { question } = splitQuestion(checked.question, seeded());
  assert.equal('techniques' in question, false);
  assert.equal('skills' in question, false);
  assert.equal(question.options.some((o) => 'technique_id' in o), false);
});

test('spot_technique keys map option ids to techniques', () => {
  const q = {
    id: 'sp', kind: 'spot_technique', prompt: 'Find them.', marks: 2, passage: 'The sea roared like a lion. The moon was a coin.',
    options: [{ id: 'o1', text: 'Simile', technique_id: 'simile' }, { id: 'o2', text: 'Metaphor', technique_id: 'metaphor' }],
    targets: [{ id: 't1', quote: 'roared like a lion', correct: ['o1'] }, { id: 't2', quote: 'was a coin', correct: ['o2'] }]
  };
  const checked = checkQuestion(q);
  assert.equal(checked.ok, true);
  const { question, key } = splitQuestion(checked.question, seeded());
  const byText = Object.fromEntries(question.options.map((o) => [o.text, o.id]));
  assert.deepEqual(key.techniques, { [byText.Simile]: 'simile', [byText.Metaphor]: 'metaphor' });
});

test('a question with no technique ids or skills keeps a bare key', () => {
  const { key } = splitQuestion(samples.multiple_choice, seeded());
  assert.equal('techniques' in key, false);
  assert.equal('skills' in key, false);
});

test('a skill must be strand.sub', () => {
  assert.equal(checkQuestion({ ...samples.true_false, skills: ['Reading'] }).ok, false);
});

test('quiz settings accept follow-up fields and keep them out of student settings', async () => {
  const { QuizSettingsSchema } = await import('../../netlify/functions/_shared/quiz-core.mjs');
  const parsed = QuizSettingsSchema.parse({ for_students: ['stu1'], follow_up_of: 'lesson_a', follow_up_flag: 'sure_wrong:tech:simile', compare_with: 'lesson_b' });
  assert.deepEqual(parsed.for_students, ['stu1']);
  assert.equal(parsed.compare_with, 'lesson_b');
});

test('written questions carry their skills and next-step bank to students', () => {
  const bank = { comp_ts: { lines: ['a', 'b', 'c', 'd', 'e'], edited: [false, true, false, false, false], source: 'x1' } };
  const q = QuizQuestionSchema.parse({ id: 'w1', kind: 'extended_response', prompt: 'Why does the town change?', marks: 4, skills: ['arguing.thesis'], next_steps: bank });
  assert.deepEqual(q.next_steps, bank);
  const { question, key } = splitQuestion(q, seeded());
  assert.deepEqual(question.skills, ['arguing.thesis']);
  assert.deepEqual(question.next_steps, bank);
  assert.equal(key.next_steps, undefined);
  assert.equal(splitQuestion({ ...q, next_steps: undefined }, seeded()).question.skills, undefined);
  assert.equal(QuizQuestionSchema.safeParse({ ...q, next_steps: { comp_ts: { ...bank.comp_ts, lines: ['a'] } } }).success, false);
});

test('AI marking: answers that aren’t an exact match wait for the AI; the key carries the switch and the note', () => {
  const key = (sample) => splitQuestion(QuizQuestionSchema.parse(sample), seeded());
  const short = key({ ...samples.short_answer, ai_mark: undefined, looking_for: 'A technique that gives the wind human traits.' });
  assert.equal(short.key.ai, true, 'on by default for short answers');
  assert.equal(short.key.looking_for, 'A technique that gives the wind human traits.');
  assert.ok(!JSON.stringify(short.question).includes('human traits'), 'the note stays off the public question');
  assert.equal(markResponse(short.key, { text: 'Personification' }).score, 2, 'an exact match marks itself');
  assert.deepEqual(markResponse(short.key, { text: 'giving it human feelings' }), { score: null, max: 2, correct: null, pending: 'ai' });
  assert.deepEqual(markResponse(short.key, { text: 'personifcation' }).pending, 'ai', 'a near miss goes to the AI too');
  assert.equal(markResponse(short.key, { text: '   ' }).score, 0, 'an empty answer is wrong at once');

  const gaps = key({ ...samples.fill_gap, ai_mark: undefined });
  assert.equal(gaps.key.ai, true);
  const [g1, g2] = gaps.question.parts.filter(p => p.type === 'gap').map(p => p.id);
  assert.equal(markResponse(gaps.key, { gaps: { [g1]: 'compare', [g2]: 'day' } }).score, 2);
  const waiting = markResponse(gaps.key, { gaps: { [g1]: 'compare', [g2]: 'evening' } });
  assert.equal(waiting.pending, 'ai');
  assert.deepEqual(waiting.parts, { [g1]: true }, 'the exact gap shows right; the other waits');
  assert.equal(markResponse(gaps.key, { gaps: { [g1]: 'compare' } }).score, 1, 'an empty gap is wrong, so nothing waits');

  const essay = key(samples.extended_response);
  assert.equal(essay.key.ai, undefined, 'off by default for written answers');
  assert.equal(markResponse(essay.key, { text: 'It ends badly.' }).pending, 'manual');
  const essayOn = key({ ...samples.extended_response, ai_mark: true });
  assert.equal(markResponse(essayOn.key, { text: 'It ends badly.' }).pending, 'ai');
  assert.equal(key({ ...samples.short_answer, ai_mark: false }).key.ai, undefined, 'the switch turns it off');
  assert.equal(key({ ...samples.true_false, ai_mark: true }).key.ai, undefined, 'only typed answers can be AI marked');
});
