function syncVisualViewport() {
  const vv = globalThis.visualViewport;
  if (!vv) return;
  const root = globalThis.document?.documentElement;
  if (!root?.style) return;
  root.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
  root.style.setProperty('--vv-height', `${vv.height}px`);
  root.style.setProperty(
    '--vv-offset-bottom',
    `${Math.max(0, globalThis.innerHeight - vv.height - vv.offsetTop)}px`
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
  syncVisualViewportSoon();
  globalThis.setTimeout?.(() => {
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    syncVisualViewport();
  }, 350);
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
}
