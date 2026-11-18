import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import type { LessonQuizHandle } from '@/quiz/student-quiz';
import { lessonSections, mountLessonMap, setDone } from '@/student/lesson-map';

const section = (id: string, title: string, blocks: unknown[] = []) => ({ id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title, blocks } });
const text = (id: string) => ({ id, type: 'block', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '<p>Read this.</p>' } });
const quizQ = (id: string) => ({ id, type: 'block', block_type: 'quiz_question', visibility: 'student_teacher', content: { question: { id, prompt: 'Pick one', marks: 1 } } });
const qset = (id: string, qids: string[]) => ({ id, type: 'block', block_type: 'question_set', visibility: 'student_teacher', content: { questions: qids.map((q) => ({ id: q, prompt: 'Explain', kind: 'short_answer' })) } });

const LESSON: Block[] = [
  section('s1', 'Watch the reading', [text('t1')]),
  section('s2', 'Quick quiz', [quizQ('q1'), quizQ('q2')]),
  section('s3', 'Write one paragraph', [qset('w1', ['a', 'b'])]),
  section('s4', 'Teacher notes', [qset('w2', ['c'])]),
  { ...section('s5', 'Exit ticket', [text('t2')]) }
] as unknown as Block[];
// The teacher's own section never shows.
(LESSON[3] as { visibility: string }).visibility = 'teacher_only';

function page(blocks: Block[]) {
  const content = document.createElement('div');
  content.className = 'student-surface__content';
  for (const b of blocks) {
    const wrap = document.createElement('div');
    wrap.className = 'block';
    wrap.dataset.blockId = b.id;
    const title = document.createElement('h2');
    title.className = 'block-section__title';
    title.textContent = (b.content as { title?: string }).title ?? '';
    wrap.append(title);
    content.append(wrap);
  }
  // The lesson end card, with the slot the list goes into.
  const end = document.createElement('section');
  end.className = 'lf__card';
  const heading = document.createElement('h2');
  heading.textContent = 'Before you finish';
  const slot = document.createElement('div');
  slot.className = 'lf__parts';
  end.append(heading, slot);
  content.append(end);
  document.body.append(content);
  return { content, end, slot };
}

let quizState: { answeredIds: string[]; handedIn: boolean };
let written: Map<string, Record<string, Record<string, string>>>;
const fakeQuiz = (): LessonQuizHandle => ({
  progress: () => ({ open: !quizState.handedIn, answered: quizState.answeredIds.length, total: 2, blank: [], ...quizState }),
  handIn: async () => true
});

function mount(blocks: Block[] = LESSON) {
  const { content, end, slot } = page(blocks);
  const progress: Array<[number, number]> = [];
  const handle = mountLessonMap({ lessonId: 'lesson1', classId: 'class1', blocks, content, slot, end, onProgress: (d, t) => progress.push([d, t]), quiz: fakeQuiz, written: () => written, headerOffset: () => 56 });
  return { content, end, slot, handle, progress };
}
const rows = (card: HTMLElement) => [...card.querySelectorAll<HTMLLIElement>('.lm-check__row')];
const rowFor = (card: HTMLElement, id: string) => rows(card).find((r) => r.dataset.section === id)!;

