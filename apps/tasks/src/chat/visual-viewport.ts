function syncVisualViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  root.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
  root.style.setProperty('--vv-height', `${vv.height}px`);
  root.style.setProperty(
    '--vv-offset-bottom',
    `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`
  );
}

/** iOS updates visualViewport after focus/keyboard animation — resync a few times. */
function syncVisualViewportSoon(): void {
  syncVisualViewport();
  requestAnimationFrame(() => {
    syncVisualViewport();
    window.setTimeout(syncVisualViewport, 120);
    window.setTimeout(syncVisualViewport, 320);
  });
}

function onComposerFocusIn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.closest('.chat-form, #chat-form')) return;
  syncVisualViewportSoon();
  // Keep the composer in the visible frame once the keyboard finishes sliding up.
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    syncVisualViewport();
  }, 350);
}

let attached = false;

export function attachVisualViewportInset(): void {
  if (attached) return;
  attached = true;
  syncVisualViewport();
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);
  document.addEventListener('focusin', onComposerFocusIn);
}

export function detachVisualViewportInset(): void {
  if (!attached) return;
  attached = false;
  window.visualViewport?.removeEventListener('resize', syncVisualViewport);
  window.visualViewport?.removeEventListener('scroll', syncVisualViewport);
  document.removeEventListener('focusin', onComposerFocusIn);
  const root = document.documentElement;
  root.style.removeProperty('--vv-offset-top');
  root.style.removeProperty('--vv-height');
  root.style.removeProperty('--vv-offset-bottom');
}
