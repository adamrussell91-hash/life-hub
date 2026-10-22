import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAssessmentPanel } from '@/markbook/assessment-panel';
import type { AssessmentColumn, AssessmentMark } from '@/markbook/schema';

const column: AssessmentColumn = {
  id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 40,
  criteria: [
    { id: 'c1', label: 'Analysis', max: 15, outcomes: [], bands: [{ label: 'A', min: 13 }, { label: 'B', min: 10 }] },
    { id: 'c2', label: 'Expression', max: 10, outcomes: [] }
  ]
};
const students = [{ id: 's1', name: 'Bob Brown', initials: 'BB' }, { id: 's2', name: 'Tom Tills', initials: 'TT' }];
const boxes = (root: HTMLElement) => [...root.querySelectorAll<HTMLInputElement>('.mb-panel__mark')];
const type = (i: HTMLInputElement, v: string) => { i.value = v; i.dispatchEvent(new Event('input')); };

afterEach(() => document.body.replaceChildren());

describe('assessment panel', () => {
  it('shows the band live, saves, and moves to the next student on Enter', () => {
    const saved: Array<[string, AssessmentMark | null]> = [];
    const root = openAssessmentPanel({ column, students, studentId: 's1', markFor: () => undefined, onSave: (id, m) => saved.push([id, m]) });
    expect(root.querySelector('.mb-panel__student')?.textContent).toBe('BB · Bob Brown');
    type(boxes(root)[0]!, '14');
    expect(root.querySelector('.mb-panel__band')?.textContent).toBe('Band A');
    type(boxes(root)[1]!, '7.5');
    boxes(root)[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(saved).toEqual([['s1', { criteria: { c1: 14, c2: 7.5 } }]]);
    expect(root.querySelector('.mb-panel__student')?.textContent).toBe('TT · Tom Tills');
    expect(document.activeElement).toBe(boxes(root)[0]);
  });

  it('refuses a mark above the criterion’s marks', () => {
    const onSave = vi.fn();
    const root = openAssessmentPanel({ column, students, studentId: 's1', markFor: () => undefined, onSave });
    type(boxes(root)[0]!, '16');
    root.querySelector<HTMLButtonElement>('.mb-panel__save')!.click();
    expect(root.querySelector('.mb-panel__error')?.textContent).toBe('Give between 0 and 15 for Analysis.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves an exemption with its note, and an empty form as a clear', () => {
    const saved: Array<[string, AssessmentMark | null]> = [];
    const root = openAssessmentPanel({ column, students, studentId: 's2', markFor: () => ({ criteria: { c1: 3 } }), onSave: (id, m) => saved.push([id, m]) });
    expect(boxes(root)[0]!.value).toBe('3');
    root.querySelector<HTMLInputElement>('.mb-panel__exempt')!.click();
    type(root.querySelector<HTMLInputElement>('.mb-panel__note')!, 'Misadventure');
    root.querySelector<HTMLButtonElement>('.mb-panel__save')!.click();
    expect(saved[0]).toEqual(['s2', { criteria: {}, exempt: true, note: 'Misadventure' }]);

    const again = openAssessmentPanel({ column, students, studentId: 's1', markFor: () => undefined, onSave: (id, m) => saved.push([id, m]) });
    again.querySelector<HTMLButtonElement>('.mb-panel__save')!.click();
    expect(saved[1]).toEqual(['s1', null]);
  });

  it('closes after the last student', () => {
    const root = openAssessmentPanel({ column, students, studentId: 's2', markFor: () => undefined, onSave: () => undefined });
    root.querySelector<HTMLButtonElement>('.mb-panel__next')!.click();
    expect(document.body.contains(root)).toBe(false);
  });

  it('is a modal labelled by its heading, and accepts any decimal', () => {
    const root = openAssessmentPanel({ column, students, studentId: 's1', markFor: () => undefined, onSave: () => undefined });
    const dialog = root.querySelector<HTMLElement>('.mb-panel')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    const ids = dialog.getAttribute('aria-labelledby')!.split(' ');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(['Essay', 'BB · Bob Brown']);
    expect(boxes(root)[0]!.step).toBe('any');
    expect(boxes(root)[0]!.max).toBe('15');
  });

  it('shows the next student’s mark as it is now', () => {
    const marks: Record<string, AssessmentMark> = {};
    const root = openAssessmentPanel({
      column, students, studentId: 's1',
      markFor: (id) => marks[id],
      onSave: (id, m) => { if (m) marks[id] = m; }
    });
    marks.s2 = { criteria: { c1: 9 } };
    type(boxes(root)[0]!, '12');
    root.querySelector<HTMLButtonElement>('.mb-panel__next')!.click();
    expect(boxes(root)[0]!.value).toBe('9');
  });

  it('closes on Escape and hands focus to returnFocus for the current student', () => {
    const cell = document.createElement('button');
    document.body.append(cell);
    const returnFocus = vi.fn(() => cell);
    const root = openAssessmentPanel({ column, students, studentId: 's1', markFor: () => undefined, onSave: () => undefined, returnFocus });
    root.querySelector<HTMLButtonElement>('.mb-panel__next')!.click();
    boxes(root)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.body.contains(root)).toBe(false);
    expect(returnFocus).toHaveBeenCalledWith('s2');
    expect(document.activeElement).toBe(cell);
  });
});
