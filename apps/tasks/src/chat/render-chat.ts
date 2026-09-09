import { syncChatChrome } from '@/chat/chat-chrome';
import { applyAgentAvatarToBubble } from '@/chat/render-agent-picker';
import { createAgentChoiceCard } from '../../design-kit/js/agent-choice-card.js';
import { createAgentPlanCard } from '../../design-kit/js/agent-plan-card.js';
import {
  createProductivityCard,
  createDecisionStackCard,
  createScheduleDiffCard,
  createReviewProgressCard,
  createRunwayCard,
  createMetricAuditStripCard,
  createHierarchyTraceCard,
  createFocusBlockCard,
  createWaitingCard,
  createShutdownCard,
  createGoodFitsCard,
  createDepthBudgetCard,
  createActiveProjectsMeter,
  createStrategicReviewCard,
  createProductivityFunnelCard,
  createAttentionAuditCard,
  createPlanningStackCard
} from '../../design-kit/js/agent-productivity-cards.js';

export type ChatRole = 'user' | 'assistant' | 'status';

const UNREAD_SELECTOR = '.floating-chat-button, [data-clare-nav]';
const UNREAD_CLASS = 'has-unread';

function toggleClass(element: Element, name: string, add: boolean): void {
  if (element.classList) {
    element.classList.toggle(name, add);
    return;
  }
  const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).filter((cls) => cls !== name);
  if (add) classes.push(name);
  element.setAttribute('class', classes.join(' '));
}

export function setChatUnread(root: ParentNode, unread: boolean): void {
  const targets = root.querySelectorAll(UNREAD_SELECTOR);
  for (const target of targets) {
    toggleClass(target, UNREAD_CLASS, unread);
    if (target instanceof HTMLElement) {
      if (unread) target.dataset.unread = 'true';
      else delete target.dataset.unread;
    }
  }
}

export function appendMessage(
  root: ParentNode,
  { role, text = '', agent = 'clare' }: { role: ChatRole; text?: string; agent?: string }
): HTMLElement | null {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const item = document.createElement('li');
  item.className = `chat-message chat-message--${role}`;
  if (role !== 'user') item.dataset.agent = agent;
  if (role === 'assistant' || role === 'status') {
    applyAgentAvatarToBubble(item, agent);
  }
  const body = document.createElement('div');
  body.className = 'chat-message__body';
  if (role === 'assistant') {
    renderInlineMarkdown(body, text, { multiline: true });
  } else {
    body.textContent = text;
  }
  item.append(body);
  list.append(item);
  syncAssistantMessageTails(list);
  list.scrollTop = list.scrollHeight;
  syncChatChrome(root);
  return item;
}

/** Messenger: only the last bubble in a consecutive assistant/status run shows the avatar. */
export function syncAssistantMessageTails(list: ParentNode): void {
  const items = [...list.querySelectorAll('.chat-message')];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!(item instanceof HTMLElement)) continue;
    const incoming =
      item.classList.contains('chat-message--assistant') ||
      item.classList.contains('chat-message--status');
    if (!incoming) {
      item.classList.remove('chat-message--tail');
      continue;
    }
    const next = items[i + 1];
    const nextIncoming =
      next instanceof HTMLElement &&
      (next.classList.contains('chat-message--assistant') ||
        next.classList.contains('chat-message--status'));
    item.classList.toggle('chat-message--tail', !nextIncoming);
  }
}

export function renderInlineMarkdown(
  container: HTMLElement,
  text: string,
  { multiline = false }: { multiline?: boolean } = {}
): void {
  container.replaceChildren();
  if (!multiline) {
    appendInlineSegments(container, text);
    return;
  }

  const lines = text.split('\n');
  if (lines.length === 1) {
    appendInlineSegments(container, text);
    return;
  }

  let currentList: HTMLUListElement | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (line.startsWith('- ')) {
      if (!currentList) {
        currentList = document.createElement('ul');
        container.append(currentList);
      }
      const item = document.createElement('li');
      appendInlineSegments(item, line.slice(2));
      currentList.append(item);
    } else {
      currentList = null;
      const paragraph = document.createElement('p');
      appendInlineSegments(paragraph, line);
      container.append(paragraph);
    }
  }
}

function appendInlineSegments(container: HTMLElement, text: string): void {
  const segments = text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean);
  for (const segment of segments) {
    const isBold = segment.startsWith('**') && segment.endsWith('**') && segment.length > 4;
    const node = document.createElement(isBold ? 'strong' : 'span');
    node.textContent = isBold ? segment.slice(2, -2) : segment;
    container.append(node);
  }
}

export function setChatBusy(root: ParentNode, busy: boolean): void {
  const input = root.querySelector<HTMLTextAreaElement | HTMLInputElement>('#chat-input');
  const button = root.querySelector<HTMLButtonElement>('#chat-send');
  if (input) input.disabled = busy;
  if (button) button.disabled = busy;
}

export function showChatError(root: ParentNode, message: string): void {
  const banner = root.querySelector<HTMLElement>('#chat-error');
  if (!banner) return;
  banner.hidden = !message;
  banner.textContent = message;
}

export function setConfirmBusy(button: HTMLButtonElement, busy: boolean, idleLabel = 'Confirm'): void {
  button.disabled = busy;
  button.textContent = busy ? 'Saving…' : idleLabel;
}

