/**
 * A tab opened before a deploy still asks for the old hashed chunks, which the
 * new deploy no longer serves (Safari: "Importing a module script failed").
 * Vite reports that as `vite:preloadError`; reload once to pick up the new
 * build. A second failure within a minute is a real fault, so let it surface.
 */
const KEY = 'life-hub:stale-chunk-reload';
const WINDOW_MS = 60_000;

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
  location.reload();
});
