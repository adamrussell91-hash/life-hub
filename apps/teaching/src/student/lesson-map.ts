import type { Block } from '@/schemas/block';
import { el, uid } from '@/quiz/dom';
import { lessonQuiz, LESSON_QUIZ_CHANGE, type LessonQuizHandle } from '@/quiz/student-quiz';
import { savedWorkByBlock } from '@/student/work-sync';
import './lesson-map.css';

/**
 * A student's map of a plain lesson: a slim strip on the right edge with a dot
 * per section that pops out into the section names, and a "This lesson"
 * checklist above the footer. Sections with a quiz question or a question set
 * tick themselves once that work is answered (as profile-todo.mjs activitiesOf
 * counts a question set done); the rest the student ticks, kept on this device
 * per class and lesson.
 */

/** One section of the lesson and the answerable work inside it. */
export type LessonMapSection = {
  id: string;
  title: string;
  /** Quiz questions inside the section. */
  quizIds: string[];
  /** Question sets inside the section, with their question ids. */
  sets: Array<{ id: string; questionIds: string[] }>;
  minutes?: number;
};

export type LessonMapOptions = {
  lessonId: string;
  classId: string;
  blocks: Block[];
  /** Where the page's blocks are rendered; sections are found here by data-block-id. */
  content: HTMLElement;
  /** The checklist goes just before this (the lesson footer). */
  before: Node;
  /** Test seams. */
  quiz?: () => LessonQuizHandle | null;
  written?: () => Map<string, Record<string, Record<string, string>>>;
  headerOffset?: () => number;
};

export type LessonMapHandle = { rail: HTMLElement | null; card: HTMLElement | null; dispose(): void; refresh(): void };

const TICK_SVG = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

type Nested = { blocks?: Block[]; columns?: Array<{ blocks?: Block[] }>; tabs?: Array<{ blocks?: Block[] }> };

/** Blocks a student can see, nested ones included; a teacher-only block hides everything inside it (profile-todo.mjs visibleBlocks). */
function* visibleBlocks(blocks: Block[] | undefined): Generator<Block> {
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== 'object' || b.visibility === 'teacher_only') continue;
    yield b;
    const c = (b.content ?? {}) as Nested;
    const nested = [c.blocks, ...(c.columns ?? []).map((x) => x?.blocks), ...(c.tabs ?? []).map((t) => t?.blocks)];
    for (const children of nested) yield* visibleBlocks(children);
  }
}

/** The lesson's top-level sections a student sees, with the work in each. */
export function lessonSections(blocks: Block[]): LessonMapSection[] {
  const out: LessonMapSection[] = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (b.block_type !== 'section' || b.visibility === 'teacher_only') continue;
    const content = b.content as { title?: string; side_path?: boolean; minutes?: unknown; blocks?: Block[] };
    if (content.side_path === true) continue;
    const section: LessonMapSection = { id: b.id, title: content.title?.trim() || 'Untitled part', quizIds: [], sets: [] };
    if (typeof content.minutes === 'number' && content.minutes > 0) section.minutes = Math.round(content.minutes);
    for (const inner of visibleBlocks(content.blocks)) {
      if (inner.block_type === 'quiz_question') section.quizIds.push(inner.id);
      else if (inner.block_type === 'question_set') {
        const questions = ((inner.content as { questions?: Array<{ id?: unknown }> }).questions ?? []).filter((q) => q && typeof q.id === 'string');
        section.sets.push({ id: inner.id, questionIds: questions.map((q) => q.id as string) });
      }
    }
    out.push(section);
  }
  return out;
}

export const isAuto = (s: LessonMapSection): boolean => s.quizIds.length > 0 || s.sets.length > 0;

/** A question set is done when every question has writing, or anything is written in its format or lens (activitiesOf). */
export function setDone(set: { questionIds: string[] }, saved: Record<string, Record<string, string>> | undefined): boolean {
  if (!saved) return false;
  if (Object.keys(saved).some((part) => part !== 'answers')) return true;
  const answers = saved.answers ?? {};
  return set.questionIds.length > 0 && set.questionIds.every((id) => typeof answers[id] === 'string' && answers[id]!.trim() !== '');
}

const checkKey = (classId: string, lessonId: string) => `lesson-check:${classId}:${lessonId}`;
function readChecks(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
function writeChecks(key: string, ids: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // No storage: the ticks last as long as the page.
  }
}

const reducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;
function defaultHeaderOffset(): number {
  const header = document.querySelector<HTMLElement>('.student-chrome');
  return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
}

