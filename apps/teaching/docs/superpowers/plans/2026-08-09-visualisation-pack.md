# Visualisation Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five leaf visualisation blocks — `chart`, `equation`, `diagram`, `mind_map`, `concept_map` — with stacked form editors, custom SVG charts, KaTeX equations, sanitised diagram SVG, and simple map layouts.

**Architecture:** Same leaf pattern as learning activities. Shared helpers: `chart-svg.ts`, `graph-layout.ts`, `sanitize-svg.ts`. KaTeX for equations. No canvas editors; schemas stay AI-fillable.

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom), KaTeX, Clinical Glass CSS

**Spec:** `docs/superpowers/specs/2026-08-09-visualisation-pack-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | Five block schemas; `BlockTypeSchema`; `leafBlockSchemas` |
| `src/schemas/lesson.ts` | Publish rules (+ graph cycle/root checks via helpers) |
| `src/blocks/create-block.ts` | Defaults, Visualisation group, clone nested ids |
| `src/blocks/chart-svg.ts` | Build SVG markup + table rows from chart content |
| `src/blocks/graph-layout.ts` | Positions for mind/concept; cycle/root validators |
| `src/blocks/sanitize-svg.ts` | Allowlist SVG sanitiser |
| `src/blocks/editors.ts` | Five stacked editors + dispatch |
| `src/blocks/render.ts` | Five renderers + dispatch |
| `src/blocks/registry.ts` | Register all five |
| `src/styles/app.css` | Viz chrome |
| `index.html` (or app entry) | Link KaTeX CSS from `katex/dist/katex.min.css` |
| `package.json` | Add `katex` dependency |
| `tests/unit/visualisation-pack.test.ts` | Schema, helpers, render/editor smoke |
| `tests/unit/schemas-lesson.test.ts` | Publish rules |
| `tests/unit/render-blocks.test.ts` | Registry keys |
| `docs/BUILD.md` | History / Next up / projection |

**No nested children** — leaves only; visibility/sanitize recursion unchanged.

---

### Task 1: Schema + createBlock

**Files:**
- Modify: `src/schemas/block.ts`
- Modify: `src/blocks/create-block.ts`
- Create: `tests/unit/visualisation-pack.test.ts`

- [ ] **Step 1: Failing tests** — parse each of five types; reject 0 chart series / >6 series / >24 points; reject empty equation latex at publish (schema allows empty string for drafts); reject diagram missing fields at publish; reject mind map with 0 nodes; reject concept map with 0 edges at schema min if applicable; `createBlock` defaults match spec; clone regenerates series/point/node/edge ids; `BLOCK_GROUPS` has Visualisation with all five; types appear in `COLUMN_CHILD_TYPES` / `TAB_CHILD_TYPES`.

```ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import {
  BLOCK_GROUPS,
  COLUMN_CHILD_TYPES,
  TAB_CHILD_TYPES,
  createBlock,
  cloneBlockWithNewIds,
  NEW_BLOCK_TYPES
} from '@/blocks/create-block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('Visualisation schemas', () => {
  it('parses chart / equation / diagram / mind_map / concept_map', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'chart',
        content: {
          chart_type: 'bar',
          series: [{ id: 's1', name: 'A', points: [{ x: 'Jan', y: 1 }] }]
        }
      }).block_type
    ).toBe('chart');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'equation',
        content: { latex: 'E = mc^2' }
      }).block_type
    ).toBe('equation');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'diagram',
        content: { source: 'image', image_url: '', image_alt: '' }
      }).block_type
    ).toBe('diagram');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'mind_map',
        content: {
          nodes: [
            { id: 'n1', label: 'Centre', parent_id: null },
            { id: 'n2', label: 'Child', parent_id: 'n1' }
          ],
          edges: []
        }
      }).block_type
    ).toBe('mind_map');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'concept_map',
        content: {
          nodes: [
            { id: 'n1', label: 'A' },
            { id: 'n2', label: 'B' }
          ],
          edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'leads to' }]
        }
      }).block_type
    ).toBe('concept_map');
  });

  it('rejects chart with zero series', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'chart',
        content: { chart_type: 'bar', series: [] }
      })
    ).toThrow();
  });
});

