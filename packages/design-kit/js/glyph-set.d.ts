export function placeholderGlyph(label: string): string;
export interface GlyphSet {
  has(id: string): boolean;
  markup(id: string): string;
  element(id: string, label?: string | null): HTMLSpanElement;
}
export function createGlyphSet(options?: { svgs?: Record<string, string>; labelOf?: (id: string) => string; className?: string }): GlyphSet;
