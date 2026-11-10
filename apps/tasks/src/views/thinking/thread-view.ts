// apps/tasks/src/views/thinking/thread-view.ts
// #/think/<id>: one thread. Its title (editable), status controls, the digest ("what we know")
// and a timeline of session cards with detours indented under their home. A Thought Starter
// detour is answered here (`?detour=<id>`); a protocol detour shows its state and its packet.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { threadsApi } from './api';
import { clearCard, endCard, fireJoint, registerCardSlot, suggestionCard, THREAD_CHANGED_EVENT } from './checkin-card';
import { detourHref } from './landing-block';
import { PROTOCOL_TOOL, toolName } from './map';
import { mountProtocolDetour } from './protocol-detour';
import { mountQuestionDetour } from './question-detour';
import { resumeIfDue } from './resume';
import { sessionApiFor } from './start';
import { homeSession, orderTimeline, waitingOn } from './thread-logic';
import type { Thread, ThreadSession } from './types';

const STATE_LABEL: Record<ThreadSession['state'], string> = { open: 'Open', running: 'Running', returned: 'Came back', failed: 'Did not finish', removed: 'Removed' };
const ROLE_LABEL: Record<ThreadSession['role'], string> = { home: 'Home', detour: 'Detour', handed_on: 'Handed on' };
const LANDING_LABEL = { answer: 'Used as the step’s answer', note: 'Added to notes', dismissed: 'Set aside' } as const;

const POLL_MS = 6000;

function digestBlock(thread: Thread): HTMLElement | null {
  const groups: [string, string[]][] = [['Facts', thread.digest.facts], ['Choices', thread.digest.choices], ['Rests on', thread.digest.restsOn], ['Still open', thread.digest.openQuestions]];
  const filled = groups.filter(([, items]) => items.length);
  if (!filled.length) return null;
  const box = el('section', 'tt-section tt-digest');
  box.append(el('h2', 'tt-section__title', 'What we know'));
  for (const [label, items] of filled) {
    const ul = el('ul', 'tt-land__list');
    for (const item of items) ul.append(el('li', '', item));
    const group = el('div', 'tt-land__group');
    group.append(el('h3', 'tt-land__label', label), ul);
    box.append(group);
  }
  return box;
}

/** The protocol option a failed protocol detour was started from, read from the route log. */
export function retryOption(thread: Thread, s: ThreadSession): string | null {
  const taken = thread.route.filter((r) => r.outcome === 'taken' && r.optionId.startsWith('protocol:') && r.sessionId === s.from?.sessionId && (r.stepId ?? null) === (s.from?.stepId ?? null));
  return taken.at(-1)?.optionId ?? null;
}

