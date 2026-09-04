function syncKeyboardInset() {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  if (!viewport) {
    root.style.setProperty("--keyboard-inset", "0px");
    root.style.removeProperty("--vv-offset-top");
    root.style.removeProperty("--vv-height");
    root.style.removeProperty("--vv-offset-bottom");
    return;
  }
  const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
  root.style.setProperty("--keyboard-inset", `${inset}px`);
  // Same visual-viewport frame Tasks Hub uses for fullscreen mobile chat.
  root.style.setProperty("--vv-offset-top", `${viewport.offsetTop}px`);
  root.style.setProperty("--vv-height", `${viewport.height}px`);
  root.style.setProperty("--vv-offset-bottom", `${inset}px`);
}

let bound = false;

export function bindKeyboardInset() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  const viewport = window.visualViewport;
  if (!viewport) {
    document.documentElement.style.setProperty("--keyboard-inset", "0px");
    return;
  }
  viewport.addEventListener("resize", syncKeyboardInset);
  viewport.addEventListener("scroll", syncKeyboardInset);
  syncKeyboardInset();
}
