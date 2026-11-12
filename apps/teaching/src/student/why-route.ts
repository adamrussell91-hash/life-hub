import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import { fadeLines } from '@/blocks/what-how-why';
import './why-route.css';

/**
 * "Why this matters" on a student's lesson page: a blue compass beside each
 * top-level section title (or the lesson title when there are none). Pressed,
 * a route line draws from what's done to "You're here" and on to the next
 * assessment, then one plain sentence drops in. If the lesson has a What, How,
 * Why block and the student has written their own why, the class's whys fade
 * through underneath. The route and reason come from the server
 * (netlify/functions/_shared/lesson-route.mjs); with no reason there is no button.
 */

export type RouteAssessment = { title: string; short: string; due_date: string; due_time: string };
export type LessonRoute = {
  route: { before: number; done: number; here_index: number; remaining: number; assessment: RouteAssessment | null } | null;
  reason: string | null;
  big_idea: string | null;
};
export type ClassWhys = { mine: string | null; others: string[] };
export type WhyRouteCalls = {
  route: () => Promise<LessonRoute>;
  whys: (blockId: string) => Promise<ClassWhys>;
};
type BlockLike = { id?: string; block_type?: string; visibility?: string; content?: unknown };
export interface WhyRouteOptions {
  /** The rendered lesson content. */
  root: HTMLElement;
  lesson: { lesson_id: string; blocks?: readonly BlockLike[] };
  classId: string;
  /** Test seams. */
  calls?: WhyRouteCalls;
  reducedMotion?: boolean;
}
export type WhyRouteHandle = { dispose(): void };

const HOLD_MS = 3400;
const FADE_MS = 600;
/** The toast lands at 1.1s + 0.3s; the whys start turning after the first has been read. */
const FIRST_TURN_MS = 4600;
const SVG_NS = 'http://www.w3.org/2000/svg';
const COMPASS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor"/></svg>';

function networkCalls(lessonId: string, classId: string): WhyRouteCalls {
  return {
    route: () => apiPost<LessonRoute>(`/api/published/profile/${encodeURIComponent(classId)}`, { action: 'lesson_route', lesson_id: lessonId, class_token: deviceToken(`class:${classId}`) }),
    whys: (blockId) => apiPost<ClassWhys>(`/api/published/why/${encodeURIComponent(lessonId)}/${encodeURIComponent(blockId)}`, { token: deviceToken(`why:${lessonId}`), action: 'status' })
  };
}

/** The first student-visible What, How, Why block, nested ones included. */
export function outcomesBlockId(blocks: readonly BlockLike[] | undefined): string | null {
  for (const b of blocks ?? []) {
    if (!b || b.visibility === 'teacher_only') continue;
    if (b.block_type === 'outcomes' && typeof b.id === 'string') return b.id;
    const c = (b.content ?? {}) as { blocks?: BlockLike[]; columns?: Array<{ blocks?: BlockLike[] }>; tabs?: Array<{ blocks?: BlockLike[] }> };
    for (const children of [c.blocks, ...(c.columns ?? []).map((x) => x?.blocks), ...(c.tabs ?? []).map((x) => x?.blocks)]) {
      const found = Array.isArray(children) ? outcomesBlockId(children) : null;
      if (found) return found;
    }
  }
  return null;
}

/** Where the buttons go: each top-level section's title, else the lesson title. */
function titleSpots(root: HTMLElement, blocks: readonly BlockLike[] | undefined): HTMLElement[] {
  const spots: HTMLElement[] = [];
  for (const b of blocks ?? []) {
    if (b?.block_type !== 'section' || typeof b.id !== 'string') continue;
    const wrapper = [...root.querySelectorAll<HTMLElement>('.block[data-block-type="section"]')].find((w) => w.dataset.blockId === b.id);
    const sec = wrapper && !wrapper.hidden ? [...wrapper.children].find((c) => c.classList.contains('block-section')) : null;
    const title = sec ? [...sec.children].find((c): c is HTMLElement => c.classList.contains('block-section__title')) : null;
    if (title) spots.push(title);
  }
  if (spots.length) return spots;
  const hero = root.querySelector<HTMLElement>('.lesson-hero__title');
  return hero ? [hero] : [];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The route's accessible sentence. */
export function routeLabel(route: NonNullable<LessonRoute['route']>): string {
  const more = route.remaining ? `${plural(route.remaining, 'more lesson', 'more lessons')} after this one` : 'This is the last lesson';
  return route.assessment ? `${more}, then ${route.assessment.title}.` : `${more} in this unit.`;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, cls?: string, delay?: number): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (cls) node.setAttribute('class', cls);
  if (delay !== undefined) node.style.setProperty('--d', `${delay}s`);
  return node;
}