function sessionCard(thread: Thread, s: ThreadSession, depth: 0 | 1, focus: boolean, teardowns: Array<() => void>): HTMLElement {
  const card = el('article', `tt-tl__card${depth ? ' tt-tl__card--detour' : ''}`);
  card.dataset.state = s.state;
  const head = el('div', 'tt-tl__head');
  const name = s.kind === 'protocol' ? 'Protocol run' : toolName(s.tool);
  head.append(el('h3', 'tt-tl__name', name), el('span', 'tt-pill', ROLE_LABEL[s.role]), el('span', `tt-pill tt-pill--${s.state}`, STATE_LABEL[s.state]));
  card.append(head);
  if (s.question) card.append(el('p', 'tt-land__question', s.question));
  if (s.packet) {
    card.append(el('p', 'tt-land__answer', s.packet.answer));
    if (s.packet.detail) card.append(el('p', 'tt-land__detail', s.packet.detail));
    if (s.packet.openQuestions.length) {
      const ul = el('ul', 'tt-land__list');
      for (const q of s.packet.openQuestions) ul.append(el('li', '', q));
      card.append(el('h4', 'tt-land__label', 'Still open'), ul);
    }
    if (s.role === 'detour') card.append(el('p', 'tt-muted', s.landing ? LANDING_LABEL[s.landing] : 'Waiting in the home step to be used or set aside.'));
  }
  if (s.tool === 'question-book' && s.state !== 'returned' && s.state !== 'removed') {
    const host = el('div');
    card.append(host);
    mountQuestionDetour(host, thread, s);
    if (focus) queueMicrotask(() => card.scrollIntoView?.({ block: 'start' }));
  } else if (s.tool === PROTOCOL_TOOL && (s.state === 'running' || (focus && s.state !== 'removed'))) {
    // The run itself (its conversation, running or finished) is the protocol screen's; it keeps polling on its own.
    const host = el('div', 'tt-card__panel');
    card.append(host);
    teardowns.push(mountProtocolDetour(host, { threadId: thread.id, sessionId: s.sessionId }).teardown);
    if (focus) queueMicrotask(() => card.scrollIntoView?.({ block: 'start' }));
  } else if (s.tool === PROTOCOL_TOOL && s.state === 'failed') {
    const option = retryOption(thread, s);
    if (option && s.from) {
      const retry = el('button', 'btn btn--ghost tt-btn', 'Retry') as HTMLButtonElement;
      retry.type = 'button';
      const panel = el('div');
      retry.addEventListener('click', () => {
        retry.hidden = true;
        panel.append(suggestionCard({ threadId: thread.id, sessionId: s.from!.sessionId, joint: 'asked', stepId: s.from!.stepId }, { optionId: option, reason: s.question ?? undefined }));
      });
      card.append(retry, panel);
    }
  } else if (s.tool !== 'question-book' && s.tool !== PROTOCOL_TOOL && s.state !== 'removed') {
    const open = el('a', 'tt-wait__link', 'Open') as HTMLAnchorElement;
    open.href = detourHref(thread, s);
    card.append(open);
  }
  const item = el('li', `tt-tl__item${depth ? ' tt-tl__item--detour' : ''}`);
  item.append(card);
  return item;
}

