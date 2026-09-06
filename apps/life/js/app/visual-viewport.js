/** Inset (px) above which we treat the visual viewport as keyboard-shrunk. */
export const VV_KEYBOARD_OPEN_PX = 120;

function composerIsFocused() {
  const active = globalThis.document?.activeElement;
  return Boolean(active?.closest?.('.chat-form, #chat-form'));
}

function syncVisualViewport() {
  const vv = globalThis.visualViewport;
  if (!vv) return;
  const root = globalThis.document?.documentElement;
  if (!root?.style) return;
  const insetBottom = Math.max(0, globalThis.innerHeight - vv.height - vv.offsetTop);
  root.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
  root.style.setProperty('--vv-height', `${vv.height}px`);
  root.style.setProperty('--vv-offset-bottom', `${insetBottom}px`);
  // iOS often resizes window.innerHeight with the keyboard, so insetBottom stays ~0.
  // Composer focus is the reliable signal that the field must stay docked and the tab bar must hide.
  root.classList.toggle(
    'vv-keyboard-open',
    insetBottom > VV_KEYBOARD_OPEN_PX || composerIsFocused()
  );
}

/** iOS updates visualViewport after focus/keyboard animation — resync a few times. */
function syncVisualViewportSoon() {
  syncVisualViewport();
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === 'function') {
    raf(() => {
      syncVisualViewport();
      globalThis.setTimeout?.(syncVisualViewport, 120);
      globalThis.setTimeout?.(syncVisualViewport, 320);
    });
  } else {
    globalThis.setTimeout?.(syncVisualViewport, 120);
  }
}

function onComposerFocusIn(event) {
  const target = event.target;
  if (!target?.closest) return;
  if (!target.closest('.chat-form, #chat-form')) return;
  // Mark open immediately so CSS docks before the keyboard animation finishes.
  globalThis.document?.documentElement?.classList?.add?.('vv-keyboard-open');
  syncVisualViewportSoon();
}

function onComposerFocusOut(event) {
  const target = event.target;
  if (!target?.closest) return;
  if (!target.closest('.chat-form, #chat-form')) return;
  // Allow focus to move within the form before clearing; then re-sync from metrics.
  globalThis.setTimeout?.(() => {
    syncVisualViewport();
  }, 0);
}

let attached = false;

export function attachVisualViewportInset() {
  if (attached) return;
  attached = true;
  syncVisualViewport();
  globalThis.visualViewport?.addEventListener?.('resize', syncVisualViewport);
  globalThis.visualViewport?.addEventListener?.('scroll', syncVisualViewport);
  globalThis.document?.addEventListener?.('focusin', onComposerFocusIn);
  globalThis.document?.addEventListener?.('focusout', onComposerFocusOut);
}

export function detachVisualViewportInset() {
  if (!attached) return;
  attached = false;
  globalThis.visualViewport?.removeEventListener?.('resize', syncVisualViewport);
  globalThis.visualViewport?.removeEventListener?.('scroll', syncVisualViewport);
  globalThis.document?.removeEventListener?.('focusin', onComposerFocusIn);
  globalThis.document?.removeEventListener?.('focusout', onComposerFocusOut);
  const root = globalThis.document?.documentElement;
  root?.style?.removeProperty?.('--vv-offset-top');
  root?.style?.removeProperty?.('--vv-height');
  root?.style?.removeProperty?.('--vv-offset-bottom');
  root?.classList?.remove?.('vv-keyboard-open');
}
