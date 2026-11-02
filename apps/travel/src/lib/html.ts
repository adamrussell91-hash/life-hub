/** Escape a value for HTML text or a double-quoted attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/-]+\)|[a-z]{3,20})$/i;

/** A stored colour is interpolated into SVG attributes, so only plain colour syntax gets through. */
export function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_COLOR.test(value.trim()) ? value.trim() : fallback;
}

/** Look up a fixed HTML snippet (an icon) by a stored key without reaching Object.prototype. */
export function pick(map: Record<string, string>, key: unknown, fallback: string): string {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key]! : fallback;
}
