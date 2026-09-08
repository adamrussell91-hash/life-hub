/** Shared hub chat keyboard / visual-viewport contract.
 *
 * Sets `html.vv-keyboard-open` and `--vv-offset-top` / `--vv-height` / `--vv-offset-bottom`
 * only while a chat composer is focused, geometry says the keyboard is open, or
 * `.chat-view.is-busy`. Closed keyboard leaves the vars unset so shells sit on
 * `100dvh` without URL-bar flicker.
 *
 * Pair with `hub-chat-viewport.css`. Shells still pin their own chat host height
 * (Life `.page-frame`, Tasks `.hub-layout[data-hub-view='clare']`, overlay panels).
 */

/** Inset (px) above which we treat the visual viewport as keyboard-shrunk. */
export const VV_KEYBOARD_OPEN_PX = 120;

/** How far vv.height must fall from the closed baseline before we trust geometry alone. */
export const VV_BASELINE_SHRINK_PX = 120;

/** Ignore URL-bar / rubber-band jitter smaller than this once the keyboard is open. */
export const VV_HEIGHT_STICK_PX = 16;

let attached = false;
let composerFocused = false;
let closedBaselineHeight = 0;
let lastWritten = { top: Number.NaN, height: Number.NaN, bottom: Number.NaN };
/** @type {Array<[string, EventListenerOrEventListenerObject]>} */
let vvListeners = [];
/** @type {Array<[string, EventListenerOrEventListenerObject]>} */
let docListeners = [];

function quantize(n) {
  return Math.round(Number(n) || 0);
}

function keyboardOpenFromGeometry(vv) {
  const rawInset = Math.max(0, globalThis.innerHeight - vv.height - vv.offsetTop);

  // Primary signal (iOS Safari): visualViewport.height collapses vs the closed
  // baseline. Prefer this — innerHeight−vv.height alone false-fires in desktop
  // Chrome DevTools device mode (large inset, vv.height still full device).
  if (closedBaselineHeight > 0) {
    const shrunk = closedBaselineHeight - vv.height;
    if (shrunk > VV_BASELINE_SHRINK_PX) {
      return { open: true, insetBottom: Math.max(rawInset, shrunk) };
    }
  }

  // Secondary: large layout inset only when the visual viewport also moved
  // (offsetTop) or clearly collapsed vs the screen — not DevTools chrome noise.
  if (rawInset > VV_KEYBOARD_OPEN_PX) {
    const screenH = Number(globalThis.screen?.height) || 0;
    const collapsedVsScreen = screenH > 0 && screenH - vv.height > VV_KEYBOARD_OPEN_PX;
    if (vv.offsetTop > 8 || collapsedVsScreen) {
      return { open: true, insetBottom: rawInset };
    }
  }

  return { open: false, insetBottom: 0 };
}

function chatViewBusy() {
  return Boolean(globalThis.document?.querySelector?.('.chat-view.is-busy'));
}

function clearViewportVars(root) {
  root.style.removeProperty('--vv-offset-top');
  root.style.removeProperty('--vv-height');
  root.style.removeProperty('--vv-offset-bottom');
  lastWritten = { top: Number.NaN, height: Number.NaN, bottom: Number.NaN };
}

function writeViewportVars(root, { offsetTop, height, insetBottom }) {
  const top = quantize(offsetTop);
  const nextHeight = quantize(height);
  const bottom = quantize(insetBottom);
  if (
    Number.isFinite(lastWritten.height)
    && Math.abs(nextHeight - lastWritten.height) < VV_HEIGHT_STICK_PX
    && Math.abs(top - lastWritten.top) < VV_HEIGHT_STICK_PX
    && Math.abs(bottom - lastWritten.bottom) < VV_HEIGHT_STICK_PX
  ) {
    return;
  }
  lastWritten = { top, height: nextHeight, bottom };
  root.style.setProperty('--vv-offset-top', `${top}px`);
  root.style.setProperty('--vv-height', `${nextHeight}px`);
  root.style.setProperty('--vv-offset-bottom', `${bottom}px`);
}

