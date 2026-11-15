import { ApiClientError } from '@/api/client';
import { el } from '@/quiz/dom';
import { createStudentShell, renderStudentChrome, renderStudentStatus, studentAnchor } from '@/student/shell';
import { isSignInNeeded, sharePage, shareSignIn, shareSignOut, type SharePage, type ShareTick } from '@/student/share-api';
import { burstLabel, formatDay, formatPlanned, formatTickTime, sydneyToday } from '@/student/share-format';
import { mountTour, type TourHandle } from '@/app/tour';
import './share-view.css';

/**
 * Progress share: a read-only page of one student's progress for a pastoral teacher or parent.
 * The server sends only what this page shows (progress-share-page.mjs); nothing here writes
 * anything about the student.
 */

const SHOW_TICKS = 20;
const VIA: Record<ShareTick['via'], string> = { tick: 'Ticked', quiz: 'Quiz submitted', teacher: 'Marked by teacher' };
const KIND: Record<string, string> = { tick: 'Ticked', untick: 'Unticked', quiz: 'Quiz submitted' };
export const SHARE_TOUR_KEY = 'progress-share-tour:v1';

export type RenderShareOptions = { token: string; today: string; onSignOut: () => void };

export const shareLessonPath = (token: string, lessonId: string) => `/s/share/${token}/lessons/${encodeURIComponent(lessonId)}`;

function section(key: string, title: string): { box: HTMLElement; body: HTMLElement } {
  const box = el('section', `share-card share-card--${key}`);
  box.dataset.tour = key;
  box.append(el('h2', 'share-card__title', title));
  const body = el('div', 'share-card__body');
  box.append(body);
  return { box, body };
}

