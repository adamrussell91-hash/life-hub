// apps/teaching/tests/unit/sprint-schema.test.ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { LessonSchema } from '@/schemas/lesson';
import { PublishedLessonSchema } from '@/schemas/published-lesson';
import { SketchPayloadSchema, SprintSettingsSchema, SPRINT_PHASES } from '@/sprint/schema';

const phase = (key: string, where: 'class' | 'home') => ({ key, where, due_date: '2026-10-28', due_time: '15:00' });
export const settings = () => ({
  class_id: 'class1',
  criteria: [{ id: 'c1', text: 'Uses sources', outcome: 'ht4-9' }, { id: 'c2', text: 'Explains why it matters' }],
  idea_guide: { checklist: ['It answers our group question.'], model: { topic: 'The Great Wall', text: 'What if…', notes: [] } },
  phases: [phase('understand', 'class'), phase('sketch', 'home'), phase('decide', 'class'), phase('prototype', 'home'), phase('test', 'class')],
  groups: [{ id: 'g1', name: 'Kestrel', students: ['st_ann', 'st_cy'] }]
});

describe('sprint schema', () => {
  it('fills defaults: teacher decides, standard support, 2 hour lock', () => {
    const s = SprintSettingsSchema.parse(settings());
    expect(s.decider).toBe('teacher');
    expect(s.support).toBe('standard');
    expect(s.lock_hours).toBe(2);
    expect(s.requirements).toEqual([]);
    expect(s.phases[1]!.ends_at).toBe('');
  });

  it('needs exactly five phases in order', () => {
    expect(() => SprintSettingsSchema.parse({ ...settings(), phases: settings().phases.slice(0, 4) })).toThrow();
    const swapped = settings().phases;
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(() => SprintSettingsSchema.parse({ ...settings(), phases: swapped })).toThrow(/order/);
    expect(SPRINT_PHASES).toEqual(['understand', 'sketch', 'decide', 'prototype', 'test']);
  });

  it('caps the lock at 24 hours and ideas at 5', () => {
    expect(() => SprintSettingsSchema.parse({ ...settings(), lock_hours: 25 })).toThrow();
    const p = settings().phases;
    p[1] = { ...p[1]!, ideas: 6 } as typeof p[1];
    expect(() => SprintSettingsSchema.parse({ ...settings(), phases: p })).toThrow();
  });

  it('keeps sprint_phase on a section and sprint on a lesson', () => {
    const s = BlockSchema.parse({ id: 's1', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', created_at: '2026-10-24T00:00:00.000Z', updated_at: '2026-10-24T00:00:00.000Z', schema_version: 1, content: { title: 'Sketch', blocks: [], sprint_phase: 'sketch' } });
    expect(s.block_type === 'section' && s.content.sprint_phase).toBe('sketch');
    const lesson = LessonSchema.parse({
      id: 'l1', type: 'lesson', title: 'Pompeii', slug: 'pompeii', unit_id: 'u1', sequence: 0, blocks: [], status: 'active', schema_version: 1,
      created_at: '2026-10-24T00:00:00.000Z', updated_at: '2026-10-24T00:00:00.000Z',
      pedagogical_mode: 'design_sprint', sprint: settings()
    });
    expect(lesson.sprint?.groups[0]!.name).toBe('Kestrel');
  });

  it('lets a published lesson carry design_sprint and its public subset', () => {
    const p = PublishedLessonSchema.parse({
      lesson_id: 'l1', title: 'Pompeii', unit_id: 'u1', blocks: [], published_at: '2026-10-24T00:00:00.000Z', schema_version: 1,
      pedagogical_mode: 'design_sprint',
      sprint: { support: 'guided', lock_hours: 2, criteria: [{ id: 'c1', text: 'Uses sources' }], reflection_criteria: [], reflection_prompts: [], requirements: [], idea_guide: settings().idea_guide, phases: settings().phases.map((x) => ({ ...x, ends_at: '', instruction: '', stretch: '' })) }
    });
    expect(p.sprint?.support).toBe('guided');
  });

  it('caps sketch cards at five and trims text', () => {
    const card = { id: 'k1', title: '  Ash  ', idea: 'x', answers: 'y', evidence: 'z', criteria: {}, requirements: {}, value_answer: '' };
    expect(SketchPayloadSchema.parse({ cards: [card], strongest: 'k1', strongest_why: '' }).cards[0]!.title).toBe('Ash');
    expect(() => SketchPayloadSchema.parse({ cards: Array.from({ length: 6 }, (_, i) => ({ ...card, id: `k${i}` })), strongest: '', strongest_why: '' })).toThrow();
  });
});
