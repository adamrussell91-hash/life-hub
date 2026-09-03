import { CHAT_AGENTS, agentBySlug, type ChatAgentSlug } from '@/chat/agents';

export function renderAgentPicker(
  root: ParentNode,
  {
    selectedSlug = null,
    onSelect
  }: {
    selectedSlug?: string | null;
    onSelect?: (slug: ChatAgentSlug) => void;
  } = {}
): void {
  const hosts = [...root.querySelectorAll('#agent-picker')];
  for (const host of hosts) {
    if (!(host instanceof HTMLElement)) continue;
    if (!host.dataset.built) {
      host.dataset.built = '1';
      host.classList.add('agent-picker');
      host.setAttribute('role', 'listbox');
      host.setAttribute('aria-label', 'Choose who to talk to');
      for (const agent of CHAT_AGENTS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'agent-picker__avatar';
        button.dataset.agentSlug = agent.slug;
        button.style.setProperty('--agent-colour', agent.colour);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-label', agent.name);
        button.title = agent.name;
        const img = document.createElement('img');
        img.src = agent.avatarSrc;
        img.alt = '';
        img.width = 64;
        img.height = 64;
        img.decoding = 'async';
        button.append(img);
        button.addEventListener('click', () => onSelect?.(agent.slug));
        host.append(button);
      }
    }
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-agent-slug]')) {
      const active = button.dataset.agentSlug === selectedSlug;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    }
  }
}

export function applyAgentAvatarToBubble(bubble: HTMLElement, slug: string): void {
  const agent = agentBySlug(slug);
  bubble.dataset.agent = agent.slug;
  let img = bubble.querySelector<HTMLImageElement>('.chat-message__avatar');
  if (!img) {
    img = document.createElement('img');
    img.className = 'chat-message__avatar';
    img.alt = '';
    img.width = 32;
    img.height = 32;
    bubble.prepend(img);
  }
  img.src = agent.avatarSrc;
  img.alt = agent.name;
}

export function applyAgentAccent(root: ParentNode, slug: string): void {
  const agent = agentBySlug(slug);
  const view = root instanceof HTMLElement ? root : root.querySelector<HTMLElement>('#chat-view');
  view?.style.setProperty('--agent-accent', agent.accent);
  view?.setAttribute('data-agent', agent.slug);
}
