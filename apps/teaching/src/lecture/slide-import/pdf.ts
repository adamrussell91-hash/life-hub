// apps/teaching/src/lecture/slide-import/pdf.ts

/** A PDF export of the deck, one page per slide, drawn to canvases on demand. */
export type PdfDeck = {
  pageCount: number;
  /** Draws a 1-based page at `width` CSS pixels wide (never wider than `maxScale` × its own size). */
  render(page: number, width: number): Promise<HTMLCanvasElement>;
  destroy(): void;
};

/** Slide pictures go up at this width: sharp on a projector, well under the upload limit as JPEG. */
export const SLIDE_WIDTH = 1920;

type PdfJs = typeof import('pdfjs-dist');

let loading: Promise<PdfJs> | null = null;

/** Lazy, like the PDF viewer: pdf.js only loads when a teacher imports slides. */
function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    const lib = await import('pdfjs-dist');
    // A worker port, not a worker URL: the dev server ignores `?url` on this file.
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
    lib.GlobalWorkerOptions.workerPort = new PdfWorker();
    return lib;
  })().catch((cause: unknown) => {
    loading = null;
    throw cause;
  });
  return loading;
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDeck> {
  const lib = await pdfjs();
  let doc: Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
  try {
    doc = await lib.getDocument({ data: bytes }).promise;
  } catch {
    throw new Error('That PDF won’t open. Export it again from PowerPoint (File › Export › PDF).');
  }
  return {
    pageCount: doc.numPages,
    async render(pageNumber, width) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, width / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser can’t draw the slides.');
      // Slides with no background fill would otherwise come out black as JPEG.
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup();
      return canvas;
    },
    destroy() {
      void doc.destroy();
    }
  };
}

export function canvasToJpeg(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: 'image/jpeg' })) : reject(new Error('The slide picture couldn’t be made.'))),
      'image/jpeg',
      0.86
    );
  });
}
