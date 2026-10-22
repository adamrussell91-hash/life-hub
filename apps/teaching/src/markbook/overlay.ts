/**
 * A modal layer for the markbook's forms and panels. It makes the rest of the
 * page inert, keeps Tab inside the content, closes on Escape, and puts focus
 * back where it was when it closes.
 */

export type OverlayOptions = {
  label?: string;
  labelledBy?: string;
  /** Where focus goes on close when the element that had it is gone. */
  returnFocus?: () => HTMLElement | null;
  /** Return false to keep the overlay open, for example while saving. */
  canClose?: () => boolean;
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.closest('[hidden]'));
}

export function openOverlay(content: HTMLElement, opts: OverlayOptions = {}): { overlay: HTMLElement; close: () => void } {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'mb-overlay';
  content.setAttribute('role', 'dialog');
  content.setAttribute('aria-modal', 'true');
  if (opts.labelledBy) content.setAttribute('aria-labelledby', opts.labelledBy);
  else if (opts.label) content.setAttribute('aria-label', opts.label);

  // Only siblings that weren't inert already, so close leaves the others alone.
  const madeInert = [...document.body.children].filter((n): n is HTMLElement => n instanceof HTMLElement && !n.hasAttribute('inert'));
  for (const n of madeInert) n.setAttribute('inert', '');

  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    overlay.remove();
    for (const n of madeInert) n.removeAttribute('inert');
    const target = opener?.isConnected ? opener : opts.returnFocus?.() ?? null;
    target?.focus();
  };

  content.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!opts.canClose || opts.canClose()) close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(content);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !content.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !content.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });

  overlay.append(content);
  document.body.append(overlay);
  return { overlay, close };
}
