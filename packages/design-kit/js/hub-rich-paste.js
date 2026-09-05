/** Classify clipboard / paste events into Life Hub ingest kinds.
 * Mine of paste-rich: tiny, zero-dep, design-kit owned.
 * Does not upload, fetch URLs, or call agents — classification only.
 */

const IMAGE_MIME = /^image\//i;
const URL_ONLY = /^(https?:\/\/[^\s]+)$/i;
const YOUTUBE = /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/i;
const VIMEO = /vimeo\.com\//i;
const MAPS = /(?:google\.[^/]+\/maps|maps\.app\.goo\.gl|openstreetmap\.org\/|maps\.apple\.com)/i;
const PDF_EXT = /\.pdf(?:[?#]|$)/i;

/**
 * @typedef {'image' | 'file' | 'url' | 'html' | 'text' | 'empty'} PasteKind
 * @typedef {{
 *   kind: PasteKind,
 *   subtype?: 'youtube' | 'vimeo' | 'maps' | 'pdf' | 'article' | 'plain',
 *   text?: string,
 *   html?: string,
 *   files?: File[],
 *   url?: string,
 * }} PastePayload
 */

/**
 * @param {DataTransfer | null | undefined} data
 * @returns {PastePayload}
 */
export function classifyClipboardData(data) {
  if (!data) return { kind: 'empty' };

  const files = [...(data.files ?? [])];
  if (files.length) {
    const onlyImages = files.every((file) => IMAGE_MIME.test(file.type || ''));
    return {
      kind: onlyImages ? 'image' : 'file',
      files,
      subtype: onlyImages ? undefined : files.some((f) => PDF_EXT.test(f.name) || f.type === 'application/pdf')
        ? 'pdf'
        : undefined
    };
  }

  const html = typeof data.getData === 'function' ? String(data.getData('text/html') || '') : '';
  const text = typeof data.getData === 'function' ? String(data.getData('text/plain') || '').trim() : '';

  if (text && URL_ONLY.test(text)) {
    return { kind: 'url', url: text, text, subtype: urlSubtype(text) };
  }

  if (html && htmlIncludesUsefulMarkup(html)) {
    return { kind: 'html', html, text: text || undefined, subtype: 'plain' };
  }

  if (text) return { kind: 'text', text, subtype: 'plain' };
  return { kind: 'empty' };
}

/**
 * @param {ClipboardEvent} event
 * @returns {PastePayload}
 */
export function classifyPasteEvent(event) {
  return classifyClipboardData(event?.clipboardData);
}

/**
 * @param {DragEvent} event
 * @returns {PastePayload}
 */
export function classifyDropEvent(event) {
  return classifyClipboardData(event?.dataTransfer);
}

/**
 * Suggest a hub destination for a classified paste/drop.
 * Soft routing hint only — never auto-write.
 * @param {PastePayload} payload
 * @param {{ currentHub?: string }} [opts]
 */
export function suggestIngestTarget(payload, opts = {}) {
  const hub = opts.currentHub || '';
  if (!payload || payload.kind === 'empty') return null;

  if (payload.kind === 'url') {
    if (payload.subtype === 'maps') return { hub: 'life', action: 'place', reason: 'Map URL' };
    if (payload.subtype === 'youtube' || payload.subtype === 'vimeo') {
      return { hub: hub === 'teaching' ? 'teaching' : 'knowledge', action: 'media', reason: 'Video URL' };
    }
    if (payload.subtype === 'pdf') return { hub: 'knowledge', action: 'source', reason: 'PDF URL' };
    return { hub: 'knowledge', action: 'link', reason: 'URL' };
  }

  if (payload.kind === 'image') {
    if (hub === 'teaching') return { hub: 'teaching', action: 'image_block', reason: 'Image' };
    if (hub === 'life') return { hub: 'life', action: 'photo', reason: 'Photo' };
    return { hub: 'knowledge', action: 'capture_photo', reason: 'Image' };
  }

  if (payload.kind === 'file') {
    if (payload.subtype === 'pdf') {
      return {
        hub: hub === 'teaching' ? 'teaching' : 'knowledge',
        action: hub === 'teaching' ? 'resource' : 'capture_pdf',
        reason: 'PDF'
      };
    }
    if (hub === 'tasks') return { hub: 'tasks', action: 'attachment', reason: 'File' };
    return { hub: hub || 'knowledge', action: 'attachment', reason: 'File' };
  }

  if (payload.kind === 'html' || payload.kind === 'text') {
    return { hub: hub || 'knowledge', action: 'note', reason: 'Text' };
  }

  return null;
}

function urlSubtype(url) {
  if (YOUTUBE.test(url)) return 'youtube';
  if (VIMEO.test(url)) return 'vimeo';
  if (MAPS.test(url)) return 'maps';
  if (PDF_EXT.test(url)) return 'pdf';
  return 'article';
}

function htmlIncludesUsefulMarkup(html) {
  return /<(table|ul|ol|li|h[1-6]|blockquote|pre|img)\b/i.test(html);
}