function label(x: number, text: string, cls: string, delay: number, anchor: 'middle' | 'end' = 'middle'): SVGTextElement {
  const t = svg('text', { x, y: 52, 'text-anchor': anchor }, `wr-route__label ${cls}`, delay);
  t.textContent = text;
  return t;
}

/** The route line, drawn as the mockup has it: track, blue fill to here, stops, labels. */
export function renderRoute(route: NonNullable<LessonRoute['route']>): HTMLElement {
  const box = document.createElement('div');
  box.className = 'wr-route';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', routeLabel(route));
  const s = svg('svg', { viewBox: '0 0 340 66', 'aria-hidden': 'true' });
  const start = 20;
  const end = 316;
  const here = route.before > 0 ? 110 : start;
  const last = route.assessment ? end - 12 : end;
  s.append(svg('line', { x1: start, y1: 22, x2: end, y2: 22, pathLength: 1 }, 'wr-route__track'));
  if (here > start) s.append(svg('line', { x1: start, y1: 22, x2: here, y2: 22, pathLength: 1 }, 'wr-route__fill'));
  if (route.before > 0) {
    s.append(svg('circle', { cx: start, cy: 22, r: 6 }, 'wr-route__stop wr-route__stop--done', 0.15));
    s.append(label(start, 'Done', 'wr-route__label--muted', 0.2));
  }
  // Up to four upcoming stops, spread between here and the end.
  const shown = Math.min(route.remaining, 4);
  for (let i = 0; i < shown; i += 1) {
    const x = here + ((last - here) * (i + 1)) / (shown + 1);
    s.append(svg('circle', { cx: x, cy: 22, r: 6 }, 'wr-route__stop wr-route__stop--next', 0.35 + i * 0.1));
  }
  if (route.remaining > 0) s.append(label((here + last) / 2 + (route.before > 0 ? 0 : 20), plural(route.remaining, 'more lesson', 'more lessons'), 'wr-route__label--muted', 0.5));
  if (route.assessment) {
    s.append(svg('rect', { x: end - 12, y: 10, width: 24, height: 24, rx: 5 }, 'wr-route__stop wr-route__stop--goal', 0.65));
    // Right-aligned to the square's edge so a long name stays inside the drawing.
    s.append(label(end + 12, route.assessment.short, 'wr-route__label--goal', 0.7, 'end'));
  }
  s.append(svg('circle', { cx: here, cy: 22, r: 9 }, 'wr-route__stop wr-route__stop--here', 1.1));
  s.append(svg('circle', { cx: here, cy: 22, r: 4 }, 'wr-route__stop wr-route__stop--hole', 1.15));
  s.append(label(here, 'You\'re here', 'wr-route__label--here', 1.15));
  box.append(s);
  return box;
}

let uid = 0;

