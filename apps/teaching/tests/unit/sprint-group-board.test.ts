// apps/teaching/tests/unit/sprint-group-board.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountGroupBoard } from '@/sprint/group-board';
import type { GroupBoard, SprintTeacherApi } from '@/sprint/api';
import type { Lesson } from '@/schemas/lesson';

const idea = (id: string, title: string, strongest: boolean, index: number) => ({ id, title, idea: 'x', answers: '', evidence: '', file: null, strongest, index });
const board = (): GroupBoard => ({
  group: { id: 'g1', name: 'Kestrel' }, awaiting: { kind: 'idea', tie: false, empty: false }, question: { id: 'q', text: 'How might we?' }, chosen: null, notes: [],
  gallery: [
    { id: 's1', name: 'Ann Bell', student_id: 'st_ann', ideas: [idea('i1', 'A phone app', true, 0), idea('i2', 'A textbook', false, 1)] },
    { id: 's2', name: 'Cy Dale', student_id: 'st_cy', ideas: [idea('i3', 'A poster', false, 0), idea('i4', 'A catching game', true, 1)] }
  ],
  totals: { i1: 1, i4: 2 }, heat: { i1: { c1: 1 }, i4: { c1: 3 } }, reasons: [], parts: [], pitch: null, subs: { prototype: [], test: [] }, round: null,
  voted: { done: ['Ann Bell', 'Cy Dale'], waiting: [] }
} as unknown as GroupBoard);

const progress = (open: string[], over: Record<string, unknown> = {}) => ({
  open,
  phases: [{ key: 'sketch', due_date: '2026-11-05', due_time: '11:00' }, { key: 'decide', due_date: '2026-11-05', due_time: '17:00' }],
  students: [
    { id: 'st_ann', name: 'Ann Bell', voted: false, phases: { understand: 'in', sketch: 'draft', decide: 'none', prototype: 'none', test: 'none' }, saved_at: { sketch: '2026-11-04T05:10:00.000Z' } },
    { id: 'st_cy', name: 'Cy Dale', voted: false, phases: { understand: 'in', sketch: 'in', decide: 'none', prototype: 'none', test: 'none' }, saved_at: {} }
  ],
  ...over
});
const mount = async (data: GroupBoard, extra: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  const api = { board: vi.fn(async () => data), confirm: vi.fn(async () => ({})), answer: vi.fn(async () => ({})), spotlight: vi.fn(async () => ({})), ...extra } as unknown as SprintTeacherApi;
  const lesson = { sprint: { criteria: [{ id: 'c1', text: 'A long criterion name in full' }] } } as unknown as Lesson;
  const handle = mountGroupBoard(host, { api, groupId: 'g1', getLesson: () => lesson, emitLesson: vi.fn(), onChanged: vi.fn() });
  await handle.refresh();
  return { host, api, handle };
};
const tabOn = (host: HTMLElement) => host.querySelector('.sboard__tab[aria-selected="true"]')?.textContent;
const clickTab = (host: HTMLElement, name: string) => [...host.querySelectorAll<HTMLButtonElement>('.sboard__tab')].find((t) => t.textContent === name)!.click();

