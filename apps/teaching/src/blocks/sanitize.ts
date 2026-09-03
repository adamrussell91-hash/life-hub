const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'u',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote'
]);

const STRIP_TAGS = new Set(['script', 'style']);

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  return !trimmed.startsWith('javascript:') && !trimmed.startsWith('data:');
}

function sanitizeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (STRIP_TAGS.has(tag)) {
    return '';
  }

  if (!ALLOWED_TAGS.has(tag)) {
    return Array.from(el.childNodes).map(sanitizeNode).join('');
  }

  if (tag === 'br') {
    return '<br>';
  }

  let attrs = '';
  if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href && isSafeHref(href)) {
      attrs = ` href="${escapeAttr(href)}"`;
    }
  }

  const inner = Array.from(el.childNodes).map(sanitizeNode).join('');
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

export function sanitizeRichTextHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes).map(sanitizeNode).join('');
}