function syncVisualViewport() {
  const vv = globalThis.visualViewport;
  if (!vv) return;
  const root = globalThis.document?.documentElement;
  if (!root?.style) return;

  const { open: geometryOpen, insetBottom } = keyboardOpenFromGeometry(vv);
  const open = composerFocused || geometryOpen || chatViewBusy();

  if (!open) {
    if (vv.height > 0) {
      closedBaselineHeight = Math.max(closedBaselineHeight, vv.height);
    }
    // Leave --vv-* unset so Chat can sit on 100dvh. Writing live vv.height here
    // pins the window to URL-bar / rubber-band jitter (edges + scrollbar jump).
    clearViewportVars(root);
    root.classList.toggle('vv-keyboard-open', false);
    return;
  }

  writeViewportVars(root, {
    offsetTop: vv.offsetTop,
    height: vv.height,
    // Composer focus alone must not invent a bottom inset from DevTools
    // innerHeight−vv.height noise — only real geometry may set it.
    insetBottom: geometryOpen ? insetBottom : 0
  });
  root.classList.toggle('vv-keyboard-open', true);
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

function isComposerTarget(target) {
  return Boolean(
    target?.closest?.(
      '.chat-form, #chat-form, .chat__composer, .hub-ai-bar--thread'
    )
  );
}

function onComposerFocusIn(event) {
  if (!isComposerTarget(event.target)) return;
  // Messenger-style: typing means keyboard mode. Do not wait on inset math —
  // on iPhone inset is often 0 because innerHeight already shrank.
  composerFocused = true;
  syncVisualViewportSoon();
}

function onComposerFocusOut(event) {
  if (!isComposerTarget(event.target)) return;
  // Defer so focus moving Attach → input inside the form does not clear the mode.
  globalThis.setTimeout?.(() => {
    const active = globalThis.document?.activeElement;
    if (isComposerTarget(active) || chatViewBusy()) return;
    composerFocused = false;
    syncVisualViewport();
  }, 0);
}

function bind(target, type, fn, bucket) {
  target?.addEventListener?.(type, fn);
  bucket.push([type, fn]);
}

export function attachVisualViewportInset() {
  if (attached) return;
  attached = true;
  composerFocused = false;
  closedBaselineHeight = 0;
  lastWritten = { top: Number.NaN, height: Number.NaN, bottom: Number.NaN };
  vvListeners = [];
  docListeners = [];
  syncVisualViewport();
  // resize only — visualViewport.scroll is URL-bar / rubber-band noise and
  // rewriting height from it makes the chat window and scrollbar flicker.
  bind(globalThis.visualViewport, 'resize', syncVisualViewport, vvListeners);
  bind(globalThis.document, 'focusin', onComposerFocusIn, docListeners);
  bind(globalThis.document, 'focusout', onComposerFocusOut, docListeners);
}

/** Re-read busy/focus after Chat send/stop so keyboard chrome does not slam back. */
export function notifyChatViewport() {
  if (!attached) return;
  if (!chatViewBusy()) {
    const active = globalThis.document?.activeElement;
    if (!isComposerTarget(active)) composerFocused = false;
  }
  syncVisualViewport();
}

export function detachVisualViewportInset() {
  if (!attached) return;
  attached = false;
  composerFocused = false;
  closedBaselineHeight = 0;
  lastWritten = { top: Number.NaN, height: Number.NaN, bottom: Number.NaN };
  for (const [type, fn] of vvListeners) {
    globalThis.visualViewport?.removeEventListener?.(type, fn);
  }
  for (const [type, fn] of docListeners) {
    globalThis.document?.removeEventListener?.(type, fn);
  }
  vvListeners = [];
  docListeners = [];
  const root = globalThis.document?.documentElement;
  root?.style?.removeProperty?.('--vv-offset-top');
  root?.style?.removeProperty?.('--vv-height');
  root?.style?.removeProperty?.('--vv-offset-bottom');
  root?.classList?.remove?.('vv-keyboard-open');
}
