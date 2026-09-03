import { plusIcon } from '@/shell/icons';
import { el } from '@/views/hub-kit';

export type PlusAddHandle = {
  root: HTMLElement;
  open: () => void;
  close: () => void;
};

/** Circular + that reveals an add form. Same mark as calendar / excursions. */
export function createPlusAdd(options: {
  ariaLabel: string;
  panel: HTMLElement;
  className?: string;
}): PlusAddHandle {
  const root = el('div', ['plus-add', options.className].filter(Boolean).join(' '));
  const btn = el('button', 'icon-plus-btn plus-add__btn') as HTMLButtonElement;
  btn.type = 'button';
  btn.title = options.ariaLabel;
  btn.setAttribute('aria-label', options.ariaLabel);
  btn.setAttribute('aria-expanded', 'false');
  btn.append(plusIcon());

  const slot = el('div', 'plus-add__panel');
  slot.hidden = true;
  slot.append(options.panel);

  const setOpen = (open: boolean) => {
    slot.hidden = !open;
    btn.hidden = open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    root.classList.toggle('is-open', open);
    if (open) {
      slot.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    }
  };

  btn.addEventListener('click', () => setOpen(true));
  slot.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setOpen(false);
    btn.focus();
  });

  root.append(btn, slot);
  return {
    root,
    open: () => setOpen(true),
    close: () => setOpen(false)
  };
}

export function createPlusButton(ariaLabel: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', 'icon-plus-btn') as HTMLButtonElement;
  btn.type = 'button';
  btn.title = ariaLabel;
  btn.setAttribute('aria-label', ariaLabel);
  btn.append(plusIcon());
  btn.addEventListener('click', onClick);
  return btn;
}

/** Open a plus-add in `host` (used by calendar day +). */
export function openPlusAdd(host: ParentNode): HTMLElement | null {
  const root = host.querySelector<HTMLElement>('.plus-add');
  if (!root) return null;
  const panel = root.querySelector<HTMLElement>('.plus-add__panel');
  if (panel?.hidden) {
    root.querySelector<HTMLButtonElement>('.plus-add__btn')?.click();
  }
  return panel?.querySelector<HTMLElement>('input, textarea') ?? panel;
}