describe('createBlock visualisation defaults', () => {
  it('creates chart with one series and three points', () => {
    const block = createBlock('chart', 'c1');
    expect(block.block_type).toBe('chart');
    if (block.block_type !== 'chart') return;
    expect(block.content.series).toHaveLength(1);
    expect(block.content.series[0].points).toHaveLength(3);
  });

  it('creates mind_map with centre + two children', () => {
    const block = createBlock('mind_map', 'm1');
    expect(block.block_type).toBe('mind_map');
    if (block.block_type !== 'mind_map') return;
    expect(block.content.nodes).toHaveLength(3);
  });

  it('creates concept_map with two nodes and one labelled edge', () => {
    const block = createBlock('concept_map', 'cm1');
    expect(block.block_type).toBe('concept_map');
    if (block.block_type !== 'concept_map') return;
    expect(block.content.nodes).toHaveLength(2);
    expect(block.content.edges).toHaveLength(1);
    expect(block.content.edges[0].label?.length).toBeGreaterThan(0);
  });

  it('lists Visualisation group and allows nesting', () => {
    const viz = BLOCK_GROUPS.find((g) => g.label === 'Visualisation');
    expect(viz?.types).toEqual(['chart', 'equation', 'diagram', 'mind_map', 'concept_map']);
    for (const t of viz!.types) {
      expect(NEW_BLOCK_TYPES).toContain(t);
      expect(COLUMN_CHILD_TYPES).toContain(t);
      expect(TAB_CHILD_TYPES).toContain(t);
    }
  });

  it('clone regenerates nested ids for chart and maps', () => {
    const chart = createBlock('chart', 'c1');
    const mind = createBlock('mind_map', 'm1');
    let n = 0;
    const nextId = () => `id_${++n}`;
    const c2 = cloneBlockWithNewIds(chart, nextId);
    const m2 = cloneBlockWithNewIds(mind, nextId);
    expect(c2.id).not.toBe(chart.id);
    if (c2.block_type === 'chart' && chart.block_type === 'chart') {
      expect(c2.content.series[0].id).not.toBe(chart.content.series[0].id);
    }
    if (m2.block_type === 'mind_map' && mind.block_type === 'mind_map') {
      expect(m2.content.nodes[0].id).not.toBe(mind.content.nodes[0].id);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/visualisation-pack.test.ts
```

- [ ] **Step 3: Schema** — In `src/schemas/block.ts`, add to `BlockTypeSchema`: `'chart' | 'equation' | 'diagram' | 'mind_map' | 'concept_map'`.

Add schemas (after self_check / before timeline is fine):

```ts
export const ChartTypeSchema = z.enum(['bar', 'line', 'pie', 'scatter']);

export const ChartPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number()
});

export const ChartSeriesSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  points: z.array(ChartPointSchema).min(1).max(24)
});

export const ChartBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('chart'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    chart_type: ChartTypeSchema,
    title: z.string().optional(),
    x_label: z.string().optional(),
    y_label: z.string().optional(),
    series: z.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const EquationBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('equation'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    latex: z.string(),
    caption: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const DiagramSourceSchema = z.enum(['image', 'svg']);

export const DiagramBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('diagram'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    source: DiagramSourceSchema,
    image_url: z.string().optional(),
    image_alt: z.string().optional(),
    svg_markup: z.string().optional(),
    caption: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  parent_id: z.string().nullable().optional()
});

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional()
});

export const MindMapBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('mind_map'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    nodes: z.array(GraphNodeSchema).min(1).max(24),
    edges: z.array(GraphEdgeSchema).max(40)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const ConceptMapBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('concept_map'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    nodes: z.array(GraphNodeSchema).min(1).max(24),
    edges: z.array(GraphEdgeSchema).max(40)
  }),
  ...blockLayout,
  ...blockTimestamps
});
```

Append all five to `leafBlockSchemas`.

- [ ] **Step 4: create-block** — Add five types to `NEW_BLOCK_TYPES`, `NEW_BLOCK_LABEL`, and:

```ts
{
  label: 'Visualisation',
  types: ['chart', 'equation', 'diagram', 'mind_map', 'concept_map']
}
```

`createBlock` cases:

```ts
case 'chart':
  return {
    ...shared,
    block_type: 'chart',
    variant: 'medium',
    content: {
      chart_type: 'bar',
      title: '',
      series: [
        {
          id: `${id}_s1`,
          name: 'Series 1',
          points: [
            { x: 'A', y: 3 },
            { x: 'B', y: 5 },
            { x: 'C', y: 2 }
          ]
        }
      ]
    }
  };
