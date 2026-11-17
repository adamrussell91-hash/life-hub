import { ApiClientError } from '@/api/client';
import { el } from '@/quiz/dom';
import { createStudentShell, renderStudentChrome, renderStudentStatus, studentAnchor } from '@/student/shell';
import { isSignInNeeded, sharePage, shareSignIn, shareSignOut, type SharePage, type ShareTick } from '@/student/share-api';
import { burstLabel, formatPlanned, formatTickTime, sydneyToday } from '@/student/share-format';
import { renderViewerProfile } from '@/student/profile-view';
import { navigate } from '@/app/router';
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
export const SHARE_TOUR_KEY = 'progress-share-tour:v2';
/** The student page's links carry this in place of a class; the share page sends them to the locked lesson view. */
export const SHARE_CLASS = 'share';

export type RenderShareOptions = { token: string; today: string; onSignOut: () => void };

export const shareLessonPath = (token: string, lessonId: string) => `/s/share/${token}/lessons/${encodeURIComponent(lessonId)}`;

const LESSON_HREF = /\/s\/classes\/[^/]+\/lessons\/([^/?#]+)/;

/**
 * Points every lesson link the student page draws (strip, To do, map cards, countdown) at the
 * locked share lesson, now and as the map adds cards. A capture listener runs before the
 * student link's own click handler, which steps aside once the click is handled.
 */
export function routeLessonLinks(root: HTMLElement, token: string, go: (path: string) => void): () => void {
  const fix = (scope: ParentNode) => {
    for (const a of scope.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const m = a.getAttribute('href')?.match(LESSON_HREF);
      if (m) a.setAttribute('href', shareLessonPath(token, decodeURIComponent(m[1])));
    }
  };
  fix(root);
  const watch = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => fix(root));
  watch?.observe(root, { childList: true, subtree: true });
  const onClick = (event: MouseEvent) => {
    const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || !root.contains(a)) return;
    const href = a.getAttribute('href') ?? '';
    const m = href.match(LESSON_HREF);
    const path = m ? shareLessonPath(token, decodeURIComponent(m[1])) : href.startsWith(`/s/share/${token}/lessons/`) ? href : null;
    if (!path) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      a.setAttribute('href', path);
      return;
    }
    event.preventDefault();
    go(path);
  };
  root.addEventListener('click', onClick, true);
  return () => {
    watch?.disconnect();
    root.removeEventListener('click', onClick, true);
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function tickRow(token: string, tick: ShareTick): HTMLElement {
  const li = el('li', 'share-tick');
  li.append(studentAnchor(shareLessonPath(token, tick.lesson_id), 'share-lesson-link', tick.title || 'Lesson'));
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

/** When each lesson was ticked, folded at the foot: the one thing a viewer gets that the student page hasn't. */
function ticksFold(page: SharePage, token: string): HTMLElement {
  const fold = el('details', 'share-ticks-fold');
  fold.dataset.tour = 'ticks';
  fold.append(el('summary', 'share-ticks-fold__sum', `When lessons were ticked off (${page.ticks.length})`));
  for (const b of page.bursts) fold.append(el('p', 'share-burst', `${burstLabel(b)} · ${formatTickTime(b.from)}`));
  if (!page.ticks.length) {
    fold.append(el('p', 'share-empty', 'Nothing ticked off in this unit yet.'));
    return fold;
  }
  const list = el('ol', 'share-ticks');
  page.ticks.forEach((t, i) => {
    const row = tickRow(token, t);
    if (i >= SHOW_TICKS) row.hidden = true;
    list.append(row);
  });
  fold.append(list);
  if (page.ticks.length > SHOW_TICKS) {
    const more = el('button', 'btn btn--ghost share-more', 'Show earlier');
    more.type = 'button';
    more.addEventListener('click', () => {
      list.querySelectorAll<HTMLElement>('.share-tick[hidden]').forEach((r) => (r.hidden = false));
      more.remove();
    });
    fold.append(more);
  }
  return fold;
}

/** The page itself, from the payload: the student's own progress page, read only. Pure: no calls. */
export function renderSharePage(page: SharePage, options: RenderShareOptions): HTMLElement {
  const { token } = options;
  const root = el('div', 'share-page');
  const name = page.student.first_name || 'Student';
  const bar = el('div', 'share-bar-top');
  const who = el('p', 'share-head__who');
  who.append(el('span', 'share-head__initials', page.viewer_initials), el('span', 'share-head__note', page.class_title ? `View only · ${page.class_title}` : 'View only'));
  const out = el('button', 'btn btn--ghost share-head__out', 'Sign out');
  out.type = 'button';
  out.setAttribute('aria-label', 'Sign out of this browser');
  out.addEventListener('click', options.onSignOut);
  bar.append(who, out);
  root.append(bar, renderViewerProfile(page.profile, { classId: SHARE_CLASS, title: `${name}’s progress` }), ticksFold(page, token));
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

/** The tour's steps for this page; a step whose part isn't there is left out. */
export function mountShareTour(content: HTMLElement, page: SharePage): TourHandle {
  const name = page.student.first_name || 'the student';
  const at = (selector: string) => () => content.querySelector<HTMLElement>(selector);
  return mountTour({
    host: content,
    storageKey: SHARE_TOUR_KEY,
    steps: [
      { title: 'Welcome', body: `This is ${name}’s own progress page, the same one ${name} sees. You can look at anything, but nothing here can be changed.` },
      { target: at('.ns-strip'), title: 'Do this now', body: `The one thing ${name} should do next.` },
      { target: at('.pg-next'), title: 'Next steps', body: `What the teacher keeps writing on ${name}’s work.` },
      { target: at('.pm-map'), title: 'The unit', body: `Every lesson in the unit. Colour means done, the gold ring is next. Tap a lesson to read it as ${name} sees it, locked.` },
      { target: at('.td-panel'), title: 'To do', body: `${name}’s list. It ticks off as they work.` },
      { target: at('[data-tour="trends"]'), title: 'How they’re going', body: 'Where they started, where they are now, and what to focus on next.' },
      { target: at('[data-tour="ticks"]'), title: 'When lessons were ticked', body: 'The time each lesson was ticked off. Lots ticked within a few minutes gets a label.' }
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
  let unroute: (() => void) | null = null;
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
    unroute?.();
    content.replaceChildren(renderSharePage(page, { token, today: today(), onSignOut: signOut }));
    unroute = routeLessonLinks(content, token, (path) => navigate(path));
    tour = mountShareTour(content, page);
  };
  const showSignIn = () => {
    unroute?.();
    unroute = null;
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
      unroute?.();
      tour?.dispose();
    }
  };
}
