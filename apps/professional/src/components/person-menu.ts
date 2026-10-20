/**
 * The profile header's "…" menu: a button that opens a short list of
 * actions. Esc, an outside click or picking an item closes it.
 */

export interface PersonMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function buildPersonMenu(items: PersonMenuItem[], label = 'More actions'): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'person-menu';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'person-menu__btn';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.textContent = '…';
  const list = document.createElement('div');
  list.className = 'person-menu__list';
  list.setAttribute('role', 'menu');
  list.hidden = true;

  function onDocClick(event: MouseEvent): void {
    if (!wrap.contains(event.target as Node)) close();
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      close();
      button.focus();
    }
  }
  function close(): void {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
  }
  function open(): void {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    list.querySelector<HTMLButtonElement>('button')?.focus();
  }

  for (const item of items) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = `person-menu__item${item.danger ? ' person-menu__item--danger' : ''}`;
    entry.setAttribute('role', 'menuitem');
    entry.textContent = item.label;
    entry.addEventListener('click', () => {
      close();
      item.onSelect();
    });
    list.append(entry);
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  wrap.append(button, list);
  return wrap;
}