case 'equation':
  return {
    ...shared,
    block_type: 'equation',
    variant: 'medium',
    content: { latex: 'E = mc^2' }
  };
case 'diagram':
  return {
    ...shared,
    block_type: 'diagram',
    variant: 'medium',
    content: { source: 'image', image_url: '', image_alt: '' }
  };
case 'mind_map':
  return {
    ...shared,
    block_type: 'mind_map',
    variant: 'medium',
    content: {
      nodes: [
        { id: `${id}_n1`, label: 'Centre', parent_id: null },
        { id: `${id}_n2`, label: 'Idea 1', parent_id: `${id}_n1` },
        { id: `${id}_n3`, label: 'Idea 2', parent_id: `${id}_n1` }
      ],
      edges: []
    }
  };
case 'concept_map':
  return {
    ...shared,
    block_type: 'concept_map',
    variant: 'medium',
    content: {
      nodes: [
        { id: `${id}_n1`, label: 'Concept A' },
        { id: `${id}_n2`, label: 'Concept B' }
      ],
      edges: [{ id: `${id}_e1`, from: `${id}_n1`, to: `${id}_n2`, label: 'relates to' }]
    }
  };
```

Clone branches: chart → new series + point ids (points have no ids — only series ids); mind_map / concept_map → remap node ids and rewrite `parent_id` / edge `from`/`to` to new ids; regenerate edge ids.

```ts
} else if (cloned.block_type === 'chart') {
  cloned.content = {
    ...cloned.content,
    series: cloned.content.series.map((series) => ({
      ...series,
      id: nextId()
    }))
  };
} else if (cloned.block_type === 'mind_map' || cloned.block_type === 'concept_map') {
  const idMap = new Map<string, string>();
  for (const node of cloned.content.nodes) {
    idMap.set(node.id, nextId());
  }
  cloned.content = {
    ...cloned.content,
    nodes: cloned.content.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      parent_id:
        node.parent_id == null ? node.parent_id : (idMap.get(node.parent_id) ?? null)
    })),
    edges: cloned.content.edges.map((edge) => ({
      ...edge,
      id: nextId(),
      from: idMap.get(edge.from) ?? edge.from,
      to: idMap.get(edge.to) ?? edge.to
    }))
  };
}
```

- [ ] **Step 5: Run — expect PASS** for Task 1 tests (registry tests may still fail later — keep them out of this file until Task 6).

```bash
npx vitest run tests/unit/visualisation-pack.test.ts
```

- [ ] **Step 6: Commit** (only if user requested commits in this session; otherwise skip)

```bash
git add src/schemas/block.ts src/blocks/create-block.ts tests/unit/visualisation-pack.test.ts
git commit -m "$(cat <<'EOF'
feat: add visualisation block schemas and create defaults

EOF
)"
```

---

### Task 2: SVG sanitiser + graph validators + chart SVG

**Files:**
- Create: `src/blocks/sanitize-svg.ts`
- Create: `src/blocks/graph-layout.ts`
- Create: `src/blocks/chart-svg.ts`
- Modify: `tests/unit/visualisation-pack.test.ts`

- [ ] **Step 1: Failing helper tests**

```ts
import { sanitizeSvgMarkup } from '@/blocks/sanitize-svg';
import { validateMindMap, validateConceptMap, layoutMindMap, layoutConceptMap } from '@/blocks/graph-layout';
import { buildChartSvg, buildChartTableRows } from '@/blocks/chart-svg';

describe('sanitizeSvgMarkup', () => {
  it('strips script and on* handlers', () => {
    const out = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle onclick="evil()" r="5"/></svg>'
    );
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).toMatch(/<circle/i);
  });

  it('strips foreignObject and external hrefs', () => {
    const out = sanitizeSvgMarkup(
      '<svg><foreignObject><div>x</div></foreignObject><use href="https://evil.test/x"/></svg>'
    );
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).not.toMatch(/https:\/\/evil/i);
  });
});

