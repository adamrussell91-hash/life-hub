/** Document edge-detect + perspective warp (jscanify + OpenCV.js).
 * Dynamic-loads heavy deps. Returns a straightened scan JPEG when paper is found.
 */

/**
 * @typedef {{
 *   blob: Blob,
 *   width: number,
 *   height: number,
 *   scanned: boolean,
 *   reason?: string,
 * }} DocScanResult
 */

const OPENCV_CDN = 'https://docs.opencv.org/4.7.0/opencv.js';

/**
 * Load OpenCV.js once (window.cv).
 * @param {{ loadOpenCv?: () => Promise<any> }} [opts]
 */
export async function ensureOpenCv(opts = {}) {
  if (globalThis.cv?.Mat) return globalThis.cv;
  if (opts.loadOpenCv) {
    const cv = await opts.loadOpenCv();
    if (cv) return cv;
  }
  if (typeof document === 'undefined') {
    throw new Error('OpenCV requires a browser document');
  }
  await new Promise((resolve, reject) => {
    const existing = document.getElementById('hub-opencv-js');
    if (existing && globalThis.cv) {
      resolve(undefined);
      return;
    }
    const script = existing || document.createElement('script');
    script.id = 'hub-opencv-js';
    script.async = true;
    script.src = OPENCV_CDN;
    const timer = setTimeout(() => reject(new Error('OpenCV load timeout')), 60000);
    script.onload = () => {
      const ready = () => {
        clearTimeout(timer);
        resolve(undefined);
      };
      if (globalThis.cv?.Mat) ready();
      else if (globalThis.cv) globalThis.cv.onRuntimeInitialized = ready;
      else reject(new Error('OpenCV missing after load'));
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('OpenCV failed to load'));
    };
    if (!existing) document.head.append(script);
  });
  return globalThis.cv;
}

/**
 * @param {{ loadJscanify?: () => Promise<any> }} [opts]
 */
async function loadJscanify(opts = {}) {
  if (opts.loadJscanify) return opts.loadJscanify();
  const mod = await import('jscanify');
  return mod.default || mod;
}

/**
 * Detect paper corners and warp to a flat scan.
 * If no paper contour is found, returns the original image as a JPEG blob.
 * @param {Blob | File} input
 * @param {{
 *   loadOpenCv?: () => Promise<any>,
 *   loadJscanify?: () => Promise<any>,
 *   quality?: number,
 * }} [opts]
 * @returns {Promise<DocScanResult>}
 */
export async function scanDocumentFromImage(input, opts = {}) {
  if (!(input instanceof Blob)) {
    throw new TypeError('scanDocumentFromImage expects a Blob or File');
  }

  await ensureOpenCv(opts);
  const Jscanify = await loadJscanify(opts);
  const Scanner = typeof Jscanify === 'function' ? Jscanify : Jscanify?.default;
  if (!Scanner) {
    return {
      blob: input,
      width: 0,
      height: 0,
      scanned: false,
      reason: 'jscanify-unavailable'
    };
  }

  const bitmap = await createImageBitmap(input);
  try {
    const source = document.createElement('canvas');
    source.width = bitmap.width;
    source.height = bitmap.height;
    const ctx = source.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(bitmap, 0, 0);

    const scanner = new Scanner();
    let resultCanvas = null;
    try {
      resultCanvas = scanner.extractPaper(source, bitmap.width, bitmap.height);
    } catch {
      resultCanvas = null;
    }

    if (!resultCanvas) {
      const fallback = await canvasToJpeg(source, opts.quality ?? 0.92);
      return {
        blob: fallback,
        width: source.width,
        height: source.height,
        scanned: false,
        reason: 'no-paper-detected'
      };
    }

    const blob = await canvasToJpeg(resultCanvas, opts.quality ?? 0.92);
    return {
      blob,
      width: resultCanvas.width || bitmap.width,
      height: resultCanvas.height || bitmap.height,
      scanned: true
    };
  } finally {
    bitmap.close?.();
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      quality
    );
  });
}
