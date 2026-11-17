import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderSharePage, renderShareSignIn, mountShareTour, routeLessonLinks } from '@/student/share-view';
import type { SharePage } from '@/student/share-api';

const page: SharePage = {
  student: { first_name: 'Ana' },
  class_title: '9 English',
  viewer_initials: 'PT',
  lesson_ids: ['l1', 'l2', 'l3', 'l4'],
  ticks: [
    { lesson_id: 'l1', title: 'Ghost poem', at: '2026-11-11T10:42:00Z', via: 'tick', planned: '2026-11-03', record: [{ at: '2026-11-04T00:02:00Z', kind: 'tick' }, { at: '2026-11-11T10:40:00Z', kind: 'untick' }, { at: '2026-11-11T10:42:00Z', kind: 'tick' }] },
    { lesson_id: 'l3', title: 'Sound and rhythm', at: '2026-11-11T10:41:00Z', via: 'tick', record: [{ at: '2026-11-11T10:41:00Z', kind: 'tick' }] }
  ],
  bursts: [{ from: '2026-11-11T10:40:00Z', to: '2026-11-11T10:43:00Z', count: 5 }],
  profile: {
    need: null,
    pieces: [{ id: 'w:l1:a', label: 'Ghost poem', date: '3 Nov', kind: 'written' }],
    outcomes: [],
    concepts: [],
    skills: [],
    next: [{ code_id: 'c1', code: 'T', colour: 'blue', positive: false, hit: 2, of: 3, action: 'Name the technique before its effect.' }],
    focus: { kind: 'code', line: 'Name the technique before its effect.' }
  } as SharePage['profile']
};

const TOKEN = 'Abc123_-Abc123_-Abc123_-';
const opts = { token: TOKEN, today: '2026-11-15', onSignOut: () => {} };

describe('renderSharePage', () => {
  const root = renderSharePage(page, opts);
  const text = root.textContent ?? '';
  it('is the student’s own progress page, headed with their name, view only', () => {
    expect(root.querySelector('.pm-profile')).not.toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('Ana’s progress');
    expect(text).toContain('View only · 9 English');
    expect(text).toContain('PT');
    expect(text).toContain('Your next steps');
    expect(text).toContain('Name the technique before its effect.');
  });
  it('has no Returned work tab and nothing to type into', () => {
    expect(root.querySelector('[role="tab"]')).toBeNull();
    expect(text).not.toContain('Returned work');
    expect(root.querySelector('input, textarea')).toBeNull();
  });
  it('folds tick times, the planned day, the record and the burst at the foot', () => {
    const fold = root.querySelector('details.share-ticks-fold');
    expect(fold?.querySelector('summary')?.textContent).toBe('When lessons were ticked off (2)');
    expect(text).toContain('Ticked Wed 11 Nov, 9:42pm');
    expect(text).toContain('planned Tue 3 Nov');
    expect(text).toContain('Ticked 2 times');
    expect(text).toContain('5 ticked within 3 minutes');
  });
  it('shows the first 20 ticks, then Show earlier', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ lesson_id: `x${i}`, title: `Lesson ${i}`, at: new Date(Date.UTC(2026, 10, 1, i)).toISOString(), via: 'tick' as const, record: [] }));
    const long = renderSharePage({ ...page, ticks: many }, opts);
    expect(long.querySelectorAll('.share-tick:not([hidden])')).toHaveLength(20);
    long.querySelector<HTMLButtonElement>('.share-more')!.click();
    expect(long.querySelectorAll('.share-tick:not([hidden])')).toHaveLength(25);
  });
});

describe('routeLessonLinks', () => {
  it('sends the student page’s lesson links to the locked share lesson', () => {
    const host = document.createElement('div');
    const a = document.createElement('a');
    a.href = 'https://class.adam-russell.com/s/classes/share/lessons/l2';
    a.textContent = 'Open';
    host.append(a);
    document.body.append(host);
    const go = vi.fn();
    const stop = routeLessonLinks(host, TOKEN, go);
    expect(a.getAttribute('href')).toBe(`/s/share/${TOKEN}/lessons/l2`);
    a.click();
    expect(go).toHaveBeenCalledWith(`/s/share/${TOKEN}/lessons/l2`);
    stop();
    host.remove();
  });
});

describe('renderShareSignIn', () => {
  it('asks for initials and a 6-digit PIN', () => {
    const form = renderShareSignIn({ onSubmit: async () => {} });
    expect(form.querySelector('input[name="initials"]')).not.toBeNull();
    const pin = form.querySelector<HTMLInputElement>('input[name="pin"]');
    expect(pin?.inputMode).toBe('numeric');
    expect(pin?.maxLength).toBe(6);
  });
  it('checks the PIN shape before sending', async () => {
    let sent = 0;
    const form = renderShareSignIn({ onSubmit: async () => { sent += 1; } });
    form.querySelector<HTMLInputElement>('input[name="initials"]')!.value = 'PT';
    form.querySelector<HTMLInputElement>('input[name="pin"]')!.value = '12';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(sent).toBe(0);
    expect(form.textContent).toContain('Type your initials and the 6-digit PIN.');
  });
});

describe('mountShareTour', () => {
  beforeEach(() => window.localStorage.clear());
  it('walks the parts shown, ending on the tick times', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    host.append(renderSharePage(page, opts));
    document.body.append(host);
    const tour = mountShareTour(host, page);
    const card = () => document.querySelector('.tour-card')?.textContent ?? '';
    const total = Number(card().match(/1 of (\d+)/)?.[1]);
    expect(total).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < total; i += 1) tour.next();
    expect(card()).toContain('When lessons were ticked');
    tour.next();
    expect(document.querySelector('.tour-card')).toBeNull();
    tour.dispose();
  });
});
