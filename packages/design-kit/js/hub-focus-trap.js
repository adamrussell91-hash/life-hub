/**
 * Slim focus trap for morphing dialogs / command palettes.
 * Mined from Zag/dialog patterns — not the Zag runtime.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(el) {
  if (!el || (typeof HTMLElement !== 'undefined' && !(el instanceof HTMLElement))) return false;
  if (typeof HTMLElement === 'undefined' && el.nodeType != null && el.nodeType !== 1) return false;
  if (el.closest?.('[hidden], [aria-hidden="true"]')) return false;
  const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
  if (style && (style.visibility === 'hidden' || style.display === 'none')) return false;
  return (el.getClientRects?.()?.length ?? 0) > 0;
}

export function listFocusable(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll(FOCUSABLE)].filter(isVisible);
}

/**
 * Trap Tab inside `container`. Escape calls onEscape when provided.
 * Focuses the first focusable (or container) on start.
 * @returns {() => void} release — restores prior focus
 */
export function trapFocus(container, { onEscape, initialFocus } = {}) {
  if (!container) return () => {};
  const doc = container.ownerDocument ?? globalThis.document;
  const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;

  const focusInitial = () => {
    const target =
      (initialFocus instanceof HTMLElement && isVisible(initialFocus) ? initialFocus : null) ??
      listFocusable(container)[0] ??
      (container instanceof HTMLElement ? container : null);
    if (target && typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus?.();
      }
    } else if (container instanceof HTMLElement && !container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
      container.focus?.({ preventScroll: true });
    }
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      if (!onEscape) return;
      event.preventDefault();
      onEscape(event);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = listFocusable(container);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  doc.addEventListener('keydown', onKeyDown, true);
  // Defer so morph open animation / DOM append settles.
  const kick = globalThis.requestAnimationFrame ?? (cb => cb());
  kick(focusInitial);

  return () => {
    doc.removeEventListener('keydown', onKeyDown, true);
    if (previous && typeof previous.focus === 'function' && previous.isConnected) {
      try {
        previous.focus({ preventScroll: true });
      } catch {
        previous.focus?.();
      }
    }
  };
}
