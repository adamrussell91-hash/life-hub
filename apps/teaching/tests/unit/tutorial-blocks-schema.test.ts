import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';

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

describe('tutorial block schemas', () => {
  it('parses a with_teacher block', () => {
    const b = BlockSchema.parse({ ...base, id: 'w1', block_type: 'with_teacher', content: { talking_points: ['Ask: what does the reader feel?'] } });
    expect(b.block_type).toBe('with_teacher');
  });

  it('parses a faded example and keeps blanks', () => {
    const b = BlockSchema.parse({ ...base, id: 'f1', block_type: 'faded_example', content: faded });
    expect(b.block_type === 'faded_example' && b.content.blanks).toEqual([2]);
  });

  it('rejects a blank that points past the parts, and more than 4 parts', () => {
    expect(() => BlockSchema.parse({ ...base, id: 'f2', block_type: 'faded_example', content: { ...faded, blanks: [3] } })).toThrow();
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `P${i}`, answer: 'x' }));
    expect(() => BlockSchema.parse({ ...base, id: 'f3', block_type: 'faded_example', content: { ...faded, parts: five, blanks: [] } })).toThrow();
  });

  it('allows both inside a section', () => {
    const s = BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'G', tutorial_group: 'g1', blocks: [
      { ...base, id: 'f1', block_type: 'faded_example', content: faded },
      { ...base, id: 'w1', block_type: 'with_teacher', content: { talking_points: [] } }
    ] } });
    expect(s.block_type === 'section' && s.content.blocks).toHaveLength(2);
  });
});
