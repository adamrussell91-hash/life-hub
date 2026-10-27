import { describe, it, expect } from 'vitest';
import { checkProposalCall } from '@/ai/job-runner';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import { listPartialAcceptUnits, filterProposal } from '@/ai/partial-accept';
import { BLOCK_BUILD_RECIPES } from '@/ai/block-recipes';
import { buildAiLessonContext } from '@/ai/context';
import type { Lesson } from '@/schemas/lesson';

const NOW = '2026-10-27T00:00:00.000Z';
const lessonOf = (extra: Record<string, unknown> = {}) =>
  ({ id: 'cs1', type: 'lesson', title: 'Case', slug: 'case', status: 'active', unit_id: 'u1', sequence: 1, blocks: [], created_at: NOW, updated_at: NOW, schema_version: 1, pedagogical_mode: 'case_study', ...extra }) as unknown as Lesson;
const doc = (id: string) => ({ id, kind: 'memo', title: 'Memo', source: 'Council memo', text: 'The wall moved.' });
const patch = {
  purpose: 'weigh a slow-building risk',
  parts: [{ id: 'p1', title: 'File', docs: [doc('d1')] }],
  decision: { prompt: 'What do you do?', options: [{ id: 'o1', label: 'Close' }, { id: 'o2', label: 'Wait' }] }
};

describe('Ann writes case study settings', () => {
  it('accepts a patch and merges it onto the lesson, keeping the class', () => {
    const proposal = checkProposalCall('propose_update_case', { case: patch }, lessonOf());
    expect(typeof proposal).not.toBe('string');
    const lesson = lessonOf({ case: { class_id: 'class_a', pace: 'own', purpose: '', parts: [], objections: [], outcomes: [], flow: 'A', support: 'standard', release: 'whole' } });
    const result = applyProposalToLesson(lesson, proposal as never, () => 'x');
    expect(result.ok).toBe(true);
    expect(result.lesson.case?.class_id).toBe('class_a');
    expect(result.lesson.case?.pace).toBe('own');
    expect(result.lesson.case?.parts).toHaveLength(1);
    expect(result.lesson.case?.decision?.options).toHaveLength(2);
  });

  it('refuses a lesson that is not a case study', () => {
    const proposal = checkProposalCall('propose_update_case', { case: patch }, lessonOf());
    const result = applyProposalToLesson(lessonOf({ pedagogical_mode: 'lesson' }), proposal as never, () => 'x');
    expect(result.ok).toBe(false);
  });

  it('tells Ann when an id is reused, so she can retry', () => {
    const reused = { ...patch, transfer: { title: 'Oval', docs: [doc('d1')], question: 'What now?' } };
    const out = checkProposalCall('propose_update_case', { case: reused }, lessonOf());
    expect(typeof out).toBe('string');
    expect(out).toContain('d1');
  });

  it('refuses an empty patch and keeps class and flow out of reach', () => {
    expect(typeof checkProposalCall('propose_update_case', { case: {} }, lessonOf())).toBe('string');
    const sneaky = checkProposalCall('propose_update_case', { case: { class_id: 'other', purpose: 'x' } }, lessonOf());
    const result = applyProposalToLesson(lessonOf({ case: { class_id: 'mine', parts: [], objections: [], outcomes: [], flow: 'A', pace: 'teacher', support: 'standard', release: 'whole', purpose: '' } }), sneaky as never, () => 'x');
    expect(result.lesson.case?.class_id).toBe('mine');
  });

  it('is accepted whole, and the recipe and prompt name the tool', () => {
    const proposal = checkProposalCall('propose_update_case', { case: patch }, lessonOf()) as never;
    expect(listPartialAcceptUnits(proposal)).toEqual([]);
    expect(filterProposal(proposal, new Set()).ok).toBe(true);
    expect(BLOCK_BUILD_RECIPES).toContain('propose_update_case');
    expect(BLOCK_BUILD_RECIPES).toContain('Never invent the outcome');
  });
});
