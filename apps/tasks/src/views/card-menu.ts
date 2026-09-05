/** Overflow menu for Cotton Glass cards. Uses kit `.hub-menu` chrome. */

import { autoUpdateHubFloating, positionHubFloating } from '../../../../packages/design-kit/js/hub-floating.js';
import { findTypeaheadMatch } from '../../../../packages/design-kit/js/hub-filter-menu.js';

export type CardMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  onSelect: () => void;
};

type OpenMenu = {
  menu: HTMLElement;
  btn: HTMLButtonElement;
  close: (returnFocus?: boolean) => void;
  stopFloating?: () => void;
};

let openMenu: OpenMenu | null = null;

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

function dots(): HTMLElement {
  const mark = el('span', 'card-menu__dots');
  mark.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) mark.append(el('span'));
  return mark;
}

export function closeCardMenu(returnFocus = false): void {
  if (!openMenu) return;
  const { menu, btn, close, stopFloating } = openMenu;
  openMenu = null;
  stopFloating?.();
  close(returnFocus);
  btn.setAttribute('aria-expanded', 'false');
  menu.remove();
}

const FLOATING_OPTS = { placement: 'bottom-end' as const, offset: 6, padding: 12 };

function openItems(btn: HTMLButtonElement, items: CardMenuItem[], ariaLabel: string, heading: string): void {
  closeCardMenu();

  const menu = el('div', 'hub-menu card-menu__panel');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', ariaLabel);
  menu.append(el('div', 'hub-menu__head', heading));

  const buttons: HTMLButtonElement[] = [];
  for (const item of items) {
    const opt = el('button', `hub-menu__opt${item.danger ? ' hub-menu__opt--danger' : ''}`, item.label) as HTMLButtonElement;
    opt.type = 'button';
    opt.role = 'menuitem';
    opt.dataset.cardMenuItem = item.id;
    opt.tabIndex = -1;
    opt.addEventListener('click', (event) => {
      event.stopPropagation();
      closeCardMenu(true);
      item.onSelect();
    });
    menu.append(opt);
    buttons.push(opt);
  }

  document.body.append(menu);
  void positionHubFloating(btn, menu, FLOATING_OPTS);
  const stopFloating = autoUpdateHubFloating(btn, menu, FLOATING_OPTS);
  requestAnimationFrame(() => menu.classList.add('is-open'));
  btn.setAttribute('aria-expanded', 'true');

  const close = (returnFocus?: boolean) => {
    menu.classList.remove('is-open');
    if (returnFocus) btn.focus();
  };
  openMenu = { menu, btn, close, stopFloating };

  let typeaheadBuffer = '';
  let typeaheadTimer = 0;
  menu.addEventListener('keydown', (event) => {
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(index + 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      closeCardMenu(true);
    } else if (
      event.key.length === 1
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {
      typeaheadBuffer += event.key;
      if (typeaheadTimer) clearTimeout(typeaheadTimer);
      typeaheadTimer = window.setTimeout(() => {
        typeaheadBuffer = '';
        typeaheadTimer = 0;
      }, 500);
      const match = findTypeaheadMatch(
        buttons.map((item) => item.textContent ?? ''),
        typeaheadBuffer
      );
      if (match >= 0) {
        event.preventDefault();
        buttons[match]?.focus();
      }
    }
  });

  const onDoc = (event: Event) => {
    if (!openMenu) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!menu.contains(target) && !btn.contains(target)) closeCardMenu();
  };
  document.addEventListener('click', onDoc);
  const previousClose = openMenu.close;
  openMenu.close = (returnFocus) => {
    document.removeEventListener('click', onDoc);
    previousClose(returnFocus);
  };

  buttons[0]?.focus();
}

export function renderCardMenu(
  label: string,
  items: CardMenuItem[],
  options?: { heading?: string; inline?: boolean }
): HTMLButtonElement {
  const heading = options?.heading ?? 'Card';
  const btn = el('button', `hub-icon-btn card-menu${options?.inline ? ' card-menu--inline' : ''}`) as HTMLButtonElement;
  btn.type = 'button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.append(dots());
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (openMenu?.btn === btn) {
      closeCardMenu();
      return;
    }
    openItems(btn, items, label, heading);
  });
  btn.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    if (openMenu?.btn !== btn) openItems(btn, items, label, heading);
    const opts = openMenu?.menu.querySelectorAll<HTMLButtonElement>('.hub-menu__opt') ?? [];
    (event.key === 'ArrowUp' ? opts[opts.length - 1] : opts[0])?.focus();
  });
  return btn;
}
