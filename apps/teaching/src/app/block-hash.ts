/**
 * `#block=<id>` deep links (curriculum map stops that point at one activity):
 * once the lesson is on the page, scroll that block into view and mark it
 * briefly.
 */
export function readBlockHash(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw.startsWith('block=')) return undefined;
  return decodeURIComponent(raw.slice('block='.length)).trim() || undefined;
}

export function revealBlockFromHash(root: ParentNode, attempts = 20): void {
  const id = readBlockHash();
  if (!id || typeof requestAnimationFrame === 'undefined') return;
  const tryReveal = (left: number) => {
    const target = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
    if (!target) {
      if (left > 0) setTimeout(() => tryReveal(left - 1), 100);
      return;
    }
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.classList.add('block--linked');
    setTimeout(() => target.classList.remove('block--linked'), 2400);
  };
  requestAnimationFrame(() => tryReveal(attempts));
}
