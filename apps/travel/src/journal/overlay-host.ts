/**
 * One owner for every journal overlay (sheets, chapter/search panels, maps).
 *
 * - Mounts the backdrop (with the sheet already inside it) on the anchor.
 * - Tapping the backdrop itself, Escape, or browser Back / iOS swipe-back
 *   dismisses only the top overlay. Dismiss may be guarded (unsaved edits):
 *   if the overlay is still open afterwards, its history entry is restored.
 * - Locks the page behind while anything is open so drags on the dim area
 *   do not scroll the journal.
 * - Restores focus to whatever opened the overlay.
 */

import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';

interface OverlayEntry {
  id: number;
  back: HTMLElement;
  dismiss: () => void;
  returnFocus: HTMLElement | null;
  hasHistory: boolean;
  release: () => void;
}

export interface JournalOverlayHandle {
  /** Remove the overlay. Safe to call more than once. */
  release(): void;
  /** True while this overlay is the top-most one. */
  isTop(): boolean;
}

export interface PresentJournalOverlayOptions {
  anchor: HTMLElement;
  /** Called for backdrop tap, Escape and Back. May decline (unsaved edits). */
  dismiss: () => void;
  /** Element to focus once mounted. */
  initialFocus?: HTMLElement | null;
  /** Skip the history entry (overlays that replace themselves instantly). */
  history?: boolean;
}

const HISTORY_KEY = 'journalOverlay';

let nextId = 1;
const stack: OverlayEntry[] = [];
let listening = false;
/** history.back() calls we issued that have not produced their popstate yet. */
let pendingPops = 0;
const deferredPushes: OverlayEntry[] = [];
let lockedScrollY = 0;
/** Page scroll restoration while overlay history entries exist (restored after). */
let savedScrollRestoration: ScrollRestoration | null = null;

function top(): OverlayEntry | undefined {
  return stack[stack.length - 1];
}

function pushEntry(entry: OverlayEntry): void {
  if (pendingPops > 0) {
    deferredPushes.push(entry);
    return;
  }
  try {
    // Popping our own entries must not make the browser jump the page back to
    // where it was when the sheet opened (e.g. after a chapter jump).
    if (savedScrollRestoration === null) {
      savedScrollRestoration = history.scrollRestoration;
      history.scrollRestoration = 'manual';
    }
    history.pushState({ ...(history.state ?? {}), [HISTORY_KEY]: entry.id }, '');
    entry.hasHistory = true;
  } catch {
    entry.hasHistory = false;
  }
}

function flushDeferred(): void {
  while (pendingPops === 0 && deferredPushes.length) {
    const entry = deferredPushes.shift()!;
    if (stack.includes(entry)) pushEntry(entry);
  }
}

function maybeRestoreScrollRestoration(): void {
  if (savedScrollRestoration === null || pendingPops > 0) return;
  if (stack.some((e) => e.hasHistory)) return;
  history.scrollRestoration = savedScrollRestoration;
  savedScrollRestoration = null;
}

function onPopState(): void {
  if (pendingPops > 0) {
    pendingPops -= 1;
    flushDeferred();
    maybeRestoreScrollRestoration();
    return;
  }
  const entry = top();
  if (!entry || !entry.hasHistory) return;
  entry.hasHistory = false;
  entry.dismiss();
  // Guarded dismiss kept it open (e.g. "Keep editing") — restore the entry so
  // the next Back still closes the sheet instead of leaving the journal.
  if (stack.includes(entry)) pushEntry(entry);
  maybeRestoreScrollRestoration();
}

function onKeyDown(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape') return;
  const entry = top();
  if (!entry) return;
  ev.preventDefault();
  ev.stopPropagation();
  entry.dismiss();
}

function lockScroll(): void {
  const body = document.body;
  lockedScrollY = window.scrollY;
  document.documentElement.classList.add('journal-overlay-open');
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
}

function unlockScroll(): void {
  const body = document.body;
  document.documentElement.classList.remove('journal-overlay-open');
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.width = '';
  window.scrollTo(0, lockedScrollY);
}

function ensureListeners(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', onPopState);
  document.addEventListener('keydown', onKeyDown, true);
}

export function journalOverlayOpenCount(): number {
  return stack.length;
}

export function presentJournalOverlay(
  back: HTMLElement,
  options: PresentJournalOverlayOptions,
): JournalOverlayHandle {
  ensureListeners();
  attachVisualViewportInset();
  const active = document.activeElement;
  const entry: OverlayEntry = {
    id: nextId++,
    back,
    dismiss: options.dismiss,
    returnFocus: active instanceof HTMLElement && active !== document.body ? active : null,
    hasHistory: false,
    release: () => undefined,
  };

  back.classList.add('journal-overlay');
  back.style.setProperty('--journal-overlay-depth', String(stack.length));
  back.addEventListener('click', (ev) => {
    if (ev.target === back && top() === entry) entry.dismiss();
  });

  if (stack.length === 0) lockScroll();
  stack.push(entry);
  options.anchor.append(back);
  if (options.history !== false) pushEntry(entry);
  options.initialFocus?.focus({ preventScroll: true });

  let released = false;
  const handle: JournalOverlayHandle = {
    isTop: () => top() === entry,
    release() {
      if (released) return;
      released = true;
      const idx = stack.indexOf(entry);
      if (idx >= 0) stack.splice(idx, 1);
      const deferredIdx = deferredPushes.indexOf(entry);
      if (deferredIdx >= 0) deferredPushes.splice(deferredIdx, 1);
      back.remove();
      if (entry.hasHistory && history.state?.[HISTORY_KEY] === entry.id) {
        entry.hasHistory = false;
        pendingPops += 1;
        history.back();
      }
      if (stack.length === 0) unlockScroll();
      if (entry.returnFocus?.isConnected) entry.returnFocus.focus({ preventScroll: true });
    },
  };
  entry.release = () => handle.release();
  return handle;
}

/**
 * Journal teardown (route change, re-render): ask each overlay to close, and
 * remove any that decline (their drafts are already autosaved on device).
 */
export function closeAllJournalOverlays(): void {
  for (const entry of [...stack].reverse()) {
    entry.dismiss();
    if (stack.includes(entry)) entry.release();
  }
}