export function mountWhyRoute(options: WhyRouteOptions): WhyRouteHandle {
  const { root, lesson } = options;
  const calls = options.calls ?? networkCalls(lesson.lesson_id, options.classId);
  const still = options.reducedMotion ?? (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const whyBlock = outcomesBlockId(lesson.blocks);
  let disposed = false;
  let whysLoad: Promise<ClassWhys | null> | null = null;
  const closers = new Set<() => void>();
  const loadWhys = (): Promise<ClassWhys | null> => {
    if (!whyBlock) return Promise.resolve(null);
    whysLoad ??= calls.whys(whyBlock).catch(() => null);
    return whysLoad;
  };

  function attach(title: HTMLElement, data: LessonRoute & { reason: string }): void {
    const id = `wr-panel-${(uid += 1)}`;
    const head = document.createElement('div');
    head.className = 'wr-head';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wr-btn';
    btn.innerHTML = COMPASS;
    btn.title = 'Why this matters';
    btn.setAttribute('aria-label', 'Why this matters');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id);
    title.replaceWith(head);
    head.append(btn, title);

    const panel = document.createElement('div');
    panel.className = `wr-panel${still ? ' wr--still' : ''}`;
    panel.id = id;
    panel.hidden = true;
    const route = data.route ? renderRoute(data.route) : null;
    const toast = document.createElement('div');
    toast.className = 'wr-toast';
    toast.setAttribute('role', 'status');
    const lab = document.createElement('span');
    lab.className = 'wr-lab';
    lab.textContent = 'Why this';
    const text = document.createElement('p');
    text.className = 'wr-reason';
    text.textContent = data.reason;
    toast.append(lab, text);
    panel.append(...(route ? [route] : []), toast);
    // A section's panel sits under its title; the lesson title's goes under the hero.
    const after = title.classList.contains('lesson-hero__title') ? (head.closest('.lesson-hero') ?? head) : head;
    after.after(panel);

    let timers: number[] = [];
    const clear = () => { timers.forEach((t) => window.clearTimeout(t)); timers = []; };
    const close = () => {
      clear();
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      route?.classList.remove('wr-go');
      toast.classList.remove('wr-in');
    };
    closers.add(clear);

    function showWhys(whys: ClassWhys | null): void {
      toast.querySelector('.wr-class')?.remove();
      // Others' whys are only for a student who has written their own (lesson-why.mjs holds the rule too).
      if (!whys?.mine) return;
      const lines = fadeLines(whys.mine, whys.others ?? []);
      if (!lines.length) return;
      const box = document.createElement('div');
      box.className = 'wr-class';
      const l = document.createElement('span');
      l.className = 'wr-lab wr-lab--muted';
      l.textContent = 'Why your class thinks it matters';
      box.append(l);
      const line = (t: { text: string; mine?: boolean }) => {
        const p = document.createElement('p');
        p.className = `wr-fade${t.mine ? ' wr-fade--mine' : ''}`;
        p.textContent = `“${t.text}”`;
        return p;
      };
      if (still) {
        // Reduced motion: every why at once, nothing turning.
        // fadeLines repeats the student's own mid-cycle; the still list shows it once, first.
        box.append(...[{ text: whys.mine, mine: true }, ...(whys.others ?? []).map((text) => ({ text }))].map(line));
        toast.append(box);
        return;
      }
      const fade = line(lines[0]);
      box.append(fade);
      toast.append(box);
      if (lines.length < 2) return;
      let at = 0;
      const turn = () => {
        fade.classList.add('wr-fade--out');
        timers.push(window.setTimeout(() => {
          at = (at + 1) % lines.length;
          fade.textContent = `“${lines[at].text}”`;
          fade.classList.toggle('wr-fade--mine', Boolean(lines[at].mine));
          fade.classList.remove('wr-fade--out');
          timers.push(window.setTimeout(turn, HOLD_MS));
        }, FADE_MS));
      };
      timers.push(window.setTimeout(turn, FIRST_TURN_MS));
    }

    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-expanded') === 'true') return close();
      btn.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      if (route) void route.getBoundingClientRect();
      route?.classList.add('wr-go');
      toast.classList.add('wr-in');
      void loadWhys().then((whys) => {
        if (disposed || panel.hidden) return;
        showWhys(whys);
      });
    });
  }

  // Wrapped so a call that throws before it returns a promise still lands in the catch.
  void Promise.resolve().then(() => calls.route()).then(
    (data) => {
      // Never invent a reason: no reason, no button.
      if (disposed || !data?.reason) return;
      for (const title of titleSpots(root, lesson.blocks)) attach(title, data as LessonRoute & { reason: string });
    },
    () => undefined
  );

  return {
    dispose() {
      disposed = true;
      closers.forEach((c) => c());
      closers.clear();
    }
  };
}