beforeEach(() => {
  localStorage.clear();
  quizState = { answeredIds: [], handedIn: false };
  written = new Map();
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('lesson map sections', () => {
  it('reads visible top-level sections and the work in each', () => {
    const list = lessonSections(LESSON);
    expect(list.map((s) => s.title)).toEqual(['Watch the reading', 'Quick quiz', 'Write one paragraph', 'Exit ticket']);
    expect(list[1]!.quizIds).toEqual(['q1', 'q2']);
    expect(list[2]!.sets).toEqual([{ id: 'w1', questionIds: ['a', 'b'] }]);
  });

  it('counts a question set done as the server does', () => {
    expect(setDone({ questionIds: ['a', 'b'] }, { answers: { a: 'yes' } })).toBe(false);
    expect(setDone({ questionIds: ['a', 'b'] }, { answers: { a: 'yes', b: 'no' } })).toBe(true);
    expect(setDone({ questionIds: ['a'] }, { 'format.because_but_so': { because: 'it rains' } })).toBe(true);
    expect(setDone({ questionIds: ['a'] }, undefined)).toBe(false);
    // Success criteria ticked for an answer written in the book.
    expect(setDone({ questionIds: ['a'] }, { answers: { 'a.checked': 'c1,c2' } })).toBe(true);
  });
});

describe('lesson map', () => {
  it('shows nothing with fewer than two sections', () => {
    const { content, handle } = mount([section('s1', 'Only part', [text('t1')]), text('t9')] as unknown as Block[]);
    expect(handle.rail).toBeNull();
    expect(handle.card).toBeNull();
    expect(content.querySelector('.lm, .lm-check')).toBeNull();
  });

  it('puts a rail row per section plus the finish row, and the list in the end card’s slot', () => {
    const { content, slot, handle, progress } = mount();
    const rail = handle.rail!;
    expect(rail.getAttribute('aria-label')).toBe('Lesson map');
    expect([...rail.querySelectorAll('.lm__label')].map((n) => n.textContent)).toEqual(['Watch the reading', 'Quick quiz', 'Write one paragraph', 'Exit ticket', 'Checklist and finish']);
    expect(handle.card!.parentElement).toBe(slot);
    expect(rows(handle.card!)).toHaveLength(4);
    expect(content.classList.contains('has-lesson-map')).toBe(true);
    // The count belongs to the card's head: the list only reports it.
    expect(progress.at(-1)).toEqual([0, 4]);
  });

  it('keeps each row to a tick and a name: no heading, count, row labels or Start here', () => {
    const { handle } = mount();
    const card = handle.card!;
    expect(card.querySelector('.lm-check__title, .lm-check__count, .lm-check__auto, .lm-check__start')).toBeNull();
    expect(rows(card).some((r) => r.classList.contains('is-next'))).toBe(false);
    expect(rowFor(card, 's2').textContent).toBe('Quick quizGo to part ↑');
  });

  it('explains self-ticking once, under the list', () => {
    const { handle } = mount();
    expect(handle.card!.querySelector('.lm-check__note')!.textContent).toBe('Parts you answer on screen tick themselves. Did one in your book? Tick it here.');
    handle.dispose();
    document.body.replaceChildren();
    const plain = mount([section('s1', 'Read', [text('t1')]), section('s2', 'Talk', [text('t2')])] as unknown as Block[]);
    expect(plain.handle.card!.querySelector('.lm-check__note')!.textContent).toBe('Tick each part off as you go.');
  });

  it('offers Go to part on a row that is not ticked, and takes it away once it is', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const { handle } = mount();
    const row = rowFor(handle.card!, 's1');
    const go = row.querySelector<HTMLButtonElement>('.lm-check__go')!;
    expect(go.textContent).toBe('Go to part ↑');
    expect(go.hidden).toBe(false);
    go.click();
    expect(scroll).toHaveBeenCalledTimes(1);
    row.querySelector<HTMLButtonElement>('.lm-check__tick')!.click();
    expect(go.hidden).toBe(true);
  });

  it('opens and closes the strip from its button and Escape', () => {
    const { handle } = mount();
    const tab = handle.rail!.querySelector<HTMLButtonElement>('.lm__tab')!;
    expect(tab.getAttribute('aria-expanded')).toBe('false');
    expect(handle.rail!.querySelector<HTMLButtonElement>('.lm__go')!.tabIndex).toBe(-1);
    tab.click();
    expect(tab.getAttribute('aria-expanded')).toBe('true');
    expect(handle.rail!.querySelector<HTMLButtonElement>('.lm__go')!.tabIndex).toBe(0);
    handle.rail!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tab.getAttribute('aria-expanded')).toBe('false');
  });

  it('hand-ticks a section with no work, and the tick stays on this device', () => {
    const first = mount();
    const tick = rowFor(first.handle.card!, 's1').querySelector<HTMLButtonElement>('.lm-check__tick')!;
    tick.click();
    expect(tick.getAttribute('aria-pressed')).toBe('true');
    expect(first.progress.at(-1)).toEqual([1, 4]);
    expect(JSON.parse(localStorage.getItem('lesson-check:class1:lesson1')!)).toEqual(['s1']);
    first.handle.dispose();
    document.body.replaceChildren();

    const again = mount();
    expect(rowFor(again.handle.card!, 's1').classList.contains('is-done')).toBe(true);
    expect(again.handle.rail!.querySelector('[data-section="s1"]')!.classList.contains('is-done')).toBe(true);
  });

  it('ticks a section with work in it itself when the work is done', () => {
    vi.useFakeTimers();
    const { content, handle, progress } = mount();
    const quizRow = rowFor(handle.card!, 's2');
    const tick = quizRow.querySelector<HTMLButtonElement>('.lm-check__tick')!;
    expect(tick.hasAttribute('aria-disabled')).toBe(false);
    expect(tick.title).toContain('Ticks itself when you answer here');

    quizState = { answeredIds: ['q1'], handedIn: false };
    content.dispatchEvent(new CustomEvent('lesson-quiz-change', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(tick.getAttribute('aria-pressed')).toBe('false');
    quizState = { answeredIds: ['q1', 'q2'], handedIn: false };
    content.dispatchEvent(new CustomEvent('lesson-quiz-change', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(tick.getAttribute('aria-pressed')).toBe('true');
    // Answered here: pressing it doesn't take the tick off.
    tick.click();
    expect(tick.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('lesson-check:class1:lesson1')).toBeNull();

    written = new Map([['w1', { answers: { a: 'First idea', b: 'Second idea' } }]]);
    content.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(rowFor(handle.card!, 's3').classList.contains('is-done')).toBe(true);
    expect(progress.at(-1)).toEqual([2, 4]);
  });

  it('lets a student tick a work section by hand when they did it in their book, and untick it', () => {
    const { handle } = mount();
    const row = rowFor(handle.card!, 's3');
    const tick = row.querySelector<HTMLButtonElement>('.lm-check__tick')!;
    tick.click();
    expect(row.classList.contains('is-done')).toBe(true);
    expect(JSON.parse(localStorage.getItem('lesson-check:class1:lesson1')!)).toEqual(['s3']);
    tick.click();
    expect(row.classList.contains('is-done')).toBe(false);
  });

  it('counts a handed-in quiz as done', () => {
    quizState = { answeredIds: [], handedIn: true };
    const { handle } = mount();
    expect(rowFor(handle.card!, 's2').classList.contains('is-done')).toBe(true);
  });

  it('scrolls to a section from the checklist and the rail, below the sticky header', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const { content, handle } = mount();
    const target = content.querySelector<HTMLElement>('[data-block-id="s3"]')!;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 900, bottom: 1000, left: 0, right: 0, width: 0, height: 100, x: 0, y: 900, toJSON: () => ({}) });
    rowFor(handle.card!, 's3').querySelector<HTMLButtonElement>('.lm-check__name')!.click();
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ top: 900 + window.scrollY - 56 - 12 }));
    expect(target.classList.contains('lm-flash')).toBe(true);
    expect(document.activeElement).toBe(target.querySelector('.block-section__title'));

    // The strip's last row goes to the whole end card, and lands on its heading.
    const { end } = { end: content.querySelector<HTMLElement>('.lf__card')! };
    vi.spyOn(end, 'getBoundingClientRect').mockReturnValue({ top: 1400, bottom: 1700, left: 0, right: 0, width: 0, height: 300, x: 0, y: 1400, toJSON: () => ({}) });
    handle.rail!.querySelector<HTMLButtonElement>('[data-section="end"] .lm__go')!.click();
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ top: 1400 + window.scrollY - 56 - 12 }));
    expect(end.classList.contains('lm-flash')).toBe(true);
    expect(document.activeElement).toBe(end.querySelector('h2'));
  });

  it('removes everything on dispose', () => {
    const { content, handle } = mount();
    handle.dispose();
    expect(content.querySelector('.lm, .lm-check')).toBeNull();
    expect(content.classList.contains('has-lesson-map')).toBe(false);
  });
});
