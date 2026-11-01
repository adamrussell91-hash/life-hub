// apps/teaching/tests/unit/sprint-checks.test.ts
import { describe, it, expect } from 'vitest';
import { fullSentence, sketchProblems, duelProblems, partsProblems, prototypeProblems, feedbackProblems, reflectionProblems } from '@/sprint/checks';

const card = (over = {}) => ({
  id: 'k1', title: 'What the ash kept', idea: 'What if the panel showed five objects?', answers: 'Ordinary objects make the town feel close to us.',
  evidence: 'For example, the carbonised loaf in Source B.', criteria: { c1: 'Loaf and graffiti in Sources B and D' }, requirements: { r1: 'Sources B and D' }, value_answer: 'This one is about objects, idea 1 was about people.', ...over
});
const reqs = [{ id: 'r1', text: 'Uses at least two sources', phases: ['sketch' as const] }];

describe('sprint checks', () => {
  it('wants a full sentence', () => {
    expect(fullSentence('bread')).toBe(false);
    expect(fullSentence('The bread shows daily life.')).toBe(true);
  });

  it('checks every idea card and the set', () => {
    const good = { cards: [card(), card({ id: 'k2', title: 'Then and now', idea: 'What if it compared streets?' }), card({ id: 'k3', title: 'Pliny', idea: 'What if it used the letter?' })], strongest: 'k1', strongest_why: 'It names two sources and fits Year 7.' };
    expect(sketchProblems(good, { ideas: 3, requirements: reqs })).toEqual([]);
    const thin = { ...good, cards: [card({ answers: 'bread' }), ...good.cards.slice(1)] };
    expect(sketchProblems(thin, { ideas: 3, requirements: reqs })[0]).toMatch(/Idea 1: Add a little more/);
    expect(sketchProblems({ ...good, cards: good.cards.slice(0, 2) }, { ideas: 3, requirements: reqs })).toContain('Write 3 ideas. You have 2 so far.');
    expect(sketchProblems({ ...good, cards: [card(), card({ id: 'k2' }), card({ id: 'k3', title: 'P', idea: 'What if it used the letter?' })] }, { ideas: 3, requirements: reqs })).toContain('Give each idea its own title and its own idea.');
    expect(sketchProblems({ ...good, cards: [card({ criteria: {} }), ...good.cards.slice(1)] }, { ideas: 3, requirements: reqs })[0]).toMatch(/link it to at least one criterion/);
    expect(sketchProblems({ ...good, cards: [card({ requirements: {} }), ...good.cards.slice(1)] }, { ideas: 3, requirements: reqs })[0]).toMatch(/say where it meets "Uses at least two sources"/);
    expect(sketchProblems({ ...good, strongest: '' }, { ideas: 3, requirements: reqs })).toContain('Pick your strongest idea and say why.');
  });

  it('checks the inspiration, the rapid ideas and the picks, and needs a strongest only with two or more', () => {
    const two = { inspiration: [{ from: 'A museum audio guide', borrow: 'One voice talking to you' }], rapid: ['Objects', 'Streets', 'Letters'], rapid_started_at: '', cards: [card({ id: 'r0' }), card({ id: 'r1', title: 'Then and now', idea: 'What if it compared streets?' })], strongest: 'r0', strongest_why: 'It names two sources and fits Year 7.' };
    expect(sketchProblems(two, { ideas: 2, requirements: reqs })).toEqual([]);
    expect(sketchProblems({ ...two, inspiration: [] }, { ideas: 2, requirements: reqs })[0]).toBe('Inspiration: note one example and what you’d borrow from it.');
    expect(sketchProblems({ ...two, rapid: ['Objects'] }, { ideas: 2, requirements: reqs })).toContain('Rapid ideas: write at least 2. You have 1 so far.');
    expect(sketchProblems({ ...two, cards: two.cards.slice(0, 1) }, { ideas: 2, requirements: reqs })).toContain('Pick: star your best 2 ideas. You have 1 starred.');
    expect(sketchProblems({ ...two, cards: two.cards.slice(0, 1), strongest: '' }, { ideas: 1, requirements: reqs })).toEqual([]);
  });

  it('checks head-to-heads: a winner in every pair, and what it is stronger in', () => {
    const ids = ['A', 'B', 'C'];
    const d = (a: string, b: string, stronger = ['c1']) => ({ a, b, winner: a, stronger, why: '' });
    expect(duelProblems([d('A', 'B'), d('C', 'A'), d('B', 'C')], ids)).toEqual([]);
    expect(duelProblems([d('A', 'B')], ids)).toEqual(['Pick a winner in every match-up. 2 of 3 still to do.']);
    expect(duelProblems([d('A', 'B', []), d('A', 'C'), d('B', 'C', [])], ids)).toEqual(['Say what the winner is stronger in for 2 match-ups.']);
  });

  it('checks parts link to a criterion', () => {
    expect(partsProblems([{ id: 'p1', text: 'Panel text', shows: 'The baker’s morning', criterion: 'c1' }])).toEqual([]);
    expect(partsProblems([{ id: 'p1', text: 'Panel text', shows: '', criterion: '' }])).toEqual(['"Panel text": pick the criterion it serves.']);
  });

  it('checks the prototype self-check and requirements', () => {
    const crit = [{ id: 'c1', text: 'Uses sources' }];
    const ok = { text: 'Panel text here', link: '', files: [], requirements: { r1: 'Paragraph 2' }, self: { c1: 2 as const }, self_why: { c1: 'It quotes Source B in the first line.' }, value_answer: 'Each date matches the source.' };
    expect(prototypeProblems(ok, crit, reqs.map((r) => ({ ...r, phases: ['prototype' as const] })))).toEqual([]);
    expect(prototypeProblems({ ...ok, text: '', files: [] }, crit, [])).toContain('Add your part: write it, upload a file or add a link.');
    expect(prototypeProblems({ ...ok, self: {} }, crit, [])).toContain('"Uses sources": pick Starting, Showing or Strong and say why.');
  });

  it('checks feedback and the reflection', () => {
    const crit = [{ id: 'c1', text: 'Uses sources' }];
    expect(feedbackProblems({ levels: { c1: 3 }, worked: 'The graffiti made it feel real.', next: 'Try naming the source on the panel.', about: 'c1' }, crit)).toEqual([]);
    expect(feedbackProblems({ levels: {}, worked: '', next: '', about: '' }, crit)).toEqual(['Pick a level for "Uses sources".', 'Say what worked in a full sentence.', 'Give one thing to try next in a full sentence.']);
    expect(reflectionProblems({ reflection: ['The panel names its sources clearly.', 'We would add a map so visitors see where.'], quote: 'Try naming the source', change_criterion: 'c1', value_answer: 'It matters because visitors need to see where.' })).toEqual([]);
    expect(reflectionProblems({ reflection: [], quote: '', change_criterion: '', value_answer: '' })).toHaveLength(4);
  });
});

