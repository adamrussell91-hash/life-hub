import { escapeHtml } from "../lib/dom";
import type { KnowledgeIntakeJob } from "../api/client";

function excerpt(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 280 ? `${trimmed.slice(0, 277).trimEnd()}…` : trimmed;
}

export function intakeReviewHtml(job: KnowledgeIntakeJob): string {
  const proposal = job.proposal;
  if (!proposal) return "";
  const title = proposal.title || job.extracted_title || "Untitled";
  const tags = proposal.tags.join(", ");
  return `<section class="confirm-card" role="region" aria-label="Confirm clean up" data-intake-review>
        <p class="page-header__eyebrow">Proposed write</p>
        <h2 class="page-header__title" style="font-size: var(--text-lg)">Review clean up</h2>
        <p class="page-header__supporting">Queued → extracting → classifying → awaiting review. Confirm writes the note.</p>
        <p class="reader__intake-title">${escapeHtml(title)}</p>
        <p class="reader__intake-tags">${escapeHtml(tags)}</p>
        <p class="reader__intake-body">${escapeHtml(excerpt(proposal.body))}</p>
        <div class="confirm-card__actions">
          <button class="btn btn--ghost" data-tidy-discard type="button">Discard</button>
          <button class="btn btn--primary" data-tidy-confirm type="button">Confirm</button>
        </div>
      </section>`;
}

export function intakeBusyLabel(phase?: string): string {
  if (phase === "extracting") return "Extracting…";
  if (phase === "classifying") return "Classifying…";
  if (phase === "queued") return "Queued…";
  return "Cleaning up…";
}
