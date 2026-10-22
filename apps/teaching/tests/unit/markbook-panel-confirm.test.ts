import { afterEach, describe, expect, it } from 'vitest';
import { openAssessmentPanel } from '@/markbook/assessment-panel';
import type { AssessmentColumn } from '@/markbook/schema';

// The real confirm card, not a mock: its Escape listener must not catch the Escape that opened it.

const column: AssessmentColumn = {
  id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 40,
  criteria: [{ id: 'c1', label: 'Analysis', max: 15, outcomes: [] }]
};
const students = [{ id: 's1', name: 'Bob Brown', initials: 'BB' }];
const esc = (target: EventTarget) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

afterEach(() => document.body.replaceChildren());

describe('assessment panel with the real confirm card', () => {
  it('keeps the card up after the Escape that asked, and closes on Close', async () => {
    const root = openAssessmentPanel({ column, students, studentId: 's1', markFor: () => undefined, onSave: () => undefined });
    const box = root.querySelector<HTMLInputElement>('.mb-panel__mark')!;
    box.value = '12';
    box.dispatchEvent(new Event('input'));
    esc(box);
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('.confirm-card')).not.toBeNull();
    expect(document.body.contains(root)).toBe(true);

    // Escape on the card dismisses only the card.
    esc(document.activeElement ?? document.body);
    expect(document.querySelector('.confirm-card')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.contains(root)).toBe(true);

    esc(box);
    await new Promise((r) => setTimeout(r, 10));
    document.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.contains(root)).toBe(false);
    expect(document.querySelector('.confirm-card')).toBeNull();
  });
});
