import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/organiser/print', () => ({ printOrganiser: vi.fn() }));
import { renderProfile } from '@/student/profile-view';
import { oneThing, POINTER_DELAY_MS, resetNowStrip } from '@/student/now-strip';
import { PULSE_COLOURS, PULSE_STEP_MS, pulseCount, resetColourPulse } from '@/student/colour-pulse';
import type { TodoBoxItem, TodoPayload } from '@/student/todo-panel';

const base: TodoPayload = { countdowns: [], announcements: [], practice: null, waiting: [], boxes: [], more: 0 };
const lesson = (id: string, extra: Partial<TodoBoxItem> = {}): TodoBoxItem => ({ id, title: `Lesson ${id}`, kind: 'lesson', done: false, reason: '', ...extra });

const unit = { content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Task' } }, lines: [], lessons: [{ id: 'l1', title: 'Ghost poem' }], schedule: [], pre: [] };
const page = (todo: TodoPayload, extra: Record<string, unknown> = {}) => ({
  need: null,
  initials: 'XY',
  pieces: [],
  has_returned: true,
  todo,
  map: { next: null, unit, lessons: [{ id: 'l1', title: 'Ghost poem', role: 'core', kind: 'lesson', done: false }] },
  ...extra
});
const todo: TodoPayload = { ...base, boxes: [{ key: 'now', items: [lesson('a', { done: true }), lesson('b', { feedback: { state: 'new', kind: 'written', date: '2026-11-10' }, title: 'Poem paragraph' })] }] };

describe('the one thing', () => {
  it('is the first open row in Do now, worded as what to do', () => {
    expect(oneThing(todo)).toEqual({ key: 'b', what: 'Read your feedback on Poem paragraph' });
  });
  it('falls back to today’s cards, then Do next', () => {
    expect(oneThing({ ...base, practice: { today: 15, answered: 0 }, boxes: [{ key: 'next', items: [lesson('c')] }] })?.what).toBe('Practise your organiser: 15 cards');
    expect(oneThing({ ...base, boxes: [{ key: 'next', items: [lesson('c', { kind: 'quiz', title: 'Week 3' })] }] })).toEqual({ key: 'c', what: 'Do the quiz: Week 3' });
  });
  it('is nothing when everything is done', () => {
    expect(oneThing({ ...base, boxes: [{ key: 'now', items: [lesson('a', { done: true })] }] })).toBeNull();
    expect(oneThing(undefined)).toBeNull();
  });
});

describe('the Do this now strip', () => {
  beforeEach(() => {
    resetNowStrip();
    vi.useFakeTimers();
    document.body.replaceChildren();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('sits above the tabs, so it stays on every tab', () => {
    const h = renderProfile(page(todo) as never, { classId: 'c1', loadReturned: async () => [] });
    const strip = h.querySelector('.ns-strip')!;
    expect(strip.textContent).toContain('Read your feedback on Poem paragraph');
    expect(strip.compareDocumentPosition(h.querySelector('.pg-tabs')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.closest('.pg-panel')).toBeNull();
  });

  it('Show me opens My progress and frames the row on the To do list', () => {
    const h = renderProfile(page(todo) as never, { classId: 'c1', loadReturned: async () => [] });
    document.body.append(h);
    h.querySelector<HTMLButtonElement>('.pg-tab[data-tab="returned"]')!.click();
    h.querySelector<HTMLButtonElement>('.ns-strip__go')!.click();
    expect(h.querySelector('.pg-tab[data-tab="progress"]')!.getAttribute('aria-selected')).toBe('true');
    expect(h.querySelector('[data-todo="b"]')!.classList.contains('is-pointed')).toBe(true);
    expect(h.querySelector('.td-panel')!.classList.contains('is-pointed')).toBe(true);
  });

  it('× hides it until the page loads again, and a redraw keeps it hidden', () => {
    const h = renderProfile(page(todo) as never, { classId: 'c1' });
    h.querySelector<HTMLButtonElement>('.ns-strip__close')!.click();
    expect(h.querySelector('.ns-strip')).toBeNull();
    expect(renderProfile(page(todo) as never, { classId: 'c1' }).querySelector('.ns-strip')).toBeNull();
  });

  it('the pointer comes up after ten seconds, once, and Don’t show this again turns it off', () => {
    const off = vi.fn();
    const h = renderProfile(page(todo, { pointer: true }) as never, { classId: 'c1', pointerOff: off });
    document.body.append(h);
    vi.advanceTimersByTime(POINTER_DELAY_MS - 1);
    expect(document.querySelector('.ns-pointer')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('.ns-pointer')!.textContent).toContain('This is what to do now.');
    document.querySelector<HTMLButtonElement>('.ns-pointer__never')!.click();
    expect(off).toHaveBeenCalledOnce();
    expect(document.querySelector('.ns-pointer')).toBeNull();
    // A redraw (say the organiser reloads) never brings it back on the same visit.
    h.replaceWith(renderProfile(page(todo, { pointer: true }) as never, { classId: 'c1', pointerOff: off }));
    vi.advanceTimersByTime(POINTER_DELAY_MS * 2);
    expect(document.querySelector('.ns-pointer')).toBeNull();
  });

  it('tapping the pointer goes to the row on the list', () => {
    const h = renderProfile(page(todo, { pointer: true }) as never, { classId: 'c1' });
    document.body.append(h);
    vi.advanceTimersByTime(POINTER_DELAY_MS);
    document.querySelector<HTMLButtonElement>('.ns-pointer__hole')!.click();
    expect(document.querySelector('.ns-pointer')).toBeNull();
    expect(h.querySelector('[data-todo="b"]')!.classList.contains('is-pointed')).toBe(true);
  });

  it('no pointer once turned off, once the strip is used, or for the teacher', () => {
    const off = renderProfile(page(todo, { pointer: false }) as never, { classId: 'c1' });
    document.body.append(off);
    vi.advanceTimersByTime(POINTER_DELAY_MS);
    expect(document.querySelector('.ns-pointer')).toBeNull();
    expect(off.querySelector('.ns-strip')).toBeTruthy();

    resetNowStrip();
    off.remove();
    const used = renderProfile(page(todo, { pointer: true }) as never, { classId: 'c1' });
    document.body.append(used);
    used.querySelector<HTMLButtonElement>('.ns-strip__go')!.click();
    vi.advanceTimersByTime(POINTER_DELAY_MS);
    expect(document.querySelector('.ns-pointer')).toBeNull();

    resetNowStrip();
    used.remove();
    const teacher = renderProfile(page(todo, { pointer: true }) as never, { classId: 'c1', teacher: { name: 'Student' } });
    document.body.append(teacher);
    vi.advanceTimersByTime(POINTER_DELAY_MS);
    expect(document.querySelector('.ns-pointer')).toBeNull();
  });

  it('pulses the To do panel’s Do now box, not the strip: two colours, one more every ten seconds up to ten', () => {
    resetColourPulse();
    expect([0, 9_999, 10_000, 30_000, 80_000, 500_000].map(pulseCount)).toEqual([2, 2, 3, 5, 10, 10]);
    const h = renderProfile(page(todo) as never, { classId: 'c1' });
    document.body.append(h);
    expect(h.querySelector('.ns-strip')!.classList.contains('is-pulsing')).toBe(false);
    const box = h.querySelector<HTMLElement>('.td-box--now')!;
    expect(box.classList.contains('is-pulsing')).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      seen.add(box.style.getPropertyValue('--pulse'));
      vi.advanceTimersByTime(PULSE_STEP_MS);
    }
    expect([...seen].sort()).toEqual(PULSE_COLOURS.slice(0, 2).sort());
    vi.advanceTimersByTime(80_000);
    expect(box.dataset.colours).toBe('10');
  });

  it('no pulse on the teacher’s view, or once everything in Do now is done', () => {
    const teacher = renderProfile(page(todo) as never, { classId: 'c2', teacher: { name: 'Student' } });
    expect(teacher.querySelector('.td-box--now')!.classList.contains('is-pulsing')).toBe(false);
    const done: TodoPayload = { ...base, boxes: [{ key: 'now', items: [lesson('a', { done: true })] }] };
    expect(renderProfile(page(done) as never, { classId: 'c3' }).querySelector('.td-box--now')!.classList.contains('is-pulsing')).toBe(false);
  });
});
