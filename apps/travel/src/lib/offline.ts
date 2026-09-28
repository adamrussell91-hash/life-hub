/** Registers the Travel service worker (TR-54) and exposes a small offline
 * banner helper (TR-55). ponytail: the SW itself is a minimal network-first /
 * hashed-asset cache — tile pre-saving (TR-56/57) is not wired here yet. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env?.MODE === 'test') return;

  // No reload on controllerchange: HTML is network-first, so this document is
  // already current. A reload here re-ran the whole boot (bundle + session +
  // trips + trip) on every first visit. Stale-shell upgrades are handled by
  // sw.js activate, which navigates only when an older shell cache existed.
  void navigator.serviceWorker.register('/travel/sw.js', { scope: '/travel/' }).catch(() => {
    /* offline support degrades gracefully without a worker */
  });
}

export function mountOfflineBanner(root: HTMLElement): () => void {
  const banner = document.createElement('div');
  banner.className = 'toast';
  banner.hidden = true;
  root.append(banner);

  function update(): void {
    const offline = !navigator.onLine;
    banner.hidden = !offline;
    if (offline) {
      const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      banner.textContent = `Offline · showing your trip as of ${now}`;
    }
  }
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}

export function isOffline(): boolean {
  return !navigator.onLine;
}
