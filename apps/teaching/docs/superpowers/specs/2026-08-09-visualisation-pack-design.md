# Teaching Hub — Visualisation Pack Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Slice:** `chart`, `equation`, `diagram`, `mind_map`, `concept_map` (thin v1 of all five)  
**Depends on:** Leaf-block patterns (activities / gallery / question_set); existing URL safety; new SVG sanitiser + KaTeX  
**Parent roadmap:** `docs/BUILD.md` Next up #1; `docs/specs/03_BLOCK_SYSTEM.md` §§37–42  
**Not this slice:** AI fill UI, canvas drag editors, Chart.js, inline equations in rich text, A4-optimised viz layouts

## Goal

Ship five visualisation leaf blocks with structured, form-editable content (AI-builder-ready later), stacked teacher editors, and accessible student renders — without canvas tooling or chart libraries.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Full pack in one vertical slice (not chart+equation only) |
| Editors | Stacked field lists; no canvas drag |
| Chart render | Custom SVG from structured data (no Chart.js) |
| Chart types | `bar`, `line`, `pie`, `scatter` |
| Equation | KaTeX from `latex` string (display mode); optional caption |
| Diagram | `source: 'image' \| 'svg'` — URL+alt or SVG markup |
| Maps | Distinct `mind_map` and `concept_map` types; shared node/edge helpers + layout |
| Mind map | Tree via `parent_id`; one root |
| Concept map | Explicit edges; edge labels required on publish |
| Student state | None (no localStorage) |
| Placement | Lesson root, `section`, `columns` cells, `tabs` panels (leaf only) |
| Approach | Five leaf `block_type`s (not one `graph` / `viz` variant) |

## Out of scope

- AI builder UI / auto-fill (schemas shaped so AI can fill later)
- Canvas node drag, freehand draw, rich styling tools
- Chart.js / uPlot / other chart libraries
- Inline equations inside `rich_text`
- Matching mind/concept to a single `block_type`
- Server-side chart image generation
- Drive uploads for diagram images (URL only)
- Print-specific redesign beyond reusing SVG/img + chart data table

## Data model

### `chart`

```ts
content: {
  chart_type: 'bar' | 'line' | 'pie' | 'scatter';
  title?: string;
  x_label?: string;
  y_label?: string;
  series: Array<{
    id: string;
    name: string;
    points: Array<{ x: string | number; y: number }>; // 1–24 points per series
  }>; // 1–6 series
}
```

- Create default: one series named “Series 1”, three sample points.
- Publish: ≥1 series; each series ≥1 point with finite numeric `y`.
- Student: custom SVG + accessible table (or `details`) of values.
- Builder: live SVG preview beside/above the form.

### `equation`

```ts
content: {
  latex: string;
  caption?: string;
}
```

- Create default: e.g. `E = mc^2`.
- Publish: non-empty trimmed `latex`.
- Student/builder: KaTeX display-mode render; on parse error show latex source + non-fatal error (do not crash the lesson).

### `diagram`

```ts
content: {
  source: 'image' | 'svg';
  image_url?: string;
  image_alt?: string;
  svg_markup?: string;
  caption?: string;
}
```

- Create default: `source: 'image'`, empty URL/alt (draft OK; publish enforces).
- Publish:
  - `image`: safe URL + non-empty alt
  - `svg`: non-empty markup that passes SVG allowlist sanitiser (store/render sanitised form)
- Student: `<img>` or sanitised inline SVG; optional caption.

### Shared graph fields (`mind_map` / `concept_map`)

```ts
content: {
  title?: string;
  nodes: Array<{
    id: string;
    label: string;
    parent_id?: string | null; // mind map tree; unused/ignored for concept layout preference
  }>; // 1–24
  edges: Array<{
    id: string;
    from: string;
    to: string;
    label?: string;
  }>; // 0–40
}
```

**Mind map**

- Tree via `parent_id`; exactly one root (`parent_id` null/absent) on publish; no cycles.
- Create: centre node + two children.
- Edges optional (renderer may derive parent→child links).
- Layout: simple radial/tree SVG from helpers.

**Concept map**

- ≥2 nodes; ≥1 edge; every edge has non-empty `label` on publish; `from`/`to` must reference existing nodes.
- Create: two nodes + one labelled edge.
- Layout: simple layered/force-free positioned SVG; edge labels drawn on links.
- May share layout helpers with mind map; presets differ (labelled edges emphasised).

## Nesting

| Parent | Allowed? |
|--------|----------|
| lesson root / section / columns cell / tabs panel | yes |
| Inside chart / equation / diagram / mind_map / concept_map | no (leaves) |

## Student UX summary

| Block | Render | Persistence |
|-------|--------|-------------|
| Chart | SVG + data table alternative | none |
| Equation | KaTeX + caption | none |
| Diagram | img or sanitised SVG + caption | none |
| Mind map | SVG tree | none |
| Concept map | SVG with labelled edges | none |

## Security

- Diagram `image_url`: existing URL safety helpers (same class as image/gallery).
- Diagram `svg_markup`: new `sanitizeSvgMarkup` — allowlist elements/attributes; strip scripts, event handlers, `foreignObject`, external resource refs.
- KaTeX: render teacher-authored latex to HTML; no arbitrary JS execution path beyond KaTeX’s normal output.
- Chart/map SVGs are generated by our code from numbers/labels (escape text in SVG).

## Wiring checklist

schema → create-block (Visualisation group) → registry → render → editors → SVG sanitiser → visibility (leaf no-op) → lesson publish → KaTeX dep + CSS → unit tests → `docs/BUILD.md`

## Testing (acceptance)

1. Schema accepts/rejects bounds (series/points/nodes/edges counts; concept edge labels).
2. `createBlock` defaults and clone regenerates nested ids (series, points, nodes, edges).
3. Chart SVG includes expected marks for bar/line/pie/scatter smoke; table lists values.
4. Equation renders KaTeX for valid latex; invalid latex shows fallback without throwing.
5. SVG sanitiser removes XSS vectors; diagram image publish requires safe URL + alt.
6. Mind map publish rejects multiple roots / cycles; concept map rejects missing edge labels.
7. Registry + Add Block group list all five; visibility/publish parity with other leaves.
8. `docs/BUILD.md` moves visualisation pack to History; Next up becomes Collection (or next agreed item).

## File map (expected)

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | Types + Zod for five blocks; `leafBlockSchemas` |
| `src/schemas/lesson.ts` | Publish rules |
| `src/blocks/create-block.ts` | Defaults, labels, Visualisation group, clone ids |
| `src/blocks/chart-svg.ts` | Build accessible SVG (+ table data) from chart content |
| `src/blocks/graph-layout.ts` | Layout helpers for mind/concept maps |
| `src/blocks/sanitize-svg.ts` | Allowlist SVG sanitiser |
| `src/blocks/editors.ts` | Five stacked editors + dispatch |
| `src/blocks/render.ts` | Five renderers + dispatch |
| `src/blocks/registry.ts` | Register all five |
| `src/styles/app.css` | Viz chrome (chart/equation/diagram/map) |
| `package.json` | `katex` dependency |
| `tests/unit/visualisation-pack.test.ts` | Schema, helpers, render/editor smoke |
| `tests/unit/schemas-lesson.test.ts` | Publish rules |
| `tests/unit/render-blocks.test.ts` | Registry includes new types |
| `docs/BUILD.md` | History / Next up / projection |
