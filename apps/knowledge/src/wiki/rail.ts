import { curatorAction, listCuratorReview, WIKI_NEEDS_NETLIFY, USE_LOCAL_DATA } from "../api/wikiClient";
import { isCrossBookPair } from "../curator/crossBook";
import { confidencePercent, pairKey, type AutoApproved, type PendingProposal } from "../curator/schema";
import { escapeHtml } from "../lib/dom";
import { hubUtilitiesActionsHtml, titleRowHtml } from "../lib/hubChrome";

export type WikiRailHost = {
  app: HTMLElement;
  shell: (main: string) => void;
  render: () => void;
  onOpenPage?: (pageId: string) => void;
};

let pending: PendingProposal[] = [];
let autoApproved: AutoApproved[] = [];
let busy = false;
let wikiError = "";
let needQueue = true;
let queueLoading = false;
let queueLoaded = false;
let mounted = false;

export function enterWikiRail() {
  needQueue = true;
}

export function leaveWikiRail() {
  mounted = false;
}

function wikiVisible() {
  return mounted && Boolean(document.querySelector("section.wiki"));
}

function failMessage(error: unknown) {
  return error instanceof Error && error.message === WIKI_NEEDS_NETLIFY
    ? error.message
    : error instanceof Error
      ? error.message
      : "Wiki update failed";
}

function ensureQueue(host: WikiRailHost) {
  if (USE_LOCAL_DATA || queueLoading || !needQueue) return;
  needQueue = false;
  queueLoading = true;
  busy = true;
  wikiError = "";
  void listCuratorReview()
    .then(review => {
      pending = review.pending;
      autoApproved = review.autoApproved;
    })
    .catch((error: unknown) => {
      if (!wikiError) wikiError = failMessage(error);
      pending = [];
      autoApproved = [];
    })
    .finally(() => {
      queueLoading = false;
      queueLoaded = true;
      busy = false;
      if (wikiVisible()) host.render();
    });
}

async function runAction(
  host: WikiRailHost,
  action: "approve" | "dismiss" | "approve-all" | "dismiss-all" | "unlink" | "run",
  id?: string,
) {
  if (busy) return;
  busy = true;
  wikiError = "";
  host.render();
  try {
    const result = await curatorAction(action, id);
    if (action === "run") {
      wikiError = "Curator queued. Proposals appear after the Action finishes.";
    } else if (result.pending) {
      pending = result.pending;
      if (result.autoApproved) autoApproved = result.autoApproved;
    } else {
      const review = await listCuratorReview();
      pending = review.pending;
      autoApproved = review.autoApproved;
    }
  } catch (error) {
    wikiError = failMessage(error);
  } finally {
    busy = false;
    host.render();
  }
}

function byConfidence(items: PendingProposal[]) {
  return [...items].sort((left, right) => {
    const leftScore = typeof left.confidence === "number" ? left.confidence : -1;
    const rightScore = typeof right.confidence === "number" ? right.confidence : -1;
    return rightScore - leftScore;
  });
}

function relationLine(item: PendingProposal) {
  const percent = confidencePercent(item.confidence);
  const cross = isCrossBookPair(item.bookA, item.bookB);
  return `<p class="wiki-card__relation">${escapeHtml(item.relation)}${percent ? ` · ${percent}` : ""}${
    cross ? `<span class="wiki-card__tag">Cross-book</span>` : ""
  }</p>`;
}

function noteButton(id: string, title: string, excerpt: string, book?: string) {
  return `<button type="button" data-open-page="${escapeHtml(id)}">
            <strong>${escapeHtml(title)}</strong>
            ${book ? `<em class="wiki-card__book">${escapeHtml(book)}</em>` : ""}
            ${excerpt ? `<span>${escapeHtml(excerpt)}</span>` : ""}
          </button>`;
}