function lessonLink(token: string, lessonId: string, title: string): HTMLElement {
  return studentAnchor(shareLessonPath(token, lessonId), 'share-lesson-link', title || 'Lesson');
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function tickRow(token: string, tick: ShareTick): HTMLElement {
  const li = el('li', 'share-tick');
  li.append(lessonLink(token, tick.lesson_id, tick.title));
  const meta = el('p', 'share-tick__meta', `${VIA[tick.via]} ${formatTickTime(tick.at)}`);
  if (tick.planned) meta.append(el('span', 'share-tick__planned', ` · ${formatPlanned(tick.planned)}`));
  li.append(meta);
  const ticks = tick.record.filter((e) => e.kind === 'tick').length;
  if (tick.record.length > 1) {
    const more = el('details', 'share-tick__record');
    more.append(el('summary', '', ticks > 1 ? `Ticked ${ticks} times` : plural(tick.record.length, 'change')));
    const list = el('ol', 'share-tick__events');
    for (const e of tick.record) list.append(el('li', '', `${KIND[e.kind] ?? e.kind} ${formatTickTime(e.at)}`));
    more.append(list);
    li.append(more);
  }
  return li;
}

function dueIn(due: string, today: string): string {
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** The page itself, from the payload. Pure: no calls, so tests and the tour can use it directly. */
export function renderSharePage(page: SharePage, options: RenderShareOptions): HTMLElement {
  const { token, today } = options;
  const root = el('div', 'share-page');

  const head = el('header', 'share-head');
  const name = page.student.first_name || 'Student';
  head.append(el('h1', 'share-head__title', `${name}’s English`));
  if (page.class_title) head.append(el('p', 'share-head__class', page.class_title));
  const who = el('p', 'share-head__who');
  who.append(el('span', 'share-head__initials', page.viewer_initials), el('span', 'share-head__note', 'View only'));
  const out = el('button', 'btn btn--ghost share-head__out', 'Sign out of this browser');
  out.type = 'button';
  out.addEventListener('click', options.onSignOut);
  who.append(out);
  head.append(who);
  root.append(head);

  const next = section('next', 'Up next');
  if (page.next.length) {
    const list = el('ul', 'share-list');
    for (const item of page.next) {
      const li = el('li', `share-list__item is-${item.box}`);
      li.append(el('span', 'share-list__box', item.box === 'now' ? 'Do now' : 'Do next'), lessonLink(token, item.lesson_id, item.title));
      list.append(li);
    }
    next.body.append(list);
  } else next.body.append(el('p', 'share-empty', 'Nothing waiting right now.'));
  root.append(next.box);

  const unit = section('unit', page.unit.title ? `Unit: ${page.unit.title}` : 'Unit progress');
  const bar = el('div', 'share-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Core lessons done');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(page.unit.core_total));
  bar.setAttribute('aria-valuenow', String(page.unit.core_done));
  const fill = el('span', 'share-bar__fill');
  fill.style.width = `${page.unit.core_total ? Math.round((page.unit.core_done / page.unit.core_total) * 100) : 0}%`;
  bar.append(fill);
  unit.body.append(bar, el('p', 'share-bar__label', `${page.unit.core_done} of ${page.unit.core_total} core lessons`));
  root.append(unit.box);

  if (page.countdowns.length) {
    const coming = section('coming', 'Coming up');
    const list = el('ul', 'share-list');
    for (const c of page.countdowns) {
      const li = el('li', 'share-list__item');
      li.append(el('span', 'share-list__what', c.title), el('span', 'share-list__when', `${dueIn(c.due_date, today)} · ${formatDay(c.due_date)}`));
      list.append(li);
    }
    coming.body.append(list);
    root.append(coming.box);
  }

  const ticks = section('ticks', 'Ticked off');
  for (const b of page.bursts) {
    ticks.body.append(el('p', 'share-burst', `${burstLabel(b)} · ${formatTickTime(b.from)}`));
  }
  if (page.ticks.length) {
    const list = el('ol', 'share-ticks');
    page.ticks.forEach((t, i) => {
      const row = tickRow(token, t);
      if (i >= SHOW_TICKS) row.hidden = true;
      list.append(row);
    });
    ticks.body.append(list);
    if (page.ticks.length > SHOW_TICKS) {
      const more = el('button', 'btn btn--ghost share-more', 'Show earlier');
      more.type = 'button';
      more.addEventListener('click', () => {
        list.querySelectorAll<HTMLElement>('.share-tick[hidden]').forEach((r) => (r.hidden = false));
        more.remove();
      });
      ticks.body.append(more);
    }
  } else ticks.body.append(el('p', 'share-empty', 'Nothing ticked off in this unit yet.'));
  root.append(ticks.box);

  const practice = section('practice', 'Practice');
  practice.body.append(el('p', 'share-streak', page.practice.streak ? `${plural(page.practice.streak, 'day')} in a row` : 'No streak right now'));
  const on = new Set(page.practice.days);
  // Four weeks ending this week, Monday first.
  const back = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -back - 21);
  const grid = el('div', 'share-grid');
  grid.setAttribute('role', 'img');
  let practised = 0;
  for (let i = 0; i < 28; i += 1) {
    const day = addDays(start, i);
    const did = on.has(day);
    if (did && day <= today) practised += 1;
    const cell = el('span', `share-grid__day${did ? ' is-on' : ''}${day > today ? ' is-future' : ''}${day === today ? ' is-today' : ''}`);
    cell.title = `${formatDay(day)}${did ? ': practised' : ''}`;
    grid.append(cell);
  }
  grid.setAttribute('aria-label', `Practised on ${plural(practised, 'day')} in the last four weeks`);
  const heads = el('div', 'share-grid__heads');
  heads.setAttribute('aria-hidden', 'true');
  for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) heads.append(el('span', '', d));
  practice.body.append(heads, grid);
  if (page.practice.weekly.length) {
    const weeks = el('ul', 'share-weeks');
    for (const w of page.practice.weekly) weeks.append(el('li', '', `Week of ${formatDay(w.week_start)}: ${w.right} of ${w.seen} right`));
    practice.body.append(weeks);
  } else if (!practised) practice.body.append(el('p', 'share-empty', 'No practice in the last 4 weeks.'));
  root.append(practice.box);

  const organiser = section('organiser', 'Today’s organiser');
  organiser.body.append(el('p', 'share-organiser', page.practice.today ? `${plural(page.practice.today.left, 'card')} left today · ${page.practice.today.answered} answered` : 'No organiser cards today.'));
  root.append(organiser.box);

  const feedback = section('feedback', 'Feedback to act on');
  if (page.feedback.to_act.length) {
    const list = el('ul', 'share-list');
    for (const f of page.feedback.to_act) {
      const li = el('li', 'share-list__item');
      li.append(el('span', 'share-list__what', f.title), el('span', `share-list__when${f.redraft ? ' is-redraft' : ''}`, f.redraft ? 'Redraft asked for' : 'To read'));
      list.append(li);
    }
    feedback.body.append(list);
  } else feedback.body.append(el('p', 'share-empty', 'Nothing to act on.'));
  if (page.feedback.waiting) feedback.body.append(el('p', 'share-waiting', `${plural(page.feedback.waiting, 'piece')} waiting to be marked`));
  root.append(feedback.box);
  return root;
}

export type ShareSignInOptions = { onSubmit: (initials: string, pin: string) => Promise<void> };

