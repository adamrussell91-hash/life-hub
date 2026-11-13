/**
 * "Do this now" on a student's progress page: one line, the first thing on their To do list, in
 * a strip that sits above the tabs and stays on screen on every tab. "Show me" opens My progress
 * and frames that row in the To do panel. The × hides the strip until the page next loads.
 *
 * The pointer: ten seconds after the page opens, unless the student has already used the strip,
 * the page dims around the strip with an arrow and a few words. It comes up once per page load.
 * "Don't show this again" turns it off for good; the teacher can turn it back on from the class's
 * student list. The strip itself stays either way.
 *
 * The pulse: from the moment the page opens, the strip's ring pulses red and orange, and every ten
 * seconds another colour joins (yellow, green, purple…) until ten are cycling. It runs until the
 * student leaves the page, say by opening a lesson. Never on the teacher's view.
 */
import { el } from '@/quiz/dom';
import type { TodoBoxItem, TodoPayload } from '@/student/todo-panel';
import './now-strip.css';

export type NowThing = { key: string; what: string };

/** Seconds on the page before the pointer comes up. */
export const POINTER_DELAY_MS = 10_000;

/** The pulse's colours, in the order they join: two to start, one more every PULSE_ADD_MS. */
export const PULSE_COLOURS = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#8e4ec6', '#0090ff', '#d6409f', '#12a594', '#a3d10b', '#00c2d7'];
export const PULSE_ADD_MS = 10_000;
/** How long each colour holds before the ring moves to the next. */
export const PULSE_STEP_MS = 700;

/** How many colours are cycling `ms` after the page opened: 2, then one more every ten seconds, up to 10. */
export function pulseCount(ms: number): number {
  return Math.min(PULSE_COLOURS.length, 2 + Math.floor(Math.max(0, ms) / PULSE_ADD_MS));
}

function wordsFor(t: TodoBoxItem): string {
  if (t.feedback?.state === 'new') return `Read your feedback on ${t.title}`;
  if (t.feedback?.state === 'redraft') return t.feedback.kind === 'answer' ? `Answer ${t.title} again` : `Redraft ${t.title}`;
  if (t.started) return `Finish ${t.title}`;
  if (t.kind === 'quiz') return `Do the quiz: ${t.title}`;
  if (t.kind === 'assessment') return `Work on ${t.title}`;
  return `Do the lesson: ${t.title}`;
}

const open = (t: TodoBoxItem): boolean => !t.done && t.feedback?.state !== 'read';

/**
 * The one thing: the first open row in Do now, then today's organiser cards, then the first open
 * row in Do next. Null when none of those has anything left.
 */
export function oneThing(todo: TodoPayload | undefined): NowThing | null {
  if (!todo) return null;
  const box = (key: string) => todo.boxes.find((b) => b.key === key)?.items.find(open);
  const now = box('now');
  if (now) return { key: now.id, what: wordsFor(now) };
  const left = todo.practice?.today ?? 0;
  if (left > 0) return { key: 'practice', what: `Practise your organiser: ${left} ${left === 1 ? 'card' : 'cards'}` };
  const next = box('next');
  if (next) return { key: next.id, what: wordsFor(next) };
  return null;
}

/** What the strip remembers for the life of the page, so a redraw (organiser reload) keeps it. */
type Memory = { hidden: boolean; used: boolean; pointed: boolean; openedAt: number };
const memory = new Map<string, Memory>();
const remember = (classId: string): Memory => {
  let m = memory.get(classId);
  if (!m) memory.set(classId, (m = { hidden: false, used: false, pointed: false, openedAt: Date.now() }));
  return m;
};
/** Tests only: forget every page's strip state. */
export function resetNowStrip(): void {
  memory.clear();
}

/** Over to My progress, scroll to the row and frame it for a few seconds. */
export function showOnList(root: Element, key: string): void {
  root.querySelector<HTMLButtonElement>('.pg-tab[data-tab="progress"]')?.click();
  const panel = root.querySelector<HTMLElement>('.td-panel');
  if (!panel) return;
  const row = Array.from(panel.querySelectorAll<HTMLElement>('[data-todo]')).find((r) => r.dataset.todo === key) ?? null;
  const target = row ?? panel;
  root.querySelectorAll('.is-pointed').forEach((n) => n.classList.remove('is-pointed'));
  panel.classList.add('is-pointed');
  if (row) row.classList.add('is-pointed');
  target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  // Keyboard users land on the row's own button.
  target.querySelector<HTMLElement>('.td-go')?.focus({ preventScroll: true });
  window.setTimeout(() => {
    panel.classList.remove('is-pointed');
    row?.classList.remove('is-pointed');
  }, 8_000);
}

