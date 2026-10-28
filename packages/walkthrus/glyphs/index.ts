// packages/walkthrus/glyphs/index.ts
// Technique icons by catalogue id. Each `<id>.svg` file in this folder is picked up here; an id with
// no file falls back to the placeholder hexagon. Fill the folder with scripts/import-walkthru-icons.mjs.
const files = import.meta.glob('./*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const GLYPH_SVGS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, markup]) => [path.replace(/^\.\//, '').replace(/\.svg$/, ''), markup])
);
