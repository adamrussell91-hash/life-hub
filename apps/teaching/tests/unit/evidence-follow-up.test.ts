import { describe, expect, it, vi } from 'vitest';
import { annBrief, startFollowUp } from '@/evidence/follow-up';
import type { Evidence } from '@/evidence/types';

const ev = (student: string, why: Evidence['why'], share = 0): Evidence => ({ item: 'q1', tags: ['tech:personification'], share, why, student, source: 'quiz:l1', date: '2026-10-20', confidence: 3 });
const evidence = [
  ev('s1', [{ type: 'named', as: 'tech:metaphor', target: 'tech:personification' }]),
  ev('s2', [{ type: 'named', as: 'tech:metaphor', target: 'tech:personification' }]),
  ev('s3', [{ type: 'option', id: 'x', text: 'It describes the sky' }]),
  ev('s9', [{ type: 'named', as: 'tech:simile', target: 'tech:personification' }])
];
const label = (t: string) => (t === 'tech:metaphor' ? 'Metaphor' : t === 'tech:simile' ? 'Simile' : 'Personification');

describe('annBrief', () => {
  it('names the tag, the shared mistakes of the chosen students, the count, and says go ahead, with no names', () => {
    const brief = annBrief({ tag: 'tech:personification', students: ['s1', 's2', 's3'], evidence, label, codeLabel: (id) => id, sourceTitle: 'Pre-test', count: 5 });
    expect(brief).toMatch(/go ahead/i);
    expect(brief).toContain('5 questions');
    expect(brief).toContain('Personification');
    expect(brief).toContain('Personification named as Metaphor (2 students)');
    expect(brief).not.toContain('Simile');
    expect(brief).not.toMatch(/s1|s2|s3/);
  });

  it('stays within the job API limit', () => {
    const brief = annBrief({ tag: 'tech:personification', students: ['s1'], evidence, label, codeLabel: (id) => id, sourceTitle: 'x'.repeat(20000), count: 5 });
    expect(brief.length).toBeLessThanOrEqual(8000);
  });
});

describe('startFollowUp', () => {
  it('creates the lesson after the original with its settings, then starts Ann on it', async () => {
    const createLesson = vi.fn(async () => ({ id: 'lesson_new' }));
    const startJob = vi.fn(async () => ({ id: 'job1', status: 'working' as const }));
    const id = await startFollowUp(
      { sourceLessonId: 'l1', unitId: 'u1', flagId: 'sure_wrong:tech:personification', title: 'Follow-up: Personification', students: ['s1', 's2'], brief: 'Go ahead.' },
      { createLesson, startJob }
    );
    expect(id).toBe('lesson_new');
    expect(createLesson).toHaveBeenCalledWith({
      title: 'Follow-up: Personification', unit_id: 'u1', pedagogical_mode: 'quiz', after_lesson_id: 'l1',
      quiz: { for_students: ['s1', 's2'], follow_up_of: 'l1', follow_up_flag: 'sure_wrong:tech:personification', confidence: true }
    });
    expect(startJob).toHaveBeenCalledWith({ lesson_id: 'lesson_new', agent: 'ann', scope: 'lesson', message: 'Go ahead.' });
  });
});