describe('graph-layout validators', () => {
  it('mind map requires one root and no cycles', () => {
    expect(
      validateMindMap({
        nodes: [
          { id: 'a', label: 'A', parent_id: null },
          { id: 'b', label: 'B', parent_id: 'a' }
        ],
        edges: []
      })
    ).toBeNull();

    expect(
      validateMindMap({
        nodes: [
          { id: 'a', label: 'A', parent_id: null },
          { id: 'b', label: 'B', parent_id: null }
        ],
        edges: []
      })
    ).toMatch(/root/i);

    expect(
      validateMindMap({
        nodes: [
          { id: 'a', label: 'A', parent_id: 'b' },
          { id: 'b', label: 'B', parent_id: 'a' }
        ],
        edges: []
      })
    ).toMatch(/cycle/i);
  });

  it('concept map requires labelled edges and valid endpoints', () => {
    expect(
      validateConceptMap({
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' }
        ],
        edges: [{ id: 'e1', from: 'a', to: 'b', label: 'to' }]
      })
    ).toBeNull();

    expect(
      validateConceptMap({
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' }
        ],
        edges: [{ id: 'e1', from: 'a', to: 'b', label: '  ' }]
      })
    ).toMatch(/label/i);
  });
});

describe('chart-svg', () => {
  it('emits svg and table rows for bar chart', () => {
    const content = {
      chart_type: 'bar' as const,
      title: 'Demo',
      series: [{ id: 's1', name: 'S', points: [{ x: 'A', y: 2 }, { x: 'B', y: 4 }] }]
    };
    const svg = buildChartSvg(content);
    expect(svg).toMatch(/<svg[\s\S]*<\/svg>/);
    expect(svg).toMatch(/A/);
    const rows = buildChartTableRows(content);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/visualisation-pack.test.ts
```

- [ ] **Step 3: Implement `sanitize-svg.ts`**

```ts
const ALLOWED_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'title', 'desc', 'linearGradient', 'radialGradient',
  'stop', 'clipPath', 'mask', 'use', 'symbol'
]);

const ALLOWED_ATTRS = new Set([
  'id', 'class', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'transform', 'd', 'cx', 'cy', 'r', 'rx', 'ry',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'text-anchor',
  'font-size', 'font-family', 'dx', 'dy', 'offset', 'stop-color', 'stop-opacity',
  'gradientUnits', 'clip-path', 'mask', 'href', 'xlink:href'
]);

function isSafeHref(value: string): boolean {
  const v = value.trim();
  return v.startsWith('#') || v.startsWith('data:image/svg+xml');
}

export function sanitizeSvgMarkup(markup: string): string {
  const doc = new DOMParser().parseFromString(
    `<div id="svg-root">${markup}</div>`,
    'text/html'
  );
  const root = doc.getElementById('svg-root');
  if (!root) return '';

  function clean(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return Array.from(el.childNodes).map(clean).join('');
    }
    const attrs: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) continue;
      if (!ALLOWED_ATTRS.has(name)) continue;
      if ((name === 'href' || name === 'xlink:href') && !isSafeHref(attr.value)) continue;
      attrs.push(`${name}="${attr.value.replace(/"/g, '&quot;')}"`);
    }
    const inner = Array.from(el.childNodes).map(clean).join('');
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner}</${tag}>`;
  }

  return Array.from(root.childNodes).map(clean).join('');
}
```

- [ ] **Step 4: Implement `graph-layout.ts`**

Export:

- `validateMindMap(content): string | null` — exactly one root (`parent_id == null` or absent); every non-root `parent_id` exists; no cycles (walk parents); return human message or null.
- `validateConceptMap(content): string | null` — ≥2 nodes; ≥1 edge; every edge non-empty label; from/to exist.
- `layoutMindMap(nodes): Array<{ id, x, y, label }>` — simple tree: root at centre, children on a circle/rows.
- `layoutConceptMap(nodes, edges): { nodes: Array<{id,x,y,label}>, edges: Array<{from,to,label,x1,y1,x2,y2}> }` — place nodes on a grid/circle; edge midpoints for labels.

Keep layout deterministic (sort by id) so tests are stable.

- [ ] **Step 5: Implement `chart-svg.ts`**

