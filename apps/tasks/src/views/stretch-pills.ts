import type { HubViewId } from '@/shell/shell';

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

const MODES: Array<{ id: HubViewId; label: string; href: string }> = [
  { id: 'graph', label: 'Blockers', href: '#/graph' },
  { id: 'graph', label: 'Workstreams', href: '#/graph?mode=workstreams' },
  { id: 'universe', label: 'Universe', href: '#/universe' },
  { id: 'orbit', label: 'Orbit', href: '#/orbit' },
  { id: 'branch', label: 'Branch', href: '#/branch' },
  { id: 'constellation', label: 'Sky', href: '#/constellation' }
];

/** Graph page pills — blockers / workstreams plus stretch views. */
export function renderGraphFamilyPills(
  active: HubViewId,
  graphMode: 'blockers' | 'workstreams' = 'blockers',
  onNavigate?: (href: string) => void
): HTMLElement {
  const pills = el('div', 'hub-pills');
  pills.setAttribute('role', 'group');
  pills.setAttribute('aria-label', 'Graph view');
  for (const mode of MODES) {
    const isGraph = mode.href.startsWith('#/graph');
    const pressed =
      isGraph && active === 'graph'
        ? (mode.href.includes('workstreams') ? graphMode === 'workstreams' : graphMode === 'blockers')
        : active === mode.id;
    const btn = el('button', `hub-pills__btn${pressed ? ' is-active' : ''}`, mode.label);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (onNavigate) onNavigate(mode.href);
      else location.hash = mode.href;
    });
    pills.append(btn);
  }
  return pills;
}
