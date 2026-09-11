import { escapeHtml } from "../lib/dom";
import type { SavedConstellation, StarsNote } from "./schema";

export type PopoverController = {
  el: HTMLElement;
  showConstellation(item: SavedConstellation, anchor: HTMLElement, onOpen: (item: SavedConstellation) => void): void;
  showNote(note: StarsNote, anchor: HTMLElement): void;
  hideSoon(delay?: number): void;
  hideNow(): void;
};

export function createStarPopover(host: HTMLElement): PopoverController {
  const el = document.createElement("div");
  el.className = "stars-popover";
  el.hidden = true;
  host.appendChild(el);

  let hideTimer = 0;
  const cancelHide = () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = 0;
    }
  };
  el.addEventListener("pointerenter", cancelHide);
  el.addEventListener("pointerleave", () => hideSoon());
  el.addEventListener("focusin", cancelHide);
  el.addEventListener("focusout", event => {
    const next = event.relatedTarget as Node | null;
    if (next && el.contains(next)) return;
    hideSoon();
  });

  function hideSoon(delay = 160) {
    cancelHide();
    hideTimer = window.setTimeout(() => {
      el.hidden = true;
    }, delay);
  }

  function hideNow() {
    cancelHide();
    el.hidden = true;
  }

  function place(anchor: HTMLElement) {
    const hostRect = host.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    el.hidden = false;
    const width = el.offsetWidth || 220;
    const height = el.offsetHeight || 90;
    let left = anchorRect.left - hostRect.left + anchorRect.width / 2 - width / 2;
    let top = anchorRect.top - hostRect.top - height - 14;
    left = Math.max(8, Math.min(left, hostRect.width - width - 8));
    if (top < 8) top = anchorRect.bottom - hostRect.top + 14;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  return {
    el,
    showConstellation(item, anchor, onOpen) {
      cancelHide();
      el.className = "stars-popover is-interactive";
      el.innerHTML = `
        <p class="stars-popover__eyebrow">${item.notes.length} note${item.notes.length === 1 ? "" : "s"}</p>
        <h4>${escapeHtml(item.title)}</h4>
        <p class="stars-popover__meaning">${escapeHtml(item.symbol.meaning)}</p>
        <button type="button" class="stars-popover__open">Open constellation →</button>
      `;
      place(anchor);
      el.querySelector<HTMLButtonElement>(".stars-popover__open")!.onclick = event => {
        event.stopPropagation();
        onOpen(item);
      };
    },
    showNote(note, anchor) {
      cancelHide();
      el.className = "stars-popover";
      el.innerHTML = `<h4>${escapeHtml(note.title)}</h4><p class="stars-popover__meaning">${escapeHtml(note.role)}</p>`;
      place(anchor);
    },
    hideSoon,
    hideNow,
  };
}
