/**
 * The To do panel beside the unit map on a student's progress page, and on the teacher's view of
 * it. The server works out every item from what the student has done (profile-todo.mjs); this only
 * draws it. Nothing here is ticked by hand. A finished item stays ticked for the rest of that day.
 */
import { el } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import { minutesFor } from '@/organiser/student-panel';
import { PRACTISED_EVENT } from '@/organiser/practice';
import { pageOpenedAt, startColourPulse } from '@/student/colour-pulse';
import './todo-panel.css';

export type TodoActivity = { id: string; title: string; done: boolean };
/** `published: false`: an assessment on the calendar whose task page is still closed, so there is nothing to open. */
export type TodoCountdown = { title: string; lesson_id: string; assessment: boolean; due_date: string; due_time: string; set_date: string; published?: boolean };
/** A published practice lesson the "Do a practice Viva Voce" line links to. */
export type VivaPracticeLink = { lesson_id: string; title: string };
export type TodoPayload = {
  countdowns: TodoCountdown[];
  /** While an assessment counts down: Viva Voce Practice 1 (prepared) and 2 (spontaneous), whichever exist. */
  viva_practice?: { prepared?: VivaPracticeLink; spontaneous?: VivaPracticeLink } | null;
  announcements: { id: string; text: string; at: string | null }[];
  /** Organiser cards left today and already answered today; null when there is nothing either way. */
  practice: { today: number; answered: number } | null;
  waiting: { title: string; lesson_id: string; at: string }[];
  /** Do now, Do next, Extra practice, Challenge: only boxes with something in them, in that order. */
  boxes: TodoBox[];
  /** Lessons left that did not fit in a box; the map has them all. */
  more: number;
};
export type TodoBoxKey = 'now' | 'next' | 'extra' | 'challenge';
/**
 * One row in a box: a lesson, or returned feedback (`kind: 'feedback'`). `done`: finished (or
 * feedback read) today, ticked until the day ends. `reason`: why it sits in this box.
 */
export type TodoBoxItem = {
  id: string;
  title: string;
  kind: 'lesson' | 'quiz' | 'assessment' | 'feedback';
  role?: 'core' | 'support' | 'extension' | 'optional';
  done: boolean;
  reason: string;
  started?: { activities: TodoActivity[] };
  feedback?: { state: 'new' | 'redraft' | 'read'; kind: string; date: string };
};
export type TodoBox = { key: TodoBoxKey; items: TodoBoxItem[] };
export type TodoOptions = {
  classId: string;
  /** The teacher looking at a student's page: same list, no Practise link (the organiser tab is the student's). */
  teacher?: boolean;
  /** Clock for tests. */
  now?: () => Date;
};

const lessonHref = (classId: string, lessonId: string): string => `/s/classes/${encodeURIComponent(classId)}/lessons/${encodeURIComponent(lessonId)}`;

/** The due moment, in the device's own time zone. No time means the end of the day. */
export function dueAt(c: TodoCountdown): Date {
  return new Date(`${c.due_date}T${c.due_time || '23:59'}:00`);
}

/** Whole days, hours and minutes from now to the due moment, never below zero. */
export function remaining(due: Date, now: Date): { days: number; hours: number; mins: number; past: boolean } {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, mins: 0, past: true };
  const mins = Math.floor(ms / 60_000);
  return { days: Math.floor(mins / 1440), hours: Math.floor((mins % 1440) / 60), mins: mins % 60, past: false };
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT_DAY = new Intl.DateTimeFormat('en-AU', { weekday: 'long' });
const DATE_ONLY = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });
const BIG_DAY = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

function clock(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Today", "Yesterday", a weekday within the week, else a short date. */
export function whenText(iso: string | null, now: Date): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const startOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return SHORT_DAY.format(at);
  return DATE_ONLY.format(at);
}

/** " today", " yesterday", " on Monday", " on 3 Nov", or nothing. */
function onDay(iso: string | null, now: Date): string {
  const when = whenText(iso, now);
  if (!when) return '';
  return when === 'Today' || when === 'Yesterday' ? ` ${when.toLowerCase()}` : ` on ${when}`;
}

function unit(n: number, label: string): HTMLElement {
  const cell = el('div', 'td-count__cell');
  cell.append(el('b', undefined, String(n).padStart(2, '0')), el('small', undefined, label));
  return cell;
}

export type CountdownOptions = {
  classId: string;
  now?: () => Date;
  /** `big`: the card at the top of My progress, with the clock beside the name. */
  size?: 'small' | 'big';
};

/**
 * One countdown: a live days, hours and minutes clock, the due moment and how far along from the
 * day it was set. Links to its lesson once that is published. Null once the time is up.
 */
