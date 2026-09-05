/** Thin client image pipeline helpers for capture → upload.
 * No dependency. Prefer this for simple resize; escalate to
 * browser-image-compression when HEIC/worker quality matters.
 */

/**
 * @typedef {{
 *   maxWidth?: number,
 *   maxHeight?: number,
 *   quality?: number,
 *   mimeType?: string,
 *   preserveOriginalBelowBytes?: number
 * }} CompressOptions
 */

/**
 * @param {Blob | File} input
 * @param {CompressOptions} [options]
 * @returns {Promise<{ blob: Blob, width: number, height: number, skipped: boolean, reason?: string }>}
 */
export async function compressImageForUpload(input, options = {}) {
  const maxWidth = options.maxWidth ?? 1920;
  const maxHeight = options.maxHeight ?? 1920;
  const quality = options.quality ?? 0.82;
  const mimeType = options.mimeType ?? 'image/jpeg';
  const preserveBelow = options.preserveOriginalBelowBytes ?? 400_000;

  if (!(input instanceof Blob)) {
    throw new TypeError('compressImageForUpload expects a Blob or File');
  }

  if (!String(input.type || '').startsWith('image/')) {
    return { blob: input, width: 0, height: 0, skipped: true, reason: 'not-image' };
  }

  if (input.type === 'image/gif' || input.type === 'image/svg+xml') {
    return { blob: input, width: 0, height: 0, skipped: true, reason: 'format-preserved' };
  }

  if (input.size > 0 && input.size <= preserveBelow) {
    // Still re-encode if dimensions may be huge; cheap check via bitmap when available.
  }

  const bitmap = await createImageBitmap(input);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxWidth, maxHeight);
    if (width === bitmap.width && height === bitmap.height && input.size <= preserveBelow) {
      return { blob: input, width, height, skipped: true, reason: 'already-small' };
    }

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });

    if ('width' in canvas) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = 'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type: mimeType, quality })
      : await new Promise((resolve, reject) => {
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('toBlob failed'))),
            mimeType,
            quality
          );
        });

    if (blob.size >= input.size && input.size <= preserveBelow * 2) {
      return { blob: input, width: bitmap.width, height: bitmap.height, skipped: true, reason: 'no-gain' };
    }

    return { blob, width, height, skipped: false };
  } finally {
    bitmap.close?.();
  }
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} maxWidth
 * @param {number} maxHeight
 */
export function fitWithin(width, height, maxWidth, maxHeight) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

/**
 * Strip GPS from a JPEG-ish pipeline by re-encoding through canvas
 * (createImageBitmap → canvas → jpeg drops EXIF). Explicit product choice.
 * @param {Blob | File} input
 * @param {CompressOptions} [options]
 */
export async function compressAndStripExif(input, options = {}) {
  const result = await compressImageForUpload(input, {
    ...options,
    preserveOriginalBelowBytes: 0
  });
  return { ...result, exifStripped: !result.skipped };
}
