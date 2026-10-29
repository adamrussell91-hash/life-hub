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

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** Browsers drop control characters and whitespace inside a URL scheme, so check what they would see. */
export function isSafeHref(href: string): boolean {
  const cleaned = href.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(cleaned);
  if (!scheme) return true; // relative link
  return SAFE_SCHEMES.has(scheme[1]!);
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

  if (tag === 'ol') {
    const start = el.getAttribute('start');
    if (start && /^\d{1,4}$/.test(start)) attrs = ` start="${start}"`;
  }

  const inner = Array.from(el.childNodes).map(sanitizeNode).join('');
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

export function sanitizeRichTextHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes).map(sanitizeNode).join('');
}
