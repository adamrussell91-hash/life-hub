import { describe, expect, it } from 'vitest';
import type { PointChain } from '@/evidence/syllabus';
import type { Evidence } from '@/evidence/types';
import { readyToPass, skillRungOf, skillsForDu } from '@/deep/progress-extras';

const ev = (student: string, item: string, share: number | null, tags: string[] = [], source = 'quiz:l1'): Evidence => ({ item, tags, share, why: [], student, source, date: '2026-10-01', confidence: null });
const chain = { skills: new Map([['reading.infer', ['texts:R2']], ['write.craft', ['texts:R3']], ['write.plan', ['other:R2']]]) } as unknown as PointChain;
const block = (id: string, steps: unknown) => ({ id, type: 'block', block_type: 'quiz_question', content: {}, settings: { deep_step: steps } });

describe('skills a deep understanding needs', () => {
  it('lists skills whose R points the understanding names, and none without a chain', () => {
    expect(skillsForDu({ dot_points: ['texts:U1', 'texts:R2', 'other:R2'] }, chain)).toEqual(['reading.infer', 'write.plan']);
    expect(skillsForDu({ dot_points: ['texts:R2'] }, null)).toEqual([]);
  });
});

describe('skill rungs', () => {
  it('reads each skill on its own and leaves a skill with no marks empty', () => {
    const marks = [ev('a', 'q1', 1, ['skill:reading.infer']), ev('a', 'q2', 1, ['skill:reading.infer']), ev('a', 'q3', 0.45, ['skill:write.craft']), ev('a', 'q4', 0.45, ['skill:write.craft'])];
    expect(skillRungOf(marks, 'a', 'reading.infer')).toBe('excellent');
    expect(skillRungOf(marks, 'a', 'write.craft')).toBe('capable');
    expect(skillRungOf(marks, 'a', 'write.plan')).toBeNull();
    expect(skillRungOf(marks, 'b', 'reading.infer')).toBeNull();
  });
});

describe('ready to pass', () => {
  const lessons = [{ id: 'l1', blocks: [block('b1', { du: 'du_aaaa', step: '2a' }), block('b2', [{ du: 'du_aaaa', step: '2b' }, { du: 'du_bbbb', step: '3' }])] }] as never;
  const run = (evidence: Evidence[], steps = {}) => readyToPass({ lessons, evidence, students: ['a', 'b'], steps });

  it('notes a student with full marks on the task for a step, once per step, and a single old step reads as one', () => {
    const r = run([ev('a', 'b1', 1), ev('a', 'b2#x', 1), ev('a', 'b2#y', 1), ev('b', 'b1', 0.5), ev('b', 'b2', null)]);
    expect([...r]).toEqual([['a|du_aaaa', ['2a', '2b']], ['a|du_bbbb', ['3']]]);
  });

  it('needs every item on the block full, and ignores other lessons', () => {
    expect(run([ev('a', 'b2#x', 1), ev('a', 'b2#y', 0.5)]).size).toBe(0);
    expect(run([ev('a', 'b1', 1, [], 'quiz:l9')]).size).toBe(0);
  });

  it('leaves out steps already passed and never passes anyone itself', () => {
    const r = run([ev('a', 'b1', 1), ev('a', 'b2', 1)], { a: { du_aaaa: { step: '2a', at: '2026-10-02' } } });
    expect([...r]).toEqual([['a|du_aaaa', ['2b']], ['a|du_bbbb', ['3']]]);
  });
});
