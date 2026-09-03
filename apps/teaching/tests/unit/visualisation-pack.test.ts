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
import { sanitizeSvgMarkup, svgHasMeaningfulContent } from '@/blocks/sanitize-svg';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';
import {
  validateMindMap,
  validateConceptMap,
  layoutMindMap,
  layoutConceptMap
} from '@/blocks/graph-layout';
import { buildChartSvg, buildChartTableRows } from '@/blocks/chart-svg';
import {
  createBlockEditor,
  createChartEditor,
  createConceptMapEditor,
  createDiagramEditor,
  createEquationEditor,
  createMindMapEditor
} from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { toPublishedLesson, LessonSchema } from '@/schemas';

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

  it('rejects chart with more than six series', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'chart',
        content: {
          chart_type: 'bar',
          series: Array.from({ length: 7 }, (_, i) => ({
            id: `s${i + 1}`,
            name: `S${i + 1}`,
            points: [{ x: 'A', y: 1 }]
          }))
        }
      })
    ).toThrow();
  });

  it('rejects chart series with more than 24 points', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'chart',
        content: {
          chart_type: 'bar',
          series: [
            {
              id: 's1',
              name: 'A',
              points: Array.from({ length: 25 }, (_, i) => ({ x: `p${i}`, y: i }))
            }
          ]
        }
      })
    ).toThrow();
  });

  it('rejects mind_map with zero nodes', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'mind_map',
        content: { nodes: [], edges: [] }
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
    const concept = createBlock('concept_map', 'cm1');
    let n = 0;
    const nextId = () => `id_${++n}`;
    const c2 = cloneBlockWithNewIds(chart, nextId);
    const m2 = cloneBlockWithNewIds(mind, nextId);
    const cm2 = cloneBlockWithNewIds(concept, nextId);

    expect(c2.id).not.toBe(chart.id);
    if (c2.block_type === 'chart' && chart.block_type === 'chart') {
      expect(c2.content.series[0].id).not.toBe(chart.content.series[0].id);
    }

    expect(m2.block_type).toBe('mind_map');
    expect(mind.block_type).toBe('mind_map');
    if (m2.block_type === 'mind_map' && mind.block_type === 'mind_map') {
      const [origRoot, ...origChildren] = mind.content.nodes;
      const [clonedRoot, ...clonedChildren] = m2.content.nodes;
      expect(clonedRoot.id).not.toBe(origRoot.id);
      expect(clonedRoot.parent_id).toBeNull();
      for (let i = 0; i < origChildren.length; i++) {
        expect(clonedChildren[i].id).not.toBe(origChildren[i].id);
        expect(clonedChildren[i].parent_id).toBe(clonedRoot.id);
        expect(clonedChildren[i].parent_id).not.toBe(origRoot.id);
      }
    }

    expect(cm2.block_type).toBe('concept_map');
    expect(concept.block_type).toBe('concept_map');
    if (cm2.block_type === 'concept_map' && concept.block_type === 'concept_map') {
      expect(cm2.content.nodes).toHaveLength(2);
      expect(cm2.content.edges).toHaveLength(1);
      expect(cm2.content.nodes[0].id).not.toBe(concept.content.nodes[0].id);
      expect(cm2.content.nodes[1].id).not.toBe(concept.content.nodes[1].id);
      expect(cm2.content.edges[0].id).not.toBe(concept.content.edges[0].id);
      expect(cm2.content.edges[0].from).toBe(cm2.content.nodes[0].id);
      expect(cm2.content.edges[0].to).toBe(cm2.content.nodes[1].id);
      expect(cm2.content.edges[0].from).not.toBe(concept.content.nodes[0].id);
      expect(cm2.content.edges[0].to).not.toBe(concept.content.nodes[1].id);
    }
  });
});

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

  it('escapes entity-encoded markup in text so it cannot break out', () => {
    const out = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>'
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).toMatch(/&lt;\/text&gt;/i);
    expect(out).toMatch(/&lt;script&gt;/i);
  });

  it('strips data URI hrefs', () => {
    const out = sanitizeSvgMarkup(
      '<svg><use href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>'
    );
    expect(out).not.toMatch(/data:image\/svg\+xml/i);
    expect(out).toMatch(/<use/i);
  });

  it('rejects external url() in fill/stroke/clip-path/mask', () => {
    const out = sanitizeSvgMarkup(
      [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        '<defs><clipPath id="c"><circle r="5"/></clipPath></defs>',
        '<circle fill="url(https://evil.test/x)" stroke="url(//evil.test/y)" r="5"/>',
        '<rect fill="url(#c)" clip-path="url(https://evil.test/clip)" width="10" height="10"/>',
        '<ellipse fill="url(#c)" mask="url(\'https://evil.test/m\')" rx="2" ry="2"/>',
        '</svg>'
      ].join('')
    );
    expect(out).not.toMatch(/evil\.test/i);
    expect(out).toMatch(/fill="url\(#c\)"/);
    expect(out).toMatch(/<circle/i);
  });

  it('keeps same-document url(#...) references', () => {
    const out = sanitizeSvgMarkup(
      '<svg><circle fill="url(#grad)" stroke="url(#grad)" clip-path="url(#clip)" mask="url(#m)" r="3"/></svg>'
    );
    expect(out).toMatch(/fill="url\(#grad\)"/);
    expect(out).toMatch(/stroke="url\(#grad\)"/);
    expect(out).toMatch(/clip-path="url\(#clip\)"/);
    expect(out).toMatch(/mask="url\(#m\)"/);
  });

  it('detects empty SVG shells as non-meaningful', () => {
    expect(svgHasMeaningfulContent('')).toBe(false);
    expect(svgHasMeaningfulContent('<svg></svg>')).toBe(false);
    expect(svgHasMeaningfulContent('<svg><g></g></svg>')).toBe(false);
    expect(svgHasMeaningfulContent('<svg><defs><linearGradient id="g"/></defs></svg>')).toBe(
      false
    );
    expect(svgHasMeaningfulContent('<svg><path/></svg>')).toBe(false);
    expect(svgHasMeaningfulContent('<svg><path d=""/></svg>')).toBe(false);
    expect(svgHasMeaningfulContent('<svg><circle r="5"/></svg>')).toBe(true);
    expect(svgHasMeaningfulContent('<svg><path d="M0 0 L1 1"/></svg>')).toBe(true);
    expect(svgHasMeaningfulContent('<svg><text>Hi</text></svg>')).toBe(true);
  });
});

