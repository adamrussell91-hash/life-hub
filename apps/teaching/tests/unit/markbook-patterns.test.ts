import { describe, expect, it, vi } from 'vitest';
import { renderPatterns } from '@/markbook/patterns-view';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import type { MarkbookView } from '@/markbook/types';
import { openStudentPanel, studentPanelBody } from '@/markbook/student-panel';

export const view: MarkbookView = {
  markbook: {
    columns: [{ id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-01', weight: 40, criteria: [{ id: 'c1', label: 'Analysis', max: 20, outcomes: ['o1'], skill: 'reading.inference' }] }],
    hidden_quizzes: [],
    marks: { essay0001: { s1: { criteria: { c1: 10 }, codes: { c1: ['code-e'] } }, s2: { criteria: {}, exempt: true } } },
    focus: {},
    updated_at: ''
  },
  students: [{ id: 's1', name: 'Ada Ash', initials: 'AA' }, { id: 's2', name: 'Bo Birch', initials: 'BB' }],
  quizzes: [
    {
      kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Pre-test', date: '2026-10-20', hidden: false, confidence: true,
      questions: [{ id: 'q1', prompt: 'Name it', marks: 1, outcomes: [] }],
      scores: {
        s1: { attempt_id: 'a~0', submitted_at: '2026-10-20T01:00:00Z', score: 0, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 0, max: 1, confidence: 3, outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: 0, why: [] }] }] },
        s2: { attempt_id: 'b~0', submitted_at: '2026-10-20T01:00:00Z', score: 1, max: 1, pending: 0, rows: [{ id: 'q1', awarded: 1, max: 1, confidence: 1, outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: 1, why: [] }] }] }
      }
    },
    { kind: 'quiz', id: 'quiz:l2', lesson_id: 'l2', title: 'Hidden', date: '2026-10-21', hidden: true, confidence: false, questions: [], scores: {} }
  ]
};

describe('markbookEvidence', () => {
  it('reads quiz items and assessment criteria, skipping hidden quizzes and exempt marks', () => {
    const { evidence, sources } = markbookEvidence(view);
    expect(sources.map((s) => s.title)).toEqual(['Pre-test', 'Essay']);
    expect(evidence.filter((e) => e.source === 'quiz:l1').map((e) => [e.student, e.share, e.confidence])).toEqual([
      ['s1', 0, 3],
      ['s2', 1, 1]
    ]);
    const essay = evidence.filter((e) => e.source === 'assess:essay0001');
    expect(essay).toEqual([
      { item: 'essay0001:c1', tags: ['out:o1', 'skill:reading.inference'], share: 0.5, why: [{ type: 'code', id: 'code-e' }], student: 's1', source: 'assess:essay0001', date: '2026-11-01', confidence: null }
    ]);
  });
});

describe('renderPatterns', () => {
  const ctx = { table: null, outcomes: [], skills: null, codes: [] };
  it('draws the class trend, tag table and heatmap; groups open a student list', () => {
    const openStudent = vi.fn();
    const node = renderPatterns(view, view.students, ctx, { openStudent });
    expect(node.querySelector('.mb-trend')).not.toBeNull();
    expect(node.querySelector('.mb-patterns__tags')?.textContent).toContain('simile');
    const weak = node.querySelector<HTMLButtonElement>('[data-group="weak"]');
    expect(weak).toBeNull(); // one question per student: below the group minimum
    const cell = node.querySelector<HTMLButtonElement>('.mb-patterns__cell[data-student="s1"]');
    expect(cell?.textContent).toBe('0');
    node.querySelector<HTMLButtonElement>('.mb-patterns__name[data-student="s2"]')!.click();
    expect(openStudent).toHaveBeenCalledWith('s2');
  });
});

