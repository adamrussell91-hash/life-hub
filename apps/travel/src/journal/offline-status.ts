import { subscribeJournalPendingCount } from '@/journal/offline-queue';

function formatOfflineStatus(offline: boolean, pending: number): string | null {
  if (!offline && pending === 0) return null;
  const parts: string[] = [];
  if (offline) parts.push('Offline');
  if (pending > 0) {
    parts.push(pending === 1 ? '1 edit waiting to sync' : `${pending} edits waiting to sync`);
  } else if (offline) {
    parts.push('Showing your trip from this device');
  }
  return parts.join(' · ');
}

/** Quiet status row — not a blocking modal (Codex offline UX). */
export function mountJournalOfflineStatus(host: HTMLElement): () => void {
  const row = document.createElement('p');
  row.className = 'journal-offline-status';
  row.setAttribute('role', 'status');
  row.hidden = true;
  host.prepend(row);

  let pending = 0;

  function paint(): void {
    const text = formatOfflineStatus(!navigator.onLine, pending);
    if (!text) {
      row.hidden = true;
      return;
    }
    row.hidden = false;
    row.textContent = text;
  }

  const unsubPending = subscribeJournalPendingCount((count) => {
    pending = count;
    paint();
  });
  const onConnectivity = (): void => paint();
  window.addEventListener('online', onConnectivity);
  window.addEventListener('offline', onConnectivity);
  paint();

  return () => {
    unsubPending();
    window.removeEventListener('online', onConnectivity);
    window.removeEventListener('offline', onConnectivity);
    row.remove();
  };
}
