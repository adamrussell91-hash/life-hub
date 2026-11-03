import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderOrganiserPanel } from '@/organiser/student-panel';
import { mountTestMyself } from '@/organiser/test-myself';
import { mountPractice, readPending } from '@/organiser/practice';
import { mountOrganiserEndCard } from '@/organiser/lesson-end-card';
import type { OrganiserLoad, PracticeCard, Sheet, SheetSection } from '@/organiser/types';

vi.mock('@/organiser/print', () => ({ printOrganiser: vi.fn() }));

const table: SheetSection = {
  id: 's1',
  name: 'Key ideas',
  kind: 'table',
  columns: [
    { id: 'c1', label: 'Prompt', hide: false },
    { id: 'c2', label: 'What to know', hide: true }
  ],
  lines: [
    { id: 'a', cells: ['Prompt A', 'Answer A'], fresh: true },
    { id: 'b', cells: ['Prompt B', 'Answer B'], fresh: true },
    { id: 'c', cells: ['Prompt C', 'Answer C'], fresh: false }
  ]
};
const list: SheetSection = { id: 's2', name: 'Order', kind: 'sequence', lines: [{ id: 'x', cells: ['First'], fresh: false }, { id: 'y', cells: ['Second'], fresh: false }] };
const sheet = (over: Partial<Sheet> = {}): Sheet => ({ unit_id: 'u1', title: 'Sample unit organiser', current: true, sections: [table, list], ...over });
const cards: PracticeCard[] = [
  { line_id: 'a', section: 'Key ideas', cue_label: 'Prompt', cue: 'Prompt A', answer_label: 'What to know', answer: 'Answer A', more: [{ label: 'Where', text: 'Somewhere' }], builds: 'A big idea' },
  { line_id: 'b', section: 'Key ideas', cue_label: 'Prompt', cue: 'Prompt B', answer_label: 'What to know', answer: 'Answer B', more: [] }
];
const loadOf = (over: Partial<OrganiserLoad> = {}): OrganiserLoad => ({ need: null, sheets: [sheet()], practice: { today: 2, cards, next: null }, ...over });
const click = (root: ParentNode, sel: string): void => (root.querySelector(sel) as HTMLElement).click();
const byText = (root: ParentNode, sel: string, text: string): HTMLElement =>
  [...root.querySelectorAll<HTMLElement>(sel)].find((n) => n.textContent?.trim() === text)!;

beforeEach(() => localStorage.clear());

describe('organiser panel', () => {
  it('shows folded sections with counts and new labels', () => {
    const p = renderOrganiserPanel(loadOf(), { classId: 'c1' });
    const heads = [...p.querySelectorAll('.kos-fold__head')];
    expect(heads).toHaveLength(2);
    expect(heads[0]!.textContent).toContain('2 new');
    expect(heads[0]!.querySelector('.kos-fold__meta')!.textContent).toBe('3');
    expect(heads[1]!.textContent).not.toContain('new');
    expect(p.querySelector('.kos-sec')).toBeNull();
    (heads[0] as HTMLElement).click();
    expect(p.querySelector('.kos-sec')).toBeTruthy();
    expect(p.textContent).toContain('Test myself');
  });
  it('shows the practice block with a count and the banner wording', () => {
    const p = renderOrganiserPanel(loadOf({ sheets: [sheet({ week: { section_id: 's1', section_name: 'Key ideas', due: '2026-11-13', reason: 'the Week 3 Review' } })] }), { classId: 'c1' });
    expect(p.querySelector('.kos-prac b')!.textContent).toBe('Practise: 2 today');
    expect(p.querySelector('.kos-set')!.textContent).toBe('This week: Key ideas, by Friday, for the Week 3 Review.');
    expect(p.querySelector('.kos-prac .kos-btn')!.textContent).toBe('Start');
  });
  it('says when the next cards come when none are due', () => {
    const p = renderOrganiserPanel(loadOf({ practice: { today: 0, cards: [], next: { date: '2026-11-12', count: 4 } } }), { classId: 'c1' });
    expect(p.querySelector('.kos-prac')!.textContent).toContain('4 cards come on Thursday');
    expect(p.querySelector('.kos-prac button')).toBeNull();
  });
  it('has no practice block when practice is null', () => {
    const p = renderOrganiserPanel(loadOf({ practice: null }), { classId: 'c1' });
    expect(p.querySelector('.kos-prac')).toBeNull();
  });
  it('switches unit only with more than one sheet, current first', () => {
    expect(renderOrganiserPanel(loadOf(), { classId: 'c1' }).querySelector('.kos-switch')).toBeNull();
    const p = renderOrganiserPanel(loadOf({ sheets: [sheet({ unit_id: 'old', title: 'Old unit', current: false }), sheet()] }), { classId: 'c1' });
    const pills = [...p.querySelectorAll('.kos-switch .kos-pill')].map((x) => x.textContent);
    expect(pills).toEqual(['Sample unit organiser', 'Old unit']);
    expect(p.querySelector('.kos-title')!.textContent).toBe('Sample unit organiser');
  });
  it('shows no scores, streaks or percentages', () => {
    const p = renderOrganiserPanel(loadOf(), { classId: 'c1' });
    expect(p.textContent).not.toMatch(/%|streak|score/i);
  });
});