describe('sanitizeBlocksDeep diagram', () => {
  it('persists sanitised svg_markup for diagram blocks', () => {
    const block = createBlock('diagram', 'd1');
    if (block.block_type !== 'diagram') throw new Error('expected diagram');
    block.content = {
      source: 'svg',
      svg_markup:
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle fill="url(https://evil.test/x)" r="3"/></svg>'
    };

    const [out] = sanitizeBlocksDeep([block]);
    expect(out?.block_type).toBe('diagram');
    if (out?.block_type !== 'diagram') return;
    expect(out.content.svg_markup).not.toMatch(/script/i);
    expect(out.content.svg_markup).not.toMatch(/evil\.test/i);
    expect(out.content.svg_markup).toMatch(/<circle/i);
  });

  it('stores sanitised diagram markup on publish snapshot', () => {
    const diagram = createBlock('diagram', 'd1');
    if (diagram.block_type !== 'diagram') throw new Error('expected diagram');
    diagram.content = {
      source: 'svg',
      svg_markup:
        '<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script><circle r="4"/></svg>'
    };
    const lesson = LessonSchema.parse({
      id: 'lesson_viz',
      type: 'lesson',
      title: 'Viz',
      slug: 'viz',
      unit_id: 'unit_1',
      sequence: 1,
      blocks: [diagram],
      status: 'active',
      ...timestamps,
      schema_version: 1
    });
    const published = toPublishedLesson(lesson, '2026-08-09T00:00:00.000Z');
    const stored = published.blocks[0];
    expect(stored?.block_type).toBe('diagram');
    if (stored?.block_type !== 'diagram') return;
    expect(stored.content.svg_markup).not.toMatch(/script/i);
    expect(stored.content.svg_markup).toMatch(/<circle/i);
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

  it('layout helpers return deterministic positioned nodes', () => {
    const mindNodes = [
      { id: 'b', label: 'B', parent_id: 'a' },
      { id: 'a', label: 'A', parent_id: null },
      { id: 'c', label: 'C', parent_id: 'a' }
    ];
    const mindLayout = layoutMindMap(mindNodes);
    expect(mindLayout).toHaveLength(mindNodes.length);
    for (const node of mindLayout) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    expect(layoutMindMap(mindNodes)).toEqual(mindLayout);

    const conceptNodes = [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' }
    ];
    const conceptEdges = [{ id: 'e1', from: 'a', to: 'b', label: 'to' }];
    const conceptLayout = layoutConceptMap(conceptNodes, conceptEdges);
    expect(conceptLayout.nodes).toHaveLength(conceptNodes.length);
    for (const node of conceptLayout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    expect(conceptLayout.edges).toHaveLength(1);
    expect(Number.isFinite(conceptLayout.edges[0].x1)).toBe(true);
    expect(Number.isFinite(conceptLayout.edges[0].y1)).toBe(true);
    expect(Number.isFinite(conceptLayout.edges[0].x2)).toBe(true);
    expect(Number.isFinite(conceptLayout.edges[0].y2)).toBe(true);
    expect(layoutConceptMap(conceptNodes, conceptEdges)).toEqual(conceptLayout);
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
    expect(svg).toMatch(/var\(--wave\)/);
    expect(svg).not.toMatch(/#2563eb/);
    expect(svg).not.toMatch(/>Demo</);
    const rows = buildChartTableRows(content);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('uses a series colour token when set', () => {
    const svg = buildChartSvg({
      chart_type: 'bar',
      series: [
        { id: 's1', name: 'Spaced', color: 'danger', points: [{ x: 'Day 1', y: 80 }] }
      ]
    });
    expect(svg).toMatch(/var\(--danger\)/);
  });
});

describe('visualisation renderers', () => {
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
        svg_markup:
          '<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script><circle r="3"/></svg>'
      }
    };
    const el = renderBlock(block as ReturnType<typeof createBlock>, 'student');
    expect(el.querySelector('script')).toBeNull();
    expect(el.innerHTML).toMatch(/circle/i);
  });

  it('does not set diagram img src for non-http urls', () => {
    for (const image_url of ['javascript:alert(1)', 'data:text/html,hi', 'not-a-url', '']) {
      const block = {
        ...createBlock('diagram', 'd1'),
        content: {
          source: 'image' as const,
          image_url,
          image_alt: 'Unsafe diagram'
        }
      };
      const el = renderBlock(block as ReturnType<typeof createBlock>, 'student');
      const img = el.querySelector('img');
      expect(img).toBeNull();
      expect(el.querySelector('.block-diagram__unavailable')).toBeTruthy();
      expect(el.innerHTML).not.toMatch(/javascript:/i);
    }
  });

  it('tells the teacher a caption-only diagram cannot publish', () => {
    const block = {
      ...createBlock('diagram', 'd1'),
      content: {
        source: 'image' as const,
        image_url: '',
        image_alt: '',
        caption: 'Spacing vs massed practice'
      }
    };
    const el = renderBlock(block as ReturnType<typeof createBlock>, 'teacher');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.block-diagram__unavailable')?.textContent).toBe(
      'Diagram image needs a valid http(s) URL to publish'
    );
    expect(el.querySelector('.block-diagram__caption')?.textContent).toBe(
      'Spacing vs massed practice'
    );
  });

  it('renders mind_map and concept_map canvases', () => {
    const mind = renderBlock(createBlock('mind_map', 'm1'), 'student');
    expect(mind.querySelector('.block-mind-map__canvas .block-graph-maker')).toBeTruthy();
    expect(mind.querySelector('.node')).toBeTruthy();

    const concept = renderBlock(createBlock('concept_map', 'cm1'), 'student');
    expect(concept.querySelector('.block-concept-map__canvas .block-graph-maker')).toBeTruthy();
    expect(concept.querySelector('.graph-edge')).toBeTruthy();
  });

  it('keeps the mind map title in HTML and renders labelled nodes on the canvas', () => {
    const block = createBlock('mind_map', 'm1');
    if (block.block_type !== 'mind_map') throw new Error('expected mind_map');
    block.content = {
      title: 'The Spacing Effect',
      nodes: [
        { id: 'centre', label: 'Spacing Effect', parent_id: null },
        ...[
          'Why it works',
          'Evidence base',
          'How to apply it',
          'Retrieval practice',
          'Cepeda et al. (2006)',
          'Ebbinghaus (1885)',
          'Flashcard review sessions',
          'repetition schedule'
        ].map((label, index) => ({
          id: `n${index + 1}`,
          label,
          parent_id: 'centre'
        }))
      ],
      edges: []
    };
    const el = renderBlock(block, 'teacher');
    expect(el.querySelector('.block-mind-map__title')?.textContent).toBe('The Spacing Effect');
    expect(el.querySelector('.block-mind-map__canvas .node')).not.toBeNull();
    const labels = [...el.querySelectorAll('.node__text')].map((node) => node.textContent ?? '');
    expect(labels.some((text) => text.includes('Why it works'))).toBe(true);
    expect(labels.some((text) => text.includes('Spacing Effect'))).toBe(true);
  });
});

describe('visualisation editors', () => {
  describe('createChartEditor', () => {
    it('mounts fields and updates content on input', () => {
      const block = createBlock('chart', 'c1');
      if (block.block_type !== 'chart') throw new Error('expected chart');
      let latest = block;
      const el = createChartEditor(block, (next) => {
        latest = next;
      });

      expect(el.querySelector('.block-editor__chart-type')).not.toBeNull();
      expect(el.querySelector('.block-editor__chart-preview svg')).not.toBeNull();

      const title = el.querySelector('.block-editor__chart-title') as HTMLInputElement;
      title.value = 'Enrolments';
      title.dispatchEvent(new Event('input'));
      expect(latest.content.title).toBe('Enrolments');

      const type = el.querySelector('.block-editor__chart-type') as HTMLSelectElement;
      type.value = 'line';
      type.dispatchEvent(new Event('change'));
      expect(latest.content.chart_type).toBe('line');

      const seriesName = el.querySelector('.block-editor__chart-series-name') as HTMLInputElement;
      seriesName.value = 'Class A';
      seriesName.dispatchEvent(new Event('input'));
      expect(latest.content.series[0]!.name).toBe('Class A');
    });

    it('lets the teacher pick a series colour from the kit tokens', () => {
      const block = createBlock('chart', 'c1');
      if (block.block_type !== 'chart') throw new Error('expected chart');
      let latest = block;
      const el = createChartEditor(block, (next) => {
        latest = next;
      });
      const colour = el.querySelector('.block-editor__chart-series-color') as HTMLSelectElement;
      expect(colour).not.toBeNull();
      colour.value = 'danger';
      colour.dispatchEvent(new Event('change'));
      expect(latest.content.series[0]?.color).toBe('danger');
    });
  });

  describe('createEquationEditor', () => {
    it('mounts latex field and updates content on input', () => {
      const block = createBlock('equation', 'e1');
      if (block.block_type !== 'equation') throw new Error('expected equation');
      let latest = block;
      const el = createEquationEditor(block, (next) => {
        latest = next;
      });

      const latex = el.querySelector('.block-editor__equation-latex') as HTMLTextAreaElement;
      expect(latex).not.toBeNull();
      latex.value = 'a^2 + b^2 = c^2';
      latex.dispatchEvent(new Event('input'));
      expect(latest.content.latex).toBe('a^2 + b^2 = c^2');

      const caption = el.querySelector('.block-editor__equation-caption') as HTMLInputElement;
      caption.value = 'Pythagoras';
      caption.dispatchEvent(new Event('input'));
      expect(latest.content.caption).toBe('Pythagoras');
    });
  });

  describe('createDiagramEditor', () => {
    it('mounts source fields and updates content on input', () => {
      const block = createBlock('diagram', 'd1');
      if (block.block_type !== 'diagram') throw new Error('expected diagram');
      let latest = block;
      const el = createDiagramEditor(block, (next) => {
        latest = next;
      });

      const url = el.querySelector('.block-editor__diagram-url') as HTMLInputElement;
      expect(url).not.toBeNull();
      url.value = 'https://example.com/diagram.png';
      url.dispatchEvent(new Event('input'));
      expect(latest.content.image_url).toBe('https://example.com/diagram.png');

      const source = el.querySelector('.block-editor__diagram-source') as HTMLSelectElement;
      source.value = 'svg';
      source.dispatchEvent(new Event('change'));
      expect(latest.content.source).toBe('svg');

      const svg = el.querySelector('.block-editor__diagram-svg') as HTMLTextAreaElement;
      expect(svg.hidden).toBe(false);
      svg.value = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>';
      svg.dispatchEvent(new Event('input'));
      expect(latest.content.svg_markup).toContain('circle');
    });

    it('previews the publish URL requirement when the image URL is empty', () => {
      const block = createBlock('diagram', 'd1');
      if (block.block_type !== 'diagram') throw new Error('expected diagram');
      const el = createDiagramEditor(block, () => {});
      expect(el.querySelector('.block-editor__diagram-preview')?.textContent).toContain(
        'Diagram image needs a valid http(s) URL to publish'
      );
    });
  });

  describe('createMindMapEditor', () => {
    it('mounts the interactive graph canvas', () => {
      const block = createBlock('mind_map', 'm1');
      if (block.block_type !== 'mind_map') throw new Error('expected mind_map');
      let latest = block;
      const el = createMindMapEditor(block, (next) => {
        latest = next;
      });

      expect(el.querySelector('.block-editor__mind-map-title')).not.toBeNull();
      expect(el.querySelector('.block-graph-maker-host .block-graph-maker')).not.toBeNull();
      const connectors = [...el.querySelectorAll('.graph-maker__edges path')];
      expect(connectors.length).toBeGreaterThan(0);
      for (const path of connectors) {
        expect(path.getAttribute('fill')).toBe('none');
        expect(path.getAttribute('stroke-width')).toBe('2');
        expect(path.getAttribute('d') ?? '').toMatch(/^M /);
      }

      const title = el.querySelector('.block-editor__mind-map-title') as HTMLInputElement;
      title.value = 'Unit map';
      title.dispatchEvent(new Event('input'));
      expect(latest.content.title).toBe('Unit map');
    });
  });

  describe('createConceptMapEditor', () => {
    it('mounts the interactive graph canvas', () => {
      const block = createBlock('concept_map', 'cm1');
      if (block.block_type !== 'concept_map') throw new Error('expected concept_map');
      let latest = block;
      const el = createConceptMapEditor(block, (next) => {
        latest = next;
      });

      expect(el.querySelector('.block-editor__concept-map-title')).not.toBeNull();
      expect(el.querySelector('.block-graph-maker-host .block-graph-maker')).not.toBeNull();
      expect(el.querySelector('.block-graph-maker .graph-edge')).not.toBeNull();
      const lines = [...el.querySelectorAll('.graph-maker__edges line')];
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.getAttribute('fill')).toBe('none');
        expect(line.getAttribute('stroke-width')).toBe('2');
      }
      const labelBg = el.querySelector('.graph-edge__label-bg');
      expect(labelBg).not.toBeNull();
      expect(labelBg?.getAttribute('fill')).toBe('#fbf8f2');
    });
  });

  describe('createBlockEditor', () => {
    it('dispatches to visualisation editors', () => {
      expect(
        createBlockEditor(createBlock('chart', 'c1'), () => {}).querySelector(
          '.block-editor__chart-type'
        )
      ).not.toBeNull();
      expect(
        createBlockEditor(createBlock('equation', 'e1'), () => {}).querySelector(
          '.block-editor__equation-latex'
        )
      ).not.toBeNull();
      expect(
        createBlockEditor(createBlock('diagram', 'd1'), () => {}).querySelector(
          '.block-editor__diagram-source'
        )
      ).not.toBeNull();
      expect(
        createBlockEditor(createBlock('mind_map', 'm1'), () => {}).querySelector(
          '.block-editor__mind-map-title'
        )
      ).not.toBeNull();
      expect(
        createBlockEditor(createBlock('concept_map', 'cm1'), () => {}).querySelector(
          '.block-editor__concept-map-title'
        )
      ).not.toBeNull();
    });
  });
});
