import { decodeImage, jpegDerivative, type DecodedImage } from '@/journal/media-upload';

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
