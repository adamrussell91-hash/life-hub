export const TEXT_LIKE_TYPES = new Set([
  'rich_text',
  'heading',
  'callout',
  'quote',
  'definition',
  'code'
]);

export function isTextLike(type: string): boolean {
  return TEXT_LIKE_TYPES.has(type);
}
