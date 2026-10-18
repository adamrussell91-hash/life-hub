/**
 * Small popup menus (toolbar More, a moment's ⋯): only one open at a time,
 * closed by a tap anywhere outside, Escape, or choosing an item.
 */

export interface DismissableMenu {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

let current: DismissableMenu | null = null;

export function bindDismissableMenu(button: HTMLElement, menu: HTMLElement): DismissableMenu {
  const onPointerDown = (ev: Event) => {
    const target = ev.target as Node | null;
    if (target && (menu.contains(target) || button.contains(target))) return;
    api.close();
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    api.close();
    button.focus();
  };

  const api: DismissableMenu = {
    isOpen: () => !menu.hidden,
    open() {
      if (!menu.hidden) return;
      if (current && current !== api) current.close();
      current = api;
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
    },
    close() {
      if (current === api) current = null;
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    },
  };

  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (api.isOpen()) api.close();
    else api.open();
  });
  return api;
}
