/** Collapse agent/protocol chrome once the thread has messages. */

export function syncChatChrome(root: ParentNode): void {
  const view = root instanceof HTMLElement && root.classList.contains('chat-view')
    ? root
    : root.querySelector<HTMLElement>('.chat-view, #chat-view');
  if (!view) return;

  const list = view.querySelector('#chat-messages');
  const engaged = Boolean(list?.childElementCount);
  if (engaged) {
    view.dataset.chrome = 'engaged';
  } else {
    delete view.dataset.chrome;
    delete view.dataset.chromeExpanded;
  }

  const tools = view.querySelector<HTMLButtonElement>('#chat-tools');
  if (tools) {
    tools.hidden = !engaged;
    const expanded = view.dataset.chromeExpanded === 'true';
    tools.setAttribute('aria-expanded', String(expanded));
    tools.textContent = 'Tools';
  }
}

export function toggleChatChrome(root: ParentNode): void {
  const view = root instanceof HTMLElement && root.classList.contains('chat-view')
    ? root
    : root.querySelector<HTMLElement>('.chat-view, #chat-view');
  if (!view || view.dataset.chrome !== 'engaged') return;
  if (view.dataset.chromeExpanded === 'true') {
    delete view.dataset.chromeExpanded;
  } else {
    view.dataset.chromeExpanded = 'true';
  }
  syncChatChrome(view);
}
