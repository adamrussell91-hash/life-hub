import { describe, expect, it, vi } from 'vitest';

vi.mock('@/evidence/context', () => ({
  loadInsightContext: async () => ({ table: null, skills: null, codes: [], outcomes: [] }),
  codeLabel: (id: string) => id
}));
const openFollowUpPlan = vi.fn();
vi.mock('@/evidence/follow-up', () => ({ openFollowUpPlan: (o: unknown) => openFollowUpPlan(o) }));

import { ClassSchema, type Class } from '@/schemas';
import type { Markbook } from '@/markbook/schema';
import type { MarkbookApi } from '@/markbook/api';
import type { MarkbookView, QuizColumn } from '@/markbook/types';
import { mountMarkbook } from '@/teacher/sections/markbook';

const cls: Class = ClassSchema.parse({
  id: 'class1', type: 'class', title: '12ENG', slug: '12eng', schema_version: 1, code: '12ENG', academic_year: 2026, year_id: 'year_12',
  subject_id: 'english', active_unit_ids: [], status: 'active', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }]
});

const students = [{ id: 's1', name: 'Bob Brown', initials: 'BB' }, { id: 's2', name: 'Tom Tills', initials: 'TT' }];

/** A quiz whose one question is tagged `tag`; s1 gets it wrong, s2 right. */
const quiz = (lessonId: string, date: string, tag: string, extra: Partial<QuizColumn> = {}): QuizColumn => {
  const row = (awarded: number) => ({ id: 'q1', awarded, max: 1, confidence: null, outcomes: [], items: [{ item: 'q1', tags: [tag], share: awarded, why: [] }] });
  return {
    kind: 'quiz', id: `quiz:${lessonId}`, lesson_id: lessonId, title: `Quiz ${lessonId}`, unit_id: `unit-${lessonId}`, date, hidden: false, confidence: false,
    questions: [{ id: 'q1', prompt: 'Name it', marks: 1, outcomes: [] }],
    scores: {
      s1: { attempt_id: 'a~0', submitted_at: '', score: 0, max: 1, pending: 0, rows: [row(0)] },
      s2: { attempt_id: 'b~0', submitted_at: '', score: 1, max: 1, pending: 0, rows: [row(1)] }
    },
    ...extra
  };
};

const emptyBook = (over: Partial<Markbook> = {}): Markbook => ({ columns: [], hidden_quizzes: [], marks: {}, updated_at: '', ...over });

async function openPatterns(view: MarkbookView) {
  const host = document.createElement('div');
  document.body.append(host);
  const api = { load: vi.fn(async () => structuredClone(view)) } as unknown as MarkbookApi;
  mountMarkbook(host, cls, { api, narrow: () => false, today: () => '2026-11-03' });
  await vi.waitFor(() => expect(host.querySelector('.mb-grid')).not.toBeNull());
  host.querySelector<HTMLButtonElement>('.mb__toggle')!.click();
  await vi.waitFor(() => expect(host.querySelector('.mb-patterns')).not.toBeNull());
  return host;
}

/** Opens the first group on the row for `name`, then presses its Ann button. */
function followUpFrom(host: HTMLElement, name: string): void {
  const row = [...host.querySelectorAll('.mb-patterns__table tr')].find((tr) => tr.textContent?.includes(name))!;
  expect(row).toBeTruthy();
  row.querySelector<HTMLButtonElement>('.mb-patterns__group')!.click();
  const ann = [...host.querySelectorAll<HTMLButtonElement>('.mb-patterns__expand button')].find((b) => b.textContent === 'Ann drafts follow-up quiz')!;
  expect(ann).toBeTruthy();
  ann.click();
}

describe('markbook Patterns follow-up', () => {
  it('opens the plan sheet from the latest shown quiz on that tag, with no flag', async () => {
    openFollowUpPlan.mockClear();
    const host = await openPatterns({
      markbook: emptyBook({ hidden_quizzes: ['l3'] }),
      students,
      quizzes: [quiz('l1', '2026-10-01', 'out:o2'), quiz('l2', '2026-10-10', 'out:o2'), quiz('l3', '2026-10-20', 'out:o2', { hidden: true })]
    });
    followUpFrom(host, 'o2');
    expect(openFollowUpPlan).toHaveBeenCalledTimes(1);
    const o = openFollowUpPlan.mock.calls[0][0];
    expect(o).toMatchObject({ sourceLessonId: 'l2', sourceTitle: 'Quiz l2', unitId: 'unit-l2', flagId: null, tag: 'out:o2', students });
    expect(o.chosen).toEqual(['s1']);
    expect(o.evidence.length).toBeGreaterThan(0);
    host.remove();
  });

  it('says follow-ups need a quiz when the tag only has assessment marks', async () => {
    openFollowUpPlan.mockClear();
    const host = await openPatterns({
      markbook: emptyBook({
        columns: [{ id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 100, criteria: ['crit0001', 'crit0002', 'crit0003'].map((id) => ({ id, label: id, max: 20, outcomes: ['o9'] })) }],
        marks: { essay0001: { s1: { criteria: { crit0001: 5, crit0002: 5, crit0003: 5 } }, s2: { criteria: { crit0001: 18, crit0002: 18, crit0003: 18 } } } }
      }),
      students,
      quizzes: []
    });
    followUpFrom(host, 'o9');
    expect(openFollowUpPlan).not.toHaveBeenCalled();
    expect(host.querySelector('.mb__status')?.textContent).toBe('Follow-ups start from a quiz; this tag only has assessment marks.');
    host.remove();
  });
});