/** Initials and the PIN. Errors from the server show under the button. */
export function renderShareSignIn(options: ShareSignInOptions): HTMLElement {
  const form = el('form', 'share-signin');
  form.noValidate = true;
  form.append(
    el('h1', 'share-signin__title', 'Progress share'),
    el('p', 'share-signin__lead', 'Type your initials and the PIN the teacher gave you. This browser will remember you, so you only do this once.')
  );
  const initials = el('input', 'share-signin__input');
  initials.name = 'initials';
  initials.autocomplete = 'off';
  initials.autocapitalize = 'characters';
  initials.maxLength = 5;
  initials.required = true;
  const pin = el('input', 'share-signin__input');
  pin.name = 'pin';
  pin.inputMode = 'numeric';
  pin.autocomplete = 'one-time-code';
  pin.maxLength = 6;
  pin.required = true;
  const field = (text: string, input: HTMLInputElement) => {
    const label = el('label', 'share-signin__field');
    label.append(el('span', 'share-signin__label', text), input);
    return label;
  };
  const go = el('button', 'btn btn--primary share-signin__go', 'Open');
  go.type = 'submit';
  const say = el('p', 'share-signin__say');
  say.setAttribute('role', 'alert');
  form.append(field('Your initials', initials), field('PIN', pin), go, say);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!initials.value.trim() || !/^\d{6}$/.test(pin.value.replace(/\s+/g, ''))) {
      say.textContent = 'Type your initials and the 6-digit PIN.';
      return;
    }
    go.disabled = true;
    say.textContent = '';
    options.onSubmit(initials.value, pin.value).catch((e: unknown) => {
      say.textContent = e instanceof ApiClientError ? e.message : 'That didn’t go through. Check your connection and try again.';
      go.disabled = false;
    });
  });
  return form;
}

/** The tour's steps for this page; a step whose section isn't there is left out. */
export function mountShareTour(content: HTMLElement, page: SharePage): TourHandle {
  const name = page.student.first_name || 'the student';
  const at = (key: string) => () => content.querySelector<HTMLElement>(`[data-tour="${key}"]`);
  return mountTour({
    host: content,
    storageKey: SHARE_TOUR_KEY,
    steps: [
      { title: 'Welcome', body: `This page shows how ${name} is getting on in English. You can look at anything, but nothing here can be changed.` },
      { target: at('next'), title: 'Up next', body: `What ${name} should work on now and next.` },
      { target: at('unit'), title: 'Unit progress', body: `How far through the current unit ${name} is, counting the core lessons.` },
      { target: at('coming'), title: 'Coming up', body: 'Assessments on the way, soonest first.' },
      { target: at('ticks'), title: 'Ticked off', body: `Everything ${name} has finished, with the time it was done. When lots are ticked within a few minutes, you’ll see a label saying so.` },
      { target: at('practice'), title: 'Practice', body: `Each square is a day ${name} practised with their organiser. The weeks show how many cards they got right.` },
      { target: at('organiser'), title: 'Today’s organiser', body: 'Cards left to practise today, and how many are done.' },
      { target: at('feedback'), title: 'Feedback to act on', body: `Work handed back that ${name} still needs to read or redraft, and work waiting to be marked.` },
      { target: () => content.querySelector<HTMLElement>('.share-lesson-link'), title: 'Lessons', body: `Tap any lesson to read it as ${name} sees it. It opens locked, so you can help without changing anything.` }
    ]
  });
}

export type MountShareViewOptions = { root: HTMLElement; token: string; isStale?: () => boolean; today?: () => string };
export type ShareViewHandle = { dispose(): void };

export function mountShareView(options: MountShareViewOptions): ShareViewHandle {
  const { root, token, isStale = () => false } = options;
  const today = options.today ?? (() => sydneyToday());
  let disposed = false;
  let tour: TourHandle | null = null;
  root.replaceChildren();
  const { surface, header, content } = createStudentShell('share-shell');
  root.append(surface);
  renderStudentChrome(header, { brand: 'Progress share' });
  renderStudentStatus(content, 'Loading…');

  const live = () => !disposed && !isStale();
  const showPage = (page: SharePage) => {
    tour?.dispose();
    document.title = `${page.student.first_name || 'Student'}’s English`;
    const signOut = () => {
      void shareSignOut(token).then(() => {
        if (live()) showSignIn();
      }, () => undefined);
    };
    content.replaceChildren(renderSharePage(page, { token, today: today(), onSignOut: signOut }));
    tour = mountShareTour(content, page);
  };
  const showSignIn = () => {
    tour?.dispose();
    tour = null;
    content.replaceChildren(
      renderShareSignIn({
        onSubmit: async (initials, pin) => {
          const reply = await shareSignIn(token, initials, pin);
          if (live() && !isSignInNeeded(reply)) showPage(reply);
        }
      })
    );
    content.querySelector<HTMLInputElement>('input[name="initials"]')?.focus();
  };

  sharePage(token).then(
    (reply) => {
      if (!live()) return;
      if (isSignInNeeded(reply)) showSignIn();
      else showPage(reply);
    },
    (e: unknown) => {
      if (!live()) return;
      content.replaceChildren(el('p', 'share-gone', e instanceof ApiClientError && e.code === 'not_found' ? 'This link doesn’t work any more.' : 'The page didn’t load. Check your connection and try again.'));
    }
  );

  return {
    dispose() {
      disposed = true;
      tour?.dispose();
    }
  };
}
