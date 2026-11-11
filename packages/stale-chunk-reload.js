/**
 * A tab opened before a deploy still asks for the old hashed chunks, which the
 * new deploy no longer serves (Safari: "Importing a module script failed").
 * Vite reports that as `vite:preloadError`; reload once to pick up the new
 * build. A second failure within a minute is a real fault, so let it surface.
 *
 * GitHub Pages lets browsers keep the HTML for ten minutes, so a plain reload
 * can bring back the same old page and the same missing chunks. Fetch the page
 * past the HTTP cache first, so the reload gets the new HTML and its bundle.
 */
const KEY = 'life-hub:stale-chunk-reload';
const WINDOW_MS = 60_000;
const FRESH_WAIT_MS = 4_000;

/** Ask for the page past the cache; the browser keeps the fresh copy for the reload. */
export function refreshPageCache(fetchImpl = globalThis.fetch, href = location.href, waitMs = FRESH_WAIT_MS) {
  if (typeof fetchImpl !== 'function') return Promise.resolve();
  const fresh = fetchImpl(href, { cache: 'reload', credentials: 'same-origin' }).then(
    () => undefined,
    () => undefined
  );
  // Never let a slow network hold the reload back for long.
  let timer;
  const cap = new Promise((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  return Promise.race([fresh, cap]).finally(() => clearTimeout(timer));
}

window.addEventListener('vite:preloadError', () => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    return;
  }
  if (Date.now() - last < WINDOW_MS) return;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  void refreshPageCache().then(() => location.reload());
});
