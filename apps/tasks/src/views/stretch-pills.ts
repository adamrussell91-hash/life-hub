import type { GraphPageView } from '@/shell/shell';
import { el } from '@/views/hub-kit';

const MODES: Array<{ id: GraphPageView; label: string; href: string }> = [
  { id: 'lines', label: 'Lines', href: '#/graph' },
  { id: 'branch', label: 'Branch', href: '#/graph?view=branch' },
  { id: 'orbit', label: 'Orbit', href: '#/graph?view=orbit' }
];

/** Graph page pills — Lines, Branch, Orbit. */
export function renderGraphFamilyPills(
  active: GraphPageView,
  _unused?: unknown,
  onNavigate?: (href: string) => void
): HTMLElement {
  const pills = el('div', 'hub-pills');
  pills.setAttribute('role', 'group');
  pills.setAttribute('aria-label', 'Graph view');
  for (const mode of MODES) {
    const pressed = active === mode.id;
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
