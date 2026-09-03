import { filterIcon } from '@/shell/icons';
import { el } from '@/views/hub-kit';

const openById = new Set<string>();

export function resetCollapsibleFiltersForTests(): void {
  openById.clear();
}

export type CollapsibleFilters = {
  root: HTMLElement;
  toggle: HTMLButtonElement;
  panel: HTMLElement;
};

/** Filter icon that reveals the page filter bar. Same chrome as the circular +. */
export function createCollapsibleFilters(options: {
  id: string;
  ariaLabel?: string;
  panel?: HTMLElement;
  className?: string;
  active?: boolean;
}): CollapsibleFilters {
  const label = options.ariaLabel ?? 'Filters';
  const open = openById.has(options.id);
  const root = el('div', ['hub-filters', options.className].filter(Boolean).join(' '));
  const toggle = el('button', 'icon-plus-btn hub-filters__toggle') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.title = label;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-controls', `hub-filters-${options.id}`);
  toggle.append(filterIcon());
  if (options.active) toggle.classList.add('is-set');

  const panel = options.panel ?? el('div');
  panel.classList.add('hub-filters__panel');
  panel.id = `hub-filters-${options.id}`;
  panel.hidden = !open;

  const setOpen = (next: boolean) => {
    if (next) openById.add(options.id);
    else openById.delete(options.id);
    panel.hidden = !next;
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
    root.classList.toggle('is-open', next);
    if (next) {
      panel.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    }
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setOpen(false);
    toggle.focus();
  });

  root.classList.toggle('is-open', open);
  root.append(toggle, panel);
  return { root, toggle, panel };
}
