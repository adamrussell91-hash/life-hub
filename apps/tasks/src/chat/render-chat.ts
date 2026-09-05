import { syncChatChrome } from '@/chat/chat-chrome';
import { applyAgentAvatarToBubble } from '@/chat/render-agent-picker';
import { createAgentChoiceCard } from '../../design-kit/js/agent-choice-card.js';
import { createAgentPlanCard } from '../../design-kit/js/agent-plan-card.js';

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
  if (role === 'assistant') {
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
  list.scrollTop = list.scrollHeight;
  syncChatChrome(root);
  return item;
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

