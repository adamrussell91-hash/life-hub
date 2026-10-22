import { describe, expect, it, vi, type Mock } from 'vitest';
import { ClassSchema, type Class } from '@/schemas';
import type { Markbook } from '@/markbook/schema';
import type { MarkbookApi } from '@/markbook/api';
import type { MarkbookView } from '@/markbook/types';
import { mountMarkbook } from '@/teacher/sections/markbook';

const cls: Class = ClassSchema.parse({
  id: 'class1', type: 'class', title: '12ENG', slug: '12eng', schema_version: 1, code: '12ENG', academic_year: 2026, year_id: 'year_12',
  subject_id: 'english', active_unit_ids: [], status: 'active', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }]
});

const book = (over: Partial<Markbook> = {}): Markbook => ({
  columns: [
    { id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 40, criteria: [{ id: 'c1', label: 'Analysis', max: 20, outcomes: [] }] },
    { id: 'hand00001', kind: 'handin', title: 'Draft', due: '2026-10-25' },
    { id: 'chck00001', kind: 'check', title: 'Bookwork', date: '2026-10-26', scale: 'four' }
  ],
  hidden_quizzes: [],
  marks: { essay0001: { s1: { criteria: { c1: 15 } } } },
  updated_at: '',
  ...over
});

function fakeApi(view: MarkbookView): MarkbookApi & { calls: unknown[][] } {
  let current = structuredClone(view);
  const calls: unknown[][] = [];
  return {
    calls,
    load: vi.fn(async () => structuredClone(current)),
    saveColumn: vi.fn(async () => current.markbook),
    deleteColumn: vi.fn(async () => current.markbook),
    hideQuiz: vi.fn(async (_c, lessonId, hidden) => {
      current.markbook.hidden_quizzes = hidden ? [lessonId] : [];
      return current.markbook;
    }),
    setMark: vi.fn(async (_c, columnId, studentId, mark) => {
      calls.push([columnId, studentId, mark]);
      const marks = { ...(current.markbook.marks[columnId] ?? {}) };
      if (mark === null) delete marks[studentId];
      else marks[studentId] = mark;
      current = { ...current, markbook: { ...current.markbook, marks: { ...current.markbook.marks, [columnId]: marks } } };
      return current.markbook;
    })
  };
}

const view = (over: Partial<MarkbookView> = {}): MarkbookView => ({
  markbook: book(),
  students: [{ id: 's2', name: 'Tom Tills', initials: 'TT' }, { id: 's1', name: 'Bob Brown', initials: 'BB' }],
  quizzes: [],
  ...over
});

const mount = async (v: MarkbookView, narrow = false) => {
  const host = document.createElement('div');
  document.body.append(host);
  const api = fakeApi(v);
  mountMarkbook(host, cls, { api, narrow: () => narrow, today: () => '2026-11-03' });
  await vi.waitFor(() => expect(host.querySelector('.mb-grid, .mb-phone, .mb__empty')).not.toBeNull());
  return { host, api };
};