export function countdownCard(c: TodoCountdown, options: CountdownOptions): HTMLElement | null {
  const now = options.now ?? (() => new Date());
  const big = options.size === 'big';
  const due = dueAt(c);
  if (Number.isNaN(due.getTime()) || remaining(due, now()).past) return null;
  const open = c.published !== false;
  const box = open ? studentAnchor(lessonHref(options.classId, c.lesson_id), 'td-count') : el('div', 'td-count is-closed');
  if (big) box.classList.add('td-count--big');
  const head = big ? el('div', 'td-count__head') : box;
  head.append(el('span', 'td-count__kicker', c.assessment ? 'Assessment task' : 'Due soon'), el('span', 'td-count__name', c.title));
  const cells = el('div', 'td-count__clock');
  cells.setAttribute('role', 'timer');
  const when = el('span', 'td-count__due', `Due ${big ? BIG_DAY.format(due).replace(',', '') : DAY_FORMAT.format(due)}${c.due_time ? `, ${clock(c.due_time)}` : ''}`);
  const track = el('span', 'td-count__track');
  const fill = el('i');
  track.append(fill);
  const set = c.set_date ? new Date(`${c.set_date}T00:00:00`) : null;
  const draw = (): boolean => {
    const left = remaining(due, now());
    cells.replaceChildren(unit(left.days, left.days === 1 ? 'day' : 'days'), unit(left.hours, left.hours === 1 ? 'hour' : 'hours'), unit(left.mins, 'mins'));
    cells.setAttribute('aria-label', `${left.days} days, ${left.hours} hours and ${left.mins} minutes left`);
    if (set && set < due) {
      const gone = Math.min(1, Math.max(0, (now().getTime() - set.getTime()) / (due.getTime() - set.getTime())));
      fill.style.width = `${Math.round(gone * 100)}%`;
    }
    return !left.past;
  };
  draw();
  if (big) {
    head.append(when);
    box.append(head, cells);
  } else box.append(cells, when);
  if (set && set < due) box.append(track);
  if (big && !open) box.append(el('p', 'td-count__foot', 'Your teacher opens the task page closer to the day.'));
  // Redraws twice a minute; stops once the panel has left the page or the time is up.
  const timer = window.setInterval(() => {
    if (!box.isConnected || !draw()) window.clearInterval(timer);
  }, 30_000);
  return box;
}

/**
 * "Do a practice Viva Voce": one slim line with a pill per practice lesson. `dark` sits under the
 * navy countdown at the top of My progress; `light` is the orange row in the To do panel's Today.
 * Null when neither lesson is there.
 */
export function vivaPracticeLine(vp: TodoPayload['viva_practice'], classId: string, tone: 'dark' | 'light'): HTMLElement | null {
  if (!vp || (!vp.spontaneous && !vp.prepared)) return null;
  const line = el('div', `td-viva td-viva--${tone}`);
  const title = el('span', 'td-viva__title', 'Do a practice Viva Voce');
  const pick = el('span', 'td-viva__pick');
  const pill = (link: VivaPracticeLink, name: string, hint: string): HTMLAnchorElement => {
    const a = studentAnchor(lessonHref(classId, link.lesson_id), 'td-viva__opt');
    a.append(name, el('small', undefined, hint));
    a.setAttribute('aria-label', `${name} practice, ${hint}: ${link.title}`);
    return a;
  };
  if (vp.spontaneous) pick.append(pill(vp.spontaneous, 'Spontaneous', 'like on the day'));
  if (vp.prepared) pick.append(pill(vp.prepared, 'Prepared', 'plan out my response'));
  line.append(title, pick);
  return line;
}

function group(title: string): HTMLElement {
  const g = el('section', 'td-group');
  g.append(el('h4', 'td-group__title', title));
  return g;
}

type Mark = 'box' | 'tick' | 'new' | 'redraft' | 'wait';
function item(mark: Mark, title: string, note: string, action?: HTMLElement, pill?: [string, string]): HTMLElement {
  const row = el('div', 'td-item');
  const marker = el('span', `td-mark td-mark--${mark}`);
  marker.setAttribute('aria-hidden', 'true');
  const body = el('div', 'td-item__body');
  const name = el('span', `td-item__title${mark === 'tick' ? ' is-done' : ''}`, title);
  if (pill) name.append(el('span', `td-pill td-pill--${pill[0]}`, pill[1]));
  body.append(name);
  if (note) body.append(el('span', 'td-item__note', note));
  row.append(marker, body);
  if (action) row.append(action);
  return row;
}

