import type { ChatProtocol } from '@/chat/agents';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function protocolButton(
  protocol: ChatProtocol,
  onPick: (id: string) => void
): HTMLButtonElement {
  const button = el('button', 'hub-pills__btn');
  button.type = 'button';
  button.dataset.protocolId = protocol.id;
  button.setAttribute('aria-pressed', 'false');
  const tipId = `chat-protocol-tip-${protocol.id}`;
  button.setAttribute('aria-describedby', tipId);
  const tip = el('span', 'agent-protocol-pills__tip', protocol.explain);
  tip.id = tipId;
  tip.setAttribute('role', 'tooltip');
  button.append(el('span', 'agent-protocol-pills__label', protocol.label), tip);
  button.addEventListener('click', () => onPick(protocol.id));
  return button;
}

function protocolTray(
  host: HTMLElement,
  title: string,
  label: string,
  protocols: readonly ChatProtocol[],
  onPick: (id: string) => void
): void {
  host.replaceChildren();
  host.className = 'clare-protocols agent-protocol-pills';
  host.hidden = protocols.length === 0;
  if (!protocols.length) return;
  host.append(el('p', 'page-header__eyebrow', title));
  const tray = el('div', 'hub-pills');
  tray.setAttribute('role', 'group');
  tray.setAttribute('aria-label', label);
  for (const protocol of protocols) {
    tray.append(protocolButton(protocol, onPick));
  }
  host.append(tray);
}

export function paintProtocolTrays(
  root: ParentNode,
  {
    canEyebrow,
    canLabel,
    protocols,
    stuckEyebrow,
    stuckLabel,
    stuckProtocols,
    onPick
  }: {
    canEyebrow: string;
    canLabel: string;
    protocols: readonly ChatProtocol[];
    stuckEyebrow?: string;
    stuckLabel?: string;
    stuckProtocols?: readonly ChatProtocol[];
    onPick: (id: string) => void;
  }
): void {
  const can = root.querySelector<HTMLElement>('#chat-protocols');
  const stuck = root.querySelector<HTMLElement>('#chat-stuck-protocols');
  if (can) protocolTray(can, canEyebrow, canLabel, protocols, onPick);
  if (stuck) {
    protocolTray(stuck, stuckEyebrow ?? 'When stuck', stuckLabel ?? 'Stuck tools', stuckProtocols ?? [], onPick);
  }
}

export function buildChatView(): HTMLElement {
  const view = el('section', 'chat-view');
  view.id = 'chat-view';
  view.setAttribute('aria-label', 'Chat');
  view.hidden = true;
  view.dataset.agent = 'clare';
  view.style.setProperty('--agent-accent', 'var(--wave)');

  const heading = el('div', 'section-heading chat-view__toolbar');
  const skip = el('label', 'clare-prefs__skip');
  const skipInput = document.createElement('input');
  skipInput.type = 'checkbox';
  skipInput.id = 'chat-skip-reasoning';
  skip.append(skipInput, document.createTextNode(' Skip reasoning'));
  const neu = el('button', 'btn btn--ghost chat-new-button', 'New chat');
  neu.type = 'button';
  neu.id = 'chat-new';
  const toolsBtn = el('button', 'btn btn--ghost chat-tools-button', 'Tools');
  toolsBtn.type = 'button';
  toolsBtn.id = 'chat-tools';
  toolsBtn.hidden = true;
  toolsBtn.setAttribute('aria-expanded', 'false');
  toolsBtn.setAttribute('aria-controls', 'chat-protocol-trays');
  toolsBtn.setAttribute('aria-label', 'Show or hide agent tools');
  const close = el('button', 'btn btn--ghost chat-close-button', 'Close');
  close.type = 'button';
  close.id = 'chat-close';
  close.setAttribute('aria-label', 'Close chat');
  heading.append(skip, neu, toolsBtn, close);
  view.append(heading);

  const picker = el('div', 'agent-picker');
  picker.id = 'agent-picker';
  picker.setAttribute('aria-label', 'Choose who to talk to');
  const hide = el('div', 'hub-scroll-hide');
  hide.setAttribute('data-hub-scroll-hide', '');
  hide.setAttribute('data-hub-scroll-scroller', '#chat-messages');
  const hideInner = el('div', 'hub-scroll-hide__inner');
  hideInner.append(picker);
  hide.append(hideInner);
  view.append(hide);

  const trays = el('div', 'chat-protocols');
  trays.id = 'chat-protocol-trays';
  const protocols = el('section');
  protocols.id = 'chat-protocols';
  const stuck = el('section');
  stuck.id = 'chat-stuck-protocols';
  trays.append(protocols, stuck);
  view.append(trays);

  const error = el('p', 'chat-error');
  error.id = 'chat-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  view.append(error);

  const messages = el('ul', 'chat-messages');
  messages.id = 'chat-messages';
  messages.setAttribute('aria-live', 'polite');
  view.append(messages);

  const form = el('form', 'chat-form');
  form.id = 'chat-form';
  const label = el('label', 'sr-only', 'Message');
  label.htmlFor = 'chat-input';
  const input = el('textarea', 'chat-input') as HTMLTextAreaElement;
  input.id = 'chat-input';
  input.name = 'message';
  input.required = true;
  input.rows = 2;
  input.placeholder = 'Dump the chaos. One thing, or twelve.';
  input.setAttribute('aria-label', 'Message');
  const send = el('button', 'btn btn--primary', 'Send');
  send.id = 'chat-send';
  send.type = 'submit';
  const tools = el('div', 'chat-form__tools');
  tools.append(send);
  form.append(label, input, tools);
  view.append(form);

  return view;
}

export function buildChatHome(): HTMLElement {
  const home = el('div');
  home.id = 'chat-view-home';
  return home;
}

export function buildFloatingChatButton(): HTMLButtonElement {
  const button = el('button', 'floating-chat-button', '💬');
  button.type = 'button';
  button.id = 'clare-chat-button';
  button.setAttribute('aria-label', 'Open chat');
  return button;
}
