/** Inset (px) above which we treat the visual viewport as keyboard-shrunk. */
export const VV_KEYBOARD_OPEN_PX = 120;

/** How far vv.height must fall from the closed baseline before we trust geometry alone. */
export const VV_BASELINE_SHRINK_PX = 120;

/** Ignore visualViewport jitter smaller than this so the Chat canvas does not resize every frame. */
export const VV_HEIGHT_STICK_PX = 16;

let attached = false;
let composerFocused = false;
let closedBaselineHeight = 0;
/** @type {Array<[string, EventListenerOrEventListenerObject]>} */
let vvListeners = [];
/** @type {Array<[string, EventListenerOrEventListenerObject]>} */
let docListeners = [];

function keyboardOpenFromGeometry(vv) {
  const insetBottom = Math.max(0, globalThis.innerHeight - vv.height - vv.offsetTop);
  if (insetBottom > VV_KEYBOARD_OPEN_PX) return { open: true, insetBottom };

  // iOS Safari often shrinks innerHeight with the keyboard, so inset stays ~0.
  // Compare against the tallest recent closed height instead.
  if (closedBaselineHeight > 0) {
    const shrunk = closedBaselineHeight - vv.height;
    if (shrunk > VV_BASELINE_SHRINK_PX) {
      return { open: true, insetBottom: Math.max(insetBottom, shrunk) };
    }
  }
  return { open: false, insetBottom };
}

function chatViewBusy() {
  return Boolean(globalThis.document?.querySelector?.('.chat-view.is-busy'));
}

function stickCssPx(root, name, next) {
  const rounded = Math.round(next);
  const raw = root.style.getPropertyValue(name);
  const prev = parseFloat(raw);
  if (!raw || !Number.isFinite(prev) || Math.abs(rounded - prev) >= VV_HEIGHT_STICK_PX) {
    root.style.setProperty(name, `${rounded}px`);
  }
}

function syncVisualViewport() {
  const vv = globalThis.visualViewport;
  if (!vv) return;
  const root = globalThis.document?.documentElement;
  if (!root?.style) return;

  const { open: geometryOpen, insetBottom } = keyboardOpenFromGeometry(vv);
  const open = composerFocused || geometryOpen || chatViewBusy();

  if (!open && vv.height > 0) {
    closedBaselineHeight = Math.max(closedBaselineHeight, vv.height);
  }

  // iOS visualViewport resize/scroll fires with 1–12px jitter. Binding the
  // Chat page-frame to every pixel made the whole window throb.
  stickCssPx(root, '--vv-offset-top', vv.offsetTop);
  stickCssPx(root, '--vv-height', vv.height);
  stickCssPx(root, '--vv-offset-bottom', insetBottom);
  root.classList.toggle('vv-keyboard-open', open);
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
  return Boolean(target?.closest?.('.chat-form, #chat-form'));
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
  vvListeners = [];
  docListeners = [];
  syncVisualViewport();
  bind(globalThis.visualViewport, 'resize', syncVisualViewport, vvListeners);
  bind(globalThis.visualViewport, 'scroll', syncVisualViewport, vvListeners);
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
