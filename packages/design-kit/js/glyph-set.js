/**
 * One loader for a book's icon set: an id → SVG markup map with a placeholder for any id that
 * has no icon yet. The four book packages each carry a near copy of this; new sets use it.
 * Markup is static and comes from the package itself, never from user text.
 */

const HEX = 'M92 50 71 86.4H29L8 50 29 13.6h42z';

const escapeText = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** A plain hexagon with the entry's initials: stands in until the commissioned icon arrives. */
export function placeholderGlyph(label) {
  const words = String(label ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const initials = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join('') : words[0]?.slice(0, 2) ?? '').toUpperCase();
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" data-glyph-placeholder="true"><path d="${HEX}"/><text x="50" y="58" text-anchor="middle" font-size="24" font-weight="700" fill="currentColor" stroke="none" font-family="inherit">${escapeText(initials)}</text></svg>`;
}

/**
 * @param {{ svgs?: Record<string,string>, labelOf?: (id: string) => string, className?: string }} options
 */
export function createGlyphSet({ svgs = {}, labelOf = (id) => id, className = 'glyph' } = {}) {
  const markup = (id) => svgs[id] ?? placeholderGlyph(labelOf(id));
  return {
    has: (id) => Object.hasOwn(svgs, id),
    markup,
    /** A decorative wrapper unless `label` names it. */
    element(id, label = null) {
      const span = document.createElement('span');
      span.className = className;
      span.innerHTML = markup(id);
      const svg = span.querySelector('svg');
      if (label) {
        span.setAttribute('role', 'img');
        span.setAttribute('aria-label', label);
      } else span.setAttribute('aria-hidden', 'true');
      svg?.removeAttribute('role');
      svg?.removeAttribute('aria-label');
      svg?.querySelector('title')?.remove();
      return span;
    }
  };
}
