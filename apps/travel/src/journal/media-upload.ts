/**
 * Back up one journal photo or voice note to private storage (R2).
 *
 * Photos: the 320 / 960 / 1600px JPEG copies the journal displays go up
 * first, then the original. The server marks the media `backed_up` only
 * when the original is stored, so `backed_up` means everything is there.
 * Voice notes: the original only.
 *
 * A file up to JOURNAL_RELAY_MAX_BYTES goes to the API, which stores it, so
 * nothing depends on the bucket accepting a PUT from the browser. A bigger
 * original goes up on a signed URL, re-signed per attempt (they expire after
 * 5 minutes). Everything retries with backoff; the caller keeps the bytes on
 * the device until this resolves.
 */
import { ApiClientError } from '@/api/client';
import {
  signJournalMedia,
  uploadJournalMediaThroughApi,
  uploadJournalMediaToSignedUrl,
  verifyJournalMedia,
  type JournalMediaSignInput,
  type JournalMediaVerifyResult,
} from '@/api/journal-media';
import type { JournalEnvelope } from '@/api/journal';
import { rememberJournalEnvelope } from '@/api/journal';
import { JOURNAL_DERIVATIVE_WIDTHS, type JournalDerivativeWidth } from '@/journal/media-loading';
import type { JournalMedia } from '@/journal/types';

/**
 * The most the API carries for one file (netlify `JOURNAL_RELAY_MAX_BYTES`):
 * a function's body is capped at 6 MB with base64 included.
 */
export const JOURNAL_RELAY_MAX_BYTES = 4 * 1024 * 1024;

/** One stored piece of a photo or voice note: a copy at one width, or the original. */
export type JournalMediaPart = 'original' | `w${JournalDerivativeWidth}`;

export interface JournalMediaUploadJob {
  tripId: string;
  mediaId: string;
  blob: Blob;
  contentType: string;
  /** SHA-256 of the original, when it was already worked out (photo import). */
  checksum?: string;
  /** Parts an earlier attempt stored, so a retry does not send them again. */
  stored?: JournalMediaPart[];
}

export interface JournalMediaUploadHooks {
  /** Called as each part is stored, so the caller can remember it across attempts. */
  onStored?: (part: JournalMediaPart) => void | Promise<void>;
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

/** A refusal the API will repeat (a bad request, a missing row, too big): retrying cannot help. */
function isFinalRefusal(err: unknown): boolean {
  const status = err instanceof ApiClientError ? (err.status ?? 0) : 0;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (isFinalRefusal(err)) break;
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

async function putSignedAndVerify(signInput: JournalMediaSignInput, blob: Blob): Promise<JournalMediaVerifyResult> {
  await withRetry(async () => {
    const sign = await signJournalMedia(signInput);
    await uploadJournalMediaToSignedUrl(sign.upload_url, blob, sign.headers);
  });
  return withRetry(() => verifyJournalMedia({ ...signInput, if_version: 'latest', action: 'verify' }));
}

async function storePart(
  base: Omit<JournalMediaSignInput, 'checksum' | 'byte_size' | 'content_type'>,
  blob: Blob,
  contentType: string,
  knownChecksum?: string,
): Promise<JournalEnvelope> {
  const signInput: JournalMediaSignInput = {
    ...base,
    content_type: contentType,
    byte_size: blob.size,
    checksum: knownChecksum ?? (await sha256Hex(blob)),
  };
  let stored: JournalMediaVerifyResult | undefined;
  if (blob.size <= JOURNAL_RELAY_MAX_BYTES) {
    try {
      stored = await withRetry(() => uploadJournalMediaThroughApi(signInput, blob));
    } catch (err) {
      // The API's host refused the body as too big: a signed upload can still carry it.
      if (!(err instanceof ApiClientError && err.status === 413)) throw err;
    }
  }
  stored ??= await putSignedAndVerify(signInput, blob);
  return rememberJournalEnvelope({
    journal: stored.journal as JournalEnvelope['journal'],
    version: stored.version,
  });
}

/**
 * Upload the copies (photos) and the original, skipping parts already stored.
 * Resolves with the server's latest journal, or null when nothing was left to send.
 */
export async function backUpJournalMedia(
  job: JournalMediaUploadJob,
  hooks: JournalMediaUploadHooks = {},
): Promise<JournalEnvelope | null> {
  const base = { trip_id: job.tripId, media_id: job.mediaId };
  const done = new Set<JournalMediaPart>(job.stored ?? []);
  let envelope: JournalEnvelope | null = null;
  if (!isAudioContentType(job.contentType)) {
    const widths = JOURNAL_DERIVATIVE_WIDTHS.filter((width) => !done.has(`w${width}`));
    if (widths.length) {
      const image = await decodeImage(job.blob);
      try {
        for (const width of widths) {
          const copy = await jpegDerivative(image, width);
          envelope = await storePart({ ...base, purpose: 'derivative', derivative_width: width }, copy, 'image/jpeg');
          await hooks.onStored?.(`w${width}`);
        }
      } finally {
        image.source.close();
      }
    }
  }
  if (!done.has('original')) {
    envelope = await storePart({ ...base, purpose: 'original' }, job.blob, job.contentType, job.checksum);
    await hooks.onStored?.('original');
  }
  return envelope;
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
  extra: {
    durationS?: number;
    /** Already worked out while reading the photo: skips a second hash. */
    checksum?: string;
    /** Pixel size as displayed, from the photo's own metadata: skips a decode. */
    width?: number;
    height?: number;
  } = {},
): Promise<JournalMedia> {
  const row: JournalMedia = {
    id: mediaId,
    lifecycle: 'live',
    content_type: contentType,
    byte_size: blob.size,
    checksum: extra.checksum ?? (await sha256Hex(blob)),
    upload_state: 'pending',
  };
  if (isAudioContentType(contentType)) {
    if (extra.durationS && Number.isFinite(extra.durationS)) {
      row.duration_s = Math.round(extra.durationS);
    }
    return row;
  }
  if (extra.width && extra.height && extra.width > 0 && extra.height > 0) {
    row.width = extra.width;
    row.height = extra.height;
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
