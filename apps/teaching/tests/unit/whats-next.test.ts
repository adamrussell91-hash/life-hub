import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountWhatsNext, renderTodoHint, todoListHref } from '@/student/whats-next';
import { mountLessonFooter, type FooterCalls } from '@/student/lesson-footer';
import type { TodoBoxItem, TodoPayload } from '@/student/todo-panel';

const base: TodoPayload = { countdowns: [], announcements: [], practice: null, waiting: [], boxes: [], more: 0 };
const lesson = (id: string, extra: Partial<TodoBoxItem> = {}): TodoBoxItem => ({ id, title: `Lesson ${id}`, kind: 'lesson', done: false, reason: '', ...extra });
const flush = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const FROM = '/s/classes/c1/lessons/here';

// No observer here: the card reads the list straight away.
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('What’s next on a lesson page', () => {
  it('names the next thing on the list, passing over this lesson', async () => {
    const todo: TodoPayload = { ...base, boxes: [{ key: 'now', items: [lesson('here'), lesson('l2', { title: 'Ghost poem' })] }] };
    const card = mountWhatsNext({ classId: 'c1', lessonId: 'here', from: FROM, load: async () => ({ need: null, todo }) });
    document.body.append(card.element);
    await flush();
    expect(card.element.querySelector('.wn-card__what')?.textContent).toBe('Do the lesson: Ghost poem');
    expect(card.element.querySelector<HTMLAnchorElement>('.wn-card__go')?.getAttribute('href')).toMatch(/\/s\/classes\/c1\/lessons\/l2$/);
    expect(card.element.querySelector<HTMLAnchorElement>('.wn-card__all')?.getAttribute('href')).toMatch(/profile\?show=todo&from=/);
  });

  it('sends feedback and organiser cards to their tab', async () => {
    const todo: TodoPayload = { ...base, boxes: [{ key: 'now', items: [lesson('f1', { title: 'Essay', feedback: { state: 'new', kind: 'written', date: '2026-11-10' } })] }] };
    const card = mountWhatsNext({ classId: 'c1', lessonId: 'here', from: FROM, load: async () => ({ todo }) });
    await flush();
    expect(card.element.querySelector('.wn-card__go')?.getAttribute('href')).toMatch(/profile\?tab=returned&from=/);
  });

  it('says so when the list is empty, and keeps only the list link', async () => {
    const card = mountWhatsNext({ classId: 'c1', lessonId: 'here', from: FROM, load: async () => ({ todo: base }) });
    await flush();
    expect(card.element.querySelector('.wn-card__what')?.textContent).toMatch(/Nothing else/);
    expect(card.element.querySelector('.wn-card__go')).toBeNull();
    expect(card.element.querySelector('.wn-card__all')).not.toBeNull();
  });

  it('turns navy once the lesson is ticked, and reads the list once', async () => {
    const load = vi.fn(async () => ({ todo: base }));
    const card = mountWhatsNext({ classId: 'c1', lessonId: 'here', from: FROM, load });
    expect(card.element.classList.contains('is-ready')).toBe(false);
    card.setDone(true, true);
    card.setDone(true);
    await flush();
    expect(card.element.classList.contains('is-ready')).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    card.setDone(false);
    expect(card.element.classList.contains('is-ready')).toBe(false);
  });

  it('the footer tells it when the lesson is done', async () => {
    const calls: FooterCalls = { profile: vi.fn(async () => ({ need: null, ticked: true })), questions: vi.fn(async () => ({ off: true as const })) };
    const seen: Array<[boolean, boolean]> = [];
    const footer = mountLessonFooter({ lessonId: 'here', classId: 'c1', calls, quiz: () => null, work: () => null, onDone: (d, f) => seen.push([d, f]) });
    document.body.append(footer.element);
    await flush();
    // A revisit of a ticked lesson: done, but not just now.
    expect(seen.at(-1)).toEqual([true, false]);
  });

  it('the line under the title goes to the framed list', () => {
    const hint = renderTodoHint('c1', FROM);
    expect(hint.textContent).toBe('Not sure what to do? My to do list →');
    expect(hint.querySelector('a')?.getAttribute('href')).toMatch(/profile\?show=todo/);
    expect(todoListHref('c1', FROM)).toContain(encodeURIComponent(FROM));
  });
});
