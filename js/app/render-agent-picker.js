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
        button.className = 'agent-picker__avatar';
        button.dataset.agentSlug = agent.slug;
        button.setAttribute?.('role', 'option');
        button.setAttribute?.('aria-label', agent.name);
        button.title = agent.name;
        const img = root.createElement('img');
        img.src = agent.src;
        img.alt = '';
        img.width = 64;
        img.height = 64;
        img.decoding = 'async';
        button.append(img);
        button.addEventListener('click', () => onSelect?.(agent.slug));
        host.append(button);
      }
    }
    for (const button of host.querySelectorAll?.('[data-agent-slug]') ?? []) {
      const active = button.dataset.agentSlug === selectedSlug;
      button.classList?.toggle?.('is-active', active);
      if (!button.classList?.toggle) {
        button.className = active
          ? 'agent-picker__avatar is-active'
          : 'agent-picker__avatar';
      }
      button.setAttribute?.('aria-selected', active ? 'true' : 'false');
    }
  }
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

export { AGENT_AVATARS, avatarForSlug };
