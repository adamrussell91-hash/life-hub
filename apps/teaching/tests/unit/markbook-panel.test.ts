import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/teacher/confirm-dialog', () => ({ askConfirmCard: vi.fn() }));

import { askConfirmCard } from '@/teacher/confirm-dialog';
import { openAssessmentPanel } from '@/markbook/assessment-panel';
import { MARKBOOK_LIMITS, type AssessmentColumn, type AssessmentMark } from '@/markbook/schema';

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

afterEach(() => {
  document.body.replaceChildren();
  vi.mocked(askConfirmCard).mockReset();
});
const esc = (target: HTMLElement, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init }));
const open = (over: Partial<Parameters<typeof openAssessmentPanel>[0]> = {}) =>
  openAssessmentPanel({ column, students, studentId: 's1', markFor: () => undefined, onSave: () => undefined, ...over });

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

  it('limits feedback and note to what the server keeps', () => {
    const root = open();
    expect(root.querySelector<HTMLTextAreaElement>('.mb-panel__feedback')!.maxLength).toBe(MARKBOOK_LIMITS.feedback);
    expect(root.querySelector<HTMLInputElement>('.mb-panel__note')!.maxLength).toBe(MARKBOOK_LIMITS.note);
  });

  it('shows a failed save in its alert, and stops listening once closed', () => {
    let show: ((message: string) => void) | null = null;
    const unsubscribe = vi.fn();
    const root = open({ subscribeErrors: (fn) => { show = fn; return unsubscribe; } });
    show!('Bob Brown’s mark wasn’t saved: Server said no');
    expect(root.querySelector('.mb-panel__error')?.textContent).toBe('Bob Brown’s mark wasn’t saved: Server said no');
    expect(root.querySelector('.mb-panel__error')?.getAttribute('role')).toBe('alert');
    esc(boxes(root)[0]!);
    expect(document.body.contains(root)).toBe(false);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('asks before Escape throws away typing, and stays open on a no', async () => {
    vi.mocked(askConfirmCard).mockResolvedValueOnce(false);
    const root = open();
    type(boxes(root)[0]!, '12');
    esc(boxes(root)[0]!);
    expect(askConfirmCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Close without saving?', confirmLabel: 'Close' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.contains(root)).toBe(true);
    vi.mocked(askConfirmCard).mockResolvedValueOnce(true);
    root.querySelector<HTMLButtonElement>('.mb-panel__close')!.click();
    await vi.waitFor(() => expect(document.body.contains(root)).toBe(false));
  });

  it('closes at once when nothing changed', () => {
    const root = open({ markFor: () => ({ criteria: { c1: 7.5 } }) });
    type(boxes(root)[0]!, '7.50');
    esc(boxes(root)[0]!);
    expect(askConfirmCard).not.toHaveBeenCalled();
    expect(document.body.contains(root)).toBe(false);
  });

  it('ignores Escape while an input method is composing', () => {
    const root = open();
    esc(boxes(root)[0]!, { isComposing: true });
    expect(document.body.contains(root)).toBe(true);
  });

  it('announces each student it moves to', () => {
    const root = open();
    const live = root.querySelector<HTMLElement>('.mb-panel__announce')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    root.querySelector<HTMLButtonElement>('.mb-panel__next')!.click();
    expect(root.querySelector('.mb-panel__announce')).toBe(live);
    expect(live.textContent).toBe('Now marking TT · Tom Tills');
  });

  it('ties the band to its box and shows none above the maximum', () => {
    const root = open();
    const box = boxes(root)[0]!;
    const band = document.getElementById(box.getAttribute('aria-describedby')!)!;
    expect(band.classList.contains('mb-panel__band')).toBe(true);
    expect(band.getAttribute('aria-live')).toBe('polite');
    type(box, '14');
    expect(band.textContent).toBe('Band A');
    type(box, '16');
    expect(band.textContent).toBe('');
  });

  it('marks and focuses the bad box, and clears that on the next input', () => {
    const root = open();
    type(boxes(root)[1]!, '11');
    root.querySelector<HTMLButtonElement>('.mb-panel__save')!.click();
    expect(boxes(root)[1]!.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(boxes(root)[1]);
    type(boxes(root)[1]!, '10');
    expect(boxes(root)[1]!.hasAttribute('aria-invalid')).toBe(false);
    expect(root.querySelector('.mb-panel__error')?.textContent).toBe('');
  });

  it('disables marks and feedback while Exempt is ticked, and says why', () => {
    const root = open();
    const hint = root.querySelector<HTMLElement>('.mb-panel__exempt-hint')!;
    expect(hint.hidden).toBe(true);
    root.querySelector<HTMLInputElement>('.mb-panel__exempt')!.click();
    expect(boxes(root).every((b) => b.disabled)).toBe(true);
    expect(root.querySelector<HTMLTextAreaElement>('.mb-panel__feedback')!.disabled).toBe(true);
    expect(hint.hidden).toBe(false);
    root.querySelector<HTMLInputElement>('.mb-panel__exempt')!.click();
    expect(boxes(root)[0]!.disabled).toBe(false);
  });

  it('ignores a held-down or composing Enter', () => {
    const onSave = vi.fn();
    const root = open({ onSave });
    boxes(root)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }));
    boxes(root)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
