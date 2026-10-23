import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { LessonSchema } from '@/schemas/lesson';
import { TutorialSettingsSchema } from '@/tutorial/schema';

const base = { type: 'block', visibility: 'student_teacher', variant: 'medium', created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z', schema_version: 1 } as const;
const group = { id: 'g1', name: 'Re-tells the plot', why: 'Describes what happens instead of the effect.', goal: 'Today: explaining the effect', gap_type: 'knowledge', students: ['st_ann'], evidence: [{ student: 'st_ann', quote: 'Named it “it goes back to the start”' }] };

describe('tutorial schema', () => {
  it('keeps tutorial_group and tutorial_exit on a section', () => {
    const s = BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'Group 1', blocks: [], tutorial_group: 'g1', tutorial_exit: true } });
    expect(s.block_type === 'section' && s.content).toMatchObject({ tutorial_group: 'g1', tutorial_exit: true });
  });

  it('parses settings and rejects a bad gap type', () => {
    expect(TutorialSettingsSchema.parse({ class_id: 'class1', groups: [group] }).groups[0]!.evidence).toHaveLength(1);
    expect(() => TutorialSettingsSchema.parse({ class_id: 'class1', groups: [{ ...group, gap_type: 'other' }] })).toThrow();
  });

  it('defaults evidence and caps groups at 8', () => {
    const { evidence: _e, ...bare } = group;
    expect(TutorialSettingsSchema.parse({ class_id: 'c', groups: [bare] }).groups[0]!.evidence).toEqual([]);
    expect(() => TutorialSettingsSchema.parse({ class_id: 'c', groups: Array.from({ length: 9 }, (_, i) => ({ ...group, id: `g${i}` })) })).toThrow();
  });

  it('keeps tutorial on a lesson', () => {
    const lesson = LessonSchema.parse({
      id: 'l1', type: 'lesson', title: 'T', slug: 't', unit_id: 'u1', sequence: 0, blocks: [],
      status: 'active', schema_version: 1,
      created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z',
      pedagogical_mode: 'tutorial', tutorial: { class_id: 'class1', groups: [group] }
    });
    expect(lesson.tutorial?.groups[0]!.name).toBe('Re-tells the plot');
  });
});
