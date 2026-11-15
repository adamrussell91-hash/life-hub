import { describe, it, expect, beforeEach } from 'vitest';
import { renderSharePage, renderShareSignIn, mountShareTour } from '@/student/share-view';
import type { SharePage } from '@/student/share-api';

const page: SharePage = {
  student: { first_name: 'Ana' },
  class_title: '9 English',
  viewer_initials: 'PT',
  lesson_ids: ['l1', 'l2', 'l3', 'l4'],
  next: [{ title: 'Speaker and voice', lesson_id: 'l2', box: 'now' }],
  unit: { title: 'Poetry', core_done: 7, core_total: 12 },
  countdowns: [{ title: 'Poem task', lesson_id: 'l4', due_date: '2026-11-21', due_time: '15:00', assessment: true }],
  ticks: [
    { lesson_id: 'l1', title: 'Ghost poem', at: '2026-11-11T10:42:00Z', via: 'tick', planned: '2026-11-03', record: [{ at: '2026-11-04T00:02:00Z', kind: 'tick' }, { at: '2026-11-11T10:40:00Z', kind: 'untick' }, { at: '2026-11-11T10:42:00Z', kind: 'tick' }] },
    { lesson_id: 'l3', title: 'Sound and rhythm', at: '2026-11-11T10:41:00Z', via: 'tick', record: [{ at: '2026-11-11T10:41:00Z', kind: 'tick' }] }
  ],
  bursts: [{ from: '2026-11-11T10:40:00Z', to: '2026-11-11T10:43:00Z', count: 5 }],
  practice: { streak: 3, days: ['2026-11-13', '2026-11-14', '2026-11-15'], weekly: [{ week_start: '2026-11-09', right: 18, seen: 24 }], today: { left: 4, answered: 6 } },
  feedback: { to_act: [{ title: 'Ghost poem draft', redraft: true }], waiting: 1 }
};

const opts = { token: 'Abc123_-Abc123_-Abc123_-', today: '2026-11-15', onSignOut: () => {} };

describe('renderSharePage', () => {
  const root = renderSharePage(page, opts);
  const text = root.textContent ?? '';
  it('shows every section with a data-tour hook', () => {
    for (const key of ['next', 'unit', 'coming', 'ticks', 'practice', 'organiser', 'feedback']) expect(root.querySelector(`[data-tour="${key}"]`)).not.toBeNull();
  });
  it('names the student and the class', () => {
    expect(text).toContain('Ana’s English');
    expect(text).toContain('9 English');
    expect(text).toContain('PT');
  });
  it('shows tick times, the planned day, the record and the burst', () => {
    expect(text).toContain('Ticked Wed 11 Nov, 9:42pm');
    expect(text).toContain('planned Tue 3 Nov');
    expect(text).toContain('Ticked 2 times');
    expect(text).toContain('Unticked Wed 11 Nov, 9:40pm');
    expect(text).toContain('5 ticked within 3 minutes');
  });
  it('links lessons to the locked view', () => {
    const link = root.querySelector<HTMLAnchorElement>('a[href$="/s/share/Abc123_-Abc123_-Abc123_-/lessons/l2"]');
    expect(link?.textContent).toBe('Speaker and voice');
  });
  it('draws 28 practice squares and fills the practised days', () => {
    expect(root.querySelectorAll('.share-grid__day')).toHaveLength(28);
    expect(root.querySelectorAll('.share-grid__day.is-on')).toHaveLength(3);
    expect(root.querySelector('.share-grid')?.getAttribute('aria-label')).toBe('Practised on 3 days in the last four weeks');
  });
  it('shows the unit bar, countdown, organiser and counts only', () => {
    expect(text).toContain('7 of 12 core lessons');
    expect(text).toContain('in 6 days');
    expect(text).toContain('4 cards left today · 6 answered');
    expect(text).toContain('Ghost poem draft');
    expect(text).toContain('Redraft asked for');
    expect(text).toContain('1 piece waiting to be marked');
  });
  it('drops sections with nothing in them and says so plainly', () => {
    const bare = renderSharePage({ ...page, countdowns: [], ticks: [], bursts: [], practice: { streak: 0, days: [], weekly: [], today: null } }, opts);
    expect(bare.querySelector('[data-tour="coming"]')).toBeNull();
    expect(bare.textContent).toContain('Nothing ticked off in this unit yet.');
    expect(bare.textContent).toContain('No practice in the last 4 weeks.');
    expect(bare.textContent).toContain('No organiser cards today.');
  });
  it('shows the first 20 ticks, then Show earlier', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ lesson_id: `x${i}`, title: `Lesson ${i}`, at: new Date(Date.UTC(2026, 10, 1, i)).toISOString(), via: 'tick' as const, record: [] }));
    const long = renderSharePage({ ...page, ticks: many }, opts);
    expect(long.querySelectorAll('.share-tick:not([hidden])')).toHaveLength(20);
    long.querySelector<HTMLButtonElement>('.share-more')!.click();
    expect(long.querySelectorAll('.share-tick:not([hidden])')).toHaveLength(25);
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
  it('walks every section shown, ending on the lessons', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    host.append(renderSharePage(page, opts));
    document.body.append(host);
    const tour = mountShareTour(host, page);
    expect(document.querySelector('.tour-card')?.textContent).toContain('1 of 9');
    for (let i = 0; i < 8; i += 1) tour.next();
    expect(document.querySelector('.tour-card')?.textContent).toContain('Lessons');
    tour.next();
    expect(document.querySelector('.tour-card')).toBeNull();
    tour.dispose();
  });
});
