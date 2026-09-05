/** Collapse agent/protocol chrome once the thread has messages. */

export function syncChatChrome(root) {
  const view = resolveChatView(root);
  if (!view) return;

  const list = view.querySelector?.('#chat-messages');
  const engaged = Boolean(list?.childElementCount ?? list?.children?.length);
  if (engaged) {
    if (view.dataset) view.dataset.chrome = 'engaged';
  } else if (view.dataset) {
    delete view.dataset.chrome;
    delete view.dataset.chromeExpanded;
  }

  const tools = view.querySelector?.('#chat-tools');
  if (tools) {
    tools.hidden = !engaged;
    const expanded = view.dataset?.chromeExpanded === 'true';
    tools.setAttribute?.('aria-expanded', String(expanded));
    tools.textContent = 'Tools';
  }

  syncChatEmpty(view);
}

export function toggleChatChrome(root) {
  const view = resolveChatView(root);
  if (!view || view.dataset?.chrome !== 'engaged') return;
  if (view.dataset.chromeExpanded === 'true') delete view.dataset.chromeExpanded;
  else view.dataset.chromeExpanded = 'true';
  syncChatChrome(view);
}

export function syncChatEmpty(root) {
  const view = resolveChatView(root);
  if (!view) return;
  const list = view.querySelector?.('#chat-messages');
  const empty = view.querySelector?.('#chat-empty');
  if (!empty) return;
  const has = Boolean(list?.childElementCount ?? list?.children?.length);
  empty.hidden = has;
}

function resolveChatView(root) {
  if (!root) return null;
  if (root.classList?.contains?.('chat-view') || root.id === 'chat-view') return root;
  return root.querySelector?.('.chat-view, #chat-view') ?? null;
}
