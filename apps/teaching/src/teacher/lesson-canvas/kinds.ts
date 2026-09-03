export const TEXT_LIKE_TYPES = new Set([
  'rich_text',
  'heading',
  'callout',
  'quote',
  'definition',
  'code'
]);

export const CANVAS_LIKE_TYPES = new Set(['mind_map', 'concept_map']);

export function isTextLike(type: string): boolean {
  return TEXT_LIKE_TYPES.has(type);
}

export function isCanvasLike(type: string): boolean {
  return CANVAS_LIKE_TYPES.has(type);
}

/** Selected block replaces its preview with the editor — no stacked inspector. */
export function isInlineEditor(type: string): boolean {
  return isTextLike(type) || isCanvasLike(type);
}
