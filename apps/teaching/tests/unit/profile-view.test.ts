import { describe, expect, it } from 'vitest';
import { renderProfile } from '@/student/profile-view';

const payload = {
  need: null,
  initials: 'AR',
  map: {
    next: 'l2',
    lessons: [
      { id: 'l1', title: 'Ghost poem', role: 'core', kind: 'lesson', done: true, assigned: true },
      { id: 'l2', title: 'Tutorial', role: 'support', kind: 'lesson', done: false, assigned: true },
      { id: 'l3', title: 'Stretch', role: 'extension', kind: 'lesson', done: false, assigned: false },
      { id: 'l4', title: 'Quiz 1', role: 'core', kind: 'quiz', done: false, assigned: true }
    ]
  },
  fills: { understanding: { mastered: 0.5, building: 0.25 }, responding: { mastered: 0, building: 0 }, concepts: { mastered: 0, building: 0.5 }, skills: { mastered: 0, building: 0 } }
};

describe('profile map', () => {
  const host = renderProfile(payload as never, { classId: 'class1' });
  it('fills done lessons and leaves the rest grey', () => {
    expect(host.querySelector('[data-lesson="l1"]')!.classList.contains('is-done')).toBe(true);
    expect(host.querySelector('[data-lesson="l4"]')!.classList.contains('is-done')).toBe(false);
  });
  it('rings the next lesson in words too', () => {
    const row = host.querySelector('[data-lesson="l2"]')!;
    expect(row.classList.contains('is-next')).toBe(true);
    expect(row.textContent).toContain('Next up');
  });
  it('fades an unassigned lesson but keeps it as a link', () => {
    const row = host.querySelector('[data-lesson="l3"]')!;
    expect(row.classList.contains('is-faded')).toBe(true);
    expect(row.querySelector('a')!.getAttribute('href')).toContain('/s/classes/class1/lessons/l3');
  });
  it('draws quizzes as diamonds', () => {
    expect(host.querySelector('[data-lesson="l4"] .pm-node--quiz')).toBeTruthy();
  });
  it('draws four bars with two shades and no numbers', () => {
    expect(host.querySelectorAll('.pm-bar').length).toBe(4);
    const u = host.querySelector('.pm-bar')!;
    expect((u.querySelector('.pm-bar__building') as HTMLElement).style.width).toBe('75%');
    expect((u.querySelector('.pm-bar__mastered') as HTMLElement).style.width).toBe('50%');
    expect(host.textContent).not.toMatch(/\d+%|\d+ of \d+|\d+ lessons?|\bscore\b|\bred\b|\bamber\b/i);
  });
  it('shows the initials step when the device is unclaimed', () => {
    const calls: string[] = [];
    const unclaimed = renderProfile({ need: 'initials' } as never, { classId: 'class1', onClaim: (i) => calls.push(i) });
    (unclaimed.querySelector('input') as HTMLInputElement).value = 'ar';
    unclaimed.querySelector('button')!.click();
    expect(calls).toEqual(['ar']);
    expect(unclaimed.querySelector('.pm-map')).toBeNull();
  });
  it('says so when the class has no unit yet', () => {
    const empty = renderProfile({ ...payload, map: { lessons: [], next: null } } as never, { classId: 'class1' });
    expect(empty.textContent).toContain('hasn’t set up a unit');
  });
});