```ts
export type ChartContent = {
  chart_type: 'bar' | 'line' | 'pie' | 'scatter';
  title?: string;
  x_label?: string;
  y_label?: string;
  series: Array<{ id: string; name: string; points: Array<{ x: string | number; y: number }> }>;
};

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildChartTableRows(content: ChartContent): Array<{ series: string; x: string; y: string }> {
  const rows: Array<{ series: string; x: string; y: string }> = [];
  for (const series of content.series) {
    for (const point of series.points) {
      rows.push({ series: series.name, x: String(point.x), y: String(point.y) });
    }
  }
  return rows;
}

export function buildChartSvg(content: ChartContent): string {
  // Implement bar/line/pie/scatter with viewBox="0 0 400 240"
  // Escape all labels via escapeXml.
  // For pie: use first series only.
  // Return full <svg>...</svg> string.
}
```

Minimal viable geometry is fine (bars as rects, line as polyline, pie as path wedges, scatter as circles). Include optional title as `<text>`.

- [ ] **Step 6: Run — expect PASS**

```bash
npx vitest run tests/unit/visualisation-pack.test.ts
```

- [ ] **Step 7: Commit** (if requested)

```bash
git add src/blocks/sanitize-svg.ts src/blocks/graph-layout.ts src/blocks/chart-svg.ts tests/unit/visualisation-pack.test.ts
git commit -m "$(cat <<'EOF'
feat: add chart SVG, graph layout, and SVG sanitiser helpers

EOF
)"
```

---

### Task 3: Publish rules

**Files:**
- Modify: `src/schemas/lesson.ts`
- Modify: `tests/unit/schemas-lesson.test.ts`

- [ ] **Step 1: Failing publish tests** — add cases mirroring flashcards block:

- chart empty series points with non-finite y → reject  
- equation empty latex → reject  
- diagram image without http URL or alt → reject  
- diagram svg empty / fails sanitiser emptiness → reject  
- mind map multiple roots / cycle → reject (message from `validateMindMap`)  
- concept map missing edge label → reject  
- valid samples of each → accept via `PublishedLessonSchema` / existing publish helper used in file

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/schemas-lesson.test.ts
```

- [ ] **Step 3: Implement in `publishBlockIssues`**

```ts
import { isHttpUrl } from '@/blocks/url-safety';
import { sanitizeSvgMarkup } from '@/blocks/sanitize-svg';
import { validateMindMap, validateConceptMap } from '@/blocks/graph-layout';

