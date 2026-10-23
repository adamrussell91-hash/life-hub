/**
 * The hidden door to the Arches Atlas in Travel. Maccas never shows in the
 * Food Journal; typing "maccas" into a search, or long-pressing the
 * masthead, opens the Atlas instead.
 */
export const ATLAS_URL = "/travel/#/atlas";
const LONG_PRESS_MS = 650;
const MOVE_TOLERANCE = 10;

export function isAtlasDoor(query) {
  return String(query || "").trim().toLowerCase() === "maccas";
}

export function openAtlas(win = window) {
  win.location.assign(ATLAS_URL);
}

/** Calls `onPress` after a held press; a scroll, move or early release cancels it. */
export function bindLongPress(node, onPress, ms = LONG_PRESS_MS) {
  let timer = null;
  let start = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    start = null;
  };
  node.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onPress();
    }, ms);
  });
  node.addEventListener("pointermove", (e) => {
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel();
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    node.addEventListener(type, cancel);
  }
  // A held touch opens the system menu otherwise.
  node.addEventListener("contextmenu", (e) => e.preventDefault());
  return cancel;
}
