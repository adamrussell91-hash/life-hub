/** Multimodal chat attachment helpers (Life agent ACI).
 * Keep transport JSON; expand to Anthropic content blocks at the model boundary.
 */

/**
 * @typedef {{
 *   id: string,
 *   kind: 'image' | 'file',
 *   mime: string,
 *   name: string,
 *   dataUrl?: string,
 *   textExcerpt?: string,
 * }} HubChatAttachment
 */

/** Wire/model budget for a single inlined image (base64 transport). */
export const MAX_CHAT_IMAGE_BYTES = 1_500_000;

/**
 * @param {unknown} raw
 * @returns {HubChatAttachment | null}
 */
export function parseChatAttachment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const data = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  const mime = typeof data.mime === 'string' ? data.mime.trim() : '';
  const name = typeof data.name === 'string' ? data.name.trim() : 'attachment';
  const kind = data.kind === 'image' || String(mime).startsWith('image/') ? 'image' : 'file';
  if (!id || !mime) return null;
  /** @type {HubChatAttachment} */
  const out = { id, kind, mime, name };
  if (typeof data.dataUrl === 'string' && data.dataUrl.startsWith('data:')) {
    out.dataUrl = data.dataUrl;
  }
  if (typeof data.textExcerpt === 'string' && data.textExcerpt.trim()) {
    out.textExcerpt = data.textExcerpt.trim();
  }
  return out;
}

/**
 * @param {unknown} list
 * @returns {HubChatAttachment[]}
 */
export function normalizeChatAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list.map(parseChatAttachment).filter(Boolean).slice(0, 3);
}

/**
 * Provenance line agents must treat as delivery fact.
 * Only call for attachments that actually became model content.
 * @param {HubChatAttachment[]} attachments
 */
export function formatAttachmentProvenance(attachments) {
  const list = normalizeChatAttachments(attachments);
  if (!list.length) return '';
  return list
    .map(
      (item) =>
        `[Attachment delivered to model · id=${item.id} · kind=${item.kind} · mime=${item.mime} · name=${item.name}]`
    )
    .join('\n');
}

/**
 * @param {HubChatAttachment[]} attachments
 */
function formatAttachmentUnavailable(attachments) {
  return attachments
    .map(
      (item) =>
        `[Attachment unavailable to model · id=${item.id} · kind=${item.kind} · mime=${item.mime} · name=${item.name} · reason=missing_bytes]`
    )
    .join('\n');
}

/**
 * Build Anthropic-style user content (string or content blocks).
 * @param {string} message
 * @param {HubChatAttachment[]} [attachments]
 * @returns {string | Array<{ type: string, text?: string, source?: Record<string, string> }>}
 */
export function buildUserContent(message, attachments = []) {
  const text = String(message || '').trim();
  const list = normalizeChatAttachments(attachments);
  if (!list.length) return text;

  /** @type {HubChatAttachment[]} */
  const delivered = [];
  /** @type {HubChatAttachment[]} */
  const unavailable = [];
  /** @type {Array<{ type: string, text?: string, source?: Record<string, string> }>} */
  const mediaBlocks = [];

  for (const item of list) {
    if (item.kind === 'image' && item.dataUrl) {
      const match = /^data:([^;]+);base64,(.+)$/s.exec(item.dataUrl);
      if (match) {
        delivered.push(item);
        mediaBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: match[1] || item.mime,
            data: match[2]
          }
        });
        continue;
      }
    }
    if (item.textExcerpt) {
      delivered.push(item);
      mediaBlocks.push({
        type: 'text',
        text: `[Attachment excerpt · ${item.name}]\n${item.textExcerpt}`
      });
      continue;
    }
    unavailable.push(item);
  }

  const notes = [text];
  if (delivered.length) notes.push(formatAttachmentProvenance(delivered));
  if (unavailable.length) notes.push(formatAttachmentUnavailable(unavailable));
  const combined = notes.filter(Boolean).join('\n\n');

  if (!mediaBlocks.length) return combined || text;

  /** @type {Array<{ type: string, text?: string, source?: Record<string, string> }>} */
  const blocks = [];
  if (combined) blocks.push({ type: 'text', text: combined });
  blocks.push(...mediaBlocks);
  return blocks;
}

/**
 * HEIC → JPEG + compress/strip EXIF so phone photos fit the chat wire budget.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function prepareChatImage(file) {
  if (!(file instanceof File)) throw new TypeError('prepareChatImage expects a File');
  if (!String(file.type || '').startsWith('image/') && !/\.hei[cf]$/i.test(file.name || '')) {
    return file;
  }

  let working = file;
  try {
    const { ensureWebImage } = await import('./hub-heic.js');
    const ensured = await ensureWebImage(file, { enableLgplConverter: true });
    working = ensured.file;
  } catch {
    /* keep original; compress may still succeed for JPEG/PNG */
  }

  try {
    const { compressAndStripExif } = await import('./hub-image-pipeline.js');
    const result = await compressAndStripExif(working, {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.78,
      mimeType: 'image/jpeg'
    });
    if (result.skipped && working.size <= MAX_CHAT_IMAGE_BYTES) return working;
    const base = (working.name || file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    let next = new File([result.blob], `${base}.jpg`, {
      type: result.blob.type || 'image/jpeg',
      lastModified: working.lastModified || Date.now()
    });
    // Second pass if still over the wire budget (very dense phone photos).
    if (next.size > MAX_CHAT_IMAGE_BYTES) {
      const tighter = await compressAndStripExif(next, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.7,
        mimeType: 'image/jpeg'
      });
      next = new File([tighter.blob], `${base}.jpg`, {
        type: tighter.blob.type || 'image/jpeg',
        lastModified: next.lastModified
      });
    }
    return next;
  } catch {
    return working;
  }
}

/**
 * Read a browser File into a HubChatAttachment (base64 data URL for images).
 * @param {File} file
 * @param {{ prepareImage?: (file: File) => Promise<File> }} [opts]
 * @returns {Promise<HubChatAttachment>}
 */
export async function fileToChatAttachment(file, opts = {}) {
  if (!(file instanceof File)) throw new TypeError('fileToChatAttachment expects a File');
  const id = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let working = file;
  const looksImage = file.type.startsWith('image/') || /\.hei[cf]$/i.test(file.name || '');
  if (looksImage) {
    const prepare = opts.prepareImage || prepareChatImage;
    working = await prepare(file);
  }
  const kind = working.type.startsWith('image/') || looksImage ? 'image' : 'file';
  /** @type {HubChatAttachment} */
  const out = {
    id,
    kind,
    mime: working.type || file.type || 'application/octet-stream',
    name: working.name || file.name || 'file'
  };
  if (kind === 'image' && working.size <= MAX_CHAT_IMAGE_BYTES) {
    out.dataUrl = await readAsDataUrl(working);
  } else if (working.size <= 200_000 && working.type.startsWith('text/')) {
    out.textExcerpt = await working.text();
  }
  if (kind === 'image' && !out.dataUrl) {
    throw new Error('Photo is too large to send. Try a smaller image.');
  }
  return out;
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read attachment'));
    reader.readAsDataURL(blob);
  });
}
