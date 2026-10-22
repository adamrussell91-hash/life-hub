import { describe, it, expect } from 'vitest';
import {
  checkQuestion,
  cleanResponse,
  locateQuote,
  markResponse,
  passageWords,
  splitQuestion,
  type QuizQuestion
} from '@/quiz/core';
import { mountQuestionPlayer } from '@/quiz/player';
import { mountQuestionBuilder } from '@/quiz/builder';
import { answerLines } from '@/blocks/quiz-question';
import { setLiteraryElementsForTests, type LiteraryElementsTable } from '@/blocks/literary-elements';
import tableJson from '@/data/literary-elements.json';

setLiteraryElementsForTests(tableJson as unknown as LiteraryElementsTable);

const PASSAGE = 'The wind whispered through the empty streets.\nHer heart was a stone, cold and heavy.\nSilent, still, the city slept.';

const question = (extra: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({
    id: 'q1',
    kind: 'spot_technique',
    prompt: 'Find two techniques and name them.',
    marks: 2,
    passage: PASSAGE,
    options: [
      { id: 'per', text: 'Personification' },
      { id: 'met', text: 'Metaphor' },
      { id: 'sim', text: 'Simile' },
      { id: 'all', text: 'Alliteration' }
    ],
    targets: [
      { id: 't1', quote: 'The wind whispered', correct: ['per'] },
      { id: 't2', quote: 'Her heart was a stone', correct: ['met'] }
    ],
    ...extra
  }) as QuizQuestion;

/** Word positions of a phrase in the passage, the way a student's selection arrives. */
const span = (phrase: string) => {
  const at = locateQuote(PASSAGE, phrase);
  if (!at) throw new Error(`not in passage: ${phrase}`);
  return at;
};

function setUp(extra: Partial<QuizQuestion> = {}) {
  const { question: pub, key } = splitQuestion(question(extra));
  if (pub.kind !== 'spot_technique') throw new Error('wrong kind');
  const id = (text: string) => pub.options.find((o) => o.text === text)!.id;
  const mark = (...spots: Array<[string, string]>) =>
    markResponse(key, { spots: spots.map(([phrase, technique]) => ({ ...span(phrase), option: id(technique) })) });
  return { pub, key, id, mark };
}

describe('spot the technique', () => {
  it('accepts a finished question and explains what is missing from an unfinished one', () => {
    expect(checkQuestion(question()).ok).toBe(true);
    const missing = checkQuestion(question({ targets: [{ id: 't1', quote: 'The moon wept', correct: ['per'] }] } as Partial<QuizQuestion>));
    expect(missing).toEqual({ ok: false, message: '“The moon wept” isn’t in the passage. Copy the words exactly.' });
    const unnamed = checkQuestion(question({ targets: [{ id: 't1', quote: 'The wind whispered', correct: ['nope'] }] } as Partial<QuizQuestion>));
    expect(unnamed).toEqual({ ok: false, message: 'Name the technique for every answer.' });
    expect(checkQuestion(question({ targets: [] } as Partial<QuizQuestion>))).toEqual({
      ok: false,
      message: 'Select the words for at least one answer and name its technique.'
    });
  });

  it('finds quotes regardless of case, punctuation and curly quotes', () => {
    expect(locateQuote(PASSAGE, 'her heart was a stone')).toEqual(span('Her heart was a stone,'));
    expect(locateQuote(PASSAGE, 'Silent still')).not.toBeNull();
    expect(locateQuote(PASSAGE, 'heart stone')).toBeNull();
    expect(passageWords(PASSAGE)[7]).toMatchObject({ text: 'Her', line: 1 });
  });

  it('keeps the answer out of what students see', () => {
    const { pub } = setUp();
    expect(JSON.stringify(pub)).not.toContain('whispered"');
    expect(pub).not.toHaveProperty('targets');
    expect(pub.pick).toBe(2);
    expect(pub.options.map((o) => o.id)).not.toContain('per');
  });

  it('gives full marks for the right words and the right name', () => {
    const { mark } = setUp();
    expect(mark(['The wind whispered', 'Personification'], ['Her heart was a stone', 'Metaphor'])).toMatchObject({ score: 2, correct: true });
  });

  it('counts a selection that is a little smaller or bigger than the answer', () => {
    const { mark } = setUp();
    // Just the key word.
    expect(mark(['whispered', 'Personification'], ['stone', 'Metaphor']).score).toBe(2);
    // A few words either side.
    expect(mark(['wind whispered through the empty', 'Personification'], ['heart was a stone, cold and heavy', 'Metaphor']).score).toBe(2);
  });

  it('does not count a selection that only catches a little word, or that sweeps up everything', () => {
    const { mark } = setUp();
    expect(mark(['The', 'Personification']).score).toBe(0);
    expect(mark(['The wind whispered through the empty streets. Her heart was a stone, cold and heavy. Silent, still, the city slept.', 'Metaphor']).score).toBe(0);
    expect(mark(['the city slept', 'Personification']).score).toBe(0);
  });

  it('gives half credit for finding the words but naming the wrong technique', () => {
    const { mark } = setUp();
    const result = mark(['The wind whispered', 'Simile'], ['Her heart was a stone', 'Metaphor']);
    expect(result.score).toBe(1.5);
    expect(result.parts).toMatchObject({ s0: false, 's0.found': true, s1: true });
  });

  it('only counts the same answer once', () => {
    const { mark } = setUp();
    expect(mark(['The wind whispered', 'Personification'], ['whispered', 'Personification']).score).toBe(1);
  });

  it('accepts any answer when students only have to find some of them', () => {
    const { pub, mark } = setUp({ find: 1, prompt: 'Find one technique.', marks: 1 } as Partial<QuizQuestion>);
    expect(pub.pick).toBe(1);
    expect(mark(['Her heart was a stone', 'Metaphor']).score).toBe(1);
    expect(mark(['wind whispered', 'Personification']).score).toBe(1);
    // Only the first allowed selection counts.
    expect(mark(['the city slept', 'Metaphor'], ['wind whispered', 'Personification']).score).toBe(0);
  });

  it('accepts every technique the teacher allowed for the words', () => {
    const { mark } = setUp({
      targets: [{ id: 't1', quote: 'Silent, still', correct: ['all', 'per'] }],
      marks: 1
    } as Partial<QuizQuestion>);
    expect(mark(['Silent, still', 'Alliteration']).score).toBe(1);
    expect(mark(['Silent, still', 'Personification']).score).toBe(1);
  });

  it('tidies stored responses', () => {
    expect(cleanResponse('spot_technique', { spots: [{ from: 5, to: 2, option: 'x' }, { from: -1, to: 2, option: 'y' }, 'junk'] })).toEqual({
      spots: [{ from: 2, to: 5, option: 'x' }]
    });
  });

  it('lets a student select words and name each technique', () => {
    const { pub, key } = setUp();
    let response: unknown = null;
    const root = mountQuestionPlayer({ question: pub, onChange: (r) => (response = r) });
    const words = [...root.querySelectorAll<HTMLButtonElement>('.qz-word')];
    expect(words).toHaveLength(passageWords(PASSAGE).length);
    words[1]!.click();
    words[2]!.click();
    const chip = [...root.querySelectorAll<HTMLButtonElement>('.qz-spot-pick .qz-chip')].find((b) => b.textContent === 'Personification')!;
    chip.click();
    expect(response).toEqual({ spots: [{ from: 1, to: 2, option: pub.options.find((o) => o.text === 'Personification')!.id }] });
    expect(root.querySelectorAll('.qz-spots__row')).toHaveLength(1);

    const marked = mountQuestionPlayer({ question: pub, response: response as never, result: { mark: markResponse(key, response), key } });
    expect(marked.querySelector('.qz-spots__row')?.getAttribute('data-state')).toBe('right');
    expect(marked.textContent).toContain('Her heart was a stone');
  });

  it('lets the teacher build one by selecting words in the passage', () => {
    let latest: QuizQuestion | null = null;
    const start = { ...question(), targets: [] } as unknown as QuizQuestion;
    const builder = mountQuestionBuilder({ question: start, audience: 'teacher', onChange: (q) => (latest = q) });
    const words = [...builder.root.querySelectorAll<HTMLButtonElement>('.qz-word')];
    words[1]!.click();
    words[2]!.click();
    const chip = [...builder.root.querySelectorAll<HTMLButtonElement>('.qz-spot-pick .qz-chip')].find((b) => b.textContent === 'Personification')!;
    chip.click();
    const save = [...builder.root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Add this answer')!;
    save.click();
    expect((latest as unknown as { targets: unknown[] }).targets).toEqual([{ id: expect.any(String), quote: 'wind whispered', correct: ['per'] }]);
    expect(builder.problem()).toBeNull();
    expect(answerLines(latest!)).toContain('✓ “wind whispered”: Personification');
  });
});
