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

let attached = false;

export function attachVisualViewportInset(): void {
  if (attached) return;
  attached = true;
  syncVisualViewport();
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);
}

export function detachVisualViewportInset(): void {
  if (!attached) return;
  attached = false;
  window.visualViewport?.removeEventListener('resize', syncVisualViewport);
  window.visualViewport?.removeEventListener('scroll', syncVisualViewport);
  const root = document.documentElement;
  root.style.removeProperty('--vv-offset-top');
  root.style.removeProperty('--vv-height');
  root.style.removeProperty('--vv-offset-bottom');
}
