// apps/tasks/src/views/thinking/view.ts
// The #/think route: the front door, or one thread at #/think/<id> (a Thought Starter or protocol
// detour opens at #/think/<id>?detour=<sessionId>).
import './thinking.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { renderLoadError } from '@/views/feedback';
import { renderFrontDoor } from './front-door';
import { renderThreadView } from './thread-view';

let cleanup: (() => void) | null = null;

/** Leaving the page (or opening another thread): stop polling and drop listeners. */
export function unmountThinkView(): void {
  cleanup?.();
  cleanup = null;
}

/** The thread id in `#/think/<id>?…`, or null for the front door. */
export function threadIdFromHash(hash = location.hash): string | null {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/');
  return parts[0] === 'think' && parts[1] ? decodeURIComponent(parts[1]) : null;
}

export async function renderThinkView(canvas: HTMLElement): Promise<void> {
  unmountThinkView();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = threadIdFromHash();
  try {
    if (id) cleanup = await renderThreadView(canvas, id, hashQuery().get('detour'));
    else await renderFrontDoor(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderThinkView(canvas), 'Could not load Think it through');
  }
}
