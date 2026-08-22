import { protocolsForSlug } from './agent-protocols.js';

export function renderProtocolPills(root, {
  slug = null,
  selectedId = null,
  onSelect,
  hostSelector = '#agent-protocol-pills'
} = {}) {
  const host = root.querySelector?.(hostSelector);
  if (!host) return;
  const pack = protocolsForSlug(slug);
  if (!pack) {
    hideHost(host);
    host.replaceChildren?.();
    return;
  }

  showHost(host);
  host.className = `${(host.className ?? '').split(/\s+/).filter(token => token && token !== 'agent-protocol-pills').join(' ')} agent-protocol-pills`.trim();

  const eyebrow = root.createElement('p');
  eyebrow.className = 'agent-protocol-pills__eyebrow section-kicker';
  eyebrow.textContent = pack.eyebrow;

  const row = root.createElement('div');
  row.className = 'hub-pills';
  row.setAttribute?.('role', 'group');
  row.setAttribute?.('aria-label', `${pack.firstName} protocols`);

  pack.pills.forEach((pill, index) => {
    const button = root.createElement('button');
    button.type = 'button';
    button.className = 'hub-pills__btn';
    button.dataset.protocolId = pill.id;
    button.textContent = pill.label;
    button.style?.setProperty?.('--pill-i', String(index));
    const active = pill.id === selectedId;
    button.classList?.toggle?.('is-active', active);
    if (!button.classList?.toggle) {
      button.className = active ? 'hub-pills__btn is-active' : 'hub-pills__btn';
    }
    button.setAttribute?.('aria-pressed', active ? 'true' : 'false');
    button.addEventListener('click', () => onSelect?.(pill.id));
    row.append(button);
  });

  host.replaceChildren?.(eyebrow, row);
}

function hideHost(host) {
  host.hidden = true;
  host.setAttribute?.('hidden', '');
}

function showHost(host) {
  host.hidden = false;
  host.removeAttribute?.('hidden');
}