export function appendSavedCard(card: HTMLElement, text = 'Saved.'): void {
  const saved = document.createElement('p');
  saved.className = 'record-proposal__saved';
  saved.textContent = text;
  card.className = 'record-proposal record-proposal--saved';
  card.removeAttribute('role');
  card.removeAttribute('aria-label');
  card.replaceChildren(saved);
}

export function appendChoiceCard(
  root: ParentNode,
  opts: {
    title?: string;
    hint?: string;
    choices: Array<{ id: string; label: string; detail?: string }>;
    multi?: boolean;
    confirmLabel?: string;
    onConfirm?: (selected: Array<{ id: string; label: string; detail?: string }>) => void;
    onDismiss?: () => void;
  }
): HTMLElement | null {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const item = document.createElement('li');
  item.className = 'chat-message chat-message--structured';
  const card = createAgentChoiceCard(document, opts);
  item.append(card);
  list.append(item);
  list.scrollTop = list.scrollHeight;
  return item;
}

export function appendPlanStatusCard(
  root: ParentNode,
  opts: { id?: string; heading?: string; steps?: string[]; current?: number }
): HTMLElement | null {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const planId = typeof opts.id === 'string' && opts.id.trim() ? opts.id.trim() : '';
  if (planId) {
    const existing = list.querySelector(`[data-plan-id="${CSS.escape?.(planId) ?? planId}"]`) as
      | (HTMLElement & { __planUpdate?: (next: typeof opts) => void })
      | null;
    if (existing?.__planUpdate) {
      existing.__planUpdate(opts);
      list.scrollTop = list.scrollHeight;
      return existing.closest('li');
    }
  }
  const item = document.createElement('li');
  item.className = 'chat-message chat-message--structured';
  const { card, update } = createAgentPlanCard(document, opts);
  (card as HTMLElement & { __planUpdate?: (next: typeof opts) => void }).__planUpdate = update;
  item.append(card);
  list.append(item);
  list.scrollTop = list.scrollHeight;
  return item;
}

function appendStructuredCard(root: ParentNode, card: HTMLElement | null): HTMLElement | null {
  const list = root.querySelector('#chat-messages');
  if (!list || !card) return null;
  const item = document.createElement('li');
  item.className = 'chat-message chat-message--structured';
  item.append(card);
  list.append(item);
  list.scrollTop = list.scrollHeight;
  return item;
}

/** Append a productivity card from a structured payload (`data-card-type`). */
export function appendProductivityCard(
  root: ParentNode,
  type: string,
  opts: Record<string, unknown> = {}
): HTMLElement | null {
  const card = createProductivityCard(document, type, opts);
  return appendStructuredCard(root, card);
}

export function appendDecisionStackCard(
  root: ParentNode,
  opts: Parameters<typeof createDecisionStackCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createDecisionStackCard(document, opts));
}

export function appendScheduleDiffCard(
  root: ParentNode,
  opts: Parameters<typeof createScheduleDiffCard>[1]
): HTMLElement | null {
  const built = createScheduleDiffCard(document, opts);
  return appendStructuredCard(root, built.card);
}

export function appendReviewProgressCard(
  root: ParentNode,
  opts: Parameters<typeof createReviewProgressCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createReviewProgressCard(document, opts));
}

export function appendRunwayCard(
  root: ParentNode,
  opts: Parameters<typeof createRunwayCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createRunwayCard(document, opts));
}

export function appendMetricAuditStripCard(
  root: ParentNode,
  opts: Parameters<typeof createMetricAuditStripCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createMetricAuditStripCard(document, opts));
}

export function appendHierarchyTraceCard(
  root: ParentNode,
  opts: Parameters<typeof createHierarchyTraceCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createHierarchyTraceCard(document, opts));
}

export function appendFocusBlockCard(
  root: ParentNode,
  opts: Parameters<typeof createFocusBlockCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createFocusBlockCard(document, opts));
}

export function appendWaitingCard(
  root: ParentNode,
  opts: Parameters<typeof createWaitingCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createWaitingCard(document, opts));
}

export function appendShutdownCard(
  root: ParentNode,
  opts: Parameters<typeof createShutdownCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createShutdownCard(document, opts));
}

export function appendGoodFitsCard(
  root: ParentNode,
  opts: Parameters<typeof createGoodFitsCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createGoodFitsCard(document, opts));
}

export function appendDepthBudgetCard(
  root: ParentNode,
  opts: Parameters<typeof createDepthBudgetCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createDepthBudgetCard(document, opts));
}

export function appendActiveProjectsMeter(
  root: ParentNode,
  opts: Parameters<typeof createActiveProjectsMeter>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createActiveProjectsMeter(document, opts));
}

export function appendStrategicReviewCard(
  root: ParentNode,
  opts: Parameters<typeof createStrategicReviewCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createStrategicReviewCard(document, opts));
}

export function appendProductivityFunnelCard(
  root: ParentNode,
  opts: Parameters<typeof createProductivityFunnelCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createProductivityFunnelCard(document, opts));
}

export function appendAttentionAuditCard(
  root: ParentNode,
  opts: Parameters<typeof createAttentionAuditCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createAttentionAuditCard(document, opts));
}

export function appendPlanningStackCard(
  root: ParentNode,
  opts: Parameters<typeof createPlanningStackCard>[1]
): HTMLElement | null {
  return appendStructuredCard(root, createPlanningStackCard(document, opts));
}