describe('renderPatterns details', () => {
  const ctx = { table: null, outcomes: [], skills: null, codes: [] };
  /** `n` quizzes on one tag, where s1 is wrong and s2 right on every one. */
  const many = (n: number): MarkbookView => {
    const row = (awarded: number) => ({ id: 'q1', awarded, max: 1, confidence: null, outcomes: [], items: [{ item: 'q1', tags: ['tech:simile'], share: awarded, why: [] }] });
    return {
      markbook: { columns: [], hidden_quizzes: [], marks: {}, focus: {}, updated_at: '' },
      students: view.students,
      quizzes: Array.from({ length: n }, (_, i) => ({
        kind: 'quiz' as const, id: `quiz:l${i}`, lesson_id: `l${i}`, title: `Quiz ${i}`, date: `2026-10-${String(i + 1).padStart(2, '0')}`, hidden: false, confidence: false,
        questions: [{ id: 'q1', prompt: `Find the simile in passage ${i}`, marks: 1, outcomes: [] }],
        scores: {
          s1: { attempt_id: `a~${i}`, submitted_at: '', score: 0, max: 1, pending: 0, rows: [row(0)] },
          s2: { attempt_id: `b~${i}`, submitted_at: '', score: 1, max: 1, pending: 0, rows: [row(1)] }
        }
      }))
    };
  };
  const tickTexts = (node: HTMLElement) => [...node.querySelectorAll('.mb-trend text.mb-trend__tick')].map((t) => t.textContent);

  it('labels the y-axis in percent and thins x labels when sources crowd, keeping first and last', () => {
    const node = renderPatterns(many(20), view.students, ctx, { openStudent: vi.fn() });
    const texts = tickTexts(node);
    expect(texts.slice(0, 3)).toEqual(['0%', '50%', '100%']);
    const labels = texts.slice(3);
    expect(labels[0]).toBe('Quiz 0');
    expect(labels[labels.length - 1]).toBe('Quiz 19');
    expect(labels.length).toBeLessThan(20);
    expect(labels.length).toBeGreaterThan(2);
    // Every source keeps its dot.
    expect(node.querySelectorAll('.mb-trend__dot')).toHaveLength(20);
    // A few sources all get labels.
    expect(tickTexts(renderPatterns(many(3), view.students, ctx, { openStudent: vi.fn() })).slice(3)).toEqual(['Quiz 0', 'Quiz 1', 'Quiz 2']);
  });

  it('group buttons name the tag, show which is open, and close on a second press', () => {
    const node = renderPatterns(many(3), view.students, ctx, { openStudent: vi.fn() });
    const weak = node.querySelector<HTMLButtonElement>('[data-group="weak"]')!;
    const secure = node.querySelector<HTMLButtonElement>('[data-group="secure"]')!;
    expect(weak.getAttribute('aria-label')).toBe('1 weak on simile');
    expect(weak.getAttribute('aria-expanded')).toBe('false');
    weak.click();
    expect(weak.getAttribute('aria-expanded')).toBe('true');
    expect(node.querySelectorAll('.mb-patterns__expand')).toHaveLength(1);
    secure.click();
    expect(weak.getAttribute('aria-expanded')).toBe('false');
    expect(secure.getAttribute('aria-expanded')).toBe('true');
    expect(node.querySelector('.mb-patterns__expand')?.textContent).toContain('Bo Birch');
    secure.click();
    expect(secure.getAttribute('aria-expanded')).toBe('false');
    expect(node.querySelector('.mb-patterns__expand')).toBeNull();
    const table = node.querySelector('.mb-patterns__table')!;
    expect([...table.querySelectorAll('tr:first-child th')].every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    expect(table.querySelector('tr:nth-child(2) th')?.getAttribute('scope')).toBe('row');
  });

  it('the evidence sheet names questions and criteria, not ids', () => {
    const node = renderPatterns(view, view.students, { ...ctx }, { openStudent: vi.fn() });
    document.body.append(node);
    node.querySelector<HTMLButtonElement>('.mb-patterns__cell[data-student="s1"]')!.click();
    let dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Pre-test · Name it · 0%');
    expect(dialog.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)).not.toBeNull();
    dialog.querySelector<HTMLButtonElement>('.mb-sheet__close')!.click();
    // Outcome tags come from the essay's Analysis criterion.
    [...node.querySelectorAll<HTMLButtonElement>('.ev-switch__pill')].find((p) => p.textContent === 'Outcome')!.click();
    node.querySelector<HTMLButtonElement>('.mb-patterns__cell[data-student="s1"]')!.click();
    dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].pop()!;
    expect(dialog.textContent).toContain('Essay · Analysis · 50%');
    dialog.querySelector<HTMLButtonElement>('.mb-sheet__close')!.click();
    node.remove();
  });

  it('draws no heatmap when there are no tag rows', () => {
    const empty: MarkbookView = { ...view, quizzes: [], markbook: { ...view.markbook, columns: [], marks: {} } };
    const node = renderPatterns(empty, view.students, ctx, { openStudent: vi.fn() });
    expect(node.textContent).toContain('No tagged marks yet.');
    expect(node.querySelector('.mb-patterns__heatmap')).toBeNull();
    expect(node.querySelector('.mb-patterns__heat')?.childElementCount).toBe(0);
  });
});

