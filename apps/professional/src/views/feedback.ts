import { ApiClientError } from '@/api/client';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** People/Organisations/Person/Organisation pages share these outcomes for a
 * recoverable load failure — authentication, network, and server errors all
 * get an honest message and a retry, never a raw stack trace. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'unauthenticated' || err.status === 401) return 'Your session expired. Refresh and sign in again.';
    if (err.code === 'network_error' || err.code === 'timeout') return 'Could not reach the network.';
    if (err.status === 404 || err.code === 'entity_not_found') return 'Not found.';
    if (typeof err.status === 'number' && err.status >= 500) return 'The server could not complete this request.';
    return err.message || 'Request failed.';
  }
  return err instanceof Error && err.message.trim() ? err.message : 'Request failed.';
}

export function showViewLoading(host: HTMLElement, message: string): void {
  host.replaceChildren(el('p', 'canvas-status', message));
}

export function renderLoadError(host: HTMLElement, err: unknown, onRetry: () => void): void {
  host.replaceChildren();
  host.append(el('p', 'empty-state', errorMessage(err)));
  const retry = el('button', 'btn btn--secondary', 'Retry');
  retry.type = 'button';
  retry.addEventListener('click', onRetry);
  host.append(retry);
}

export function renderEmptyState(host: HTMLElement, message: string): void {
  host.replaceChildren(el('p', 'empty-state', message));
}
