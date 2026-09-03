const KEBAB_ICON = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="19" r="1.75" />
  </svg>
`.trim();

export interface PageOptionsItem {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
  dataset?: Record<string, string>;
  ariaLabel?: string;
}

export interface PageOptionsMenuOptions {
  label?: string;
  className?: string;
  triggerClassName?: string;
}

export interface PageOptionsMenuHandle {
  el: HTMLElement;
  dispose: () => void;
}

let activeClose: (() => void) | null = null;

export function mountPageOptionsMenu(
  items: PageOptionsItem[],
  options: PageOptionsMenuOptions = {}
): PageOptionsMenuHandle {
  const label = options.label ?? 'More options';
  const visible = items.filter((item) => item.label.trim().length > 0);

  const root = document.createElement('div');
  root.className = ['page-options', options.className].filter(Boolean).join(' ');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = ['hub-icon-btn', 'page-options__trigger', options.triggerClassName]
    .filter(Boolean)
    .join(' ');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', label);
  trigger.title = label;
  trigger.innerHTML = KEBAB_ICON;

  const menu = document.createElement('div');
  menu.className = 'page-options__menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  for (const item of visible) {
    const isLink = Boolean(item.href);
    const entry = isLink ? document.createElement('a') : document.createElement('button');
    if (!isLink) (entry as HTMLButtonElement).type = 'button';
    entry.className = [
      'page-options__item',
      item.danger ? 'page-options__item--danger' : '',
      item.className ?? ''
    ]
      .filter(Boolean)
      .join(' ');
    entry.setAttribute('role', 'menuitem');
    entry.textContent = item.label;
    if (item.ariaLabel) entry.setAttribute('aria-label', item.ariaLabel);
    if (isLink) {
      const link = entry as HTMLAnchorElement;
      link.href = item.href!;
      if (item.target) link.target = item.target;
      link.rel = item.rel ?? (item.target === '_blank' ? 'noopener noreferrer' : '');
    }
    if (item.dataset) {
      for (const [key, value] of Object.entries(item.dataset)) {
        entry.dataset[key] = value;
      }
    }
    entry.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(false);
      if (item.onSelect) {
        event.preventDefault();
        item.onSelect();
      }
    });
    menu.append(entry);
  }

  function setOpen(open: boolean): void {
    if (open) {
      if (activeClose && activeClose !== closeSelf) activeClose();
      activeClose = closeSelf;
    } else if (activeClose === closeSelf) {
      activeClose = null;
    }
    menu.hidden = !open;
    root.classList.toggle('page-options--open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeSelf(): void {
    setOpen(false);
  }

  const onTrigger = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(menu.hidden);
  };

  const onDoc = (event: MouseEvent): void => {
    if (menu.hidden) return;
    const target = event.target as Node | null;
    if (target && root.contains(target)) return;
    setOpen(false);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || menu.hidden) return;
    setOpen(false);
    trigger.focus();
  };

  trigger.addEventListener('click', onTrigger);
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onKey);

  root.append(trigger, menu);

  return {
    el: root,
    dispose: () => {
      if (activeClose === closeSelf) activeClose = null;
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
      root.replaceChildren();
    }
  };
}
