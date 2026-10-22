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
  /** Runs once when the overlay closes, however it closes. */
  onClose?: () => void;
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

/** Open overlays, bottom first. Only the top one is live; everything under it is inert. */
const stack: HTMLElement[] = [];
/** Elements the overlays made inert, so the last close leaves other inert elements alone. */
const madeInert = new Set<HTMLElement>();

/** The live overlay on top. One taken out of the page without close() no longer counts. */
function topOverlay(): HTMLElement | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) if (!stack[i]!.isConnected) stack.splice(i, 1);
  return stack[stack.length - 1];
}

function syncInert(): void {
  const top = topOverlay();
  if (!top) {
    for (const n of madeInert) n.removeAttribute('inert');
    madeInert.clear();
    return;
  }
  for (const n of document.body.children) {
    if (!(n instanceof HTMLElement)) continue;
    if (n === top) {
      if (madeInert.delete(n)) n.removeAttribute('inert');
    } else if (!n.hasAttribute('inert')) {
      n.setAttribute('inert', '');
      madeInert.add(n);
    }
  }
}

export function openOverlay(content: HTMLElement, opts: OverlayOptions = {}): { overlay: HTMLElement; close: () => void } {
  const active = document.activeElement;
  const opener = active instanceof HTMLElement && active !== document.body ? active : null;
  const overlay = document.createElement('div');
  overlay.className = 'mb-overlay';
  content.setAttribute('role', 'dialog');
  content.setAttribute('aria-modal', 'true');
  if (opts.labelledBy) content.setAttribute('aria-labelledby', opts.labelledBy);
  else if (opts.label) content.setAttribute('aria-label', opts.label);

  /**
   * Listens on the document, so Escape and Tab still work after a click on the
   * backdrop drops focus to the body. Keys aimed at another dialog (a confirm
   * card) or at an overlay further down the stack are left alone.
   */
  const onKey = (event: KeyboardEvent): void => {
    if (!overlay.isConnected) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (topOverlay() !== overlay) return;
    const target = event.target;
    const lost = target === document.body || target === document.documentElement || target === document;
    if (!lost && !(target instanceof Node && overlay.contains(target))) return;
    if (event.key === 'Escape') {
      // Escape while an input method is composing cancels the composition, not the overlay.
      if (event.isComposing) return;
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
    const now = document.activeElement;
    if (event.shiftKey && (now === first || !content.contains(now))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (now === last || !content.contains(now))) {
      event.preventDefault();
      first.focus();
    }
  };

  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey);
    const wasTop = topOverlay() === overlay;
    const at = stack.indexOf(overlay);
    if (at >= 0) stack.splice(at, 1);
    overlay.remove();
    syncInert();
    opts.onClose?.();
    // Under another overlay, focus belongs to that one.
    if (!wasTop) return;
    const target = opener?.isConnected ? opener : opts.returnFocus?.() ?? null;
    target?.focus();
  };

  overlay.append(content);
  document.body.append(overlay);
  stack.push(overlay);
  syncInert();
  document.addEventListener('keydown', onKey);
  return { overlay, close };
}