export type NowStripOptions = {
  classId: string;
  /** Whether the pointer may come up (the server's `pointer`). The teacher's view never has it. */
  pointer: boolean;
  /** "Don't show this again". */
  pointerOff?: () => void;
  /** The colour pulse: the student's own page only. */
  pulse?: boolean;
};

/** The strip, or null when there is nothing to do or the student hid it this visit. */
export function renderNowStrip(todo: TodoPayload | undefined, options: NowStripOptions): HTMLElement | null {
  const thing = oneThing(todo);
  const mem = remember(options.classId);
  if (!thing || mem.hidden) return null;

  const strip = el('section', 'ns-strip');
  strip.setAttribute('aria-label', 'Do this now');
  const inner = el('div', 'ns-strip__in');
  const text = el('div', 'ns-strip__text');
  text.append(el('span', 'ns-strip__kicker', 'Do this now'), el('span', 'ns-strip__what', thing.what));
  const go = el('button', 'ns-strip__go', 'Show me →');
  go.type = 'button';
  const close = el('button', 'ns-strip__close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Hide this for now');
  inner.append(text, go, close);
  strip.append(inner);

  let shut: (() => void) | null = null;
  const show = (): void => {
    mem.used = true;
    shut?.();
    const root = strip.closest('.pm-profile');
    if (root) showOnList(root, thing.key);
  };
  go.addEventListener('click', show);
  close.addEventListener('click', () => {
    mem.hidden = true;
    mem.used = true;
    shut?.();
    strip.remove();
  });

  if (options.pulse) startPulse(strip, mem.openedAt);

  if (options.pointer && !mem.pointed) {
    // A redraw drops this strip (the check above skips it) and the new strip starts its own clock.
    window.setTimeout(() => {
      if (!strip.isConnected || mem.used || mem.pointed) return;
      mem.pointed = true;
      shut = pointAt(strip, {
        show,
        never: () => {
          shut?.();
          options.pointerOff?.();
        }
      });
    }, POINTER_DELAY_MS);
  }
  return strip;
}

/** Steps the strip's ring through the colours, adding one every ten seconds; stops once the strip goes. */
function startPulse(strip: HTMLElement, openedAt: number): void {
  strip.classList.add('is-pulsing');
  let step = 0;
  const paint = (): void => {
    const n = pulseCount(Date.now() - openedAt);
    strip.style.setProperty('--ns-pulse', PULSE_COLOURS[step % n]!);
    strip.dataset.colours = String(n);
    step += 1;
  };
  paint();
  const timer = window.setInterval(() => {
    if (!strip.isConnected) {
      window.clearInterval(timer);
      return;
    }
    paint();
  }, PULSE_STEP_MS);
}

/**
 * Dims the page around the strip, with an arrow and the words. Tapping the strip's spot, or Show
 * me, goes to the list; anywhere else (or Escape) just closes it. Returns a function that closes it.
 */
function pointAt(strip: HTMLElement, actions: { show: () => void; never: () => void }): () => void {
  strip.scrollIntoView?.({ block: 'nearest' });
  const layer = el('div', 'ns-pointer');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', 'This is what to do now');
  const hole = el('button', 'ns-pointer__hole');
  hole.type = 'button';
  hole.setAttribute('aria-label', 'Show me on my to do list');
  const arrow = el('span', 'ns-pointer__arrow', '⬆');
  arrow.setAttribute('aria-hidden', 'true');
  const card = el('div', 'ns-pointer__card');
  const show = el('button', 'ns-pointer__show', 'Show me →');
  show.type = 'button';
  const never = el('button', 'ns-pointer__never', 'Don’t show this again');
  never.type = 'button';
  const acts = el('div', 'ns-pointer__acts');
  acts.append(show, never);
  card.append(el('p', 'ns-pointer__words', 'This is what to do now.'), acts);
  layer.append(hole, arrow, card);

  const place = (): void => {
    const r = strip.getBoundingClientRect();
    Object.assign(hole.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    const w = Math.min(340, window.innerWidth - 24);
    card.style.width = `${w}px`;
    card.style.left = `${Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12))}px`;
    card.style.top = `${r.bottom + 64}px`;
    arrow.style.left = `${r.left + r.width / 2 - 18}px`;
    arrow.style.top = `${r.bottom + 12}px`;
  };
  const close = (): void => {
    layer.remove();
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  hole.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.show();
  });
  show.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.show();
  });
  never.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.never();
  });
  card.addEventListener('click', (e) => e.stopPropagation());
  layer.addEventListener('click', close);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  document.addEventListener('keydown', onKey);
  document.body.append(layer);
  place();
  show.focus({ preventScroll: true });
  return close;
}