// inside loop:
if (block.block_type === 'chart') {
  for (const series of block.content.series) {
    if (series.points.length === 0) {
      return 'Chart series need at least one point to publish';
    }
    for (const point of series.points) {
      if (!Number.isFinite(point.y)) {
        return 'Chart points need finite y values to publish';
      }
    }
  }
}
if (block.block_type === 'equation') {
  if (block.content.latex.trim().length === 0) {
    return 'Equation blocks need LaTeX to publish';
  }
}
if (block.block_type === 'diagram') {
  if (block.content.source === 'image') {
    if (!isHttpUrl(block.content.image_url ?? '')) {
      return 'Diagram image needs a valid http(s) URL to publish';
    }
    if ((block.content.image_alt ?? '').trim().length === 0) {
      return 'Diagram image needs alt text to publish';
    }
  } else {
    const cleaned = sanitizeSvgMarkup(block.content.svg_markup ?? '');
    if (cleaned.trim().length === 0) {
      return 'Diagram SVG needs safe SVG markup to publish';
    }
  }
}
if (block.block_type === 'mind_map') {
  const issue = validateMindMap(block.content);
  if (issue) return issue;
}
if (block.block_type === 'concept_map') {
  const issue = validateConceptMap(block.content);
  if (issue) return issue;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/schemas-lesson.test.ts
```

- [ ] **Step 5: Commit** (if requested)

---

### Task 4: Install KaTeX + renderers

**Files:**
- Modify: `package.json` / lockfile via npm
- Modify: `index.html` (link KaTeX CSS)
- Modify: `src/blocks/render.ts`
- Modify: `tests/unit/visualisation-pack.test.ts`

- [ ] **Step 1: Install**

```bash
npm install katex@0.16.22
```

Add to `index.html` head (after app.css):

```html
<link rel="stylesheet" href="/node_modules/katex/dist/katex.min.css" />
```

(If Vite prefers, `import 'katex/dist/katex.min.css'` from `src/app/main.ts` instead — use whichever pattern already exists for CSS; prefer main.ts import if present.)

- [ ] **Step 2: Failing render smoke tests**

```ts
import { renderBlock } from '@/blocks/render';

it('renders chart svg and table', () => {
  const block = createBlock('chart', 'c1');
  const el = renderBlock(block, 'student');
  expect(el.querySelector('svg')).toBeTruthy();
  expect(el.querySelector('table, details')).toBeTruthy();
});

it('renders equation with katex or fallback', () => {
  const block = createBlock('equation', 'e1');
  const el = renderBlock(block, 'student');
  expect(el.querySelector('.block-equation')).toBeTruthy();
  expect(el.textContent).toMatch(/E|mc|error|\\\\|=/i);
});

it('renders sanitised diagram svg', () => {
  const block = {
    ...createBlock('diagram', 'd1'),
    content: {
      source: 'svg' as const,
      svg_markup: '<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script><circle r="3"/></svg>'
    }
  };
  const el = renderBlock(block as ReturnType<typeof createBlock>, 'student');
  expect(el.querySelector('script')).toBeNull();
  expect(el.innerHTML).toMatch(/circle/i);
});

it('renders mind_map and concept_map svg', () => {
  expect(renderBlock(createBlock('mind_map', 'm1'), 'student').querySelector('svg')).toBeTruthy();
  expect(renderBlock(createBlock('concept_map', 'cm1'), 'student').querySelector('svg')).toBeTruthy();
});
```

- [ ] **Step 3: Implement renderers** in `render.ts`

Pattern for each: outer `.block.block-<type>`, then content.

**Chart:**

```ts
export function renderChartBlock(block: Extract<Block, { block_type: 'chart' }>, _mode: RenderMode): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block block-chart';
  root.dataset.blockId = block.id;
  if (block.content.title) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-chart__title';
    cap.textContent = block.content.title;
    root.append(cap);
  }
  const wrap = document.createElement('div');
  wrap.className = 'block-chart__svg';
  wrap.innerHTML = buildChartSvg(block.content);
  root.append(wrap);

  const details = document.createElement('details');
  details.className = 'block-chart__data';
  const summary = document.createElement('summary');
  summary.textContent = 'Chart data';
  const table = document.createElement('table');
  // thead Series / X / Y; tbody from buildChartTableRows
  details.append(summary, table);
  root.append(details);
  return root;
}
```

**Equation:**

```ts
import katex from 'katex';

export function renderEquationBlock(block: Extract<Block, { block_type: 'equation' }>, _mode: RenderMode): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block block-equation';
  const math = document.createElement('div');
  math.className = 'block-equation__math';
  try {
    katex.render(block.content.latex, math, { throwOnError: false, displayMode: true });
  } catch {
    math.textContent = block.content.latex;
    math.classList.add('block-equation__math--error');
  }
  root.append(math);
  if (block.content.caption?.trim()) {
    const cap = document.createElement('figcaption');
    cap.textContent = block.content.caption;
    root.append(cap);
  }
  return root;
}
```

Note: with `throwOnError: false`, KaTeX puts error text in the element — still OK. Also handle empty latex.

**Diagram:**

```ts
export function renderDiagramBlock(block: Extract<Block, { block_type: 'diagram' }>, _mode: RenderMode): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block block-diagram';
  if (block.content.source === 'image') {
    const img = document.createElement('img');
    img.className = 'block-diagram__image';
    img.src = block.content.image_url ?? '';
    img.alt = block.content.image_alt ?? '';
    root.append(img);
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'block-diagram__svg';
    wrap.innerHTML = sanitizeSvgMarkup(block.content.svg_markup ?? '');
    root.append(wrap);
  }
  if (block.content.caption?.trim()) {
    const cap = document.createElement('figcaption');
    cap.textContent = block.content.caption;
    root.append(cap);
  }
  return root;
}
```

**Mind / concept maps:** build SVG string from `layoutMindMap` / `layoutConceptMap` — circles + text + lines; escape labels with `escapeXml` from chart-svg (or shared escape). Put in `.block-mind-map` / `.block-concept-map`.

Wire into `renderBlock` switch.

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/visualisation-pack.test.ts
```

