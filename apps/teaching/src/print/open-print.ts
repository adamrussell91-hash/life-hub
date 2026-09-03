import { renderPrintLesson } from '@/print/render-print-lesson';
import type { Lesson } from '@/schemas/lesson';

// Matches package.json katex version; used when no bundled stylesheet href is found.
const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css';

const PRINT_CSS = `
  @page { size: A4 portrait; margin: 15mm; }
  html, body { margin: 0; padding: 0; }
  .print-document {
    box-sizing: border-box;
    width: auto;
    min-height: auto;
    padding: 0;
    background: #fff;
    color: #111;
    box-shadow: none;
  }
  .print-document__title {
    font-size: 1.5rem;
    margin: 0 0 1rem;
  }
  .block {
    margin-bottom: 0.75rem;
  }
  img {
    max-width: 100%;
    height: auto;
  }
  .block-table,
  .block-chart__table {
    border-collapse: collapse;
    width: 100%;
  }
  .block-table th,
  .block-table td,
  .block-chart__table th,
  .block-chart__table td {
    border: 1px solid #ccc;
    padding: 0.25rem 0.5rem;
  }
  .block-question-set__response-lines {
    margin-top: 0.5rem;
  }
  .block-question-set__line {
    border-bottom: 1px solid #333;
    height: 1.5rem;
  }
  .block-print-fallback {
    border: 1px solid #ccc;
    padding: 0.5rem 0.75rem;
  }
  .block-columns--print-stack {
    display: flex !important;
    flex-direction: column;
    gap: 0.75rem;
    grid-template-columns: none;
  }
  .block-flashcards__controls,
  .block-cloze__controls,
  .block-self-check__controls,
  .block-gallery__controls,
  .block-gallery__nav { display: none !important; }
  .block-flashcards__print,
  .block-cloze__print,
  .block-self-check__print { display: block !important; }
`;

function katexStylesheetHref(): string | null {
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const href = link.getAttribute('href');
    if (href && /katex/i.test(href)) return href;
  }
  return KATEX_CSS_URL;
}

async function waitForImages(docEl: HTMLElement, timeoutMs = 1500): Promise<void> {
  const images = Array.from(docEl.querySelectorAll('img'));
  if (images.length === 0) return;

  await Promise.race([
    Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
      )
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    })
  ]);
}

function writePrintDocument(doc: Document, lesson: Lesson): HTMLElement {
  const docEl = renderPrintLesson(lesson);

  const title = doc.createElement('title');
  title.textContent = lesson.title.trim() || 'Print';
  doc.head.append(title);

  const katexHref = katexStylesheetHref();
  if (katexHref) {
    const katexLink = doc.createElement('link');
    katexLink.rel = 'stylesheet';
    katexLink.href = katexHref;
    doc.head.append(katexLink);
  }

  const style = doc.createElement('style');
  style.textContent = PRINT_CSS;
  doc.head.append(style);

  doc.body.replaceChildren(docEl);
  return docEl;
}

function printLessonPopup(lesson: Lesson): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('Allow pop-ups to print this lesson.');
    return;
  }
  try {
    printWindow.opener = null;
  } catch {
    /* some environments expose opener as read-only */
  }

  const docEl = writePrintDocument(printWindow.document, lesson);
  void (async () => {
    await waitForImages(docEl);
    printWindow.focus();
    printWindow.print();
  })();
}

export function openPrintLesson(lesson: Lesson): void {
  document.querySelector('[data-print-modal="backdrop"]')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'create-modal-backdrop';
  backdrop.dataset.printModal = 'backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'create-modal glass-panel glass-tile print-modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'print-modal-title');

  const heading = document.createElement('h2');
  heading.id = 'print-modal-title';
  heading.className = 'create-modal__title';
  heading.textContent = 'Print';

  const viewport = document.createElement('div');
  viewport.className = 'print-modal__viewport';
  viewport.append(renderPrintLesson(lesson));

  const footer = document.createElement('div');
  footer.className = 'create-modal__footer';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost';
  closeBtn.dataset.printModalAction = 'close';
  closeBtn.textContent = 'Close';

  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.className = 'btn btn--decisive';
  printBtn.dataset.printModalAction = 'print';
  printBtn.textContent = 'Print';

  footer.append(closeBtn, printBtn);
  dialog.append(heading, viewport, footer);
  backdrop.append(dialog);
  document.body.append(backdrop);

  const close = (): void => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  closeBtn.addEventListener('click', () => close());
  printBtn.addEventListener('click', () => printLessonPopup(lesson));
}
