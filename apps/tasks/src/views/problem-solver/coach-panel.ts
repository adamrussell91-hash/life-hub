// apps/tasks/src/views/problem-solver/coach-panel.ts
import { el } from '@/views/hub-kit';
import { skillChip } from '../../../../../packages/problem-solver/glyphs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import type { PsAction, PsSession } from '../../../../../packages/problem-solver/types';

export type CoachPanelHandlers = { onSay: (text: string) => void; onAction: (action: PsAction) => void };

function actionButton(label: string, action: PsAction, handlers: CoachPanelHandlers, kind = 'btn--ghost'): HTMLButtonElement {
  const button = el('button', `btn ${kind}`, label) as HTMLButtonElement;
  button.type = 'button';
  button.dataset.action = action;
  button.addEventListener('click', () => handlers.onAction(action));
  return button;
}

function message(turn: PsSession['turns'][number]): HTMLLIElement {
  const item = el('li', `chat-message chat-message--${turn.role === 'user' ? 'user' : 'assistant'}`) as HTMLLIElement;
  const body = el('div', 'chat-message__body', turn.text);
  item.append(body);
  const chips = [...(turn.skillsSeen ?? []).map((id) => skillChip(id)), ...(turn.skillsMissing ?? []).map((id) => skillChip(id, { missing: true }))];
  if (chips.length) {
    const row = el('div', 'ps-coach__skills');
    row.append(...chips);
    item.append(row);
  }
  return item;
}

function suggestionCard(session: PsSession, handlers: CoachPanelHandlers): HTMLElement | null {
  const suggestion = session.suggestion;
  if (!suggestion) return null;
  const card = el('div', 'ps-suggestion confirm-card');
  const title = suggestion.kind === 'finish_define' ? 'Ready to move on' : `${suggestion.kind === 'switch_tool' ? 'Switch to' : 'Next'}: ${TOOLS[suggestion.tool].name}`;
  card.append(el('p', 'ps-suggestion__title', title), el('p', 'ps-suggestion__reason', suggestion.reason));
  const row = el('div', 'ps-suggestion__actions');
  row.append(actionButton(suggestion.kind === 'finish_define' ? 'Move on' : 'Start it', 'accept_suggestion', handlers, 'btn--primary'), actionButton('Not now', 'dismiss_suggestion', handlers));
  card.append(row);
  return card;
}

export function renderCoachPanel(session: PsSession, handlers: CoachPanelHandlers): HTMLElement {
  const panel = el('section', 'ps-coach');
  panel.setAttribute('aria-label', 'Coach');
  const list = el('ul', 'chat-messages ps-coach__messages');
  list.setAttribute('aria-live', 'polite');
  list.append(...session.turns.map(message));
  panel.append(list);

  const busy = session.runner.status === 'queued' || session.runner.status === 'running';
  if (busy) panel.append(el('p', 'ps-coach__status', 'Coach is thinking…'));
  if (session.runner.status === 'failed') {
    const failed = el('div', 'ps-coach__status ps-coach__status--failed');
    failed.append(el('span', '', session.runner.error ?? 'The coach could not answer.'), actionButton('Try again', 'retry', handlers));
    panel.append(failed);
  }

  const card = suggestionCard(session, handlers);
  if (card) panel.append(card);

  const actions = el('div', 'ps-coach__actions');
  if (session.pendingKeep && !busy) actions.append(actionButton('Keep it anyway', 'keep_anyway', handlers));
  if (session.phase === 'define' && !busy) actions.append(actionButton("I've defined it", 'finish_define', handlers));
  if (actions.childElementCount) panel.append(actions);

  const form = el('form', 'chat-form hub-ai-bar hub-ai-bar--thread') as HTMLFormElement;
  const field = el('div', 'hub-ai-bar__field');
  const input = el('textarea', 'chat-input hub-ai-bar__input') as HTMLTextAreaElement;
  input.rows = 2;
  input.placeholder = session.phase === 'defined' ? 'Add a note for next time…' : 'Your answer…';
  input.setAttribute('aria-label', 'Your answer');
  input.disabled = busy;
  field.append(input);
  const send = el('button', 'btn btn--primary', 'Send') as HTMLButtonElement;
  send.type = 'submit';
  send.disabled = busy;
  const tools = el('div', 'chat-form__tools hub-ai-bar__tools');
  tools.append(send);
  const aside = el('div', 'hub-ai-bar__aside');
  aside.append(tools);
  form.append(field, aside);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (text) handlers.onSay(text);
  });
  panel.append(form);
  return panel;
}
