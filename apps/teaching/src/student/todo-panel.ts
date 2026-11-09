/**
 * The To do panel beside the unit map on a student's own progress page. The server works out
 * every item from what the student has done (profile-todo.mjs); this only draws it. Nothing here
 * is ticked by hand. Organiser practice for today comes from the organiser load the page already has.
 */
import { el } from '@/quiz/dom';
import { studentAnchor } from '@/student/shell';
import type { PracticeLoad } from '@/organiser/types';
import { minutesFor } from '@/organiser/student-panel';
import './todo-panel.css';

export type TodoActivity = { id: string; title: string; done: boolean };
export type TodoPayload = {
  countdown: { title: string; lesson_id: string; due_date: string; due_time: string; set_date: string } | null;
  announcements: { id: string; text: string; at: string | null }[];
  back: { id: string; kind: string; title: string; date: string; state: 'new' | 'redraft' }[];
  waiting: { title: string; lesson_id: string; at: string }[];
  started: { lesson_id: string; title: string; activities: TodoActivity[] }[];
  todo: { id: string; title: string; kind: 'lesson' | 'quiz' | 'assessment' }[];
  more: number;
};
export type TodoOptions = {
  classId: string;
  /** Today's organiser practice; the Today row shows only when there is one. */
  practice?: PracticeLoad | null;
  /** Clock for tests. */
  now?: () => Date;
};

const lessonHref = (classId: string, lessonId: string): string => `/s/classes/${encodeURIComponent(classId)}/lessons/${encodeURIComponent(lessonId)}`;

/** The due moment, in the device's own time zone. No time means the end of the day. */
export function dueAt(c: NonNullable<TodoPayload['countdown']>): Date {
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

function countdown(c: NonNullable<TodoPayload['countdown']>, classId: string, now: () => Date): HTMLElement | null {
  const due = dueAt(c);
  if (Number.isNaN(due.getTime()) || remaining(due, now()).past) return null;
  const box = studentAnchor(lessonHref(classId, c.lesson_id), 'td-count');
  box.append(el('span', 'td-count__kicker', 'Assessment task'), el('span', 'td-count__name', c.title));
  const cells = el('div', 'td-count__clock');
  cells.setAttribute('role', 'timer');
  const when = el('span', 'td-count__due', `Due ${DAY_FORMAT.format(due)}${c.due_time ? `, ${clock(c.due_time)}` : ''}`);
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
  box.append(cells, when);
  if (set && set < due) box.append(track);
  // Redraws twice a minute; stops once the panel has left the page or the time is up.
  const timer = window.setInterval(() => {
    if (!box.isConnected || !draw()) window.clearInterval(timer);
  }, 30_000);
  return box;
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

export function renderTodoPanel(todo: TodoPayload, options: TodoOptions): HTMLElement {
  const now = options.now ?? (() => new Date());
  const panel = el('aside', 'td-panel');
  panel.setAttribute('aria-label', 'Your to do list');
  panel.append(el('h3', 'td-panel__title', 'To do'), el('p', 'td-panel__sub', 'Updated as you work. Things tick off when you do them.'));
  let any = false;

  const count = todo.countdown ? countdown(todo.countdown, options.classId, now) : null;
  if (count) {
    panel.append(count);
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

  const prac = options.practice;
  if (prac && (prac.today > 0 || (prac.answered ?? 0) > 0)) {
    const g = group('Today');
    if (prac.today > 0) {
      const minutes = minutesFor(prac.today);
      g.append(item('box', 'Practise your organiser', `${prac.today} ${prac.today === 1 ? 'card' : 'cards'} · about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`, tabLink('Practise →', 'organiser', 'Practise your organiser')));
    } else g.append(item('tick', 'Practise your organiser', 'Done for today'));
    panel.append(g);
    any = true;
  }

  if (todo.back.length || todo.waiting.length) {
    const g = group('Back to you');
    for (const b of todo.back) {
      if (b.state === 'redraft') g.append(item('redraft', b.title, 'Your teacher asked for another go.', tabLink('Redraft →', 'returned', `Redraft ${b.title}`), ['again', 'Have another go']));
      else g.append(item('new', b.title, 'Feedback is back. Have a read.', tabLink('Open →', 'returned', `Open feedback on ${b.title}`), ['new', 'New']));
    }
    for (const w of todo.waiting) {
      g.append(item('wait', w.title, `Handed in${onDay(w.at, now())}. Feedback not back yet.`, undefined, ['wait', 'With your teacher']));
    }
    panel.append(g);
    any = true;
  }

  if (todo.started.length) {
    const g = group('Keep going');
    for (const s of todo.started) {
      const finished = s.activities.filter((a) => a.done).length;
      const total = s.activities.length;
      const row = item('box', s.title, total ? `${finished} of ${total} ${total === 1 ? 'activity' : 'activities'} done` : 'Started', lessonLink(options.classId, s.lesson_id, 'Carry on →', s.title));
      if (total) {
        const meter = el('span', 'td-meter');
        meter.setAttribute('aria-hidden', 'true');
        const fill = el('i');
        fill.style.width = `${Math.round((finished / total) * 100)}%`;
        meter.append(fill);
        row.querySelector('.td-item__note')?.prepend(meter);
        const list = el('ul', 'td-acts');
        for (const a of s.activities) {
          const li = el('li', a.done ? 'is-done' : undefined, a.title);
          li.setAttribute('aria-label', `${a.title}: ${a.done ? 'done' : 'not done yet'}`);
          list.append(li);
        }
        row.querySelector('.td-item__body')?.append(list);
      }
      g.append(row);
    }
    panel.append(g);
    any = true;
  }

  if (todo.todo.length) {
    const g = group('Still to do');
    for (const t of todo.todo) g.append(item('box', t.title, KIND_NOTE[t.kind] ?? '', lessonLink(options.classId, t.id, 'Open →', t.title)));
    if (todo.more > 0) g.append(el('p', 'td-more', `And ${todo.more} more on the map.`));
    panel.append(g);
    any = true;
  }

  if (!any) panel.append(el('p', 'td-empty', 'All caught up. Nothing to do right now.'));
  return panel;
}
