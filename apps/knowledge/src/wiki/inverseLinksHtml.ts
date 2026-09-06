import { escapeHtml } from "../lib/dom";

export type InverseLink = {
  id: string;
  title?: string;
};

export function inverseLinksHtml(
  links: InverseLink[] | undefined,
  status?: string | null,
): string {
  if (status === "unavailable") {
    return `<section class="wiki-links inverse-links" aria-label="What points here">
              <h3>What points here</h3>
              <p class="inverse-links__unavailable">Inbound links are unavailable.</p>
            </section>`;
  }
  const list = Array.isArray(links) ? links.filter(item => item?.id) : [];
  if (!list.length) return "";
  return `<section class="wiki-links inverse-links" aria-label="What points here">
              <h3>What points here</h3>
              <ul>${list
                .map(item => {
                  const title = item.title || item.id;
                  return `<li><button type="button" data-open-page="${escapeHtml(item.id)}">${escapeHtml(title)}</button></li>`;
                })
                .join("")}</ul>
            </section>`;
}