describe('group board', () => {
  it('lists the starred ideas that went head to head, most wins first, with full criterion names, and folds the rest by student', async () => {
    const { host } = await mount(board());
    const rows = [...host.querySelectorAll('.sboard__ideas tbody tr')];
    expect(rows.map((r) => r.querySelector('.sboard__title')!.textContent)).toEqual(['A catching game', 'A phone app']);
    expect(rows.map((r) => r.querySelector('td.is-wins')!.textContent)).toEqual(['2', '1']);
    expect(rows[0]!.querySelector('.sboard__by')!.textContent).toBe('Cy Dale');
    expect(host.querySelector('.sboard__ideas th.is-crit')!.textContent).toBe('A long criterion name in full');
    const more = host.querySelector('.sboard__more')!;
    expect(more.querySelector('summary')!.textContent).toBe('Other ideas, by student (2)');
    expect([...more.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(['Ann Bell', 'Cy Dale']);
    expect(more.textContent).toContain('A textbook');
  });

  it('says who is where, and opens on the tab for the phase the group is in', async () => {
    const { host } = await mount({ ...board(), awaiting: null, progress: progress(['understand', 'sketch']) } as unknown as GroupBoard);
    expect(tabOn(host)).toBe('Sketch and Decide');
    expect(host.querySelector('.sboard__sub')!.textContent).toContain('In Sketch · 1 of 2 handed in · closes');
    expect([...host.querySelectorAll('.sboard__who th')].map((t) => t.textContent)).toEqual(['Student', 'Understand', 'Sketch']);
    const ann = [...host.querySelectorAll('.sboard__who tbody tr')][0]!;
    expect(ann.querySelector('td.is-now')!.textContent).toMatch(/^Saved, not handed inLast saved /);
    expect(host.querySelector('.sboard__pane')!.textContent).toContain('Not in yet: Ann Bell. Saved cards go in when Sketch closes.');
  });

  it('counts only the match-ups still in the pool in the Decide column', async () => {
    const data = { ...board(), awaiting: null, progress: progress(['understand', 'sketch', 'decide']), reasons: [{ student_id: 'st_ann', name: 'Ann Bell', votes: {}, reasons: {}, duels: [{ a: 'i1', b: 'i4', winner: 'i4', stronger: [] }, { a: 'gone', b: 'i4', winner: 'i4', stronger: [] }] }] } as unknown as GroupBoard;
    const { host } = await mount(data);
    const ann = [...host.querySelectorAll('.sboard__who tbody tr')][0]!;
    expect(ann.querySelector('td.is-now')!.textContent).toBe('1 of 1 match-ups');
  });

  it('shows what needs the teacher with a way straight to it, and keeps the tab after an answer', async () => {
    const data = { ...board(), awaiting: null, progress: progress(['understand', 'sketch']), understand: { who: [], why: [], audience: null, limits: { can_known: [{ text: 'The poems', count: 2 }], cant_known: [], can_unknown: [], cant_unknown: [] }, questions: [], sent: [{ id: 'q1', text: 'How many marks?', answer: null }] } } as unknown as GroupBoard;
    const { host, api } = await mount(data);
    expect(host.querySelector('.sboard__needs')!.textContent).toContain('1 question from the group to answer.');
    host.querySelector<HTMLButtonElement>('.sboard__needs button')!.click();
    expect(tabOn(host)).toBe('Understand');
    expect(host.querySelector('.sboard__limits')!.textContent).toContain('The poems ×2');
    const box = host.querySelector<HTMLTextAreaElement>('.sboard__answer textarea')!;
    box.value = 'Twenty.';
    host.querySelector<HTMLFormElement>('.sboard__answer')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.answer).toHaveBeenCalledWith('g1', 'q1', 'Twenty.');
    expect(tabOn(host)).toBe('Understand');
  });

  it('keeps a read card open when the board repaints', async () => {
    const { host, handle } = await mount({ ...board(), awaiting: null } as unknown as GroupBoard);
    const card = host.querySelector<HTMLDetailsElement>('.sboard__ideas .sboard__card')!;
    card.open = true;
    card.dispatchEvent(new Event('toggle'));
    await handle.refresh();
    expect(host.querySelector<HTMLDetailsElement>('.sboard__ideas .sboard__card')!.open).toBe(true);
    clickTab(host, 'Prototype');
    expect(host.querySelector('.sboard__pane')!.textContent).toContain('Parts and the pitch file show here');
  });
  it('offers another go only where a student has work, says what it touches, and only acts once confirmed', async () => {
    const anotherGo = vi.fn(async () => ({}));
    const { host } = await mount({ ...board(), awaiting: null, progress: progress(['understand', 'sketch']) } as unknown as GroupBoard, { anotherGo });
    const cy = [...host.querySelectorAll('.sboard__who tbody tr')][1]!;
    const link = [...cy.querySelectorAll<HTMLButtonElement>('td.is-now .sboard__again')].find((b) => b.textContent === 'Give another go')!;
    link.click();
    expect(anotherGo).not.toHaveBeenCalled();
    const box = host.querySelector('.smap-confirm')!;
    expect(box.querySelector('strong')!.textContent).toBe('Give Cy Dale another go at Sketch?');
    expect(box.textContent).toContain('Their earlier work is set aside, and you can bring it back here.');
    expect(box.textContent).toContain('Their idea leaves the head-to-heads until they hand in again');
    [...box.querySelectorAll('button')].find((b) => b.textContent === 'Give another go')!.click();
    expect(anotherGo).toHaveBeenCalledWith('st_cy', 'sketch');
  });

  it('has no another go on a step with nothing in, and offers Bring back once work is set aside', async () => {
    const bringBack = vi.fn(async () => ({}));
    const data = progress(['understand', 'sketch']);
    data.students[1] = { ...data.students[1]!, phases: { ...data.students[1]!.phases, sketch: 'none' }, earlier: { sketch: 1 } } as never;
    const { host } = await mount({ ...board(), awaiting: null, progress: data } as unknown as GroupBoard, { bringBack });
    const cell = [...host.querySelectorAll('.sboard__who tbody tr')][1]!.querySelector('td.is-now')!;
    expect([...cell.querySelectorAll('.sboard__again')].map((b) => b.textContent)).toEqual(['Bring back earlier work']);
    cell.querySelector<HTMLButtonElement>('.sboard__again')!.click();
    [...host.querySelectorAll<HTMLButtonElement>('.smap-confirm button')].find((b) => b.textContent === 'Bring it back')!.click();
    expect(bringBack).toHaveBeenCalledWith('st_cy', 'sketch');
  });

  it('ticks a student off for Prototype by hand and counts them as done', async () => {
    const students = [
      { id: 'st_ann', name: 'Ann Bell', voted: true, phases: { understand: 'in', sketch: 'in', decide: 'in', prototype: 'none', test: 'none' }, saved_at: {}, ticked: { prototype: '2026-11-09T01:00:00.000Z' } },
      { id: 'st_cy', name: 'Cy Dale', voted: true, phases: { understand: 'in', sketch: 'in', decide: 'in', prototype: 'draft', test: 'none' }, saved_at: {} }
    ];
    const data = { ...board(), awaiting: null, chosen: 'i4', progress: progress(['understand', 'sketch', 'decide', 'prototype'], { students }) } as unknown as GroupBoard;
    const tick = vi.fn(async () => ({}));
    const { host } = await mount(data, { tick });
    expect(host.querySelector('.sboard__sub')!.textContent).toContain('In Prototype · 1 of 2 done');
    const [ann, cy] = [...host.querySelectorAll('.sboard__who tbody tr')];
    expect(ann!.querySelector('td.is-now .sboard__state')!.textContent).toBe('Ticked off');
    expect(ann!.querySelector<HTMLInputElement>('td.is-now .sboard__tick input')!.checked).toBe(true);
    expect(ann!.querySelector('td.is-past .sboard__tick')).toBeNull();
    const box = cy!.querySelector<HTMLInputElement>('td.is-now .sboard__tick input')!;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(tick).toHaveBeenCalledWith('st_cy', 'prototype', true);
  });

  it('shows every part of each peer feedback card: levels, both lines and the class tally', async () => {
    const round = { status: 'closed', entries: [
      { student_id: 'st_ed', name: 'Ed Fox', levels: { c1: 3 }, worked: 'The map was clear.', next: 'Add a key.', about: 'c1', flagged: false, status: 'ok' },
      { student_id: 'st_gus', name: 'Gus Hay', levels: { c1: 2 }, worked: 'Bad word here.', next: 'Try again.', about: '', flagged: true, status: 'held' }
    ] };
    const data = { ...board(), awaiting: null, progress: progress(['understand', 'sketch', 'decide', 'prototype', 'test']), round } as unknown as GroupBoard;
    const { host } = await mount(data);
    expect(tabOn(host)).toBe('Test and marking');
    const cards = [...host.querySelectorAll('.sboard__feedback')];
    expect(cards).toHaveLength(2);
    expect(cards[0]!.querySelector('.sboard__levels')!.textContent).toBe('A long criterion name in fullStrong');
    expect(cards[0]!.textContent).toContain('What workedThe map was clear.');
    expect(cards[0]!.textContent).toContain('Try nextAdd a key.');
    expect(cards[0]!.textContent).toContain('About: A long criterion name in full');
    expect(cards[1]!.textContent).toContain('Held');
    expect(host.querySelector('.sprint-tally__bar')!.getAttribute('aria-label')).toBe('A long criterion name in full: Starting 0, Showing 1, Strong 1');
  });
});
