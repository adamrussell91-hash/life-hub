import { createHash } from 'node:crypto';
import { isValidOrganisationId } from './identity-schema.mjs';

/** People redesign Phase 1 crests — PNG/SVG, square intended, ≤ 512 KB. */
export const MAX_CREST_BYTES = 512 * 1024;

const TYPES = new Set(['image/png', 'image/svg+xml']);

export function orgCrestR2Key(organisationId, filename) {
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  return `org-crests/${organisationId}/${safe}`;
}

function normalizeContentType(contentType) {
  return String(contentType).split(';')[0].trim().toLowerCase();
}

/**
 * @param {unknown} raw
 * @returns {{ error: string } | { value: { filename: string, content_type: string, byte_size: number, organisation_id: string, attachment: object } }}
 */
export function parseOrgCrestSignRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Invalid JSON' };
  const filename = typeof raw.filename === 'string' ? raw.filename.trim() : '';
  const contentType = normalizeContentType(typeof raw.content_type === 'string' ? raw.content_type : '');
  const byteSize = typeof raw.byte_size === 'number' ? raw.byte_size : NaN;
  const organisationId = typeof raw.organisation_id === 'string' ? raw.organisation_id.trim() : '';
  if (!filename.includes('.')) return { error: 'filename needs an extension' };
  if (!isValidOrganisationId(organisationId)) return { error: 'organisation_id invalid' };
  if (!TYPES.has(contentType)) return { error: 'content_type must be image/png or image/svg+xml' };
  if (!Number.isFinite(byteSize) || byteSize < 1) return { error: 'byte_size required' };
  if (byteSize > MAX_CREST_BYTES) return { error: 'File exceeds 512KB' };
  const lower = filename.toLowerCase();
  if (contentType === 'image/png' && !lower.endsWith('.png')) {
    return { error: 'PNG crest must use a .png filename' };
  }
  if (contentType === 'image/svg+xml' && !lower.endsWith('.svg')) {
    return { error: 'SVG crest must use a .svg filename' };
  }
  const r2Key = orgCrestR2Key(organisationId, filename);
  return {
    value: {
      filename,
      content_type: contentType,
      byte_size: byteSize,
      organisation_id: organisationId,
      attachment: {
        id: `crest_${createHash('sha256').update(r2Key).digest('hex').slice(0, 12)}`,
        kind: 'image',
        r2_key: r2Key,
        filename,
        content_type: contentType
      }
    }
  };
}