export async function renderThreadView(canvas: HTMLElement, threadId: string, detourId: string | null): Promise<() => void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let thread = await threadsApi.get(threadId);
  let alive = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let editing = false;
  let page = el('div');
  let teardowns: Array<() => void> = [];
  let drawn = '';
  /** The line under the controls; kept across a redraw so "Closed." is still there to read. */
  let note = '';

  const cards = el('div', 'tt-strip__cards');
  cards.setAttribute('aria-live', 'polite');

  function draw(): void {
    if (editing) return;
    // Redraw only when the thread changed, so a running protocol screen is not remounted by every poll.
    const signature = `${thread.revision}:${thread.updatedAt}:${thread.sessions.map((x) => x.state).join(',')}`;
    if (signature === drawn) return;
    drawn = signature;
    for (const off of teardowns) off();
    teardowns = [];
    const home = homeSession(thread);
    const next = el('div', 'tt-page tt-thread-page');
    const back = el('a', 'tt-back', '← Think it through') as HTMLAnchorElement;
    back.href = '#/think';

    const title = el('input', 'tt-title') as HTMLInputElement;
    title.value = thread.title;
    title.maxLength = 120;
    title.setAttribute('aria-label', 'Thread title');
    const saveTitle = async () => {
      editing = false;
      const value = title.value.trim();
      if (!value || value === thread.title) {
        title.value = thread.title;
        return;
      }
      try {
        thread = await threadsApi.patch(thread, { title: value });
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not rename.');
        title.value = thread.title;
      }
    };
    title.addEventListener('focus', () => { editing = true; });
    title.addEventListener('blur', () => void saveTitle());
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') title.blur();
      if (e.key === 'Escape') {
        title.value = thread.title;
        title.blur();
      }
    });

    const status = el('p', 'tt-card__status');
    status.setAttribute('role', 'status');
    status.textContent = note;
    note = '';
    const controls = el('div', 'tt-card__actions tt-thread__controls');
    const setStatus = async (patch: Parameters<typeof threadsApi.patch>[1], done: string) => {
      try {
        thread = await threadsApi.patch(thread, patch);
        note = done;
        draw();
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not save that.');
      }
    };
    const state = el('span', `tt-pill tt-pill--${thread.status}`, thread.status === 'resting' && thread.restUntil ? `Resting until ${formatDisplayDate(thread.restUntil)}` : thread.status === 'closed' ? 'Closed' : 'Open');
    if (thread.status === 'closed' || thread.status === 'resting') {
      const reopen = el('button', 'btn btn--ghost tt-btn', 'Reopen') as HTMLButtonElement;
      reopen.type = 'button';
      reopen.addEventListener('click', () => void setStatus({ status: 'open', restUntil: null }, 'Reopened.'));
      controls.append(reopen);
    }
    if (thread.status !== 'closed') {
      const close = el('button', 'btn btn--ghost tt-btn', 'Close the thread') as HTMLButtonElement;
      close.type = 'button';
      close.addEventListener('click', () => void setStatus({ status: 'closed' }, 'Closed.'));
      const date = el('input', 'tt-input tt-input--date') as HTMLInputElement;
      date.type = 'date';
      date.min = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      date.value = date.min;
      date.setAttribute('aria-label', 'Rest until');
      const rest = el('button', 'btn btn--ghost tt-btn', 'Rest until') as HTMLButtonElement;
      rest.type = 'button';
      rest.addEventListener('click', () => {
        if (!date.value || date.value < date.min) {
          status.textContent = 'Pick a day after today.';
          return;
        }
        void setStatus({ status: 'resting', restUntil: date.value }, `Resting until ${date.value}.`);
      });
      controls.append(close, date, rest);
    }

    const head = el('header', 'tt-thread__head');
    head.append(title, state);

    const situation = el('details', 'tt-situation');
    situation.append(el('summary', '', 'The situation'), el('p', 'tt-situation__text', thread.situation));

    const timeline = el('ol', 'tt-tl');
    for (const { session, depth } of orderTimeline(thread)) timeline.append(sessionCard(thread, session, depth, session.sessionId === detourId, teardowns));
    const tl = el('section', 'tt-section');
    tl.append(el('h2', 'tt-section__title', 'The route so far'), timeline);

    next.append(back, head, controls, status, cards, situation);
    const digest = digestBlock(thread);
    if (digest) next.append(digest);
    next.append(tl);
    if (!home) next.append(el('p', 'tt-muted', 'This thread has no home session yet.'));
    page.replaceWith(next);
    page = next;
  }

  canvas.replaceChildren(page);
  registerCardSlot(cards);
  draw();

  async function refresh(): Promise<void> {
    try {
      thread = await threadsApi.get(threadId);
      draw();
    } catch { /* the page keeps what it has */ }
    schedule();
  }
  function schedule(): void {
    const running = thread.sessions.some((s) => s.tool === PROTOCOL_TOOL && waitingOn(s));
    if (running && !timer) timer = setInterval(() => { if (!document.hidden && alive) void refresh(); }, POLL_MS);
    if (!running && timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  const onChanged = (event: Event) => {
    const next = (event as CustomEvent<{ thread: Thread | null }>).detail?.thread;
    if (!next || next.id !== threadId) return;
    thread = next;
    draw();
    schedule();
  };
  window.addEventListener(THREAD_CHANGED_EVENT, onChanged);
  schedule();

  // After time away, or once the rest is over: one check-in, from the home session.
  const home = homeSession(thread);
  if (home) {
    void resumeIfDue(thread, null, () => void fireJoint({ threadId, sessionId: home.sessionId, joint: 'resumed', stepId: null, stepTitle: '', latestStep: null })).then((t) => {
      if (alive && t !== thread) {
        thread = t;
        draw();
      }
    });
    // A home record already written: offer to close, rest, or go on.
    const api = home.kind === 'tool' ? sessionApiFor(home.tool) : null;
    if (api && thread.status === 'open') {
      void api.get(home.sessionId).then((session) => {
        if (alive && session.caseFile && !cards.hasChildNodes()) cards.append(endCard({ threadId, sessionId: home.sessionId, joint: 'recorded', stepId: session.phase, stepTitle: '' }, null));
      }, () => undefined);
    }
  }

  return () => {
    alive = false;
    if (timer) clearInterval(timer);
    for (const off of teardowns) off();
    teardowns = [];
    window.removeEventListener(THREAD_CHANGED_EVENT, onChanged);
    clearCard();
    registerCardSlot(null);
  };
}

