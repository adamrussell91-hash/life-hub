import { AGENT_AVATARS, avatarForSlug } from './agent-avatars.js';

export function renderAgentPicker(root, {
  selectedSlug = null,
  onSelect,
  hostSelector = '#agent-picker'
} = {}) {
  const hosts = typeof root.querySelectorAll === 'function'
    ? [...(root.querySelectorAll(hostSelector) ?? [])]
    : [];
  for (const host of hosts) {
    if (!host.dataset.built) {
      host.dataset.built = '1';
      host.className = `${host.className ?? ''} agent-picker`.trim();
      host.setAttribute?.('role', 'listbox');
      host.setAttribute?.('aria-label', 'Choose who to talk to');
      for (const agent of AGENT_AVATARS) {
        const button = root.createElement('button');
        button.type = 'button';
        button.className = 'agent-picker__avatar hub-ai-agent__btn';
        button.dataset.agentSlug = agent.slug;
        if (agent.colour) button.style?.setProperty?.('--agent-colour', agent.colour);
        button.setAttribute?.('role', 'option');
        button.setAttribute?.('aria-label', agent.name);
        button.title = agent.name;
        const img = root.createElement('img');
        img.src = agent.src;
        img.alt = '';
        img.width = 64;
        img.height = 64;
        img.decoding = 'async';
        const name = root.createElement('span');
        name.className = 'agent-picker__name';
        name.textContent = agent.shortName;
        button.append(img, name);
        button.addEventListener('click', () => onSelect?.(agent.slug));
        host.append(button);
      }
    }
    for (const button of host.querySelectorAll?.('[data-agent-slug]') ?? []) {
      const active = button.dataset.agentSlug === selectedSlug;
      button.classList?.toggle?.('is-active', active);
      if (!button.classList?.toggle) {
        button.className = active
          ? 'agent-picker__avatar hub-ai-agent__btn is-active'
          : 'agent-picker__avatar hub-ai-agent__btn';
      }
      button.setAttribute?.('aria-selected', active ? 'true' : 'false');
    }
  }
  renderChatWho(root, selectedSlug);
  syncChatComposerHint(root, selectedSlug);
}

export function renderChatWho(root, slug) {
  const who = root.querySelector?.('#chat-who');
  if (!who) return;
  const agent = avatarForSlug(slug);
  if (!agent) {
    who.hidden = true;
    return;
  }
  who.hidden = false;
  const img = who.querySelector?.('.chat-view__who-avatar');
  const name = who.querySelector?.('.chat-view__who-name');
  if (img) {
    img.src = agent.src;
    img.alt = agent.name;
  }
  if (name) name.textContent = agent.shortName || agent.name;
}

export function syncChatComposerHint(root, slug) {
  const input = root.querySelector?.('#chat-input');
  if (!input) return;
  const agent = avatarForSlug(slug);
  input.placeholder = agent?.shortName ? `Message ${agent.shortName}…` : 'Message…';
}

export function renderChatEmpty(root, slug) {
  const empty = root.querySelector?.('#chat-empty');
  if (!empty) return;
  const agent = avatarForSlug(slug);
  const purpose = root.createElement('p');
  purpose.className = 'chat-empty__purpose';
  if (!agent) {
    purpose.textContent = 'Tap a personality to start.';
    empty.replaceChildren?.(purpose);
    return;
  }
  purpose.textContent = agent.purpose || '';
  empty.replaceChildren?.(purpose);
}

export function applyAgentAvatarToBubble(bubble, slug) {
  if (!bubble || !slug) return;
  const agent = avatarForSlug(slug);
  if (!agent) return;
  bubble.dataset.agent = slug;
  let img = typeof bubble.querySelector === 'function'
    ? bubble.querySelector('.chat-message__avatar')
    : null;
  if (!img) {
    const doc = bubble.ownerDocument ?? globalThis.document;
    img = doc?.createElement?.('img');
    if (!img) return;
    img.className = 'chat-message__avatar';
    img.alt = '';
    img.width = 52;
    img.height = 52;
    if (typeof bubble.insertBefore === 'function' && bubble.firstChild) {
      bubble.insertBefore(img, bubble.firstChild);
    } else if (typeof bubble.prepend === 'function') {
      bubble.prepend(img);
    } else if (typeof bubble.append === 'function') {
      bubble.append(img);
    }
  }
  img.src = agent.src;
  img.alt = agent.name;
}

export function renderAgentHero(root, slug, {
  hostSelector = '#chat-agent-hero'
} = {}) {
  // Full-body personality portraits are disabled for now (picker + bubble avatars only).
  const host = root.querySelector?.(hostSelector);
  if (!host) return;
  host.setAttribute?.('hidden', '');
  host.replaceChildren?.();
  host.classList?.remove?.('is-collapsed');
  if (!host.classList?.remove && typeof host.className === 'string') {
    host.className = host.className.split(/\s+/).filter(c => c && c !== 'is-collapsed').join(' ');
  }
  void slug;
}

export { AGENT_AVATARS, avatarForSlug };
