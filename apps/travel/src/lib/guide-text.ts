import { escapeHtml } from '@/lib/html';

const stripTags = (value: string): string => value.replace(/<[^>]*>?/g, '');

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Soft Landing rows are stored as `<b>Label.</b> detail`. Returns plain text only. */
export function splitGuideText(html: string): { label: string; detail: string } {
  const m = String(html || '').match(/^<b>(.*?)<\/b>\s*(.*)$/is);
  if (m) {
    return {
      label: decodeEntities(stripTags(m[1]!)).replace(/\.$/, '').trim(),
      detail: decodeEntities(stripTags(m[2]!)).trim()
    };
  }
  return { label: '', detail: decodeEntities(stripTags(String(html || ''))).trim() };
}

export function joinGuideText(label: string, detail: string): string {
  const l = label.trim();
  const d = detail.trim();
  if (l && d) return `<b>${escapeHtml(l)}.</b> ${escapeHtml(d)}`;
  if (l) return `<b>${escapeHtml(l)}.</b>`;
  return escapeHtml(d);
}
