import { ApiClientError, apiPost, parseApiResponse } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';

export interface JournalMediaSignInput {
  trip_id: string;
  media_id: string;
  content_type: string;
  byte_size: number;
  checksum: string;
  purpose: 'original' | 'derivative';
  derivative_width?: 320 | 960 | 1600;
}

export interface JournalMediaSignResult {
  upload_url: string;
  headers: Record<string, string>;
  key: string;
  expires_in: number;
}

export interface JournalMediaVerifyInput extends JournalMediaSignInput {
  if_version: string;
  action: 'verify';
}

export interface JournalMediaVerifyResult {
  /** `backed_up` once the original is stored; a copy alone leaves the row pending. */
  upload_state: 'backed_up' | 'pending';
  journal: unknown;
  version: string;
  key: string;
}

export function signJournalMedia(body: JournalMediaSignInput): Promise<JournalMediaSignResult> {
  return apiPost<JournalMediaSignResult>('/api/travel-journal-media-sign', body);
}

export function verifyJournalMedia(
  body: JournalMediaVerifyInput
): Promise<JournalMediaVerifyResult> {
  return apiPost<JournalMediaVerifyResult>('/api/travel-journal-media-sign', body);
}

export function uploadJournalMediaToSignedUrl(
  uploadUrl: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Journal media upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Journal media upload failed (network)'));
    xhr.send(file);
  });
}

export async function uploadJournalMediaWithProgress(
  signInput: JournalMediaSignInput,
  file: Blob,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ key: string; sign: JournalMediaSignResult }> {
  const sign = await signJournalMedia(signInput);
  await uploadJournalMediaToSignedUrl(sign.upload_url, file, sign.headers, onProgress);
  return { key: sign.key, sign };
}

/**
 * Send the bytes to the API, which stores them and records them on the journal
 * in one step. Nothing here depends on the bucket accepting a browser PUT. The
 * API refuses anything over its size limit with 413 (`too_large`).
 */
export async function uploadJournalMediaThroughApi(
  input: JournalMediaSignInput,
  file: Blob
): Promise<JournalMediaVerifyResult> {
  const params = new URLSearchParams({
    trip: input.trip_id,
    id: input.media_id,
    purpose: input.purpose,
    ...(input.derivative_width ? { width: String(input.derivative_width) } : {}),
    checksum: input.checksum
  });
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/travel-journal-media-upload?${params}`, {
      method: 'POST',
      headers: { 'content-type': input.content_type },
      body: file,
      credentials: 'include',
      signal:
        typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(60_000) : undefined
    });
  } catch (cause) {
    // Safari rejects with a bare TypeError ("Load failed") when the connection drops.
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
    throw new ApiClientError({
      code: timedOut ? 'timeout' : 'network_error',
      message: cause instanceof Error ? cause.message : 'Network request failed'
    });
  }
  const result = await parseApiResponse<JournalMediaVerifyResult>(response);
  if (!result.ok) throw new ApiClientError(result.error, response.status, result.data);
  return result.data;
}
