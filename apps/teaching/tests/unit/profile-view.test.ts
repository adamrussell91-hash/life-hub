import { describe, expect, it } from 'vitest';
import { renderProfile } from '@/student/profile-view';

const unit = {
  content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Assessment task' } },
  lines: [{ id: 'ln1', mode: 'train', name: 'Argument', colour: 'wave' }],
  lessons: [
    { id: 'l1', title: 'Ghost poem', line_stops: [{ line_id: 'ln1', level: 'introduced' }] },
    { id: 'l2', title: 'Tutorial', role: 'support', line_stops: [{ line_id: 'ln1' }] },
    { id: 'l3', title: 'Stretch', role: 'extension' },
    { id: 'l4', title: 'Quiz 1', quiz: true, line_stops: [{ line_id: 'ln1', level: 'reinforced' }] },
    { id: 'l5', title: 'Essay', assessment: true }
  ],
  schedule: [{ lesson_id: 'l1', date: '2026-10-05' }, { lesson_id: 'l4', date: '2026-10-12' }],
  pre: []
};
const payload = {
  need: null,
  initials: 'AR',
  map: {
    next: 'l4',
    unit,
    lessons: [
      { id: 'l1', title: 'Ghost poem', role: 'core', kind: 'lesson', done: true, assigned: true },
      { id: 'l2', title: 'Tutorial', role: 'support', kind: 'lesson', done: false, assigned: true },
      { id: 'l3', title: 'Stretch', role: 'extension', kind: 'lesson', done: false, assigned: false },
      { id: 'l4', title: 'Quiz 1', role: 'core', kind: 'quiz', done: false, assigned: true },
      { id: 'l5', title: 'Essay', role: 'core', kind: 'assessment', done: false, assigned: true }
    ]
  },
  fills: { understanding: { mastered: 0.5, building: 0.25 }, responding: { mastered: 0, building: 0 }, concepts: { mastered: 0, building: 0.5 }, skills: { mastered: 0, building: 0 } }
};

describe('profile map', () => {
  const host = renderProfile(payload as never, { classId: 'class1' });
  // A lesson's row (name and station); its dots on the item branches share the data-row but not the class.
  const row = (id: string) => host.querySelector(`.cm-row[data-row="${id}"]`)!;
  it('fills done lessons and leaves the rest grey', () => {
    expect(row('l1').querySelector('.cm-station')!.classList.contains('cm-p-done')).toBe(true);
    expect(row('l4').querySelector('.cm-station')!.classList.contains('cm-p-done')).toBe(false);
    expect(host.querySelectorAll('.cm-route.cm-p-lit').length).toBe(0);
    expect(host.querySelectorAll('.cm-route.cm-p-grey').length).toBeGreaterThan(0);
  });
  it('colours the route behind a done lesson and marks it done in words too', () => {
    const done = renderProfile({ ...payload, map: { ...payload.map, lessons: payload.map.lessons.map((l) => (l.id === 'l4' ? { ...l, done: true } : l)), next: 'l5' } } as never, { classId: 'class1' });
    expect(done.querySelectorAll('.cm-route.cm-p-lit').length).toBeGreaterThan(0);
    expect(done.querySelector('.cm-row[data-row="l4"]')!.getAttribute('aria-label')).toContain('done');
    expect(done.querySelector('.cm-row[data-row="l4"] .cm-done-mark')).toBeTruthy();
  });
  it('rings the next lesson in words too', () => {
    expect(row('l4').querySelector('.cm-station')!.classList.contains('cm-p-next')).toBe(true);
    expect(row('l4').textContent).toContain('Next up');
  });
  it('fades an unassigned lesson but keeps it pressable', () => {
    expect(row('l3').classList.contains('cm-faded')).toBe(true);
    expect(row('l3').getAttribute('role')).toBe('button');
    expect(row('l2').classList.contains('cm-faded')).toBe(false);
  });
  it('draws the quiz as a diamond and the assessment as a square', () => {
    expect(row('l4').querySelector('rect[transform^="rotate(45"]')).toBeTruthy();
    expect(row('l5').querySelector('rect[rx="2"]')).toBeTruthy();
  });
  it('has no placeholder assessment row when the assessment is a lesson', () => {
    expect(host.querySelector('[data-row="__terminus"]')).toBeNull();
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
    const empty = renderProfile({ ...payload, map: { lessons: [], next: null, unit: null } } as never, { classId: 'class1' });
    expect(empty.textContent).toContain('hasn’t set up a unit');
  });
});
