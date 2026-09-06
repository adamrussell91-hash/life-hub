import { escapeHtml } from "../lib/dom";

export type UrlWatch = {
  url: string;
  status?: string;
};

function statusLabel(status?: string) {
  if (status === "changed") return "Changed";
  if (status === "unchanged") return "Unchanged";
  return "Unavailable";
}

export function urlWatchHtml(
  watches: UrlWatch[] | undefined,
  status?: string | null,
): string {
  if (status === "unavailable") {
    return `<section class="wiki-links url-watches" aria-label="External URL watch">
              <h3>External URL watch</h3>
              <p class="url-watches__unavailable">URL watch is unavailable.</p>
            </section>`;
  }
  const list = Array.isArray(watches) ? watches.filter(item => item?.url) : [];
  if (!list.length) return "";
  return `<section class="wiki-links url-watches" aria-label="External URL watch">
              <h3>External URL watch</h3>
              <ul>${list
                .map(item => {
                  const state = statusLabel(item.status);
                  const kind = item.status === "changed" || item.status === "unchanged" ? item.status : "unavailable";
                  return `<li data-watch-status="${escapeHtml(kind)}"><a href="${escapeHtml(item.url)}">${escapeHtml(item.url)}</a> — ${escapeHtml(state)}</li>`;
                })
                .join("")}</ul>
            </section>`;
}