describe('sketchProblems: only the strongest idea is checked against criteria', () => {
  const card = (id: string, extra = {}) => ({ id, seed: id, title: id, idea: 'A full idea sentence here.', answers: 'It solves the problem well.', evidence: 'Because it worked before.', criteria: {}, requirements: {}, value_answer: 'Yes, it does fit the audience.', ...extra });
  it('asks for a line only on the strongest', () => {
    const cards = [card('a'), card('b')];
    const out = sketchProblems({ cards, strongest: 'a', strongest_why: 'It is clearest and fits the audience.' } as never, { ideas: 2, requirements: [] });
    expect(out.some((m) => m.startsWith('Idea 1') && /criterion/.test(m))).toBe(true);
    expect(out.some((m) => m.startsWith('Idea 2') && /criterion/.test(m))).toBe(false);
  });
});

describe('check question only when it is on screen', () => {
  it('does not require an answer when the phase has no check question', () => {
    const c = { id: 'a', seed: 'a', title: 'a', idea: 'A full idea sentence here.', answers: 'It solves the problem well.', evidence: 'Because it worked before.', criteria: { c1: 'line' }, requirements: {}, value_answer: '' };
    const p = { cards: [c], strongest: 'a', strongest_why: '' } as never;
    expect(sketchProblems(p, { ideas: 1, requirements: [] }).some((m) => /check question/.test(m))).toBe(true);
    expect(sketchProblems(p, { ideas: 1, requirements: [], valueCheck: false }).some((m) => /check question/.test(m))).toBe(false);
  });
});
