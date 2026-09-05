/** In-hub PDF viewer (pdf.js) with text-selection → highlight notes.
 * Full Hypothesis client can replace/augment this later; this owns Life Hub chrome
 * and a first-class highlight payload agents can cite.
 */

/**
 * @typedef {{
 *   page: number,
 *   quote: string,
 *   attachmentId?: string,
 *   title?: string,
 * }} HubPdfHighlight
 */

/**
 * @typedef {{
 *   src: string,
 *   title?: string,
 *   attachmentId?: string,
 *   initialPage?: number,
 *   onHighlight?: (highlight: HubPdfHighlight) => void | Promise<void>,
 *   onClose?: () => void,
 * }} OpenHubPdfViewerOptions
 */

/**
 * Normalize a highlight for storage / agent citation.
 * @param {unknown} raw
 * @returns {HubPdfHighlight | null}
 */
export function parsePdfHighlight(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const data = /** @type {Record<string, unknown>} */ (raw);
  const page = Number(data.page);
  const quote = typeof data.quote === 'string' ? data.quote.trim() : '';
  if (!Number.isFinite(page) || page < 1 || !quote) return null;
  /** @type {HubPdfHighlight} */
  const out = { page: Math.floor(page), quote };
  if (typeof data.attachmentId === 'string' && data.attachmentId.trim()) {
    out.attachmentId = data.attachmentId.trim();
  }
  if (typeof data.title === 'string' && data.title.trim()) {
    out.title = data.title.trim();
  }
  return out;
}

/**
 * Markdown block for a saved highlight (Knowledge body append).
 * @param {HubPdfHighlight} highlight
 */
export function formatPdfHighlightMarkdown(highlight) {
  const parsed = parsePdfHighlight(highlight);
  if (!parsed) return '';
  const source = parsed.title || parsed.attachmentId || 'PDF';
  return [
    '',
    `> **Highlight · p.${parsed.page} · ${source}**`,
    '>',
    `> ${parsed.quote.replace(/\n+/g, '\n> ')}`,
    ''
  ].join('\n');
}

/**
 * Open a pdf.js overlay. Lazy-loads pdfjs-dist.
 * @param {OpenHubPdfViewerOptions} opts
 * @returns {Promise<{ close: () => void, goToPage: (page: number) => Promise<void> } | null>}
 */
