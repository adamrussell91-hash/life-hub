import { apiPost } from '@/api/client';

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
  upload_state: 'backed_up';
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
