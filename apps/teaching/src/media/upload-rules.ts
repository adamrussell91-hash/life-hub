export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MEDIA_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'audio/mpeg',
  'audio/wav',
  'application/zip',
  'text/plain'
]);

export function mediaTypeFromMime(mime: string): 'image' | 'pdf' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}
