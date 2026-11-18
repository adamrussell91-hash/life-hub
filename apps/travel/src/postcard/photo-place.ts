/**
 * A postcard's photo: the copy that is uploaded, its shape, and where it was taken.
 *
 * The location is read on the phone from the original file, turned into a street-level
 * address, and never leaves the phone as coordinates: the uploaded copy is a fresh JPEG
 * with no metadata.
 */
import { reversePlaceAddress, type PlaceAddressParts } from '@/api/travel';
import { decodeImage, jpegDerivative, type DecodedImage } from '@/journal/media-upload';
import { SAFE_PHOTO_WIDTH } from '@/lib/safe-photo';
import { addressFromParts } from '@/postcard/model';
import type { PostcardOrientation } from '@/types';

export interface PhotoCoordinates {
  lat: number;
  lon: number;
}

export interface PreparedPhoto {
  /** The 1600px JPEG that is uploaded. It carries no location. */
  file: File;
  orientation: PostcardOrientation;
  coordinates?: PhotoCoordinates;
}

/** Its message is the sentence to show the owner. */
export class PhotoUnreadableError extends Error {
  constructor() {
    super("That photo can't be read. Try a different one.");
    this.name = 'PhotoUnreadableError';
  }
}

export interface PreparePhotoDeps {
  decode?: (blob: Blob) => Promise<DecodedImage>;
  encode?: (image: DecodedImage, width: number) => Promise<Blob>;
  readCoordinates?: (file: Blob) => Promise<PhotoCoordinates | undefined>;
}

/** The photo's own GPS, if it has one. The EXIF reader loads only when a photo is chosen. */
export async function readPhotoCoordinates(file: Blob): Promise<PhotoCoordinates | undefined> {
  try {
    const { default: exifr } = await import('exifr');
    const gps = (await exifr.gps(file)) as { latitude?: number; longitude?: number } | undefined;
    const lat = gps?.latitude;
    const lon = gps?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return undefined;
    }
    // 0,0 is what a camera writes when it has no fix.
    if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return undefined;
    return { lat, lon };
  } catch {
    return undefined;
  }
}

/**
 * Decode, note the shape, and make the copy that is uploaded. A file the browser cannot
 * decode is refused: sending it as it is would carry its location with it.
 */
export async function preparePostcardPhoto(file: File, deps: PreparePhotoDeps = {}): Promise<PreparedPhoto> {
  const decode = deps.decode ?? decodeImage;
  const encode = deps.encode ?? jpegDerivative;
  const readCoordinates = deps.readCoordinates ?? readPhotoCoordinates;
  const coordinates = await readCoordinates(file);
  let image: DecodedImage;
  try {
    image = await decode(file);
  } catch {
    throw new PhotoUnreadableError();
  }
  try {
    const blob = await encode(image, SAFE_PHOTO_WIDTH);
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return {
      file: new File([blob], `${base}.jpg`, { type: 'image/jpeg' }),
      // Wider than tall, or square, is landscape.
      orientation: image.width >= image.height ? 'landscape' : 'portrait',
      ...(coordinates ? { coordinates } : {})
    };
  } catch {
    throw new PhotoUnreadableError();
  } finally {
    image.source.close?.();
  }
}

/** Street-level address lines for where the photo was taken, or the stop's own when that fails. */
export async function addressForPhoto(
  coordinates: PhotoCoordinates | undefined,
  fallback: string[],
  lookup: (lat: number, lon: number) => Promise<PlaceAddressParts | null> = reversePlaceAddress
): Promise<string[]> {
  if (!coordinates) return fallback;
  try {
    const lines = addressFromParts(await lookup(coordinates.lat, coordinates.lon));
    return lines.length ? lines : fallback;
  } catch {
    return fallback;
  }
}