describe('test myself', () => {
  it('goes again on the unticked rows only', () => {
    const host = document.createElement('div');
    mountTestMyself(host, table);
    click(host, '.kos-btn--primary'); // Test myself
    click(host, '.kos-btn--primary'); // Cover it (Hide starts from the section)
    expect(host.querySelectorAll('textarea')).toHaveLength(3);
    const first = host.querySelector('textarea') as HTMLTextAreaElement;
    first.value = 'my try';
    first.dispatchEvent(new Event('input'));
    click(host, '.kos-btn--primary'); // Check
    expect(host.textContent).toContain('my try');
    (host.querySelector('[data-label="What to know"]') as HTMLElement);
    click(host, '.kos-tick');
    expect(host.querySelector('.kos-tally')!.textContent).toContain('1 more');
    byText(host, 'button', 'Go again').click();
    expect(host.querySelectorAll('textarea')).toHaveLength(2);
    byText(host, 'button', 'Check').click();
    byText(host, 'button', 'Cover everything').click();
    expect(host.querySelectorAll('textarea')).toHaveLength(3);
  });
  it('covers a sequence with typed lines and saves nothing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const host = document.createElement('div');
    mountTestMyself(host, list);
    click(host, '.kos-btn--primary');
    click(host, '.kos-btn--primary');
    const ta = host.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'First\nSecond';
    ta.dispatchEvent(new Event('input'));
    byText(host, 'button', 'Check').click();
    expect(host.querySelector('.kos-wroteblock')!.textContent).toContain('First');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('practice', () => {
  const answer = (host: HTMLElement, which: 'got' | 'again'): void => {
    byText(host, 'button', 'Show answer').click();
    click(host, `[data-result="${which}"]`);
  };
  it('shows the back with builds, and Again brings the card round again', async () => {
    const review = vi.fn().mockResolvedValue({ today: 1, next: { date: '2026-11-12', count: 3 } });
    const host = document.createElement('div');
    const h = mountPractice(host, { classId: 'c1', load: { today: 2, cards, next: null }, api: { review } });
    expect(host.textContent).toContain('2 to go today');
    byText(host, 'button', 'Show answer').click();
    expect(host.textContent).toContain('This builds your big idea');
    expect(host.textContent).toContain('A big idea');
    click(host, '[data-result="again"]');
    expect(host.textContent).toContain('Prompt B');
    answer(host, 'got');
    expect(host.textContent).toContain('Prompt A');
    expect(host.textContent).toContain('1 to go today');
    answer(host, 'got');
    await h.settled();
    expect(review.mock.calls.map((c) => c[1])).toEqual([[{ line_id: 'a', result: 'again' }], [{ line_id: 'b', result: 'got' }], [{ line_id: 'a', result: 'got' }]]);
    expect(host.textContent).toContain('All done for today');
    expect(host.textContent).toContain('3 cards come on Thursday');
    expect(readPending('c1')).toEqual([]);
  });
  it('keeps a failed result and sends it with the next review', async () => {
    const review = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ today: 0, next: null });
    const host = document.createElement('div');
    const h = mountPractice(host, { classId: 'c1', load: { today: 2, cards, next: null }, api: { review } });
    answer(host, 'got');
    await h.settled();
    expect(readPending('c1')).toEqual([{ line_id: 'a', result: 'got' }]);
    expect(host.textContent).toContain('Prompt B'); // the session carries on
    answer(host, 'got');
    await h.settled();
    expect(review.mock.calls[1]![1]).toEqual([{ line_id: 'a', result: 'got' }, { line_id: 'b', result: 'got' }]);
    expect(readPending('c1')).toEqual([]);
  });
  it('flushes leftovers when a session starts', async () => {
    localStorage.setItem('teaching.organiser.pending.c1', JSON.stringify([{ line_id: 'z', result: 'again' }]));
    const review = vi.fn().mockResolvedValue({ today: 0, next: null });
    const h = mountPractice(document.createElement('div'), { classId: 'c1', load: { today: 2, cards, next: null }, api: { review } });
    await h.settled();
    expect(review).toHaveBeenCalledWith('c1', [{ line_id: 'z', result: 'again' }]);
    expect(readPending('c1')).toEqual([]);
  });
});

describe('lesson end card', () => {
  it('adds a card with a link to the organiser tab', async () => {
    const content = document.createElement('div');
    const footer = document.createElement('div');
    content.append(footer);
    await mountOrganiserEndCard(content, { lessonId: 'l1', classId: 'c1', from: '/s/classes/c1/lessons/l1', before: footer, api: { lesson: async () => ({ lines: ['Line one', 'Line two'], joining: true }) } });
    expect(content.firstElementChild!.className).toBe('kos-end');
    expect(content.textContent).toContain('From this lesson: 2 new lines');
    expect(content.querySelector('a')!.getAttribute('href')).toContain('/s/classes/c1/profile?tab=organiser');
  });
  it('adds nothing when there are no lines or the call fails', async () => {
    const a = document.createElement('div');
    await mountOrganiserEndCard(a, { lessonId: 'l1', classId: 'c1', api: { lesson: async () => ({ lines: [] }) } });
    const b = document.createElement('div');
    await mountOrganiserEndCard(b, { lessonId: 'l1', classId: 'c1', api: { lesson: async () => Promise.reject(new Error('x')) } });
    expect(a.childElementCount + b.childElementCount).toBe(0);
  });
});
