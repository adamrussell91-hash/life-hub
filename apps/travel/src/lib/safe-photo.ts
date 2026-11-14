import { decodeImage, jpegDerivative, type DecodedImage } from '@/journal/media-upload';
import { ApiClientError } from '@/api/client';

/**
 * Plain words for a failed safe mark or photo. Safari reports a dropped
 * connection as a bare "Load failed", and timeouts carry the API address.
 */
export function safeSaveErrorMessage(err: unknown): string {
  if (err instanceof TypeError) return "Couldn't reach the server. Check your signal and try again.";
  if (!(err instanceof ApiClientError)) return 'Could not save. Try again.';
  if (err.code === 'network_error') return "Couldn't reach the server. Check your signal and try again.";
  if (err.code === 'timeout') return 'That took too long. Check your signal and try again.';
  if (err.status === 413) return 'That photo is too big to send. Try a different one.';
  if (err.code === 'invalid_response' || err.code === 'platform_unavailable' || (err.status ?? 0) >= 500) {
    return 'The server had a problem. Try again in a minute.';
  }
  // The travel functions write their own messages for people ("Please sign in to continue.").
  return err.message || 'Could not save. Try again.';
}

/** Width of the follower photo: sharp on a phone, a few hundred KB. */
export const SAFE_PHOTO_WIDTH = 1600;

export interface ShrinkSafePhotoDeps {
  decode?: (blob: Blob) => Promise<DecodedImage>;
  encode?: (image: DecodedImage, width: number) => Promise<Blob>;
}

/**
 * Camera photos are 3–8 MB, and the upload function refuses big bodies
 * (Netlify answers 413 after the whole file has crawled up). Re-encode on the
 * phone first, the same way the journal does. The JPEG copy also drops EXIF,
 * so the public link never carries the photo's GPS.
 * If the browser cannot decode the file, send it as it is.
 */
export async function shrinkSafePhoto(file: File, deps: ShrinkSafePhotoDeps = {}): Promise<File> {
  const decode = deps.decode ?? decodeImage;
  const encode = deps.encode ?? jpegDerivative;
  let image: DecodedImage;
  try {
    image = await decode(file);
  } catch {
    return file;
  }
  try {
    const blob = await encode(image, SAFE_PHOTO_WIDTH);
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } finally {
    image.source.close?.();
  }
}
