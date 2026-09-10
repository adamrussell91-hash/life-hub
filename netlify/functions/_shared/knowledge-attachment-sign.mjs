import { createHash } from 'node:crypto';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a',
  'application/octet-stream'
]);

export function hubR2Key(area, pageId, filename) {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  return `${area}/${pageId}/${safe}`;
}

export function attachmentKind(contentType, filename) {
  if (contentType === 'application/pdf' || /\.pdf$/i.test(filename)) return 'pdf';
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(filename)) return 'image';
  if (contentType.startsWith('audio/') || /\.(webm|m4a|mp3|wav|ogg)$/i.test(filename)) return 'audio';
  return 'file';
}

function normalizeContentType(contentType) {
  return String(contentType).split(';')[0].trim().toLowerCase();
}

export function parseSignRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Invalid JSON' };
  const filename = typeof raw.filename === 'string' ? raw.filename.trim() : '';
  const contentType = normalizeContentType(typeof raw.content_type === 'string' ? raw.content_type : '');
  const byteSize = typeof raw.byte_size === 'number' ? raw.byte_size : NaN;
  const pageId = typeof raw.page_id === 'string' ? raw.page_id : '';
  const area = raw.area === 'notes' || raw.area === 'university' ? raw.area : '';
  if (!filename.includes('.')) return { error: 'filename needs an extension' };
  if (!pageId) return { error: 'page_id required' };
  if (!area) return { error: 'area must be notes or university' };
  if (!TYPES.has(contentType)) return { error: 'content_type not allowed' };
  if (!Number.isFinite(byteSize) || byteSize < 1) return { error: 'byte_size required' };
  if (byteSize > MAX_ATTACHMENT_BYTES) return { error: 'File exceeds 20MB' };
  const r2Key = hubR2Key(area, pageId, filename);
  return {
    value: {
      filename,
      content_type: contentType,
      byte_size: byteSize,
      page_id: pageId,
      area,
      attachment: {
        id: `attachment_${createHash('sha256').update(r2Key).digest('hex').slice(0, 12)}`,
        kind: attachmentKind(contentType, filename),
        r2_key: r2Key,
        filename,
        content_type: contentType
      }
    }
  };
}

export function findAttachment(page, attachmentId) {
  const attachments = Array.isArray(page?.attachments) ? page.attachments : [];
  return attachments.find(item => item?.id === attachmentId && typeof item.r2_key === 'string') ?? null;
}
