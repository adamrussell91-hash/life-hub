/** Inset (px) above which we treat the visual viewport as keyboard-shrunk. */
export const VV_KEYBOARD_OPEN_PX = 120;

function syncVisualViewport() {
  const vv = globalThis.visualViewport;
  if (!vv) return;
  const root = globalThis.document?.documentElement;
  if (!root?.style) return;
  const insetBottom = Math.max(0, globalThis.innerHeight - vv.height - vv.offsetTop);
  root.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
  root.style.setProperty('--vv-height', `${vv.height}px`);
  root.style.setProperty('--vv-offset-bottom', `${insetBottom}px`);
  root.classList.toggle('vv-keyboard-open', insetBottom > VV_KEYBOARD_OPEN_PX);
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
  // Full-page Chat pins to --vv-height; overlay already does. Do not scrollIntoView —
  // that is what left the composer floating above the nav/keyboard on iOS.
  syncVisualViewportSoon();
}

let attached = false;

export function attachVisualViewportInset() {
  if (attached) return;
  attached = true;
  syncVisualViewport();
  globalThis.visualViewport?.addEventListener?.('resize', syncVisualViewport);
  globalThis.visualViewport?.addEventListener?.('scroll', syncVisualViewport);
  globalThis.document?.addEventListener?.('focusin', onComposerFocusIn);
}

export function detachVisualViewportInset() {
  if (!attached) return;
  attached = false;
  globalThis.visualViewport?.removeEventListener?.('resize', syncVisualViewport);
  globalThis.visualViewport?.removeEventListener?.('scroll', syncVisualViewport);
  globalThis.document?.removeEventListener?.('focusin', onComposerFocusIn);
  const root = globalThis.document?.documentElement;
  root?.style?.removeProperty?.('--vv-offset-top');
  root?.style?.removeProperty?.('--vv-height');
  root?.style?.removeProperty?.('--vv-offset-bottom');
  root?.classList?.remove?.('vv-keyboard-open');
}