/** A link that opens another tab of the progress page (Returned work, Organiser). */
/** The daily practice row: an orange card with cards left, or a tick once today's are done. */
function practiceRow(left: number, teacher: boolean): HTMLElement {
  if (left <= 0) {
    const done = item('tick', 'Practise your organiser', 'Done for today');
    done.dataset.todo = 'practice';
    return done;
  }
  const minutes = minutesFor(left);
  const note = `${left} ${left === 1 ? 'card' : 'cards'} left · about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  // Orange card so the daily practice stands out from the plain rows below it.
  const row = item('box', 'Practise your organiser', note, teacher ? undefined : tabLink('Practise →', 'organiser', 'Practise your organiser'));
  row.classList.add('td-item--practise');
  // The "Do this now" strip finds its row by this.
  row.dataset.todo = 'practice';
  return row;
}

function tabLink(label: string, tab: string, aria: string): HTMLButtonElement {
  const b = el('button', 'td-go', label);
  b.type = 'button';
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', () => {
    const target = b.closest('.pm-profile')?.querySelector<HTMLButtonElement>(`.pg-tab[data-tab="${tab}"]`);
    if (!target) return;
    target.click();
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    target.focus();
  });
  return b;
}

function lessonLink(classId: string, lessonId: string, label: string, title: string): HTMLAnchorElement {
  const a = studentAnchor(lessonHref(classId, lessonId), 'td-go', label);
  a.setAttribute('aria-label', `${label.replace(' →', '')}: ${title}`);
  return a;
}

const KIND_NOTE: Record<string, string> = { lesson: '', quiz: 'Quiz', assessment: 'Assessment task' };

const BOXES: Record<TodoBoxKey, { title: string; hint: string }> = {
  now: { title: 'Do now', hint: 'For your next test, or something to fix' },
  next: { title: 'Do next', hint: 'Start once Do now is done' },
  extra: { title: 'Extra practice', hint: 'Helps, but you won’t fall behind' },
  challenge: { title: 'Challenge', hint: 'For when you want to go further' }
};
/** Rows not done that a box shows before Show more. A row done today stays and takes no slot. */
export const BOX_SHOWN = 3;

function startedRow(t: TodoBoxItem, activities: TodoActivity[], classId: string): HTMLElement {
  const finished = activities.filter((a) => a.done).length;
  const total = activities.length;
  const row = item('box', t.title, total ? `${finished} of ${total} ${total === 1 ? 'activity' : 'activities'} done` : 'Started', lessonLink(classId, t.id, 'Carry on →', t.title));
  if (total) {
    const meter = el('span', 'td-meter');
    meter.setAttribute('aria-hidden', 'true');
    const fill = el('i');
    fill.style.width = `${Math.round((finished / total) * 100)}%`;
    meter.append(fill);
    row.querySelector('.td-item__note')?.prepend(meter);
    const list = el('ul', 'td-acts');
    for (const a of activities) {
      const li = el('li', a.done ? 'is-done' : undefined, a.title);
      li.setAttribute('aria-label', `${a.title}: ${a.done ? 'done' : 'not done yet'}`);
      list.append(li);
    }
    row.querySelector('.td-item__body')?.append(list);
  }
  return row;
}

function feedbackRow(t: TodoBoxItem, f: NonNullable<TodoBoxItem['feedback']>): HTMLElement {
  if (t.done || f.state === 'read') return item('tick', t.title, 'Feedback read today.');
  if (f.state === 'redraft') {
    return item('redraft', t.title, '', f.kind === 'answer' ? tabLink('Answer again →', 'returned', `Answer ${t.title} again`) : tabLink('Redraft →', 'returned', `Redraft ${t.title}`), ['again', 'Have another go']);
  }
  return item('new', t.title, '', tabLink('Open →', 'returned', `Open feedback on ${t.title}`), ['new', 'New']);
}

function boxRow(t: TodoBoxItem, classId: string): HTMLElement {
  let row: HTMLElement;
  if (t.feedback) row = feedbackRow(t, t.feedback);
  else if (t.done) row = item('tick', t.title, 'Done today');
  else if (t.started) row = startedRow(t, t.started.activities, classId);
  else row = item('box', t.title, KIND_NOTE[t.kind] ?? '', lessonLink(classId, t.id, 'Open →', t.title));
  if (t.reason && !t.done) row.querySelector('.td-item__title')?.after(el('span', 'td-item__why', t.reason));
  return row;
}

let boxSeq = 0;

/** One box: a dot heading and hint, its first rows, and Show more for the rest. */
function boxGroup(box: TodoBox, options: TodoOptions): HTMLElement {
  const meta = BOXES[box.key];
  const g = el('section', `td-group td-box td-box--${box.key}`);
  const title = el('h4', 'td-group__title');
  const dot = el('span', 'td-box__dot');
  dot.setAttribute('aria-hidden', 'true');
  title.append(dot, meta.title);
  g.append(title, el('p', 'td-box__hint', meta.hint));
  // Do now pulses through colours (colour-pulse.ts) while anything in it is left: the student's own page only.
  if (box.key === 'now' && !options.teacher && box.items.some((t) => !t.done)) startColourPulse(g, pageOpenedAt(options.classId));
  const hidden: HTMLElement[] = [];
  let shown = 0;
  for (const t of box.items) {
    const row = boxRow(t, options.classId);
    row.dataset.todo = t.id;
    if (!t.done && shown >= BOX_SHOWN) {
      hidden.push(row);
      continue;
    }
    if (!t.done) shown += 1;
    g.append(row);
  }
  if (hidden.length) {
    const id = `td-more-${box.key}-${++boxSeq}`;
    const extra = el('div', 'td-box__more');
    extra.id = id;
    // The rows past the first three sit in one wrapper the toggle opens, in their order.
    extra.append(...hidden);
    extra.hidden = true;
    const toggle = el('button', 'td-morebtn', `Show ${hidden.length} more`);
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', id);
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Show less' : `Show ${hidden.length} more`;
      extra.hidden = !open;
    });
    g.append(extra, toggle);
  }
  return g;
}

export function renderTodoPanel(todo: TodoPayload, options: TodoOptions): HTMLElement {
  const now = options.now ?? (() => new Date());
  const panel = el('aside', 'td-panel');
  panel.setAttribute('aria-label', 'Your to do list');
  panel.append(el('h3', 'td-panel__title', 'To do'), el('p', 'td-panel__sub', options.teacher ? 'Their list, as they see it. It ticks off as they work.' : 'Updated as you work. Things tick off when you do them.'));
  let any = false;

  // Two countdowns at once (an assessment and a sprint step, say) stack, soonest first.
  const counts = todo.countdowns.map((c) => countdownCard(c, { classId: options.classId, now })).filter((c): c is HTMLElement => c !== null);
  if (counts.length) {
    const stack = el('div', 'td-counts');
    stack.append(...counts);
    panel.append(stack);
    any = true;
  }

  if (todo.announcements.length) {
    const g = group('From your teacher');
    for (const a of todo.announcements) {
      const note = el('div', 'td-ann');
      note.append(el('p', 'td-ann__text', a.text));
      const when = whenText(a.at, now());
      if (when) note.append(el('span', 'td-ann__when', when));
      g.append(note);
    }
    panel.append(g);
    any = true;
  }

  const prac = todo.practice;
  const hasPractice = !!prac && (prac.today > 0 || prac.answered > 0);
  const viva = vivaPracticeLine(todo.viva_practice, options.classId, 'light');
  if (hasPractice || viva) {
    // Today: the organiser row first, then the practice Viva line.
    const g = group('Today');
    let row = prac && hasPractice ? practiceRow(prac.today, !!options.teacher) : null;
    if (row) g.append(row);
    if (viva) g.append(viva);
    panel.append(g);
    any = true;
    // A practice round on the Organiser tab counts this row down and ticks it off when none are
    // left, without reloading the page. The listener goes once the panel is redrawn away.
    if (row && !options.teacher) {
      const onPractised = (e: Event): void => {
        if (!panel.isConnected) return document.removeEventListener(PRACTISED_EVENT, onPractised);
        const d = (e as CustomEvent<{ classId?: string; today?: number }>).detail;
        if (!d || d.classId !== options.classId || typeof d.today !== 'number' || !row) return;
        const next = practiceRow(Math.max(0, d.today), false);
        row.replaceWith(next);
        row = next;
      };
      document.addEventListener(PRACTISED_EVENT, onPractised);
    }
  }

  // Back to you holds only work still with the teacher; feedback to read or redo sits in Do now.
  if (todo.waiting.length) {
    const g = group('Back to you');
    for (const w of todo.waiting) {
      g.append(item('wait', w.title, `Handed in${onDay(w.at, now())}. Feedback not back yet.`, undefined, ['wait', 'With your teacher']));
    }
    panel.append(g);
    any = true;
  }

  for (const box of todo.boxes) {
    if (!box.items.length || !BOXES[box.key]) continue;
    panel.append(boxGroup(box, options));
    any = true;
  }
  if (todo.more > 0) {
    panel.append(el('p', 'td-more', `And ${todo.more} more on the map.`));
    any = true;
  }

  if (!any) panel.append(el('p', 'td-empty', 'All caught up. Nothing to do right now.'));
  return panel;
}
