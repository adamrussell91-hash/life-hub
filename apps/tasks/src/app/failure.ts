export const FAILURE = {
  network: 'Unable to load. Please refresh to try again.',
  unsupportedBlock: 'This block cannot be shown.',
  imageUnavailable: 'Image unavailable.',
  videoUnavailable: 'Video unavailable.',
  embedUnavailable: 'Embed unavailable.',
  aiRetry: 'AI is unavailable. You can try again.',
  aiStopped: 'AI request failed and cannot be retried.'
} as const;

export function aiFailureCopy(retryable?: boolean): string {
  return retryable === false ? FAILURE.aiStopped : FAILURE.aiRetry;
}

/**
 * Keep the server's reason visible. A bare "cannot be retried" leaves an
 * expired session, a missing draft and a provider rejection looking identical.
 */
export function aiErrorCopy(error: { code?: string; message?: string; retryable?: boolean }): string {
  if (error.code === 'unauthorized') {
    return 'Your session expired. Sign in again to keep using AI.';
  }
  const detail = error.message?.trim();
  if (!detail) return aiFailureCopy(error.retryable);
  const sentence = /[.!?]$/.test(detail) ? detail : `${detail}.`;
  return error.retryable === false
    ? `${sentence} This request cannot be retried.`
    : `${sentence} You can try again.`;
}

export function createSkipLink(targetId: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'skip-link';
  link.href = `#${targetId}`;
  link.textContent = 'Skip to content';
  return link;
}