describe('student panel', () => {
  it('lists focus areas with pin and dismiss, secure tags and confidence', () => {
    const ev = [0, 0.2, 0.4].map((share, i) => ({ item: `q${i}`, tags: ['tech:jux'], share, why: [], student: 's1', source: 'quiz:l1', date: '2026-10-20', confidence: 3 as const }));
    const onPins = vi.fn();
    const node = studentPanelBody({
      student: { id: 's1', name: 'Ada Ash', initials: 'AA' }, evidence: ev, kind: 'tech', label: (t) => t.slice(5), codeLabel: (id) => id,
      pins: { pinned: [], dismissed: [] }, onPins, overall: '64%'
    });
    expect(node.textContent).toContain('Focus areas');
    expect(node.textContent).toContain('jux');
    expect(node.textContent).toContain('Sure but wrong 3 times');
    [...node.querySelectorAll('button')].find((b) => b.textContent === 'Pin')!.click();
    expect(onPins).toHaveBeenCalledWith({ pinned: ['tech:jux'], dismissed: [] });
  });

  const ev = [0, 0.2, 0.4].map((share, i) => ({ item: `q${i}`, tags: ['tech:jux'], share, why: [], student: 's1', source: 'quiz:l1', date: '2026-10-20', confidence: 3 as const }));
  const base = { student: { id: 's1', name: 'Ada Ash', initials: 'AA' }, evidence: ev, kind: 'tech' as const, label: (t: string) => t.slice(5), codeLabel: (id: string) => id, overall: '64%' };
  const click = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!.click();

  it('dismisses a tag and unpins a pinned one', () => {
    const onPins = vi.fn();
    click(studentPanelBody({ ...base, pins: { pinned: [], dismissed: [] }, onPins }), 'Dismiss');
    expect(onPins).toHaveBeenCalledWith({ pinned: [], dismissed: ['tech:jux'] });
    click(studentPanelBody({ ...base, pins: { pinned: ['tech:jux'], dismissed: [] }, onPins }), 'Unpin');
    expect(onPins).toHaveBeenLastCalledWith({ pinned: [], dismissed: [] });
  });

  it('keeps focus on the row control after a redraw and the dialog labelled', () => {
    openStudentPanel({ ...base, pins: { pinned: [], dismissed: [] }, onPins: vi.fn() });
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const pin = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Pin')!;
    pin.focus();
    pin.click();
    const unpin = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Unpin')!;
    expect(document.activeElement).toBe(unpin);
    expect(dialog.getAttribute('aria-labelledby')).toBe('mb-student-s1');
    expect(dialog.querySelector('#mb-student-s1')).not.toBeNull();
    (dialog.querySelector('.mb-sheet__close') as HTMLElement).click();
  });
});
