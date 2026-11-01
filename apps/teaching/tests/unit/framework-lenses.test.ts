import { describe, expect, it } from 'vitest';
import { STEPPED_LENSES, steppedLens } from '@/blocks/lenses/registry';
import { PLANNING_FIELDS } from '@/blocks/walkthru-note/planning';
import { techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';

const FRAMEWORKS = ['fw_rosenshine', 'fw_willingham', 'fw_marge', 'fw_wiliam', 'fw_berger'];

describe('framework lenses', () => {
  it('registers the five frameworks once each, in the Frameworks group', () => {
    for (const id of FRAMEWORKS) expect(steppedLens(id)?.group).toBe('Frameworks');
    expect(new Set(STEPPED_LENSES.map((l) => l.id)).size).toBe(STEPPED_LENSES.length);
  });

  it('every lens writes steps and a write-it-down at every level, and names its source as a framework chapter', () => {
    for (const id of FRAMEWORKS) {
      const lens = steppedLens(id)!;
      expect(lens.path).toMatch(/framework chapter/);
      for (const level of ['support', 'core', 'extend'] as const) {
        const config = lens.create({ block_type: 'rich_text' } as never);
        const steps = lens.steps(config, { level, block: {} as never });
        expect(steps.length).toBeGreaterThanOrEqual(4);
        for (const step of steps) {
          expect(step.title).toBeTruthy();
          expect(step.prompt).toBeTruthy();
          expect(step.prompt.length).toBeLessThan(260);
        }
        const out = lens.writeItDown(config, { level, block: {} as never });
        expect(out.checklist.length).toBeGreaterThan(0);
        expect(out.example).toBeTruthy();
      }
    }
  });
});

describe('unit planning prompts', () => {
  it('every field points at a real technique', () => {
    expect(PLANNING_FIELDS.length).toBe(10);
    for (const field of PLANNING_FIELDS) expect(techniqueById(field.technique)).toBeTruthy();
  });
});

import { withWalkthruNote } from '@/blocks/walkthru-note/add-note';
import { renderFrameworkLenses } from '@/blocks/walkthru-note/planning';
import { markbookEvidence } from '@/evidence/markbook-evidence';

describe('unit-level framework lenses', () => {
  it('offers one button per framework (Willingham lives in Deep understandings) and adds the chosen lens', () => {
    const added: string[] = [];
    const host = renderFrameworkLenses((id) => { added.push(id); return true; })!;
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons).toHaveLength(4);
    expect(buttons.every((b) => /framework chapter/.test(b.title))).toBe(true);
    buttons[1]!.click();
    expect(added).toEqual(['fw_marge']);
    expect(host.textContent).toContain('added at the end of the plan');
  });
});

describe('WalkThru note on a lesson', () => {
  const lesson = { id: 'l1', blocks: [] as never[] };
  it('adds one teacher-only note carrying the id and no text, once', () => {
    const next = withWalkthruNote(lesson, 'w1-cold-calling', 'block_1');
    expect(next.blocks).toHaveLength(1);
    const note = next.blocks[0] as { block_type: string; visibility: string; content: { walkthru: unknown } };
    expect(note.block_type).toBe('teacher_note');
    expect(note.visibility).toBe('teacher_only');
    expect(note.content.walkthru).toEqual({ set: 1, id: 'w1-cold-calling', jots: {} });
    expect(withWalkthruNote(next, 'w1-cold-calling', 'block_2')).toBe(next);
    expect(withWalkthruNote(lesson, 'not-a-technique', 'block_3')).toBe(lesson);
  });
});

describe('timing evidence', () => {
  it('counts blank items at the end of a timed quiz and ignores untimed ones', () => {
    const row = (id: string, unanswered?: true) => ({ id, awarded: 0, max: 1, confidence: null, outcomes: [], items: [], ...(unanswered ? { unanswered } : {}) });
    const quiz = (timed: boolean) => ({ kind: 'quiz', id: 'quiz:q', lesson_id: 'q', title: 'Q', date: '2026-10-01', hidden: false, confidence: false, timed, questions: [], scores: { s1: { attempt_id: 'a', submitted_at: '2026-10-01T00:00:00.000Z', score: 0, max: 3, pending: 0, rows: [row('1'), row('2', true), row('3', true)] } } });
    const view = (timed: boolean) => ({ markbook: { columns: [], marks: {}, groups: [], history: [], hidden_quizzes: [] }, students: [], quizzes: [quiz(timed)] }) as never;
    expect(markbookEvidence(view(true)).timing).toEqual({ 'quiz:q': { s1: 2 } });
    expect(markbookEvidence(view(false)).timing).toEqual({});
  });
});
