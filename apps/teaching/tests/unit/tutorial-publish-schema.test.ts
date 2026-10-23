// apps/teaching/tests/unit/tutorial-publish-schema.test.ts
import { describe, it, expect } from 'vitest';
import { PublishableLessonSchema } from '@/schemas/lesson';
import { PublishedLessonSchema } from '@/schemas/published-lesson';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z', schema_version: 1, content });
const q = (id: string) => b(id, 'quiz_question', { question: { id, kind: 'multiple_choice', prompt: 'Which?', marks: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: ['a'] } });
const lesson = (blocks: unknown[]) => ({
  id: 'l1', type: 'lesson', title: 'Structure', slug: 'structure', status: 'active', schema_version: 1, unit_id: 'u1', sequence: 0, blocks,
  created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z', pedagogical_mode: 'tutorial',
  tutorial: { class_id: 'class1', groups: [{ id: 'ga', name: 'A', why: '', goal: 'Today', gap_type: 'knowledge', students: ['st_ann'] }] }
});

describe('tutorial publish rules', () => {
  it('allows quiz questions in an exit check', () => {
    const ok = PublishableLessonSchema.safeParse(lesson([
      b('t', 'section', { title: 'A', tutorial_group: 'ga', blocks: [b('w', 'with_teacher', { talking_points: [] })] }),
      b('e', 'section', { title: 'Exit', tutorial_group: 'ga', tutorial_exit: true, blocks: [q('q1')] })
    ]));
    expect(ok.success).toBe(true);
  });

  it('refuses a tutorial with tutorial issues', () => {
    const bad = PublishableLessonSchema.safeParse(lesson([]));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toContain('Group “A” has no tab.');
  });

  it('a published lesson can be a tutorial', () => {
    expect(PublishedLessonSchema.shape.pedagogical_mode.parse('tutorial')).toBe('tutorial');
  });
});