- [ ] **Step 5: Commit** (if requested)

---

### Task 5: Editors

**Files:**
- Modify: `src/blocks/editors.ts`
- Modify: `tests/unit/visualisation-pack.test.ts`

- [ ] **Step 1: Failing editor smoke tests** — each `createXEditor` mounts fields; changing an input calls `onChange` with updated content (mirror flashcards tests).

- [ ] **Step 2: Implement five editors** (stacked forms + live preview):

Shared pattern: `.block-editor__fields` + preview region that calls the same helpers/render snippets.

**Chart editor:** select `chart_type`; inputs title / x_label / y_label; for each series: name + point rows (x, y) + add/remove series (max 6) + add/remove points (max 24); preview `innerHTML = buildChartSvg(...)`.

**Equation editor:** textarea latex; input caption; preview via katex into a div (same try/fallback as render).

**Diagram editor:** select source image|svg; if image: url + alt; if svg: textarea; caption; preview img or sanitised svg.

**Mind map editor:** title; node list (label + parent `<select>` of other nodes / None); add/remove (max 24); preview from layout SVG.

**Concept map editor:** title; node labels; edge list (from/to selects + label); add/remove; preview.

Emit via `onChange({ ...getLatest(), content: {...} })` like flashcards.

Wire into `createBlockEditor` switch.

- [ ] **Step 3: Run — expect PASS**

```bash
npx vitest run tests/unit/visualisation-pack.test.ts
```

- [ ] **Step 4: Commit** (if requested)

---

### Task 6: Registry + CSS + BUILD

**Files:**
- Modify: `src/blocks/registry.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/render-blocks.test.ts` (if it asserts registry key list)
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Register** all five in `blockRegistry` and re-export render/editor symbols like existing entries.

- [ ] **Step 2: CSS** — append Clinical Glass-friendly rules (no purple/glow). Use existing spacing/border tokens:

```css
.block-chart,
.block-equation,
.block-diagram,
.block-mind-map,
.block-concept-map {
  margin: 0 0 var(--space-4, 1rem);
}

.block-chart__svg svg,
.block-diagram__svg svg,
.block-mind-map svg,
.block-concept-map svg {
  max-width: 100%;
  height: auto;
  display: block;
}

.block-chart__data {
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.block-equation__math {
  overflow-x: auto;
}

.block-equation__math--error {
  color: var(--color-danger, #a33);
  font-family: ui-monospace, monospace;
}

.block-editor__viz-preview {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--border-subtle, #ddd);
  border-radius: 4px;
  background: var(--surface-2, #fafafa);
}
```

Tune to match tokens already in `app.css`.

- [ ] **Step 3: Update `docs/BUILD.md`**

- Next up #1 → Collection (html_app / Builder UX remain after)
- History row: Visualisation pack shipped (five types + KaTeX + custom SVG)
- Block types live: add five (count 25 → 30)
- Projection: tick Chart, Equation, Diagram, Mind map, Concept map
- Latest note: visualisation pack done; next Collection

- [ ] **Step 4: Full unit pass**

```bash
npx vitest run tests/unit
```

- [ ] **Step 5: Commit** (if requested)

```bash
git add src/blocks/registry.ts src/styles/app.css docs/BUILD.md tests/unit/render-blocks.test.ts tests/unit/visualisation-pack.test.ts package.json package-lock.json index.html src/app/main.ts
git commit -m "$(cat <<'EOF'
feat: register visualisation blocks and update BUILD roadmap

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Five leaf types, one slice | 1–6 |
| Custom SVG charts bar/line/pie/scatter | 2, 4 |
| Chart table alternative | 4 |
| KaTeX equation + error fallback | 4 |
| Diagram image \| svg + sanitiser | 2, 3, 4 |
| Mind/concept form editors + SVG layout | 2, 4, 5 |
| Mind one root / no cycles; concept labelled edges | 2, 3 |
| Visualisation Add Block group | 1 |
| Publish rules | 3 |
| Nesting as leaves | 1 (COLUMN/TAB child types) |
| BUILD update | 6 |
| No canvas / Chart.js / AI UI | — out of scope |

No TBD placeholders. Clone id remapping for maps is explicit. KaTeX version pinned in install step.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-09-visualisation-pack.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