export function mountLessonMap(options: LessonMapOptions): LessonMapHandle {
  const sections = lessonSections(options.blocks);
  if (sections.length < 2) return { rail: null, card: null, dispose() {}, refresh() {} };
  const { content, lessonId } = options;
  const quiz = options.quiz ?? (() => lessonQuiz(lessonId));
  const written = options.written ?? (() => savedWorkByBlock(lessonId));
  const headerOffset = options.headerOffset ?? defaultHeaderOffset;
  const key = checkKey(options.classId, lessonId);
  const checks = readChecks(key);
  const done = new Map<string, boolean>();
  const cleanups: Array<() => void> = [];
  const listen = (target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  const sectionEl = (id: string): HTMLElement | null =>
    [...content.querySelectorAll<HTMLElement>('[data-block-id]')].find((b) => b.dataset.blockId === id) ?? null;

  /* ── Checklist card ── */
  const card = el('section', 'lm-check');
  const headingId = uid('lm-check');
  card.setAttribute('aria-labelledby', headingId);
  const head = el('div', 'lm-check__head');
  const heading = el('h2', 'lm-check__title', 'This lesson');
  heading.id = headingId;
  const count = el('span', 'lm-check__count');
  count.setAttribute('aria-live', 'polite');
  head.append(heading, count);
  const list = el('ul', 'lm-check__list');
  card.append(head, list);
  const checkRows = new Map<string, { li: HTMLLIElement; tick: HTMLButtonElement; status: HTMLElement }>();
  for (const s of sections) {
    const li = el('li', 'lm-check__row');
    li.dataset.section = s.id;
    const tick = el('button', 'lm-check__tick');
    tick.type = 'button';
    tick.innerHTML = TICK_SVG;
    tick.setAttribute('aria-label', s.title);
    if (isAuto(s)) {
      tick.setAttribute('aria-disabled', 'true');
      tick.title = 'Ticks itself when you finish the work in it';
    }
    tick.addEventListener('click', () => {
      if (isAuto(s)) return;
      if (checks.has(s.id)) checks.delete(s.id);
      else checks.add(s.id);
      writeChecks(key, checks);
      paint();
    });
    const label = el('span', 'lm-check__label');
    const name = el('button', 'lm-check__name', s.title);
    name.type = 'button';
    name.addEventListener('click', () => goTo(s.id));
    label.append(name);
    if (isAuto(s)) label.append(el('span', 'lm-check__auto', 'ticks itself'));
    label.append(el('span', 'lm-check__start', 'Start here'));
    const status = el('span', 'lm-check__status');
    li.append(tick, label, status);
    list.append(li);
    checkRows.set(s.id, { li, tick, status });
  }

  /* ── Rail ── */
  const rail = el('nav', 'lm');
  rail.setAttribute('aria-label', 'Lesson map');
  const railList = el('ol', 'lm__list');
  railList.id = uid('lm-list');
  const tab = el('button', 'lm__tab');
  tab.type = 'button';
  tab.setAttribute('aria-expanded', 'false');
  tab.setAttribute('aria-controls', railList.id);
  tab.setAttribute('aria-label', 'Open lesson map');
  rail.append(tab, railList);
  const railRows = new Map<string, { li: HTMLLIElement; status: HTMLElement }>();
  const railRow = (id: string, title: string): { li: HTMLLIElement; status: HTMLElement; btn: HTMLButtonElement } => {
    const li = el('li', 'lm__row');
    li.dataset.section = id;
    const btn = el('button', 'lm__go');
    btn.type = 'button';
    btn.tabIndex = -1;
    const status = el('span', 'lm__status');
    btn.append(el('span', 'lm__label', title), status, el('span', 'lm__dot'));
    btn.addEventListener('click', () => goTo(id));
    li.append(btn);
    railList.append(li);
    return { li, status, btn };
  };
  for (const s of sections) railRows.set(s.id, railRow(s.id, s.title));
  const endRow = railRow('end', 'Checklist and finish');

  let open = false;
  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    rail.classList.toggle('is-open', open);
    tab.setAttribute('aria-expanded', String(open));
    tab.setAttribute('aria-label', open ? 'Close lesson map' : 'Open lesson map');
    for (const b of railList.querySelectorAll<HTMLButtonElement>('button')) b.tabIndex = open ? 0 : -1;
  }
  tab.addEventListener('click', () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    railList.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  });
  let closeTimer: number | undefined;
  if (canHover()) {
    rail.addEventListener('mouseenter', () => {
      window.clearTimeout(closeTimer);
      setOpen(true);
    });
    rail.addEventListener('mouseleave', () => {
      // Leaving with focus inside keeps it open for the keyboard.
      if (rail.contains(document.activeElement) && document.activeElement !== tab) return;
      closeTimer = window.setTimeout(() => setOpen(false), 250);
    });
  }
  rail.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open) return;
    setOpen(false);
    tab.focus();
  });
  rail.addEventListener('focusout', (event) => {
    const to = (event as FocusEvent).relatedTarget as Node | null;
    if (open && to && !rail.contains(to)) setOpen(false);
  });
  listen(document, 'click', (event) => {
    if (open && !rail.contains(event.target as Node)) setOpen(false);
  });

  /* ── Going to a section ── */
  function goTo(id: string): void {
    const target = id === 'end' ? card : sectionEl(id);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset() - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    target.classList.add('lm-flash');
    window.setTimeout(() => target.classList.remove('lm-flash'), 1200);
    // Keyboard users land where they went.
    const focusTo = id === 'end' ? heading : target.querySelector<HTMLElement>('.block-section__title') ?? target;
    if (!focusTo.hasAttribute('tabindex')) focusTo.setAttribute('tabindex', '-1');
    focusTo.focus({ preventScroll: true });
    if (id === 'end') card.classList.add('is-in');
    window.setTimeout(() => setOpen(false), 350);
  }

  /* ── State ── */
  function compute(): void {
    const q = quiz()?.progress();
    const answered = new Set(q?.answeredIds ?? []);
    const handedIn = q?.handedIn === true;
    let saved: ReturnType<typeof written> = new Map();
    try {
      saved = written();
    } catch {
      // No storage to read: nothing written yet as far as the map knows.
    }
    for (const s of sections) {
      if (!isAuto(s)) {
        done.set(s.id, checks.has(s.id));
        continue;
      }
      const quizDone = s.quizIds.every((id) => handedIn || answered.has(id));
      const setsDone = s.sets.every((set) => setDone(set, saved.get(set.id)));
      done.set(s.id, quizDone && setsDone);
    }
  }

  function paint(): void {
    compute();
    let n = 0;
    let nextMarked = false;
    for (const s of sections) {
      const isDone = done.get(s.id) === true;
      const row = checkRows.get(s.id)!;
      row.li.classList.toggle('is-done', isDone);
      row.tick.setAttribute('aria-pressed', String(isDone));
      row.status.textContent = isDone ? 'Done' : s.minutes ? `${s.minutes} min` : '';
      const isNext = !isDone && !nextMarked;
      row.li.classList.toggle('is-next', isNext);
      if (isNext) nextMarked = true;
      const r = railRows.get(s.id)!;
      r.li.classList.toggle('is-done', isDone);
      r.status.textContent = isDone ? 'Done' : s.minutes ? `${s.minutes} min` : '';
      if (isDone) n += 1;
    }
    count.textContent = `${n} of ${sections.length} done`;
    endRow.li.classList.toggle('is-done', n === sections.length);
  }

  let pending: number | undefined;
  const schedule = (): void => {
    window.clearTimeout(pending);
    pending = window.setTimeout(paint, 250);
  };
  // Writing saves to the device as it's typed or picked, and the quiz says when it keeps an answer.
  listen(content, 'input', schedule);
  listen(content, 'change', schedule);
  listen(content, 'click', schedule);
  listen(content, LESSON_QUIZ_CHANGE, schedule);
  listen(window, 'storage', schedule);

  /* ── Where the student is ── */
  let frame = 0;
  function markHere(): void {
    frame = 0;
    const line = headerOffset() + 80;
    let current: string = sections[0]!.id;
    for (const s of sections) {
      const node = sectionEl(s.id);
      if (node && node.getBoundingClientRect().top <= line) current = s.id;
    }
    const doc = document.documentElement;
    const cardTop = card.getBoundingClientRect().top;
    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4 || (card.isConnected && cardTop <= line)) current = 'end';
    for (const li of railList.children) (li as HTMLElement).classList.toggle('is-here', (li as HTMLElement).dataset.section === current);
  }
  const onScroll = (): void => {
    if (!frame) frame = window.requestAnimationFrame(markHere);
  };
  listen(window, 'scroll', onScroll, { passive: true });
  const placeRail = (): void => {
    rail.style.setProperty('--lm-top', `${Math.round(headerOffset())}px`);
    onScroll();
  };
  listen(window, 'resize', placeRail, { passive: true });

  /* ── The checklist pops in near the end ── */
  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === 'function') {
    // Only hidden once something will show it again.
    card.classList.add('is-armed');
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) card.classList.add('is-in');
          // Scrolled back up past it: ready to pop in again.
          else if (entry.boundingClientRect.top > 0) card.classList.remove('is-in');
        }
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 }
    );
    observer.observe(card);
  } else card.classList.add('is-in');

  options.before.parentNode?.insertBefore(card, options.before);
  content.append(rail);
  content.classList.add('has-lesson-map');
  placeRail();
  paint();
  markHere();

  return {
    rail,
    card,
    refresh: paint,
    dispose() {
      window.clearTimeout(pending);
      window.clearTimeout(closeTimer);
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      for (const c of cleanups) c();
      content.classList.remove('has-lesson-map');
      rail.remove();
      card.remove();
    }
  };
}
