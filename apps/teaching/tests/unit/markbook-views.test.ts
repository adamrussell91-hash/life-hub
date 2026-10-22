import { afterEach, describe, expect, it } from 'vitest';
import { renderOutcomes } from '@/markbook/outcomes-view';
import { openHeatmap, openQuizAttempt } from '@/markbook/heatmap';
import type { MarkbookView, QuizColumn } from '@/markbook/types';

const quiz: QuizColumn = {
  kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Quiz 1', date: '2026-10-20', hidden: false, confidence: false,
  questions: [{ id: 'q1', prompt: 'Name the device', marks: 2, outcomes: ['o2'] }, { id: 'q2', prompt: 'Explain the ending', marks: 4, outcomes: ['o2'] }],
  scores: {
    s1: { attempt_id: 'x~0', submitted_at: '', score: 2, max: 6, pending: 1, rows: [{ id: 'q1', awarded: 2, max: 2, confidence: null, outcomes: ['o2'] }, { id: 'q2', awarded: null, max: 4, confidence: null, outcomes: ['o2'] }] },
    s2: { attempt_id: 'y~0', submitted_at: '', score: 1, max: 6, pending: 0, rows: [{ id: 'q1', awarded: 0, max: 2, confidence: null, outcomes: ['o2'] }, { id: 'q2', awarded: 1, max: 4, confidence: null, outcomes: ['o2'] }] }
  }
};
const view: MarkbookView = {
  markbook: { columns: [{ id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-01', weight: 40, criteria: [{ id: 'c1', label: 'Analysis', max: 20, outcomes: ['o1'] }] }], hidden_quizzes: [], marks: { essay0001: { s1: { criteria: { c1: 12 } } } }, updated_at: '' },
  students: [{ id: 's1', name: 'Bob Brown', initials: 'BB' }, { id: 's2', name: 'Tom Tills', initials: 'TT' }],
  quizzes: [quiz]
};
const labels = [{ id: 'o1', code: 'EN12-1', title: 'Responds', group: 'Objective A' }, { id: 'o2', code: 'EN12-3', title: 'Analyses', group: 'Objective B' }];

afterEach(() => document.body.replaceChildren());

describe('outcomes view', () => {
  it('draws a coloured cell per student and outcome, and lists the evidence on click', () => {
    const root = renderOutcomes(view, view.students, labels);
    expect([...root.querySelectorAll('thead .mb-outcome__code')].map((n) => n.textContent)).toEqual(['EN12-1', 'EN12-3']);
    const bob = root.querySelectorAll('tbody tr')[0]!;
    const cells = bob.querySelectorAll('.mb-outcome-cell');
    expect(cells[0]!.textContent).toBe('60%·1');
    expect(cells[0]!.className).toContain('mb-band--mid');
    expect(cells[1]!.textContent).toBe('100%·1');
    (cells[0] as HTMLButtonElement).click();
    expect(root.querySelector('.mb-evidence__title')?.textContent).toBe('BB · EN12-1');
    expect(root.querySelector('.mb-evidence li')?.textContent).toBe('Essay · Analysis · 60%');
    const tom = root.querySelectorAll('tbody tr')[1]!;
    expect(tom.querySelector('.mb-outcome-cell--none')?.textContent).toBe('No evidence');
  });
  it('says so when nothing is tagged', () => {
    const root = renderOutcomes({ ...view, markbook: { ...view.markbook, columns: [] }, quizzes: [] }, view.students, labels);
    expect(root.textContent).toBe('No outcomes yet. Tag assessment criteria or quiz questions with outcome codes, or give the quiz lesson outcomes.');
  });
  it('labels cells, tags them for focus keeping, and marks the one being read', () => {
    const root = renderOutcomes(view, view.students, labels);
    expect(root.querySelector('.mb-evidence')?.getAttribute('aria-live')).toBe('polite');
    const [first, second] = [...root.querySelectorAll<HTMLButtonElement>('tbody tr')[0]!.querySelectorAll<HTMLButtonElement>('button.mb-outcome-cell')];
    expect(first!.getAttribute('aria-label')).toBe('Bob Brown, EN12-1: 60% from 1 piece of evidence');
    expect(first!.dataset.col).toBe('outcome:o1');
    expect(first!.dataset.student).toBe('s1');
    expect(first!.getAttribute('aria-pressed')).toBe('false');
    first!.click();
    expect(first!.getAttribute('aria-pressed')).toBe('true');
    second!.click();
    expect(first!.getAttribute('aria-pressed')).toBe('false');
    expect(second!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('heatmap', () => {
  it('lists questions to reteach and colours each answer', () => {
    const root = openHeatmap(quiz, view.students);
    expect([...root.querySelectorAll('.mb-reteach li')].map((n) => n.textContent)).toEqual(['Explain the ending · 25%']);
    const cells = root.querySelectorAll('tbody tr')[1]!.querySelectorAll('td');
    expect(cells[0]!.className).toContain('mb-heat--pending');
    expect(cells[1]!.className).toContain('mb-band--low');
    root.querySelector<HTMLButtonElement>('.mb-sheet__close')!.click();
    expect(document.body.contains(root)).toBe(false);
  });
  it('gives each answer hidden text a screen reader reads, and names the dialog by its heading', () => {
    const root = openHeatmap(quiz, view.students);
    const cells = root.querySelectorAll('tbody tr')[1]!.querySelectorAll('td');
    expect(cells[0]!.querySelector('.mb-sr')?.textContent).toBe('Bob Brown: to mark');
    expect(cells[1]!.querySelector('.mb-sr')?.textContent).toBe('Tom Tills: 25%');
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby')!);
    expect(heading?.textContent).toBe('Quiz 1');
  });
  it('closes on Escape and returns focus where it is told', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const root = openHeatmap(quiz, view.students, { returnFocus: () => opener });
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.body.contains(root)).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
  it('summarises one attempt with a link to Results', () => {
    const root = openQuizAttempt(quiz, view.students[0]!, '/lessons/l1');
    expect([...root.querySelectorAll('.mb-attempt li')].map((n) => n.textContent)).toEqual(['Name the device · 2/2', 'Explain the ending · to mark']);
    expect(root.querySelector<HTMLAnchorElement>('.mb-attempt__link')!.getAttribute('href')).toBe('/lessons/l1');
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('BB · Bob Brown');
  });
  it('leaves out answers to questions the quiz no longer has', () => {
    const stale: QuizColumn = {
      ...quiz,
      scores: { s1: { ...quiz.scores.s1!, rows: [...quiz.scores.s1!.rows, { id: 'old9', awarded: 1, max: 1, confidence: null, outcomes: [] }] } }
    };
    const root = openQuizAttempt(stale, view.students[0]!, '/lessons/l1');
    expect(root.querySelectorAll('.mb-attempt li')).toHaveLength(2);
    expect(root.textContent).not.toContain('old9');
  });
});
