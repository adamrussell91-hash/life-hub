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
  it('shows the sheet as it has grown, with new marks and Test myself under a card', () => {
    const concept: SheetSection = { ...table, id: 's3', name: 'Perspective', role: 'concept', sentence: 'A sentence for the unit.' };
    const words: SheetSection = { id: 's4', name: 'Vocabulary', kind: 'table', role: 'vocab', columns: table.columns, lines: [
      { id: 'w1', cells: ['Hubris', 'Pride'], fresh: false, tier: 3 },
      { id: 'w2', cells: ['Ambition', 'A drive'], fresh: true, tier: 2 }
    ] };
    const p = renderOrganiserPanel(loadOf({ sheets: [sheet({ sections: [concept, words, list] })] }), { classId: 'c1' });
    expect(p.querySelector('.kos-capsule')!.textContent).toBe('Perspective');
    expect(p.querySelector('.kos-concept__line')!.textContent).toBe('A sentence for the unit.');
    expect(p.querySelector('.kos-stop')!.textContent).toContain('Answer');
    expect(p.querySelectorAll('.kos-stop .kos-new')).toHaveLength(2);
    expect([...p.querySelectorAll('.kos-tier')].map((n) => n.textContent)).toEqual(['Tier 2', 'Tier 3']);
    expect(p.querySelector('.kos-pair')!.textContent).toContain('Ambition');
    expect(p.querySelector('.kos-sec')).toBeNull();
    (p.querySelector('.kos-quiet') as HTMLElement).click();
    expect(p.querySelector('.kos-sec')).toBeTruthy();
    (p.querySelector('.kos-quiet') as HTMLElement).click();
    expect(p.querySelector('.kos-sec')).toBeNull();
  });
  it('shows the practice block with a count and the banner wording', () => {
    const p = renderOrganiserPanel(loadOf({ sheets: [sheet({ week: { section_id: 's1', section_name: 'Key ideas', due: '2026-11-13', reason: 'the Week 3 Review' } })] }), { classId: 'c1' });
    expect(p.querySelector('.kos-prac b')!.textContent).toBe('Practise today: 2');
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
  it('shows the back with builds, and Not yet does not bring the card back today', async () => {
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
    await h.settled();
    expect(review.mock.calls.map((c) => c[1])).toEqual([[{ line_id: 'a', result: 'again' }], [{ line_id: 'b', result: 'got' }]]);
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

describe('practice boxes and history', () => {
  it('shows a count for each box at the top, and everything on the sheet starts closed', () => {
    const p = renderOrganiserPanel(loadOf({ practice: { today: 2, cards, next: null, boxes: [4, 3, 2, 1, 0] } }), { classId: 'c1' });
    expect([...p.querySelectorAll('.kos-box__n')].map((n) => n.textContent)).toEqual(['4', '3', '2', '1', '0']);
    expect(p.querySelector('.kos-leitner')!.compareDocumentPosition(p.querySelector('.kos-sheet')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(p.querySelectorAll('details.kos-fold').length).toBeGreaterThan(0);
    expect(p.querySelectorAll('details[open]')).toHaveLength(0);
  });
  it('shows green and red circles with dates on a card', () => {
    const host = document.createElement('div');
    mountPractice(host, { classId: 'c1', load: { today: 1, cards: [{ ...cards[0]!, box: 2, history: [{ d: '2026-11-03', ok: false }, { d: '2026-11-04', ok: true }] }], next: null }, api: { review: vi.fn() } });
    expect(host.querySelector('.kos-card__from')!.textContent).toBe('Key ideas · Box 2');
    expect([...host.querySelectorAll('.kos-hist__item')].map((n) => n.className.includes('is-got'))).toEqual([false, true]);
    expect(host.querySelector('.kos-hist__day')!.textContent).toBe('3 Nov');
  });
});

describe('lesson end card', () => {
  it('adds a card with a link to the organiser tab', async () => {
    const content = document.createElement('div');
    const footer = document.createElement('div');
    content.append(footer);
    await mountOrganiserEndCard(content, { lessonId: 'l1', classId: 'c1', from: '/s/classes/c1/lessons/l1', before: footer, api: { lesson: async () => ({ items: [{ section: 'Perspective', text: 'Line one' }, { section: 'Vocabulary', text: 'Line two' }], joining: true }) } });
    expect(content.firstElementChild!.className).toBe('kos-end');
    expect(content.textContent).toContain('What to remember from this lesson');
    expect(content.querySelector('.kos-end__from')!.textContent).toBe('Perspective (1)');
    expect(content.querySelectorAll('details[open]')).toHaveLength(2);
    expect(content.textContent).toContain('Tick this lesson off below and they become practice cards.');
    expect(content.querySelector('a')!.getAttribute('href')).toContain('/s/classes/c1/profile?tab=organiser');
  });
  it('adds nothing when there are no lines or the call fails', async () => {
    const a = document.createElement('div');
    await mountOrganiserEndCard(a, { lessonId: 'l1', classId: 'c1', api: { lesson: async () => ({ items: [] }) } });
    const b = document.createElement('div');
    await mountOrganiserEndCard(b, { lessonId: 'l1', classId: 'c1', api: { lesson: async () => Promise.reject(new Error('x')) } });
    expect(a.childElementCount + b.childElementCount).toBe(0);
  });
});
