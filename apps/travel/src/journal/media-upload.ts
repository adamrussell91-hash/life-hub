/**
 * Back up one journal photo or voice note to private storage (R2).
 *
 * Photos: the 320 / 960 / 1600px JPEG copies the journal displays go up
 * first, then the original. The server marks the media `backed_up` only
 * when the original is verified, so `backed_up` means everything is there.
 * Voice notes: the original only.
 *
 * Every PUT is re-signed per attempt (signed URLs expire after 5 minutes)
 * and retried with backoff; the caller keeps the bytes on the device until
 * this resolves.
 */
import {
  signJournalMedia,
  uploadJournalMediaToSignedUrl,
  verifyJournalMedia,
  type JournalMediaSignInput,
} from '@/api/journal-media';
import type { JournalEnvelope } from '@/api/journal';
import { rememberJournalEnvelope } from '@/api/journal';
import { JOURNAL_DERIVATIVE_WIDTHS } from '@/journal/media-loading';
import type { JournalMedia } from '@/journal/types';

export interface JournalMediaUploadJob {
  tripId: string;
  mediaId: string;
  blob: Blob;
  contentType: string;
}

const RETRY_DELAYS_MS = [1000, 4000, 12000];

export function normalizeMediaContentType(blob: Blob, fallback = 'image/jpeg'): string {
  const raw = (blob.type || '').split(';')[0]!.trim().toLowerCase();
  if (raw) return raw === 'image/jpg' ? 'image/jpeg' : raw;
  const name = (blob as File).name?.toLowerCase() ?? '';
  if (/\.(heic|heif)$/.test(name)) return 'image/heic';
  if (/\.png$/.test(name)) return 'image/png';
  if (/\.(m4a|mp4)$/.test(name)) return 'audio/mp4';
  return fallback;
}

export function isAudioContentType(contentType: string): boolean {
  return contentType.startsWith('audio/');
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await wait(delay);
    }
  }
  throw lastError;
}

export interface DecodedImage {
  width: number;
  height: number;
  source: ImageBitmap;
}

export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  // `from-image` applies the EXIF rotation so portrait iPhone photos stay upright.
  const source = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return { width: source.width, height: source.height, source };
}

/** JPEG copy no wider than `width` (never upscaled). */
export async function jpegDerivative(image: DecodedImage, width: number): Promise<Blob> {
  const scale = Math.min(1, width / image.width);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas unavailable');
  g.drawImage(image.source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', width <= 320 ? 0.78 : 0.84),
  );
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('Could not encode photo');
  return blob;
}

async function putAndVerify(
  base: Omit<JournalMediaSignInput, 'checksum' | 'byte_size' | 'content_type'>,
  blob: Blob,
  contentType: string,
): Promise<JournalEnvelope> {
  const signInput: JournalMediaSignInput = {
    ...base,
    content_type: contentType,
    byte_size: blob.size,
    checksum: await sha256Hex(blob),
  };
  await withRetry(async () => {
    const sign = await signJournalMedia(signInput);
    await uploadJournalMediaToSignedUrl(sign.upload_url, blob, sign.headers);
  });
  const verified = await withRetry(() =>
    verifyJournalMedia({ ...signInput, if_version: 'latest', action: 'verify' }),
  );
  return rememberJournalEnvelope({
    journal: verified.journal as JournalEnvelope['journal'],
    version: verified.version,
  });
}

/** Upload derivatives (photos) and the original; resolves with the server's latest journal. */
export async function backUpJournalMedia(job: JournalMediaUploadJob): Promise<JournalEnvelope> {
  const base = { trip_id: job.tripId, media_id: job.mediaId };
  if (!isAudioContentType(job.contentType)) {
    const image = await decodeImage(job.blob);
    try {
      for (const width of JOURNAL_DERIVATIVE_WIDTHS) {
        const copy = await jpegDerivative(image, width);
        await putAndVerify(
          { ...base, purpose: 'derivative', derivative_width: width },
          copy,
          'image/jpeg',
        );
      }
    } finally {
      image.source.close();
    }
  }
  return putAndVerify({ ...base, purpose: 'original' }, job.blob, job.contentType);
}

export function makeMediaId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = 'med_';
  for (const b of crypto.getRandomValues(new Uint8Array(12))) out += alphabet[b % alphabet.length];
  return out;
}

/**
 * The journal row for a photo or voice note that is about to be queued.
 * It starts `pending`; the server flips it to `backed_up` on verify.
 */
export async function buildJournalMediaRow(
  mediaId: string,
  blob: Blob,
  contentType: string,
  extra: { durationS?: number } = {},
): Promise<JournalMedia> {
  const row: JournalMedia = {
    id: mediaId,
    lifecycle: 'live',
    content_type: contentType,
    byte_size: blob.size,
    checksum: await sha256Hex(blob),
    upload_state: 'pending',
  };
  if (isAudioContentType(contentType)) {
    if (extra.durationS && Number.isFinite(extra.durationS)) {
      row.duration_s = Math.round(extra.durationS);
    }
    return row;
  }
  try {
    const image = await decodeImage(blob);
    row.width = image.width;
    row.height = image.height;
    image.source.close();
  } catch {
    /* This browser cannot decode it (e.g. HEIC outside Safari); size stays unknown. */
  }
  return row;
}
