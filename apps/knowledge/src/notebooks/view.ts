import { closeActiveMorphingDialog, openMorphingDialog } from "../../design-kit/js/morphing-dialog.js";
import { cardSupportingText } from "../archive/cardText";
import { escapeHtml } from "../lib/dom";
import type { NotebookCard, NotebookNote } from "./catalog";

function coverHtml(card: NotebookCard, className: string) {
  if (card.image) {
    return `<img class="${className}" data-hub-morph="image" src="${escapeHtml(card.image)}" alt="" />`;
  }
  return `<div class="${className} nb-card__image--empty" data-hub-morph="image" role="presentation"></div>`;
}

export function notebookCardHtml(card: NotebookCard) {
  return `<button class="nb-card" type="button" data-notebook="${escapeHtml(card.label)}">
    ${coverHtml(card, "nb-card__image")}
    <span class="nb-card__copy">
      <span class="nb-card__eyebrow" data-hub-morph="subtitle">Notebook</span>
      <span class="nb-card__title" data-hub-morph="title">${escapeHtml(card.label)}</span>
    </span>
  </button>`;
}

export function notebooksGridHtml(cards: NotebookCard[]) {
  return `<div class="nb-grid" data-notebooks-grid>${cards.map(notebookCardHtml).join("")}</div>`;
}

export function notebookOpenHtml(card: NotebookCard, notes: NotebookNote[]) {
  const list = notes.length
    ? notes
        .map(note => {
          const supporting = cardSupportingText(note.title, note.excerpt);
          return `<button class="nb-note" type="button" data-open-page="${escapeHtml(note.id)}">
          <span class="nb-note__title">${escapeHtml(note.title)}</span>
          ${supporting ? `<span class="nb-note__excerpt">${escapeHtml(supporting)}</span>` : ""}
        </button>`;
        })
        .join("")
    : `<p class="nb-open__empty">No notes in this notebook yet.</p>`;
  const count = `${card.count} ${card.count === 1 ? "note" : "notes"}`;
  return `<header class="nb-open__hero">
      ${coverHtml(card, "nb-open__image")}
      <div class="nb-open__copy">
        <p class="nb-card__eyebrow" data-hub-morph="subtitle">Notebook</p>
        <h2 class="nb-card__title" id="nb-open-${escapeHtml(card.slug)}" data-hub-morph="title">${escapeHtml(card.label)}</h2>
        <p class="nb-open__count">${count}</p>
      </div>
    </header>
    <div class="nb-open__notes">${list}</div>`;
}

export function bindNotebooksGrid(
  root: ParentNode,
  cards: NotebookCard[],
  notesFor: (label: string) => NotebookNote[],
  onOpenNote: (id: string) => void,
) {
  root.querySelectorAll<HTMLButtonElement>("[data-notebook]").forEach(button => {
    button.onclick = () => {
      const label = button.dataset.notebook ?? "";
      const card = cards.find(item => item.label === label);
      if (!card) return;
      const frame = document.createElement("div");
      frame.className = "nb-open";
      frame.innerHTML = notebookOpenHtml(card, notesFor(label));
      openMorphingDialog({
        trigger: button,
        frame,
        backdropClass: "nb-open-dialog",
        labelledBy: `nb-open-${card.slug}`,
      });
      frame.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(noteBtn => {
        noteBtn.onclick = () => {
          closeActiveMorphingDialog();
          onOpenNote(noteBtn.dataset.openPage!);
        };
      });
    };
  });
}