export async function openHubPdfViewer(opts) {
  if (!opts?.src || typeof document === 'undefined') return null;

  const pdfjs = await import('pdfjs-dist');
  const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;
  if (!getDocument) return null;

  // Worker from same package version (Vite/bundler resolves URL).
  try {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    if (pdfjs.GlobalWorkerOptions && worker?.default) {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    }
  } catch {
    // Tests / non-bundled: disable worker.
    if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = '';
  }

  ensurePdfViewerCss();

  const doc = document;
  const overlay = doc.createElement('div');
  overlay.className = 'hub-pdf-viewer';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', opts.title || 'PDF viewer');

  const chrome = doc.createElement('div');
  chrome.className = 'hub-pdf-viewer__chrome';

  const title = doc.createElement('h2');
  title.className = 'hub-pdf-viewer__title';
  title.textContent = opts.title || 'PDF';

  const pageLabel = doc.createElement('span');
  pageLabel.className = 'hub-pdf-viewer__page';
  pageLabel.textContent = '…';

  const prev = doc.createElement('button');
  prev.type = 'button';
  prev.className = 'btn btn--ghost';
  prev.textContent = 'Prev';

  const next = doc.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--ghost';
  next.textContent = 'Next';

  const highlightBtn = doc.createElement('button');
  highlightBtn.type = 'button';
  highlightBtn.className = 'btn btn--secondary';
  highlightBtn.textContent = 'Save highlight';
  highlightBtn.disabled = !opts.onHighlight;

  const download = doc.createElement('a');
  download.className = 'btn btn--ghost';
  download.href = opts.src;
  download.target = '_blank';
  download.rel = 'noopener noreferrer';
  download.textContent = 'Download';

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--primary';
  closeBtn.textContent = 'Close';

  chrome.append(title, prev, pageLabel, next, highlightBtn, download, closeBtn);

  const stage = doc.createElement('div');
  stage.className = 'hub-pdf-viewer__stage';
  const canvas = doc.createElement('canvas');
  canvas.className = 'hub-pdf-viewer__canvas';
  const textLayer = doc.createElement('div');
  textLayer.className = 'hub-pdf-viewer__text textLayer';
  stage.append(canvas, textLayer);

  const hint = doc.createElement('p');
  hint.className = 'hub-pdf-viewer__hint';
  hint.textContent = opts.onHighlight
    ? 'Select text, then Save highlight to attach a citable quote to the note.'
    : 'Select text to copy. Download for the original file.';

  overlay.append(chrome, stage, hint);
  doc.body.append(overlay);
  doc.body.classList.add('hub-pdf-viewer-open');

  let pdfDoc = null;
  let pageNumber = Math.max(1, opts.initialPage || 1);
  let closed = false;
  let renderTask = null;

  async function renderPage(num) {
    if (!pdfDoc || closed) return;
    pageNumber = Math.min(Math.max(1, num), pdfDoc.numPages);
    pageLabel.textContent = `${pageNumber} / ${pdfDoc.numPages}`;
    prev.disabled = pageNumber <= 1;
    next.disabled = pageNumber >= pdfDoc.numPages;

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.25 });
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    if (renderTask) {
      try {
        renderTask.cancel();
      } catch {
        /* ignore */
      }
    }
    renderTask = page.render({ canvasContext: context, viewport });
    await renderTask.promise;

    textLayer.replaceChildren();
    textLayer.style.width = `${viewport.width}px`;
    textLayer.style.height = `${viewport.height}px`;
    const textContent = await page.getTextContent();
    // Lightweight text layer: selectable spans positioned approximately.
    // Good enough for highlight quotes; Hypothesis can replace for full fidelity.
    for (const item of textContent.items || []) {
      if (!item || typeof item.str !== 'string' || !item.str) continue;
      const span = doc.createElement('span');
      span.textContent = item.str + (item.hasEOL ? '\n' : ' ');
      span.style.left = `${item.transform?.[4] ?? 0}px`;
      span.style.top = `${viewport.height - (item.transform?.[5] ?? 0)}px`;
      span.style.fontSize = `${Math.abs(item.transform?.[0] || 12)}px`;
      textLayer.append(span);
    }
  }

  async function goToPage(page) {
    await renderPage(page);
  }

  function close() {
    if (closed) return;
    closed = true;
    try {
      renderTask?.cancel?.();
    } catch {
      /* ignore */
    }
    pdfDoc?.destroy?.();
    overlay.remove();
    doc.body.classList.remove('hub-pdf-viewer-open');
    opts.onClose?.();
  }

  prev.addEventListener('click', () => void renderPage(pageNumber - 1));
  next.addEventListener('click', () => void renderPage(pageNumber + 1));
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  highlightBtn.addEventListener('click', () => {
    const quote = String(doc.getSelection?.()?.toString() || '').trim();
    if (!quote || !opts.onHighlight) return;
    const highlight = parsePdfHighlight({
      page: pageNumber,
      quote,
      attachmentId: opts.attachmentId,
      title: opts.title
    });
    if (!highlight) return;
    void opts.onHighlight(highlight);
    hint.textContent = `Saved highlight from page ${highlight.page}.`;
  });

  try {
    const loading = getDocument({ url: opts.src, withCredentials: true });
    pdfDoc = await loading.promise;
    await renderPage(pageNumber);
  } catch (error) {
    hint.textContent =
      error instanceof Error ? error.message : 'Could not open PDF. Try Download.';
  }

  closeBtn.focus();
  return { close, goToPage };
}

function ensurePdfViewerCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('hub-pdf-viewer-css')) return;
  const link = document.createElement('link');
  link.id = 'hub-pdf-viewer-css';
  link.rel = 'stylesheet';
  link.href = new URL('../hub-pdf-viewer.css', import.meta.url).href;
  document.head.append(link);
}