function cardsHtml() {
  if (busy && !pending.length) return `<p class="empty">Loading proposals…</p>`;
  if (!busy && !pending.length) {
    return `<p class="empty">No pending links. Run now after you capture, or wait for the nightly pass.</p>`;
  }
  return byConfidence(pending)
    .map(item => {
      const cross = isCrossBookPair(item.bookA, item.bookB);
      return `<article class="glass-panel wiki-card">
                  ${relationLine(item)}
                  <div class="wiki-card__pair">
                    ${noteButton(item.noteA, item.titleA, item.excerptA, cross ? item.bookA : undefined)}
                    ${noteButton(item.noteB, item.titleB, item.excerptB, cross ? item.bookB : undefined)}
                  </div>
                  <p class="wiki-card__why">${escapeHtml(item.rationale)}</p>
                  <div class="alchemist__actions">
                    <button type="button" class="btn btn--primary" data-wiki-approve="${escapeHtml(item.id)}" ${busy ? "disabled" : ""}>Approve</button>
                    <button type="button" class="btn btn--ghost" data-wiki-dismiss="${escapeHtml(item.id)}" ${busy ? "disabled" : ""}>Dismiss</button>
                  </div>
                </article>`;
    })
    .join("");
}

function autoHtml() {
  const rows = [...autoApproved].slice(-50).reverse();
  const body = rows.length
    ? rows
        .map(row => {
          const percent = confidencePercent(row.confidence);
          const cross = isCrossBookPair(row.bookA, row.bookB);
          return `<article class="glass-panel wiki-card">
                    <p class="wiki-card__relation">${escapeHtml(row.relation)}${percent ? ` · ${percent}` : ""}${
                      cross ? `<span class="wiki-card__tag">Cross-book</span>` : ""
                    }</p>
                    <div class="wiki-card__pair">
                      ${noteButton(row.noteA, row.titleA, "", row.bookA)}
                      ${noteButton(row.noteB, row.titleB, "", row.bookB)}
                    </div>
                    <p class="wiki-card__why">${escapeHtml(row.rationale)}</p>
                    <div class="alchemist__actions">
                      <button type="button" class="btn btn--secondary" data-wiki-unlink="${escapeHtml(pairKey(row.noteA, row.noteB))}" ${busy ? "disabled" : ""}>Unlink</button>
                    </div>
                  </article>`;
        })
        .join("")
    : `<p class="empty">Nothing auto-approved yet.</p>`;
  return `<details class="wiki-auto"><summary>Auto-approved</summary>${body}</details>`;
}

function bind(host: WikiRailHost) {
  host.app.querySelector<HTMLButtonElement>("[data-wiki-run]")?.addEventListener("click", () => {
    void runAction(host, "run");
  });
  host.app.querySelector<HTMLButtonElement>("[data-wiki-approve-all]")?.addEventListener("click", () => {
    void runAction(host, "approve-all");
  });
  host.app.querySelector<HTMLButtonElement>("[data-wiki-dismiss-all]")?.addEventListener("click", () => {
    void runAction(host, "dismiss-all");
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-wiki-approve]").forEach(button => {
    button.onclick = () => void runAction(host, "approve", button.dataset.wikiApprove);
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-wiki-dismiss]").forEach(button => {
    button.onclick = () => void runAction(host, "dismiss", button.dataset.wikiDismiss);
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-wiki-unlink]").forEach(button => {
    button.onclick = () => void runAction(host, "unlink", button.dataset.wikiUnlink);
  });
  host.app.querySelectorAll<HTMLButtonElement>("[data-open-page]").forEach(button => {
    button.onclick = () => host.onOpenPage?.(button.dataset.openPage!);
  });
}

export function renderWikiRail(host: WikiRailHost) {
  mounted = true;
  ensureQueue(host);
  host.shell(`
    ${USE_LOCAL_DATA ? `<p class="local-banner">Local preview · Wiki proposals need the Netlify API (session) and the data repo.</p>` : ""}
    <header class="topbar page-header">
      <div class="page-header__copy">
        <p class="eyebrow page-header__eyebrow">Self-maintaining wiki</p>
        ${titleRowHtml("Wiki")}
      </div>
      ${hubUtilitiesActionsHtml()}
    </header>
    <section class="alchemist wiki">
      <div class="alchemist__actions">
        <button type="button" class="btn btn--primary" data-wiki-run ${busy ? "disabled" : ""}>Run now</button>
        ${
          pending.length
            ? `<button type="button" class="btn btn--secondary" data-wiki-approve-all ${busy ? "disabled" : ""}>Approve all</button>
               <button type="button" class="btn btn--ghost" data-wiki-dismiss-all ${busy ? "disabled" : ""}>Dismiss all</button>`
            : ""
        }
      </div>
      ${wikiError ? `<p class="alchemist__error">${escapeHtml(wikiError)}</p>` : ""}
      ${cardsHtml()}
      ${queueLoaded ? autoHtml() : ""}
    </section>
  `);
  bind(host);
}
