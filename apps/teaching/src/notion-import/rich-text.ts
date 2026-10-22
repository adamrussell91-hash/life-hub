import type { NotionRichText } from './types';

// Teaching Hub rich text allows only: p, br, strong, em, u, ul, ol, li, a,
// blockquote (see blocks/sanitize.ts). Strikethrough, inline code and colour
// therefore become plain text.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, /^\/(?!\/)/.test(href) ? 'https://www.notion.so' : undefined);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function plainText(rich: NotionRichText[] | undefined): string {
  return (rich ?? []).map((span) => span.plain_text ?? '').join('');
}

export function richTextHtml(rich: NotionRichText[] | undefined): string {
  return (rich ?? [])
    .map((span) => {
      let html = escapeHtml(span.plain_text ?? '').replace(/\n/g, '<br>');
      if (!html) return '';
      const a = span.annotations ?? {};
      if (a.underline) html = `<u>${html}</u>`;
      if (a.italic) html = `<em>${html}</em>`;
      if (a.bold) html = `<strong>${html}</strong>`;
      const href = span.type === 'text' ? safeHref(span.href) : null;
      if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
      return html;
    })
    .join('');
}
