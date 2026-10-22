// apps/tasks/src/views/problem-solver/coach-panel.ts
import { el } from '@/views/hub-kit';
import { skillChip, toolEmblem } from '../../../../../packages/problem-solver/glyphs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { acceptProblem } from '../../../../../packages/problem-solver/machine.mjs';
import { nextPhase, planStepForBook, stepName } from '../../../../../packages/problem-solver/steps.mjs';
import type { PsAction, PsSession } from '../../../../../packages/problem-solver/types';
import { coachAvatar, thinkingDots } from './decor';

export type CoachPanelHandlers = { onSay: (text: string) => void; onAction: (action: PsAction) => void };

/**
 * How the panel looks in a tool: its coach avatar, the emblem beside a suggested tool, the
 * framing questions per session kind and the word for the session. Problem Solver's is the
 * default; Decision Maker passes its own (decision-book/decor.ts).
 */
export type CoachLook = {
  avatar(): Element;
  emblem(tool: string): Element;
  frames: Record<string, { keys: string[]; prompts: string[] }>;
  noun: string;
  /** The card that offers a quick route's way on to a full session. */
  escalate?: { title: string; accept: string };
};

const PS_LOOK: CoachLook = {
  avatar: coachAvatar,
  emblem: (tool) => toolEmblem(tool as never),
  frames: { full: { keys: ['goal', 'whatIsTrue', 'whatCanBeDone'], prompts: ['What is the goal?', 'What is true?', 'What can be done?'] } },
  noun: 'Problem'
};
export type CoachPanel = { el: HTMLElement; update(session: PsSession): void };

function actionButton(label: string, action: PsAction, handlers: CoachPanelHandlers, kind = 'btn--ghost'): HTMLButtonElement {
  const button = el('button', `btn ${kind}`, label) as HTMLButtonElement;
  button.type = 'button';
  button.dataset.action = action;
  button.addEventListener('click', () => handlers.onAction(action));
  return button;
}

/**
 * True when the active run's tool would refuse the pending keep (a 5 Cs name that breaks a
 * strict naming rule), so Keep it anyway would only meet a 409.
 */
function keepRefused(session: PsSession): boolean {
  const keep = session.pendingKeep;
  const run = session.steps?.[session.phase]?.runs.find((item) => item.status === 'active');
  return Boolean(keep && run && acceptProblem(run, keep));
}

function message(turn: PsSession['turns'][number], fresh: boolean, look: CoachLook): HTMLLIElement {
  const coach = turn.role !== 'user';
  const item = el('li', `chat-message chat-message--${coach ? 'assistant' : 'user'} ps-msg${fresh ? ' is-new' : ''}`) as HTMLLIElement;
  item.dataset.turn = turn.id;
  if (coach) item.append(look.avatar());
  item.append(el('div', 'chat-message__body', turn.text));
  const chips = [...(turn.skillsSeen ?? []).map((id) => skillChip(id)), ...(turn.skillsMissing ?? []).map((id) => skillChip(id, { missing: true }))];
  if (chips.length) {
    const row = el('div', 'ps-coach__skills');
    chips.forEach((chip, i) => chip.style.setProperty('--i', String(i)));
    row.append(...chips);
    item.append(row);
  }
  return item;
}

function thinkingBubble(look: CoachLook): HTMLLIElement {
  const item = el('li', 'chat-message chat-message--assistant ps-msg ps-msg--thinking is-new') as HTMLLIElement;
  const body = el('div', 'chat-message__body ps-thinking');
  body.append(thinkingDots(), el('span', '', 'Coach is thinking…'));
  item.append(look.avatar(), body);
  return item;
}

function suggestionCard(session: PsSession, handlers: CoachPanelHandlers, look: CoachLook): HTMLElement | null {
  const suggestion = session.suggestion;
  if (!suggestion) return null;
  const card = el('div', 'ps-suggestion confirm-card');
  const model = session.model?.id;
  let title: string;
  let accept = 'Start it';
  // Escalating is its own action (accept_suggestion refuses it): it makes the full session.
  let acceptAction: PsAction = 'accept_suggestion';
  if (suggestion.kind === 'next_step') {
    const nextName = model ? nextPhase(session) : null;
    title = nextName ? `Next step: ${stepName(model!, nextName)}` : 'Ready to finish';
    accept = 'Move on';
  } else if (suggestion.kind === 'reopen_step') {
    const target = model ? planStepForBook(model, suggestion.step) : null;
    title = `Reopen: ${model && target ? stepName(model, target) : suggestion.step}`;
    accept = 'Reopen it';
  } else if (suggestion.kind === 'escalate') {
    title = look.escalate?.title ?? 'This needs the full process';
    accept = look.escalate?.accept ?? 'Start the full process';
    acceptAction = 'escalate';
  } else {
    title = `${suggestion.kind === 'switch_tool' ? 'Switch to' : 'Next'}: ${TOOLS[suggestion.tool].name}`;
  }
  const heading = el('p', 'ps-suggestion__title', title);
  if (suggestion.kind === 'next_tool' || suggestion.kind === 'switch_tool') heading.prepend(look.emblem(suggestion.tool));
  card.append(heading, el('p', 'ps-suggestion__reason', suggestion.reason));
  const row = el('div', 'ps-suggestion__actions');
  row.append(actionButton(accept, acceptAction, handlers, 'btn--primary'), actionButton('Not now', 'dismiss_suggestion', handlers));
  card.append(row);
  return card;
}

