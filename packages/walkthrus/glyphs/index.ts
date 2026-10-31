// packages/walkthrus/glyphs/index.ts
// Technique icons by catalogue id, in two drawn sets:
// FIGURE_SVGS (outlined people acting the technique out, the same set as the private step
// pictures) for the Professional board hexes and a block's WalkThru bar, and SYMBOL_SVGS (the
// idea without people, made by scripts/draw-walkthru-icons.mjs) for Teaching's cards and
// planning strips. An id with no file falls back to the placeholder hexagon.
const figures = import.meta.glob('./figure/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const symbols = import.meta.glob('./symbol/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const byId = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, markup]) => [path.replace(/^.*\//, '').replace(/\.svg$/, ''), markup]));

export const FIGURE_SVGS: Record<string, string> = byId(figures);
export const SYMBOL_SVGS: Record<string, string> = byId(symbols);
