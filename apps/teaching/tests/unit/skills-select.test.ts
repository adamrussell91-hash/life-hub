import { describe, expect, it } from 'vitest';
import { skillSelect } from '@/skills/select';
import type { SkillsContinuum } from '@/skills/schema';

const skills = {
  strands: [{ strand: 'reading', name: 'Reading', sub_strands: [{ id: 'inference', name: 'Inference' }] }]
} as unknown as SkillsContinuum;

describe('skillSelect', () => {
  it('lists sub-strands as strand.sub and keeps the value', () => {
    const s = skillSelect('reading.inference', skills, 'x');
    expect([...s.options].map((o) => o.value)).toEqual(['', 'reading.inference']);
    expect(s.value).toBe('reading.inference');
    expect(s.className).toBe('x');
  });
  it('keeps a saved value while the list loads', () => {
    const s = skillSelect('reading.inference', null, 'x');
    expect(s.value).toBe('reading.inference');
  });
});
