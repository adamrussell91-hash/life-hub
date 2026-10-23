import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/teacher/confirm-dialog', () => ({ askConfirmCard: vi.fn() }));
vi.mock('@/evidence/context', () => ({
  loadInsightContext: async () => ({ table: null, skills: null, codes: [], outcomes: [] }),
  codeLabel: (id: string) => id
}));

import { askConfirmCard } from '@/teacher/confirm-dialog';
import { ClassSchema, type Class } from '@/schemas';
import type { Markbook } from '@/markbook/schema';
import type { MarkbookApi } from '@/markbook/api';
import type { MarkbookView } from '@/markbook/types';
import { mountMarkbook } from '@/teacher/sections/markbook';
import { withAppBase } from '@/app/base-path';
import { ApiClientError } from '@/api/client';

const cls: Class = ClassSchema.parse({
  id: 'class1', type: 'class', title: '12ENG', slug: '12eng', schema_version: 1, code: '12ENG', academic_year: 2026, year_id: 'year_12',
  subject_id: 'english', active_unit_ids: [], status: 'active', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }]
});

const book = (over: Partial<Markbook> = {}): Markbook => ({
  columns: [
    { id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 40, criteria: [{ id: 'crit0001', label: 'Analysis', max: 20, outcomes: [] }] },
    { id: 'hand00001', kind: 'handin', title: 'Draft', due: '2026-10-25' },
    { id: 'chck00001', kind: 'check', title: 'Bookwork', date: '2026-10-26', scale: 'four' }
  ],
  hidden_quizzes: [],
  marks: { essay0001: { s1: { criteria: { crit0001: 15 } } } },
  updated_at: '',
  ...over
});

