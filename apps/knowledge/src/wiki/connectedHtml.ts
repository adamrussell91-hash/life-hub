import { hrefForHubRef, labelForHubRef, parseHubRef } from "../domain/hub-ref";
import { escapeHtml } from "../lib/dom";
import { connectedDisplayRefs } from "./connectedRelationships";

export function connectedLinksHtml(
  page: { connected?: string[] },
  entries: { id: string; title: string }[],
  options: {
    relationships?: Array<{ legacy_hub_ref?: string | null; target_ref?: string }> | null;
  } = {},
): string {
  const ids = connectedDisplayRefs({
    legacyConnected: page.connected ?? [],
    relationships: options.relationships ?? null
  });
  if (!ids.length) return "";
  return `<section class="wiki-links" aria-label="Connected">
              <h3>Connected</h3>
              <ul>${ids
                .map(id => connectedItemHtml(id, entries))
                .join("")}</ul>
            </section>`;
}

function connectedItemHtml(id: string, entries: { id: string; title: string }[]): string {
  const ref = parseHubRef(id);
  if (ref && ref.hub !== "knowledge") {
    const href = hrefForHubRef(ref);
    if (href) {
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(labelForHubRef(ref))}</a></li>`;
    }
  }
  const pageId = ref?.hub === "knowledge" ? ref.id : id;
  const title = entries.find(entry => entry.id === pageId)?.title ?? pageId;
  return `<li><button type="button" data-open-page="${escapeHtml(pageId)}">${escapeHtml(title)}</button></li>`;
}