describe('markbook section', () => {
  it('draws students by surname, columns by date, and the overall mark', async () => {
    const { host } = await mount(view());
    expect([...host.querySelectorAll('.mb-grid__student .mb-student__initials')].map((n) => n.textContent)).toEqual(['BB', 'TT']);
    expect([...host.querySelectorAll('.mb-col__title')].map((n) => n.textContent)).toEqual(['Draft', 'Bookwork', 'Essay']);
    const bobRow = host.querySelectorAll('tbody tr')[0]!;
    expect(bobRow.querySelector('.mb-cell--assessment')?.textContent).toBe('15/20 · 75%');
    expect(bobRow.querySelector('.mb-grid__overall')?.textContent).toBe('75%');
  });

  it('warns when weights don’t add to 100', async () => {
    const { host } = await mount(view());
    expect(host.querySelector('.mb__warning')?.textContent).toBe('Assessment weights add to 40%, not 100%.');
  });

  it('cycles a hand-in with a tap and clears it with a right-click', async () => {
    const { host, api } = await mount(view());
    const cell = () => host.querySelectorAll('tbody tr')[0]!.querySelector<HTMLButtonElement>('.mb-cell--handin')!;
    cell().click();
    await vi.waitFor(() => expect(cell().textContent).toBe('Submitted'));
    await vi.waitFor(() => expect(api.calls[0]).toEqual(['hand00001', 's1', { status: 'submitted', at: '2026-11-03' }]));
    cell().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(cell().textContent).toBe('–'));
    await vi.waitFor(() => expect(api.calls[1]).toEqual(['hand00001', 's1', null]));
  });

  it('cycles a 1–4 check', async () => {
    const { host } = await mount(view());
    const cell = () => host.querySelectorAll('tbody tr')[1]!.querySelector<HTMLButtonElement>('.mb-cell--check')!;
    cell().click();
    await vi.waitFor(() => expect(cell().textContent).toBe('1'));
  });

  it('shows quiz scores with a pending dot, and hides a quiz', async () => {
    const quiz = { kind: 'quiz' as const, id: 'quiz:l1', lesson_id: 'l1', title: 'Quiz 1', date: '2026-10-20', hidden: false, confidence: false, questions: [], scores: { s1: { attempt_id: 'x~0', submitted_at: '', score: 3, max: 4, pending: 1, rows: [] } } };
    const { host } = await mount(view({ quizzes: [quiz] }));
    const cell = host.querySelectorAll('tbody tr')[0]!.querySelector('.mb-cell--quiz')!;
    expect(cell.textContent).toContain('75%');
    expect(cell.querySelector('.mb-cell__pending')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.mb-col__hide')!.click();
    await vi.waitFor(() => expect(host.querySelector('.mb-col--quiz')).toBeNull());
  });

  it('says what to do with an empty class list', async () => {
    const { host } = await mount(view({ students: [] }));
    expect(host.querySelector('.mb__empty')?.textContent).toBe('Add students to this class to start a markbook.');
  });

  it('shows removed students read-only', async () => {
    const { host } = await mount(view({ markbook: book({ marks: { essay0001: { s1: { criteria: { c1: 15 } } }, hand00001: { s9: { status: 'late', at: '2026-10-26' } } } }) }));
    host.querySelector<HTMLButtonElement>('.mb__removed')!.click();
    await vi.waitFor(() => expect(host.querySelectorAll('tbody tr')).toHaveLength(3));
    const removed = host.querySelectorAll('tbody tr')[2]!;
    expect(removed.querySelector('.mb-student__name')?.textContent).toBe('Removed student 1');
    expect(removed.querySelectorAll('button.mb-cell')).toHaveLength(0);
    expect(removed.querySelector('.mb-cell--handin')?.textContent).toBe('Late');
    expect(removed.querySelector('.mb-grid__overall')?.textContent).toBe('–');
  });

  it('sends three rapid taps in order and ends on the last one', async () => {
    const { host, api } = await mount(view());
    const cell = () => host.querySelectorAll('tbody tr')[0]!.querySelector<HTMLButtonElement>('.mb-cell--handin')!;
    cell().click();
    cell().click();
    cell().click();
    await vi.waitFor(() => expect(api.calls).toHaveLength(3));
    expect(api.calls).toEqual([
      ['hand00001', 's1', { status: 'submitted', at: '2026-11-03' }],
      ['hand00001', 's1', { status: 'late', at: '2026-11-03' }],
      ['hand00001', 's1', { status: 'missing' }]
    ]);
    await new Promise((r) => setTimeout(r, 0));
    expect(cell().textContent).toBe('Missing');
  });

  it('recovers from a failed save and keeps later queued taps', async () => {
    const { host, api } = await mount(view());
    (api.setMark as Mock).mockRejectedValueOnce(new Error('Server said no'));
    const row = (i: number) => host.querySelectorAll('tbody tr')[i]!;
    row(0).querySelector<HTMLButtonElement>('.mb-cell--handin')!.click();
    row(1).querySelector<HTMLButtonElement>('.mb-cell--check')!.click();
    await vi.waitFor(() => expect(api.calls).toEqual([['chck00001', 's2', 1]]));
    expect(api.load).toHaveBeenCalledTimes(2);
    await new Promise((r) => setTimeout(r, 0));
    expect(host.querySelector('.mb__status')?.textContent).toBe('Server said no');
    expect(row(0).querySelector('.mb-cell--handin')?.textContent).toBe('–');
    expect(row(1).querySelector('.mb-cell--check')?.textContent).toBe('1');
    row(0).querySelector<HTMLButtonElement>('.mb-cell--handin')!.click();
    expect(host.querySelector('.mb__status')?.textContent).toBe('');
    await vi.waitFor(() => expect(api.calls[1]).toEqual(['hand00001', 's1', { status: 'submitted', at: '2026-11-03' }]));
    expect(row(0).querySelector('.mb-cell--handin')?.textContent).toBe('Submitted');
  });

  it('keeps focus on the tapped cell', async () => {
    const { host } = await mount(view());
    const cell = host.querySelectorAll('tbody tr')[1]!.querySelector<HTMLButtonElement>('.mb-cell--check')!;
    cell.focus();
    cell.click();
    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(cell);
    expect(active.dataset.col).toBe('chck00001');
    expect(active.dataset.student).toBe('s2');
    expect(active.textContent).toBe('1');
  });

  it('clears a hand-in with Delete', async () => {
    const { host, api } = await mount(view({ markbook: book({ marks: { hand00001: { s1: { status: 'late', at: '2026-10-26' } } } }) }));
    const cell = () => host.querySelectorAll('tbody tr')[0]!.querySelector<HTMLButtonElement>('.mb-cell--handin')!;
    expect(cell().getAttribute('aria-label')).toBe('Draft, Bob Brown: Late, Delete to clear');
    cell().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.calls[0]).toEqual(['hand00001', 's1', null]));
    expect(cell().textContent).toBe('–');
  });

  it('unhides a hidden quiz from the list', async () => {
    const quiz = { kind: 'quiz' as const, id: 'quiz:l1', lesson_id: 'l1', title: 'Quiz 1', date: '2026-10-20', hidden: false, confidence: false, questions: [], scores: {} };
    const { host, api } = await mount(view({ quizzes: [quiz] }));
    const hiddenToggle = () => host.querySelector<HTMLButtonElement>('.mb__hidden-toggle')!;
    expect(hiddenToggle().hidden).toBe(true);
    host.querySelector<HTMLButtonElement>('.mb-col__hide')!.click();
    await vi.waitFor(() => expect(api.hideQuiz).toHaveBeenCalledWith('class1', 'l1', true));
    expect(hiddenToggle().hidden).toBe(false);
    expect(hiddenToggle().textContent).toBe('Hidden quizzes (1)');
    hiddenToggle().click();
    expect(host.querySelector('.mb__hidden-list')?.textContent).toContain('Quiz 1');
    host.querySelector<HTMLButtonElement>('.mb__unhide')!.click();
    await vi.waitFor(() => expect(api.hideQuiz).toHaveBeenCalledWith('class1', 'l1', false));
    await vi.waitFor(() => expect(host.querySelector('.mb-col--quiz')).not.toBeNull());
    expect(hiddenToggle().hidden).toBe(true);
  });

  it('keeps the Outcomes label and marks the mode with aria-pressed', async () => {
    const { host } = await mount(view());
    const toggle = host.querySelector<HTMLButtonElement>('.mb__toggle')!;
    toggle.click();
    expect(toggle.textContent).toBe('Outcomes');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});