/**
 * The coach thread. It keeps its DOM between updates: new turns are appended, the thinking
 * bubble is swapped in place for the reply, and the composer keeps what you typed, so the
 * page does not jump while the coach is polled. `slots.cards` (the task confirm cards) sits
 * between the extras and the composer and keeps its own DOM when the extras are replaced.
 */
export function mountCoachPanel(handlers: CoachPanelHandlers, slots: { cards?: HTMLElement; look?: CoachLook } = {}): CoachPanel {
  const look = slots.look ?? PS_LOOK;
  const panel = el('section', 'ps-coach');
  panel.setAttribute('aria-label', 'Coach');
  const list = el('ul', 'chat-messages ps-coach__messages');
  list.setAttribute('aria-live', 'polite');
  const extras = el('div', 'ps-coach__extras');

  const form = el('form', 'chat-form hub-ai-bar hub-ai-bar--thread ps-composer') as HTMLFormElement;
  const now = el('p', 'ps-composer__now');
  const field = el('div', 'hub-ai-bar__field');
  const input = el('textarea', 'chat-input hub-ai-bar__input') as HTMLTextAreaElement;
  input.rows = 2;
  input.setAttribute('aria-label', 'Your answer');
  field.append(input);
  const send = el('button', 'btn btn--primary', 'Send') as HTMLButtonElement;
  send.type = 'submit';
  const tools = el('div', 'chat-form__tools hub-ai-bar__tools');
  tools.append(send);
  const aside = el('div', 'hub-ai-bar__aside');
  aside.append(tools);
  form.append(now, field, aside);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    handlers.onSay(text);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) form.requestSubmit();
  });
  panel.append(list, extras, form);
  if (slots.cards) panel.insertBefore(slots.cards, form);

  const shown = new Set<string>();
  let thinking: HTMLLIElement | null = null;
  let first = true;

  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 48;

  return {
    el: panel,
    update(session) {
      const stick = first || nearBottom();
      const busy = session.runner.status === 'queued' || session.runner.status === 'running';
      // A failed boundary turn must be retried before anything else: the step has already moved.
      const boundaryFailed = session.runner.status === 'failed' && session.runner.mode === 'boundary';
      // A Lightning run or a quick decision: a fixed flow with no frame and no steps.
      const lightning = session.kind === 'lightning' || session.kind === 'quick';
      // A finished Lightning run takes no more replies until It came back starts a new round.
      const closed = lightning && session.status !== 'active';
      const locked = busy || boundaryFailed || closed;

      for (const turn of session.turns) {
        if (shown.has(turn.id)) continue;
        shown.add(turn.id);
        // Clear the composer once the answer is in the thread, so a failed send keeps the text.
        if (!first && turn.role === 'user' && input.value.trim() === turn.text.trim()) input.value = '';
        const node = message(turn, !first, look);
        if (thinking && turn.role !== 'user') {
          thinking.replaceWith(node);
          thinking = null;
        } else if (thinking) {
          list.insertBefore(node, thinking);
        } else {
          list.append(node);
        }
      }
      if (busy && !thinking) {
        thinking = thinkingBubble(look);
        list.append(thinking);
      } else if (!busy && thinking) {
        thinking.remove();
        thinking = null;
      }

      const parts: HTMLElement[] = [];
      if (session.runner.status === 'failed') {
        const failed = el('div', 'ps-coach__status ps-coach__status--failed');
        failed.append(el('span', '', session.runner.error ?? 'The coach could not answer.'), actionButton('Try again', 'retry', handlers));
        parts.push(failed);
      }
      const card = boundaryFailed ? null : suggestionCard(session, handlers, look);
      if (card) parts.push(card);
      const actions = el('div', 'ps-coach__actions');
      if (session.pendingKeep && !locked) {
        if (keepRefused(session)) parts.push(el('p', 'ps-coach__status ps-coach__status--keep', "This name breaks a naming rule, so it can't be kept as it is."));
        else actions.append(actionButton('Keep it anyway', 'keep_anyway', handlers));
      }
      // A Lightning run has no steps: no Move on and no step label.
      const inStep = !lightning && Boolean(session.model && session.steps?.[session.phase]);
      if (inStep && !locked) {
        const after = nextPhase(session);
        actions.append(actionButton(after ? `Move on to ${stepName(session.model!.id, after)}` : 'Finish', 'move_on', handlers));
      }
      if (actions.childElementCount) parts.push(actions);
      const sig = parts.map((part) => part.textContent).join('|');
      if (extras.dataset.sig !== sig) {
        extras.dataset.sig = sig;
        extras.replaceChildren(...parts);
      }

      const frame = look.frames[session.kind] ?? look.frames.full ?? PS_LOOK.frames.full;
      const question = !lightning && session.phase === 'frame' ? frame.keys.findIndex((key) => !session.frame[key as keyof PsSession['frame']]) : -1;
      const stepLabel = inStep ? `Step: ${stepName(session.model!.id, session.phase)}` : '';
      now.textContent = lightning ? '' : question >= 0 ? `Answering: ${frame.prompts[question]}` : session.phase === 'finished' ? `${look.noun} finished` : stepLabel;
      now.dataset.q = String(question);
      input.placeholder = closed ? 'This run is done.' : !lightning && session.phase === 'finished' ? 'Add a note for next time…' : 'Your answer…';
      input.disabled = locked;
      send.disabled = locked;

      if (stick) list.scrollTop = list.scrollHeight;
      first = false;
    }
  };
}

/** One-shot render, for callers that only need a snapshot. */
export function renderCoachPanel(session: PsSession, handlers: CoachPanelHandlers): HTMLElement {
  const panel = mountCoachPanel(handlers);
  panel.update(session);
  return panel.el;
}
