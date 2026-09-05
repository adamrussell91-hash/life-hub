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
 * Build Anthropic-style user content (string or content blocks).
 * @param {string} message
 * @param {HubChatAttachment[]} [attachments]
 * @returns {string | Array<{ type: string, text?: string, source?: Record<string, string> }>}
 */
export function buildUserContent(message, attachments = []) {
  const text = String(message || '').trim();
  const list = normalizeChatAttachments(attachments);
  if (!list.length) return text;

  const provenance = formatAttachmentProvenance(list);
  const blocks = [];
  const combined = [text, provenance].filter(Boolean).join('\n\n');
  if (combined) blocks.push({ type: 'text', text: combined });

  for (const item of list) {
    if (item.kind === 'image' && item.dataUrl) {
      const match = /^data:([^;]+);base64,(.+)$/s.exec(item.dataUrl);
      if (match) {
        blocks.push({
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
      blocks.push({
        type: 'text',
        text: `[Attachment excerpt · ${item.name}]\n${item.textExcerpt}`
      });
    }
  }
  return blocks;
}

/**
 * Read a browser File into a HubChatAttachment (base64 data URL for images).
 * @param {File} file
 * @returns {Promise<HubChatAttachment>}
 */
export async function fileToChatAttachment(file) {
  if (!(file instanceof File)) throw new TypeError('fileToChatAttachment expects a File');
  const id = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const kind = file.type.startsWith('image/') ? 'image' : 'file';
  /** @type {HubChatAttachment} */
  const out = { id, kind, mime: file.type || 'application/octet-stream', name: file.name || 'file' };
  if (kind === 'image' && file.size <= 1_500_000) {
    out.dataUrl = await readAsDataUrl(file);
  } else if (file.size <= 200_000 && file.type.startsWith('text/')) {
    out.textExcerpt = await file.text();
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
