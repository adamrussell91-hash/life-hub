import type { Block } from '@/schemas/block';
import { button, el } from '@/blocks/peer-feedback-ui';

export type BrainstormBlock = Extract<Block, { block_type: 'brainstorm' }>;

const POLL_MS = 5000;

/** Runs `tick` now and every few seconds while the block is on the page and the tab is visible. */
export function poller(root: HTMLElement, tick: () => Promise<void>): void {
  let timer: number | undefined;
  const onVisible = () => {
    if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
    if (!document.hidden) void tick();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
      if (!document.hidden) await tick();
      schedule();
    }, POLL_MS);
  };
  document.addEventListener('visibilitychange', onVisible);
  void tick().finally(schedule);
}

export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** The join code, full screen, for the projector. */
export function showCodeOverlay(code: string): void {
  const overlay = el('div', 'pf-board');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Brainstorm code');
  const close = button('Close', 'secondary', () => dismiss());
  overlay.append(el('p', 'pf-board__label', 'Open the lesson and type this code'), el('p', 'pf-board__code', formatCode(code)), close);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };
  function dismiss(): void {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  close.focus();
}
