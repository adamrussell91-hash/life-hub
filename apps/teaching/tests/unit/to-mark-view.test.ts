import { describe, expect, it } from 'vitest';
import { toMarkView } from '@/marking/to-mark-view';

describe('to mark', () => {
  it('groups waiting and coming in, flags late work, links to marking', () => {
    const view = toMarkView([
      { class_id: 'c1', class_title: '12E1', column_id: 'col1', title: 'Paragraph 3', lesson_id: 'l1', block_id: 'b1', waiting: 9, handed_in: 24, roster: 24, oldest_at: '2026-10-24T00:00:00Z', late: true },
      { class_id: 'c1', class_title: '12E1', column_id: 'col2', title: 'Paragraph 4', lesson_id: 'l2', block_id: 'b2', waiting: 0, handed_in: 3, roster: 24, oldest_at: null, late: false }
    ]);
    expect([...view.querySelectorAll('.tm-group')].map((n) => n.textContent)).toEqual(['Waiting for feedback', 'Coming in']);
    expect(view.querySelector('.tm-task.is-late .tm-age')!.textContent).toMatch(/days/);
    expect((view.querySelector('.tm-task a') as HTMLAnchorElement).getAttribute('href')).toBe('/mark/c1/col1');
  });
});