function fakeApi(view: MarkbookView): MarkbookApi & { calls: unknown[][] } {
  let current = structuredClone(view);
  const calls: unknown[][] = [];
  return {
    calls,
    load: vi.fn(async () => structuredClone(current)),
    saveColumn: vi.fn(async (_c, column) => {
      const columns = current.markbook.columns.some((c) => c.id === column.id)
        ? current.markbook.columns.map((c) => (c.id === column.id ? column : c))
        : [...current.markbook.columns, column];
      current = { ...current, markbook: { ...current.markbook, columns } };
      return current.markbook;
    }),
    deleteColumn: vi.fn(async (_c, columnId) => {
      const { [columnId]: _gone, ...marks } = current.markbook.marks;
      current = { ...current, markbook: { ...current.markbook, columns: current.markbook.columns.filter((c) => c.id !== columnId), marks } };
      return current.markbook;
    }),
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
    }),
    setFocus: vi.fn(async (_c, studentId, pinned, dismissed) => {
      const focus = { ...(current.markbook.focus ?? {}) };
      if (!pinned.length && !dismissed.length) delete focus[studentId];
      else focus[studentId] = { pinned, dismissed };
      current = { ...current, markbook: { ...current.markbook, focus } };
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
    const { host } = await mount(view({ markbook: book({ marks: { essay0001: { s1: { criteria: { crit0001: 15 } } }, hand00001: { s9: { status: 'late', at: '2026-10-26' } } } }) }));
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

  it('keeps the Patterns label and marks the mode with aria-pressed', async () => {
    const { host } = await mount(view());
    const toggle = host.querySelector<HTMLButtonElement>('.mb__toggle')!;
    toggle.click();
    expect(toggle.textContent).toBe('Patterns');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('rolls a failed save back even when the reload fails too', async () => {
    const { host, api } = await mount(view({ markbook: book({ marks: { hand00001: { s1: { status: 'late', at: '2026-10-26' } } } }) }));
    (api.setMark as Mock).mockRejectedValueOnce(new Error('Server said no'));
    (api.load as Mock).mockRejectedValueOnce(new Error('offline'));
    const cell = () => host.querySelectorAll('tbody tr')[0]!.querySelector<HTMLButtonElement>('.mb-cell--handin')!;
    cell().click();
    expect(cell().textContent).toBe('Missing');
    await vi.waitFor(() => expect(host.querySelector('.mb__status')?.textContent).toBe('Couldn’t save that, and couldn’t reach the server. Check your connection.'));
    expect(cell().textContent).toBe('Late');
  });

  it('shows the server’s message when the markbook can’t be read', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi(view());
    (api.load as Mock).mockRejectedValueOnce(new ApiClientError({ code: 'markbook_unreadable', message: 'This markbook couldn’t be read. Nothing was changed.' }));
    mountMarkbook(host, cls, { api, narrow: () => false, today: () => '2026-11-03' });
    await vi.waitFor(() => expect(host.querySelector('.mb__status')?.textContent).toBe('This markbook couldn’t be read. Nothing was changed.'));
  });

  it('keeps the plain load message when the server can’t be reached', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi(view());
    (api.load as Mock).mockRejectedValueOnce(new ApiClientError({ code: 'network_error', message: 'Failed to fetch' }));
    mountMarkbook(host, cls, { api, narrow: () => false, today: () => '2026-11-03' });
    await vi.waitFor(() => expect(host.querySelector('.mb__status')?.textContent).toBe('Couldn’t load the markbook.'));
  });

  it('moves focus to the heading when the focused control goes away', async () => {
    const quiz = { kind: 'quiz' as const, id: 'quiz:l1', lesson_id: 'l1', title: 'Quiz 1', date: '2026-10-20', hidden: false, confidence: false, questions: [], scores: {} };
    const { host } = await mount(view({ quizzes: [quiz] }));
    const hide = host.querySelector<HTMLButtonElement>('.mb-col__hide')!;
    hide.focus();
    hide.click();
    expect(document.activeElement).toBe(host.querySelector('.mb__title'));
    expect(host.querySelector<HTMLElement>('.mb__title')!.tabIndex).toBe(-1);
  });

  it('gives the full student name as a tooltip', async () => {
    const { host } = await mount(view());
    expect(host.querySelector<HTMLElement>('.mb-student__name')!.title).toBe('Bob Brown');
  });

  it('adds an assessment task from the Add task pill', async () => {
    const { host, api } = await mount(view());
    const pill = [...host.querySelectorAll<HTMLButtonElement>('.mb__add-kind')].find((b) => b.textContent === 'Add task')!;
    pill.click();
    const form = document.querySelector<HTMLElement>('.mb-form')!;
    expect(document.getElementById(form.getAttribute('aria-labelledby')!)?.textContent).toBe('Add assessment task');
    const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    const type = (name: string, value: string) => {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input'));
    };
    type('title', 'Speech');
    type('weight', '60');
    type('criterion-label', 'Delivery');
    type('criterion-max', '10');
    form.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(api.saveColumn).toHaveBeenCalled());
    expect((api.saveColumn as Mock).mock.calls[0]![1]).toMatchObject({ kind: 'assessment', title: 'Speech', date: '2026-11-03', weight: 60 });
    await vi.waitFor(() => expect([...host.querySelectorAll('.mb-col__title')].map((n) => n.textContent)).toContain('Speech'));
    expect(document.querySelector('.mb-form')).toBeNull();
    expect(host.querySelector('.mb__warning')?.hidden).toBe(true);
  });

  it('opens a teacher column’s form filled in from its title', async () => {
    const { host, api } = await mount(view());
    const title = [...host.querySelectorAll<HTMLButtonElement>('.mb-col__title')].find((b) => b.textContent === 'Draft')!;
    title.click();
    const form = document.querySelector<HTMLElement>('.mb-form')!;
    expect(document.getElementById(form.getAttribute('aria-labelledby')!)?.textContent).toBe('Edit hand-in');
    expect(form.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Draft');
    expect(form.querySelector<HTMLInputElement>('[name="date"]')!.value).toBe('2026-10-25');
    const name = form.querySelector<HTMLInputElement>('[name="title"]')!;
    name.value = 'Final draft';
    form.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(api.saveColumn).toHaveBeenCalledWith('class1', { id: 'hand00001', kind: 'handin', title: 'Final draft', due: '2026-10-25' }));
    await vi.waitFor(() => expect([...host.querySelectorAll('.mb-col__title')].map((n) => n.textContent)).toEqual(['Final draft', 'Bookwork', 'Essay']));
  });

  it('shows a failed column save in the form and keeps it open', async () => {
    const { host, api } = await mount(view());
    (api.saveColumn as Mock).mockRejectedValueOnce(new Error('Server said no'));
    [...host.querySelectorAll<HTMLButtonElement>('.mb-col__title')].find((b) => b.textContent === 'Draft')!.click();
    const form = document.querySelector<HTMLElement>('.mb-form')!;
    form.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(form.querySelector('.mb-form__error')?.textContent).toBe('Server said no'));
    expect(document.body.contains(form)).toBe(true);
    form.querySelector<HTMLButtonElement>('.mb-form__actions .btn--secondary')!.click();
  });

  it('deletes a column through the form, and rolls a failed delete back', async () => {
    vi.mocked(askConfirmCard).mockResolvedValue(true);
    const { host, api } = await mount(view());
    const titles = () => [...host.querySelectorAll<HTMLButtonElement>('.mb-col__title')].map((n) => n.textContent);
    const remove = (name: string) => {
      [...host.querySelectorAll<HTMLButtonElement>('.mb-col__title')].find((b) => b.textContent === name)!.click();
      document.querySelector<HTMLButtonElement>('.mb-form__delete')!.click();
    };
    remove('Draft');
    await vi.waitFor(() => expect(titles()).toEqual(['Bookwork', 'Essay']));
    expect(document.querySelector('.mb-form')).toBeNull();
    await vi.waitFor(() => expect(api.deleteColumn).toHaveBeenCalledWith('class1', 'hand00001'));
    let refuse: () => void = () => {};
    const gate = new Promise<void>((r) => { refuse = r; });
    (api.deleteColumn as Mock).mockImplementationOnce(async () => {
      await gate;
      throw new Error('Server said no');
    });
    remove('Essay');
    await vi.waitFor(() => expect(titles()).toEqual(['Bookwork']));
    refuse();
    await vi.waitFor(() => expect(host.querySelector('.mb__status')?.textContent).toBe('Server said no'));
    expect(titles()).toEqual(['Bookwork', 'Essay']);
    expect(host.querySelectorAll('tbody tr')[0]!.querySelector('.mb-cell--assessment')?.textContent).toBe('15/20 · 75%');
    vi.mocked(askConfirmCard).mockReset();
  });

  it('returns focus to the column title when the form closes', async () => {
    const { host } = await mount(view());
    const title = () => [...host.querySelectorAll<HTMLButtonElement>('.mb-col__title')].find((b) => b.textContent === 'Draft')!;
    title().focus();
    title().click();
    expect(document.activeElement?.getAttribute('name')).toBe('title');
    document.querySelector<HTMLButtonElement>('.mb-form__actions .btn--secondary')!.click();
    expect(document.querySelector('.mb-form')).toBeNull();
    expect(document.activeElement).toBe(title());
  });

  it('queues a column save behind a pending mark, and keeps both', async () => {
    const { host, api } = await mount(view());
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const real = (api.setMark as Mock).getMockImplementation()!;
    (api.setMark as Mock).mockImplementationOnce(async (...args: unknown[]) => {
      await gate;
      return real(...args);
    });
    host.querySelectorAll('tbody tr')[0]!.querySelector<HTMLButtonElement>('.mb-cell--handin')!.click();
    host.querySelector<HTMLButtonElement>('.mb__add-kind:nth-child(3)')!.click();
    const form = document.querySelector<HTMLElement>('.mb-form')!;
    const name = form.querySelector<HTMLInputElement>('[name="title"]')!;
    name.value = 'Homework';
    form.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.saveColumn).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(api.saveColumn).toHaveBeenCalled());
    await vi.waitFor(() => expect([...host.querySelectorAll('.mb-col__title')].map((n) => n.textContent)).toContain('Homework'));
    expect(host.querySelectorAll('tbody tr')[0]!.querySelector('.mb-cell--handin')?.textContent).toBe('Submitted');
    expect(document.querySelector('.mb-form')).toBeNull();
  });

  it('marks an assessment in the panel, saving through the queue and moving on', async () => {
    const { host, api } = await mount(view());
    const cell = (i: number) => host.querySelectorAll('tbody tr')[i]!.querySelector<HTMLButtonElement>('.mb-cell--assessment')!;
    cell(0).focus();
    cell(0).click();
    const panel = document.querySelector<HTMLElement>('.mb-panel')!;
    const box = () => panel.querySelector<HTMLInputElement>('.mb-panel__mark')!;
    expect(panel.querySelector('.mb-panel__student')?.textContent).toBe('BB · Bob Brown');
    expect(box().value).toBe('15');
    expect(document.activeElement).toBe(box());
    box().value = '18';
    box().dispatchEvent(new Event('input'));
    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.calls).toEqual([['essay0001', 's1', { criteria: { crit0001: 18 } }]]));
    expect(panel.querySelector('.mb-panel__student')?.textContent).toBe('TT · Tom Tills');
    expect(box().value).toBe('');
    expect(document.activeElement).toBe(box());
    await vi.waitFor(() => expect(cell(0).textContent).toBe('18/20 · 90%'));
    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.mb-panel')).toBeNull();
    expect(document.activeElement).toBe(cell(1));
  });

  it('shows a mark saved earlier in the same panel when the teacher comes back to it', async () => {
    const { host, api } = await mount(view());
    const cell = (i: number) => host.querySelectorAll('tbody tr')[i]!.querySelector<HTMLButtonElement>('.mb-cell--assessment')!;
    cell(1).click();
    const box = () => document.querySelector<HTMLInputElement>('.mb-panel__mark')!;
    box().value = '11';
    document.querySelector<HTMLButtonElement>('.mb-panel__save')!.click();
    expect(document.querySelector('.mb-panel')).toBeNull();
    cell(1).click();
    expect(box().value).toBe('11');
    document.querySelector<HTMLButtonElement>('.mb-panel__close')!.click();
    await vi.waitFor(() => expect(api.setMark).toHaveBeenCalledTimes(1));
  });

  it('skips the server when an unmarked student is passed over', async () => {
    const { host, api } = await mount(view());
    host.querySelectorAll('tbody tr')[1]!.querySelector<HTMLButtonElement>('.mb-cell--assessment')!.click();
    document.querySelector<HTMLButtonElement>('.mb-panel__next')!.click();
    expect(document.querySelector('.mb-panel')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.setMark).not.toHaveBeenCalled();
  });

  it('returns focus to the redrawn column title after the form saves', async () => {
    const { host, api } = await mount(view());
    const title = () => [...host.querySelectorAll<HTMLButtonElement>('.mb-col__title')].find((b) => b.dataset.col === 'hand00001')!;
    title().focus();
    title().click();
    const form = document.querySelector<HTMLElement>('.mb-form')!;
    const name = form.querySelector<HTMLInputElement>('[name="title"]')!;
    name.value = 'Final draft';
    form.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(api.saveColumn).toHaveBeenCalled());
    await vi.waitFor(() => expect(document.querySelector('.mb-form')).toBeNull());
    expect(document.activeElement).toBe(title());
    expect(title().textContent).toBe('Final draft');
  });

  it('shows a failed mark save inside the open panel, naming the student', async () => {
    const { host, api } = await mount(view());
    (api.setMark as Mock).mockRejectedValueOnce(new Error('Server said no'));
    host.querySelectorAll('tbody tr')[0]!.querySelector<HTMLButtonElement>('.mb-cell--assessment')!.click();
    const panel = document.querySelector<HTMLElement>('.mb-panel')!;
    const box = () => panel.querySelector<HTMLInputElement>('.mb-panel__mark')!;
    box().value = '19';
    box().dispatchEvent(new Event('input'));
    panel.querySelector<HTMLButtonElement>('.mb-panel__next')!.click();
    await vi.waitFor(() => expect(panel.querySelector('.mb-panel__error')?.textContent).toBe('Bob Brown’s mark wasn’t saved: Server said no'));
    expect(host.querySelectorAll('tbody tr')[0]!.querySelector('.mb-cell--assessment')?.textContent).toBe('15/20 · 75%');
    panel.querySelector<HTMLButtonElement>('.mb-panel__close')!.click();
    expect(document.querySelector('.mb-panel')).toBeNull();
  });

  it('skips the server when a mark is saved unchanged', async () => {
    const { host, api } = await mount(view());
    host.querySelectorAll('tbody tr')[0]!.querySelector<HTMLButtonElement>('.mb-cell--assessment')!.click();
    document.querySelector<HTMLButtonElement>('.mb-panel__save')!.click();
    expect(document.querySelector('.mb-panel')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.setMark).not.toHaveBeenCalled();
  });

  const outcomeQuiz = () => ({
    kind: 'quiz' as const, id: 'quiz:l1', lesson_id: 'l1', title: 'Quiz 1', date: '2026-10-20', hidden: false, confidence: false,
    questions: [{ id: 'q1', prompt: 'Name the device', marks: 2, outcomes: ['o2'] }],
    scores: { s1: { attempt_id: 'x~0', submitted_at: '', score: 1, max: 2, pending: 0, rows: [{ id: 'q1', awarded: 1, max: 2, confidence: null, outcomes: ['o2'] }] } }
  });

  it('draws the patterns view from the Patterns toggle, and goes back to the grid', async () => {
    const { host } = await mount(view({ quizzes: [outcomeQuiz()] }));
    const toggle = host.querySelector<HTMLButtonElement>('.mb__toggle')!;
    toggle.click();
    await vi.waitFor(() => expect(host.querySelector('.mb-patterns')).not.toBeNull());
    expect(host.querySelector('.mb-col__title')).toBeNull();
    toggle.click();
    expect(host.querySelector('.mb-patterns')).toBeNull();
    expect(host.querySelector('.mb-col__title')).not.toBeNull();
    host.remove();
  });

  it('opens the student panel from a name in the grid', async () => {
    const { host } = await mount(view({ quizzes: [outcomeQuiz()] }));
    const name = [...host.querySelectorAll<HTMLButtonElement>('button.mb-student__name')].find((n) => n.textContent === 'Bob Brown')!;
    name.focus();
    await vi.waitFor(() => {
      name.click();
      expect(document.querySelector('.mb-sheet--student')).not.toBeNull();
    });
    const sheet = document.querySelector<HTMLElement>('.mb-sheet--student')!;
    expect(sheet.querySelector('.mb-panel__student')?.textContent).toBe('BB · Bob Brown');
    sheet.querySelector<HTMLButtonElement>('.mb-sheet__close')!.click();
    expect(document.querySelector('.mb-sheet--student')).toBeNull();
    expect(document.activeElement).toBe(name);
    host.remove();
  });

  it('saves focus pins through the queue, and rolls them back when the save fails', async () => {
    const focused = book({ focus: { s1: { pinned: [], dismissed: ['out:o2'] } } });
    const { host, api } = await mount(view({ markbook: focused, quizzes: [outcomeQuiz()] }));
    const openBob = async (): Promise<HTMLElement> => {
      const name = [...host.querySelectorAll<HTMLButtonElement>('button.mb-student__name')].find((n) => n.textContent === 'Bob Brown')!;
      await vi.waitFor(() => {
        name.click();
        expect(document.querySelector('.mb-sheet--student')).not.toBeNull();
      });
      return document.querySelector<HTMLElement>('.mb-sheet--student')!;
    };
    let sheet = await openBob();
    (api.setFocus as Mock).mockRejectedValueOnce(new Error('Server said no'));
    sheet.querySelector<HTMLButtonElement>('[data-focus="show-dismissed"]')!.click();
    await vi.waitFor(() => expect(api.setFocus).toHaveBeenCalledWith('class1', 's1', [], []));
    await vi.waitFor(() => expect(host.querySelector('.mb__status')?.textContent).toBe('Server said no'));
    sheet.querySelector<HTMLButtonElement>('.mb-sheet__close')!.click();
    sheet = await openBob();
    // Rolled back: the dismissed tag is still there.
    expect(sheet.querySelector('[data-focus="show-dismissed"]')?.textContent).toBe('Show 1 dismissed');
    sheet.querySelector<HTMLButtonElement>('[data-focus="show-dismissed"]')!.click();
    await vi.waitFor(() => expect(api.setFocus).toHaveBeenCalledTimes(2));
    sheet.querySelector<HTMLButtonElement>('.mb-sheet__close')!.click();
    sheet = await openBob();
    expect(sheet.querySelector('[data-focus="show-dismissed"]')).toBeNull();
    sheet.querySelector<HTMLButtonElement>('.mb-sheet__close')!.click();
    host.remove();
  });

  it('opens the heatmap from a quiz column title, and Escape returns focus to it', async () => {
    const { host } = await mount(view({ quizzes: [outcomeQuiz()] }));
    const title = [...host.querySelectorAll<HTMLButtonElement>('.mb-col__title')].find((n) => n.dataset.col === 'quiz:l1')!;
    title.focus();
    title.click();
    const sheet = document.querySelector<HTMLElement>('.mb-sheet')!;
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.querySelector('.mb-heat')).not.toBeNull();
    expect(sheet.contains(document.activeElement)).toBe(true);
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.mb-sheet')).toBeNull();
    expect(document.activeElement).toBe(title);
    host.remove();
  });

  it('opens the attempt summary from a quiz cell, linking to the lesson', async () => {
    const { host } = await mount(view({ quizzes: [outcomeQuiz()] }));
    const cell = host.querySelectorAll('tbody tr')[0]!.querySelector<HTMLButtonElement>('.mb-cell--quiz')!;
    cell.focus();
    cell.click();
    const sheet = document.querySelector<HTMLElement>('.mb-sheet')!;
    expect(sheet.querySelector('.mb-attempt li')?.textContent).toBe('Name the device · 1/2');
    expect(sheet.querySelector<HTMLAnchorElement>('.mb-attempt__link')!.getAttribute('href')).toBe(withAppBase('/lessons/l1'));
    sheet.querySelector<HTMLButtonElement>('.mb-sheet__close')!.click();
    expect(document.querySelector('.mb-sheet')).toBeNull();
    expect(document.activeElement).toBe(cell);
    host.remove();
  });

  it('shows one student at a time on a phone, with the same tap controls', async () => {
    const { host, api } = await mount(view(), true);
    expect(host.querySelector('.mb-grid')).toBeNull();
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('BB · Bob Brown');
    expect([...host.querySelectorAll('.mb-phone__row .mb-phone__label')].map((n) => n.firstChild?.textContent)).toEqual(['Draft', 'Bookwork', 'Essay']);
    expect(host.querySelector('.mb-phone__overall')?.textContent).toBe('75%');
    host.querySelector<HTMLButtonElement>('.mb-phone__row .mb-cell--handin')!.click();
    await vi.waitFor(() => expect(api.calls[0]).toEqual(['hand00001', 's1', { status: 'submitted', at: '2026-11-03' }]));
    host.querySelector<HTMLButtonElement>('.mb-phone__next')!.click();
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('TT · Tom Tills');
    expect(host.querySelector<HTMLButtonElement>('.mb-phone__next')!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('.mb-phone__prev')!.disabled).toBe(false);
  });

  it('keeps the patterns tables on a phone', async () => {
    const { host } = await mount(view({ quizzes: [outcomeQuiz()] }), true);
    expect(host.querySelector('.mb-phone')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.mb__toggle')!.click();
    expect(host.querySelector('.mb-phone')).toBeNull();
    await vi.waitFor(() => expect(host.querySelector('.mb-patterns .mb-grid')).not.toBeNull());
  });

  it('keeps focus on a tapped phone cell, and on the student through a redraw', async () => {
    const { host } = await mount(view(), true);
    host.querySelector<HTMLButtonElement>('.mb-phone__next')!.click();
    const cell = host.querySelector<HTMLButtonElement>('.mb-phone .mb-cell--check')!;
    cell.focus();
    cell.click();
    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(cell);
    expect(active.dataset.col).toBe('chck00001');
    expect(active.dataset.student).toBe('s2');
    expect(active.textContent).toBe('1');
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('TT · Tom Tills');
  });

  it('clears a hand-in from the phone card’s Clear button', async () => {
    const { host, api } = await mount(view({ markbook: book({ marks: { hand00001: { s1: { status: 'late', at: '2026-10-26' } } } }) }), true);
    const clears = [...host.querySelectorAll<HTMLButtonElement>('.mb-phone__clear')];
    expect(clears.map((b) => b.getAttribute('aria-label'))).toEqual(['Clear Draft for Bob Brown']);
    expect(clears[0]!.textContent).toBe('Clear');
    clears[0]!.focus();
    clears[0]!.click();
    await vi.waitFor(() => expect(api.calls[0]).toEqual(['hand00001', 's1', null]));
    expect(host.querySelector('.mb-phone .mb-cell--handin')?.textContent).toBe('–');
    expect(host.querySelector('.mb-phone__clear')).toBeNull();
    expect((document.activeElement as HTMLElement).dataset.col).toBe('hand00001');
  });

  it('keeps focus on Previous and Next after moving', async () => {
    const three = view({ students: [...view().students, { id: 's3', name: 'Ava Moss', initials: 'AM' }] });
    const { host } = await mount(three, true);
    host.querySelector<HTMLButtonElement>('.mb-phone__next')!.focus();
    host.querySelector<HTMLButtonElement>('.mb-phone__next')!.click();
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('AM · Ava Moss');
    expect(document.activeElement).toBe(host.querySelector('.mb-phone__next'));
    host.querySelector<HTMLButtonElement>('.mb-phone__prev')!.focus();
    host.querySelector<HTMLButtonElement>('.mb-phone__prev')!.click();
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('BB · Bob Brown');
    // Back on the first student Previous is disabled, so focus goes to the picker.
    expect(host.querySelector<HTMLButtonElement>('.mb-phone__prev')!.disabled).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('.mb-phone__pick'));
  });

  it('picks a student from the list, and keeps focus on it', async () => {
    const { host } = await mount(view(), true);
    const pick = host.querySelector<HTMLSelectElement>('.mb-phone__pick')!;
    expect([...pick.options].map((o) => o.textContent)).toEqual(['BB · Bob Brown', 'TT · Tom Tills']);
    pick.focus();
    pick.value = '1';
    pick.dispatchEvent(new Event('change', { bubbles: true }));
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('TT · Tom Tills');
    expect(document.activeElement).toBe(host.querySelector('.mb-phone__pick'));
  });

  it('shows removed students read-only on the phone, and clamps the card when they are hidden again', async () => {
    const { host } = await mount(view({ markbook: book({ marks: { hand00001: { s9: { status: 'late', at: '2026-10-26' } } } }) }), true);
    host.querySelector<HTMLButtonElement>('.mb__removed')!.click();
    const pick = host.querySelector<HTMLSelectElement>('.mb-phone__pick')!;
    expect(pick.options).toHaveLength(3);
    pick.value = '2';
    pick.dispatchEvent(new Event('change', { bubbles: true }));
    expect(host.querySelector('.mb-phone__name')?.textContent).toContain('Removed student 1');
    expect(host.querySelectorAll('.mb-phone button.mb-cell')).toHaveLength(0);
    expect(host.querySelector('.mb-phone .mb-cell--handin')?.textContent).toBe('Late');
    expect(host.querySelector('.mb-phone__clear')).toBeNull();
    host.querySelector<HTMLButtonElement>('.mb__removed')!.click();
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('TT · Tom Tills');
    expect(host.querySelector<HTMLSelectElement>('.mb-phone__pick')!.value).toBe('1');
    expect(host.querySelector<HTMLButtonElement>('.mb-phone__next')!.disabled).toBe(true);
  });

  it('exports a CSV named after the class, with a byte-order mark for Excel, and frees the file after 30 seconds', async () => {
    const { host } = await mount(view());
    // jsdom has no object URLs; give spyOn something to wrap.
    const urls = URL as unknown as Record<string, unknown>;
    for (const name of ['createObjectURL', 'revokeObjectURL']) if (typeof urls[name] !== 'function') urls[name] = () => '';
    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blobs.push(b as Blob); return 'blob:x'; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download); });
    vi.useFakeTimers();
    try {
      host.querySelector<HTMLButtonElement>('.mb__export')!.click();
      vi.advanceTimersByTime(0);
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(29_999);
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(revoke).toHaveBeenCalledWith('blob:x');
    } finally {
      vi.useRealTimers();
      click.mockRestore();
      create.mockRestore();
      revoke.mockRestore();
    }
    expect(clicked).toEqual(['markbook-12eng-2026-11-03.csv']);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(blobs[0]!.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toContain('Initials,Name,Draft,Bookwork,Essay,Overall');
  });

  it('announces the student when the phone card moves, from a live region outside the redrawn body', async () => {
    const { host } = await mount(view(), true);
    const live = host.querySelector<HTMLElement>('.mb__announce')!;
    expect(live.classList.contains('mb-sr')).toBe(true);
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.closest('.mb__body')).toBeNull();
    expect(live.textContent).toBe('');
    host.querySelector<HTMLButtonElement>('.mb-phone__next')!.click();
    expect(live.textContent).toBe('Tom Tills, 2 of 2');
    expect(host.querySelector('.mb__announce')).toBe(live);
    const pick = host.querySelector<HTMLSelectElement>('.mb-phone__pick')!;
    pick.value = '0';
    pick.dispatchEvent(new Event('change', { bubbles: true }));
    expect(live.textContent).toBe('Bob Brown, 1 of 2');
  });

  it('keeps the same student on the phone card when a reload adds someone before them', async () => {
    const { host, api } = await mount(view(), true);
    host.querySelector<HTMLButtonElement>('.mb-phone__next')!.click();
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('TT · Tom Tills');
    // A failed save reloads; the reload brings a new student who sorts before Tom.
    const withAva = view({ students: [...view().students, { id: 's3', name: 'Ava Moss', initials: 'AM' }] });
    (api.setMark as Mock).mockRejectedValueOnce(new Error('Nope.'));
    (api.load as Mock).mockResolvedValueOnce(structuredClone(withAva));
    host.querySelector<HTMLButtonElement>('.mb-phone .mb-cell--handin')!.click();
    await vi.waitFor(() => expect(host.querySelector('.mb__status')?.textContent).toBe('Nope.'));
    expect(host.querySelector<HTMLSelectElement>('.mb-phone__pick')!.options).toHaveLength(3);
    expect(host.querySelector('.mb-phone__name')?.textContent).toBe('TT · Tom Tills');
    expect(host.querySelector<HTMLSelectElement>('.mb-phone__pick')!.value).toBe('2');
  });

  it('offers Clear on hand-in and check rows only, named for the student, with no Delete hint on phone cells', async () => {
    const marks = { hand00001: { s1: { status: 'late', at: '2026-10-26' } }, chck00001: { s1: 2 }, essay0001: { s1: { criteria: { crit0001: 15 } } } };
    const { host, api } = await mount(view({ markbook: book({ marks }), quizzes: [outcomeQuiz()] }), true);
    const clears = [...host.querySelectorAll<HTMLButtonElement>('.mb-phone__clear')];
    expect(clears.map((b) => b.getAttribute('aria-label'))).toEqual(['Clear Draft for Bob Brown', 'Clear Bookwork for Bob Brown']);
    const rows = [...host.querySelectorAll('.mb-phone__row')];
    for (const kind of ['quiz', 'assessment']) {
      const row = rows.find((r) => r.querySelector(`.mb-cell--${kind}`));
      expect(row).toBeDefined();
      expect(row!.querySelector('.mb-phone__clear')).toBeNull();
    }
    for (const cell of host.querySelectorAll('.mb-phone .mb-cell')) expect(cell.getAttribute('aria-label') ?? '').not.toContain('Delete to clear');
    clears[1]!.click();
    await vi.waitFor(() => expect(api.calls[0]).toEqual(['chck00001', 's1', null]));
    expect(host.querySelector('.mb-phone .mb-cell--check')?.textContent).toBe('–');
  });

  it('keeps the Delete hint on grid cells', async () => {
    const { host } = await mount(view());
    expect(host.querySelector('.mb-grid .mb-cell--handin')?.getAttribute('aria-label')).toContain('Delete to clear');
  });

  describe('follows the phone-width media query', () => {
    type Listener = () => void;
    const stub = (legacy: boolean) => {
      const listeners = new Set<Listener>();
      const removed: Listener[] = [];
      const mql = {
        matches: false,
        media: '(max-width: 600px)',
        ...(legacy
          ? { addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => { listeners.delete(fn); removed.push(fn); } }
          : {
              addEventListener: (_t: string, fn: Listener) => listeners.add(fn),
              removeEventListener: (_t: string, fn: Listener) => { listeners.delete(fn); removed.push(fn); }
            })
      };
      vi.stubGlobal('matchMedia', vi.fn(() => mql));
      const flip = (matches: boolean) => {
        mql.matches = matches;
        for (const fn of [...listeners]) fn();
      };
      return { listeners, removed, flip };
    };

    for (const legacy of [false, true]) {
      it(legacy ? 'with the older addListener API' : 'with addEventListener', async () => {
        const media = stub(legacy);
        try {
          const host = document.createElement('div');
          document.body.append(host);
          const dispose = mountMarkbook(host, cls, { api: fakeApi(view()), today: () => '2026-11-03' });
          await vi.waitFor(() => expect(host.querySelector('.mb-grid')).not.toBeNull());
          expect(media.listeners.size).toBe(1);
          const listener = [...media.listeners][0]!;
          media.flip(true);
          expect(host.querySelector('.mb-phone')).not.toBeNull();
          expect(host.querySelector('.mb-grid')).toBeNull();
          media.flip(false);
          expect(host.querySelector('.mb-grid')).not.toBeNull();
          expect(host.querySelector('.mb-phone')).toBeNull();
          dispose();
          expect(media.listeners.size).toBe(0);
          expect(media.removed).toEqual([listener]);
          host.remove();
        } finally {
          vi.unstubAllGlobals();
        }
      });
    }
  });
});
