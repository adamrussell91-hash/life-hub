/** Shared toast, copy-confirm, and timed undo. Tokens only. */

const DEFAULT_DURATION = 3200;
const UNDO_DURATION = 5600;

/** @type {{ el: HTMLElement, dismiss: (reason?: string) => void } | null} */
let current = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let timer = null;

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function viewOf(root) {
  return ownerDoc(root)?.defaultView ?? globalThis;
}

function addClass(el, name) {
  if (!el) return;
  if (el.classList?.add) el.classList.add(name);
  else el.className = `${el.className || ''} ${name}`.trim();
}

function removeEl(el) {
  el?.remove?.();
  if (el?.parentNode?.removeChild) el.parentNode.removeChild(el);
}

function prefersReduced(root) {
  return Boolean(viewOf(root).matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function clearTimer() {
  if (timer != null) {
    (globalThis.clearTimeout ?? viewOf().clearTimeout)?.(timer);
    timer = null;
  }
}

/**
 * @param {string} message
 * @param {{
 *   root?: Document | ParentNode,
 *   tone?: 'neutral' | 'success' | 'danger',
 *   durationMs?: number,
 *   action?: { label: string, onClick: () => void } | null,
 *   onDismiss?: (reason: 'timeout' | 'action' | 'replace' | 'manual') => void
 * }} [options]
 */
export function showHubToast(message, options = {}) {
  const text = String(message ?? '').trim();
  if (!text) return null;
  const root = options.root ?? globalThis.document;
  const doc = ownerDoc(root);
  const tone = options.tone === 'success' || options.tone === 'danger' ? options.tone : 'neutral';
  const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : DEFAULT_DURATION;
  const host = doc.body ?? root;

  if (current) {
    const prev = current;
    current = null;
    prev.dismiss('replace');
  }

  const el = doc.createElement('div');
  addClass(el, 'hub-toast');
  addClass(el, `hub-toast--${tone}`);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  const copy = doc.createElement('p');
  addClass(copy, 'hub-toast__message');
  copy.textContent = text;
  el.append(copy);

  let settled = false;
  const dismiss = (reason = 'manual') => {
    if (settled) return;
    settled = true;
    clearTimer();
    addClass(el, 'is-leaving');
    removeEl(el);
    if (current?.el === el) current = null;
    options.onDismiss?.(reason);
  };

  if (options.action?.label) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    addClass(btn, 'btn');
    addClass(btn, 'btn--ghost');
    addClass(btn, 'hub-toast__action');
    btn.textContent = options.action.label;
    btn.addEventListener('click', () => {
      options.action.onClick?.();
      dismiss('action');
    });
    el.append(btn);
  }

  host.append(el);
  if (!prefersReduced(root)) addClass(el, 'is-visible');
  else addClass(el, 'is-visible');

  current = { el, dismiss };
  if (durationMs > 0) {
    const start = viewOf(root).setTimeout ?? globalThis.setTimeout;
    timer = start(() => dismiss('timeout'), durationMs);
  }
  return current;
}

/**
 * @param {HTMLElement | null | undefined} trigger
 * @param {string} text
 * @param {{
 *   root?: Document | ParentNode,
 *   clipboard?: { writeText: (value: string) => Promise<void> },
 *   message?: string
 * }} [options]
 */
export async function showCopyConfirm(trigger, text, options = {}) {
  const value = String(text ?? '');
  const root = options.root ?? trigger?.ownerDocument ?? globalThis.document;
  const view = viewOf(root);
  const clipboard = options.clipboard ?? view.navigator?.clipboard ?? globalThis.navigator?.clipboard;
  if (clipboard?.writeText) await clipboard.writeText(value);
  if (trigger) {
    trigger.dataset.hubCopyState = 'copied';
    addClass(trigger, 'is-copied');
    const prior = trigger.getAttribute('aria-label');
    trigger.setAttribute('aria-label', prior ? `${prior} (copied)` : 'Copied');
  }
  return showHubToast(options.message ?? 'Copied', { root, tone: 'success', durationMs: 2200 });
}

/**
 * Apply the user action immediately, then offer Undo.
 * @param {{
 *   message: string,
 *   durationMs?: number,
 *   undoLabel?: string,
 *   root?: Document | ParentNode,
 *   onUndo?: () => void,
 *   onCommit?: () => void
 * }} options
 */
export function offerTimedUndo(options) {
  let undone = false;
  const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : UNDO_DURATION;
  return showHubToast(options.message, {
    root: options.root,
    tone: 'neutral',
    durationMs,
    action: {
      label: options.undoLabel ?? 'Undo',
      onClick: () => {
        undone = true;
        options.onUndo?.();
      }
    },
    onDismiss: (reason) => {
      if (!undone && reason !== 'action') options.onCommit?.();
    }
  });
}

export function resetHubFeedbackForTests() {
  clearTimer();
  if (current) {
    removeEl(current.el);
    current = null;
  }
}
