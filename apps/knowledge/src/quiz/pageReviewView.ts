import { escapeHtml } from "../lib/dom";
import type { PageReview } from "./pageReview";

export function duePagesHtml(reviews: PageReview[]) {
  if (!reviews.length) return "";
  return `<section class="due-pages glass-panel" aria-labelledby="due-pages-label">
    <p class="page-header__eyebrow" id="due-pages-label">Due to revisit</p>
    <p class="due-pages__supporting">Old notes the same FSRS scheduler already uses for quiz cards.</p>
    <ul class="due-pages__list">
      ${reviews
        .map(
          review => `<li>
        <button class="due-pages__item" type="button" data-open-page="${escapeHtml(review.page_id)}">
          <span class="due-pages__title">${escapeHtml(review.title)}</span>
        </button>
      </li>`,
        )
        .join("")}
    </ul>
  </section>`;
}

export function pageReviewActionsHtml() {
  return `<section class="due-pages due-pages--rate glass-panel" aria-label="Rate this note">
    <p class="page-header__eyebrow">Still know this?</p>
    <p class="due-pages__supporting">Rates the whole note with the quiz scheduler.</p>
    <div class="due-pages__ratings">
      <button class="btn btn--ghost" type="button" data-page-rate="1">Again</button>
      <button class="btn btn--ghost" type="button" data-page-rate="2">Hard</button>
      <button class="btn btn--primary" type="button" data-page-rate="3">Good</button>
      <button class="btn btn--primary" type="button" data-page-rate="4">Easy</button>
    </div>
  </section>`;
}
