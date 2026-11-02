import { describe, expect, it } from 'vitest';
import { toMarkView } from '@/marking/to-mark-view';

describe('to mark', () => {
  it('groups waiting and coming in, flags late work, links to marking', () => {
    const view = toMarkView([
      { class_id: 'c1', class_title: '12E1', column_id: 'col1', title: 'Paragraph 3', lesson_id: 'l1', block_id: 'b1', waiting: 9, handed_in: 24, roster: 24, oldest_at: '2026-10-24T00:00:00Z', late: true },
      { class_id: 'c1', class_title: '12E1', column_id: 'col2', title: 'Paragraph 4', lesson_id: 'l2', block_id: 'b2', waiting: 0, handed_in: 3, roster: 24, oldest_at: null, late: false },
      { class_id: 'c1', class_title: '12E1', column_id: 'col3', title: 'Paragraph 5', lesson_id: 'l3', block_id: 'b3', waiting: 0, handed_in: 24, roster: 24, oldest_at: null, late: false }
    ]);
    expect(view.textContent).not.toContain('Paragraph 5');
    expect([...view.querySelectorAll('.tm-group')].map((n) => n.textContent)).toEqual(['Waiting for you', 'Coming in']);
    expect(view.querySelector('.tm-task.is-late .tm-age')!.textContent).toMatch(/days/);
    expect((view.querySelector('.tm-task a') as HTMLAnchorElement).getAttribute('href')).toBe('/mark/c1/col1');
    expect(view.querySelector('.tm-group')!.textContent).toBe('Waiting for you');
  });

  it('shows every kind with its tag, who is waiting and a link to where it is dealt with', () => {
    const view = toMarkView([
      { kind: 'voice', what: 'Recordings to return', href: '/lessons/l1#block=v1', class_id: 'c1', class_title: '12E1', title: 'Viva', lesson_id: 'l1', waiting: 2, roster: 24, who: ['AN', 'NP'], oldest_at: '2026-11-01T00:00:00Z', late: false },
      { kind: 'quiz', what: 'Quiz answers to mark', href: '/lessons/l2', class_id: 'c1', class_title: '12E1', title: 'Road quiz', lesson_id: 'l2', waiting: 1, roster: 24, oldest_at: '2026-11-01T00:00:00Z', late: false }
    ], { limit: 1 });
    expect(view.querySelector('.tm-kind')!.textContent).toBe('Voice');
    expect(view.querySelector('.tm-task__who')!.textContent).toBe('AN, NP');
    expect((view.querySelector('.tm-task__title') as HTMLAnchorElement).getAttribute('href')).toBe('/lessons/l1#block=v1');
    expect(view.querySelector('.tm-more')!.textContent).toBe('See all 2');
  });
});
