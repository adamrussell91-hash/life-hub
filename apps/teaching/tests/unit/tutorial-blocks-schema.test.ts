import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { fadedContent, fadedStepKey, fadedWarnings, suggestedBlanks, upgradeFaded, type FadedContent } from '@/schemas/faded';

const base = { type: 'block', visibility: 'student_teacher', variant: 'medium', created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z', schema_version: 1 } as const;
const faded = {
  prompt: 'How is the ending built?',
  extract: 'The house was empty. … The house was empty again.',
  parts: [
    { label: 'Technique', answer: 'Cyclical structure' },
    { label: 'Where', answer: 'The first and last lines both describe the empty house.' },
    { label: 'Effect', answer: 'Nothing has changed for her, so the reader feels her loneliness.' }
  ],
  blanks: [2]
};

const good: FadedContent = {
  prompt: 'How is the ending built?',
  part_labels: ['What', 'Why'],
  steps: [
    { id: 's1', extract: 'One', answers: ['a', 'b'], blanks: [], question: { prompt: 'q', choices: ['x', 'y'], correct: 1 } },
    { id: 's2', extract: 'Two', answers: ['c', 'd'], blanks: [1] },
    { id: 's3', extract: 'Three', answers: ['e', 'f'], blanks: [0, 1] }
  ],
  criteria: { What: ['Makes a claim'], Why: ['Says what it means'] }
};

describe('tutorial block schemas', () => {
  it('parses a with_teacher block', () => {
    const b = BlockSchema.parse({ ...base, id: 'w1', block_type: 'with_teacher', content: { talking_points: ['Ask: what does the reader feel?'] } });
    expect(b.block_type).toBe('with_teacher');
  });

  it('converts an old faded example to one step with its id left to the block', () => {
    const b = BlockSchema.parse({ ...base, id: 'f1', block_type: 'faded_example', content: faded });
    if (b.block_type !== 'faded_example') throw new Error('wrong type');
    expect(b.content.part_labels).toEqual(['Technique', 'Where', 'Effect']);
    expect(b.content.steps).toHaveLength(1);
    expect(b.content.steps[0]!.blanks).toEqual([2]);
    expect(b.content.steps[0]!.answers[0]).toBe('Cyclical structure');
    expect(Object.keys(b.content.criteria)).toEqual(['Effect']);
    expect(fadedStepKey(b, b.content.steps[0]!)).toBe('f1');
  });

  it('keeps new content unchanged, and converting twice changes nothing', () => {
    const once = upgradeFaded(faded);
    expect(upgradeFaded(once)).toBe(once);
    const b = BlockSchema.parse({ ...base, id: 'f1', block_type: 'faded_example', content: good });
    expect(b.content).toEqual(good);
  });

  it('rejects answers that do not match the parts, seven steps and a bad correct choice', () => {
    const parse = (content: unknown) => BlockSchema.parse({ ...base, id: 'f1', block_type: 'faded_example', content });
    expect(() => parse({ ...good, steps: [{ ...good.steps[1]!, answers: ['a'] }] })).toThrow();
    expect(() => parse({ ...good, steps: Array.from({ length: 7 }, () => good.steps[1]!) })).toThrow();
    expect(() => parse({ ...good, steps: [{ ...good.steps[0]!, question: { prompt: 'q', choices: ['a', 'b'], correct: 2 } }] })).toThrow();
  });

  it('suggests blanks from the last part backward', () => {
    expect([0, 1, 2, 3, 5].map((i) => suggestedBlanks(i, 3))).toEqual([[], [2], [1, 2], [0, 1, 2], [0, 1, 2]]);
  });

  it('reads empty content as no steps', () => {
    expect(fadedContent({ content: {} }).steps).toEqual([]);
  });

  it('warns about a sequence that does not fade', () => {
    expect(fadedWarnings(good)).toEqual([]);
    expect(fadedWarnings({ ...good, steps: [good.steps[1]!] }).join(' ')).toMatch(/One step[\s\S]*fully worked/);
    expect(fadedWarnings({ ...good, steps: [good.steps[0]!, good.steps[2]!, good.steps[1]!] })).toContain('Step 3 asks for less than step 2.');
    expect(fadedWarnings({ ...good, steps: [{ ...good.steps[0]!, question: undefined }, good.steps[1]!] })).toContain('Step 1 is worked and has no question about it.');
    expect(fadedWarnings({ ...good, steps: [good.steps[0]!, { ...good.steps[1]!, extract: 'One' }] })).toContain('Two steps use the same extract.');
  });

  it('rejects a blank that points past the parts, and more than 4 parts', () => {
    expect(() => BlockSchema.parse({ ...base, id: 'f2', block_type: 'faded_example', content: { ...faded, blanks: [3] } })).toThrow();
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `P${i}`, answer: 'x' }));
    expect(() => BlockSchema.parse({ ...base, id: 'f3', block_type: 'faded_example', content: { ...faded, parts: five, blanks: [] } })).toThrow();
  });

  it('rejects the same blank twice', () => {
    expect(() => BlockSchema.parse({ ...base, id: 'f4', block_type: 'faded_example', content: { ...faded, blanks: [1, 1] } })).toThrow();
  });

  it('allows both inside a section', () => {
    const s = BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'G', tutorial_group: 'g1', blocks: [
      { ...base, id: 'f1', block_type: 'faded_example', content: faded },
      { ...base, id: 'w1', block_type: 'with_teacher', content: { talking_points: [] } }
    ] } });
    expect(s.block_type === 'section' && s.content.blocks).toHaveLength(2);
  });
});
