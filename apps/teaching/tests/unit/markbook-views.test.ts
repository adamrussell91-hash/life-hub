import { afterEach, describe, expect, it } from 'vitest';
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

afterEach(() => document.body.replaceChildren());

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
  it('moves focus into the sheet, gives row headers the full prompt, and draws a legend', () => {
    const root = openHeatmap(quiz, view.students);
    expect(root.querySelector('.mb-sheet')!.contains(document.activeElement)).toBe(true);
    expect(root.querySelector<HTMLElement>('.mb-reteach li')!.title).toBe('Explain the ending');
    const legend = root.querySelector('.mb-heat-legend')!;
    expect([...legend.querySelectorAll('li')].map((n) => n.textContent)).toEqual(['Below 50', '50–69', '70–84', '85+', 'To mark', 'Not taken']);
    expect([...legend.querySelectorAll('.mb-heat-legend__swatch')].every((n) => n.getAttribute('aria-hidden') === 'true')).toBe(true);
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
