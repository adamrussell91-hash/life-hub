// apps/tasks/src/views/thinking/thread-strip.ts
// The thin bar at the top of a tool session that belongs to a thread: the thread's title, the
// check-in tick, Where next?, Back to thread and a Detour to… menu. The full bar shows once the
// thread has more than one session; before that, a quiet row keeps Where next? and Detour to…
// within reach (otherwise the first detour could never be started by hand).
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { CHECKED_EVENT, fireJoint, registerCardSlot, startDetour, suggestionCard, type JointContext } from './checkin-card';
import { detourChoices, isProtocolOption, optionLabel, option, toolName, type MapOption } from './map';
import { declinedAt, homeSession } from './thread-logic';
import { detourHref } from './landing-block';
import type { LatestStep, Thread } from './types';

export type StepInfo = { stepId: string | null; stepTitle: string; latestStep: LatestStep | null };

export type ThreadStrip = {
  update(thread: Thread): void;
  destroy(): void;
};

type StripOptions = {
  threadId: string;
  sessionId: string;
  /** The step the person is on now. */
  getStep: () => StepInfo;
};

const isListedThread = (t: Thread): boolean => t.sessions.length > 1 || t.sessions.some((s) => s.role === 'detour');

export function mountThreadStrip(host: HTMLElement, { threadId, sessionId, getStep }: StripOptions): ThreadStrip {
  host.classList.add('tt-strip');
  let thread: Thread | null = null;

  const bar = el('div', 'tt-strip__bar');
  const title = el('span', 'tt-strip__title');
  const tick = el('span', 'tt-strip__tick', '✓');
  tick.hidden = true;
  tick.title = 'Checked';
  tick.setAttribute('role', 'img');
  tick.setAttribute('aria-label', 'Checked just now');
  const where = el('button', 'btn btn--ghost tt-btn tt-strip__where', 'Where next?') as HTMLButtonElement;
  where.type = 'button';
  const back = el('a', 'tt-strip__back', 'Back to thread') as HTMLAnchorElement;
  back.href = `#/think/${encodeURIComponent(threadId)}`;
  const backHome = el('a', 'tt-strip__back', '') as HTMLAnchorElement;
  backHome.hidden = true;
  const menuBox = el('details', 'tt-strip__menu');
  menuBox.append(el('summary', 'btn btn--ghost tt-btn', 'Detour to…'));
  const menuBody = el('div', 'tt-strip__menubody');
  menuBox.append(menuBody);
  const cards = el('div', 'tt-strip__cards');
  cards.setAttribute('aria-live', 'polite');
  bar.append(title, tick, where, menuBox, backHome, back);
  host.append(bar, cards);
  registerCardSlot(cards);

  const context = (joint: JointContext['joint']): JointContext => {
    const step = getStep();
    return { threadId, sessionId, joint, stepId: step.stepId, stepTitle: step.stepTitle, latestStep: step.latestStep };
  };

  where.addEventListener('click', async () => {
    where.disabled = true;
    try {
      await fireJoint({ ...context('asked'), explicit: true, detourTool: thread?.sessions.find((s) => s.sessionId === sessionId)?.tool });
    } finally {
      where.disabled = false;
    }
  });

  const onChecked = (event: Event) => {
    const detail = (event as CustomEvent<{ threadId: string; verdict: unknown }>).detail;
    if (detail?.threadId !== threadId) return;
    tick.hidden = !detail.verdict;
  };
  window.addEventListener(CHECKED_EVENT, onChecked);

  /** The menu's options: the map's shortlist for this thread and step, with no AI call. */
  function choices(t: Thread): MapOption[] {
    const entry = t.sessions.find((s) => s.sessionId === sessionId);
    const step = getStep();
    const text = `${t.situation} ${step.stepTitle} ${step.latestStep?.text ?? ''} ${t.digest.openQuestions.join(' ')}`;
    const tools = new Set(t.sessions.filter((s) => s.kind === 'tool').map((s) => s.tool));
    const all = detourChoices({ text, fromOptionId: entry && entry.kind === 'tool' ? `tool:${entry.tool}` : null, exclude: [], limit: 24 });
    return all.filter((o) => o.kind === 'protocol' || !tools.has(o.tool)).filter((o) => !declinedAt(t, o.id, step.stepId)).slice(0, 8);
  }

  function renderMenu(t: Thread): void {
    menuBody.replaceChildren();
    const list = el('ul', 'tt-strip__options');
    for (const o of choices(t)) {
      const item = el('li');
      const pick = el('button', 'tt-strip__option') as HTMLButtonElement;
      pick.type = 'button';
      pick.append(el('span', 'tt-strip__option-name', optionLabel(o.id)), el('span', 'tt-strip__option-when', o.when));
      pick.addEventListener('click', () => askQuestion(o));
      item.append(pick);
      list.append(item);
    }
    menuBody.append(list);
  }

  /** Before a detour starts, say in a line what it is to answer. */
  function askQuestion(o: MapOption): void {
    const step = getStep();
    const form = el('form', 'tt-strip__ask') as HTMLFormElement;
    const label = el('label', 'tt-strip__ask-label', `What should ${optionLabel(o.id)} answer?`);
    const input = el('textarea', 'tt-input') as HTMLTextAreaElement;
    input.rows = 2;
    input.maxLength = 400;
    input.value = step.stepTitle ? `Help with ${step.stepTitle.toLowerCase()}` : '';
    label.append(input);
    const status = el('p', 'tt-card__status');
    status.setAttribute('role', 'status');
    const go = el('button', 'btn btn--primary tt-btn', isProtocolOption(o.id) ? 'See the draft' : 'Start detour') as HTMLButtonElement;
    const cancel = el('button', 'btn btn--ghost tt-btn', 'Cancel') as HTMLButtonElement;
    cancel.type = 'button';
    cancel.addEventListener('click', () => renderMenu(thread!));
    const row = el('div', 'tt-card__actions');
    row.append(go, cancel);
    form.append(el('p', 'tt-strip__ask-name', toolName(o.tool)), label, status, row);
    menuBody.replaceChildren(form);
    input.focus();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const question = input.value.trim() || `Help with ${step.stepTitle || 'this step'}`;
      if (isProtocolOption(o.id)) {
        menuBox.open = false;
        cards.replaceChildren(suggestionCard(context('asked'), { optionId: o.id, reason: question }));
        return;
      }
      go.disabled = true;
      try {
        await startDetour(context('asked'), o.id, question);
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not start the detour.');
        go.disabled = false;
      }
    });
  }

  menuBox.addEventListener('toggle', () => {
    if (menuBox.open && thread) renderMenu(thread);
  });

  return {
    update(next) {
      thread = next;
      const listed = isListedThread(next);
      const entry = next.sessions.find((s) => s.sessionId === sessionId);
      host.classList.toggle('tt-strip--quiet', !listed);
      title.hidden = !listed;
      back.hidden = !listed;
      title.textContent = next.title;
      title.title = next.title;
      // One level only: a detour cannot start its own detour.
      menuBox.hidden = entry?.role === 'detour';
      const home = homeSession(next);
      backHome.hidden = !(entry?.role === 'detour' && home);
      if (entry?.role === 'detour' && home) {
        backHome.href = detourHref(next, home);
        backHome.textContent = `Back to ${toolName(home.tool)}`;
      }
      if (entry?.role === 'detour') {
        const from = option(`tool:${next.sessions.find((s) => s.sessionId === entry.from?.sessionId)?.tool ?? ''}`);
        if (from) title.textContent = `${next.title} · detour from ${from.title}`;
      }
    },
    destroy() {
      window.removeEventListener(CHECKED_EVENT, onChecked);
      registerCardSlot(null);
      host.replaceChildren();
    }
  };
}
