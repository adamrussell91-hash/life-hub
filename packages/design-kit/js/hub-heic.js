/** HEIC/HEIF → web-decodable JPEG.
 * Strategy: native decode first; optional LGPL `heic-to` WASM fallback.
 * See packages/design-kit/LEGAL-HEIC.md before shipping the fallback publicly.
 */

const HEIC_TYPE = /image\/hei[cf]/i;
const HEIC_EXT = /\.hei[cf]$/i;

/**
 * @param {Blob | File | null | undefined} input
 */
export function isHeicLike(input) {
  if (!input) return false;
  const type = String(input.type || '');
  if (HEIC_TYPE.test(type)) return true;
  const name = typeof File !== 'undefined' && input instanceof File ? input.name : '';
  return HEIC_EXT.test(name);
}

/**
 * Try to decode via platform codecs (Safari / newer Chromium often succeed).
 * @param {Blob} input
 * @param {{ quality?: number, mimeType?: string }} [opts]
 * @returns {Promise<File | null>}
 */
export async function convertHeicNatively(input, opts = {}) {
  const mimeType = opts.mimeType || 'image/jpeg';
  const quality = opts.quality ?? 0.9;
  try {
    const bitmap = await createImageBitmap(input);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('toBlob failed'))),
          mimeType,
          quality
        );
      });
      return toJpegFile(blob, input);
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}

/**
 * Convert via `heic-to` (LGPL-3.0 / libheif). Call only when `enableLgplConverter` is true.
 * @param {Blob} input
 * @param {{ quality?: number }} [opts]
 */
export async function convertHeicWithLgpl(input, opts = {}) {
  const { heicTo, isHeic } = await import('heic-to');
  if (typeof isHeic === 'function') {
    const yes = await isHeic(input);
    if (!yes && !isHeicLike(input)) {
      return toJpegFile(input, input);
    }
  }
  const blob = await heicTo({
    blob: input,
    type: 'image/jpeg',
    quality: opts.quality ?? 0.9
  });
  return toJpegFile(blob, input);
}

/**
 * Ensure an image File is web-decodable (JPEG). Non-HEIC inputs pass through.
 * @param {File} file
 * @param {{
 *   enableLgplConverter?: boolean,
 *   quality?: number,
 *   convertNatively?: typeof convertHeicNatively,
 *   convertWithLgpl?: typeof convertHeicWithLgpl,
 * }} [opts]
 * @returns {Promise<{ file: File, converted: boolean, method?: 'native' | 'lgpl' | 'passthrough' }>}
 */
export async function ensureWebImage(file, opts = {}) {
  if (!(file instanceof File)) {
    throw new TypeError('ensureWebImage expects a File');
  }
  if (!isHeicLike(file)) {
    return { file, converted: false, method: 'passthrough' };
  }

  const native = opts.convertNatively || convertHeicNatively;
  const nativeFile = await native(file, { quality: opts.quality });
  if (nativeFile) {
    return { file: nativeFile, converted: true, method: 'native' };
  }

  if (opts.enableLgplConverter === false) {
    throw new Error(
      'HEIC image needs conversion. Enable the LGPL heic-to converter (see design-kit/LEGAL-HEIC.md) or export as JPEG from the Photos app.'
    );
  }

  const lgpl = opts.convertWithLgpl || convertHeicWithLgpl;
  const converted = await lgpl(file, { quality: opts.quality });
  return { file: converted, converted: true, method: 'lgpl' };
}

/**
 * @param {Blob} blob
 * @param {Blob | File} source
 */
function toJpegFile(blob, source) {
  const base =
    typeof File !== 'undefined' && source instanceof File
      ? source.name.replace(/\.[^.]+$/, '') || 'photo'
      : 'photo';
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: typeof File !== 'undefined' && source instanceof File ? source.lastModified : Date.now()
  });
}
