import { emptyColumnsForPreset } from '@/blocks/column-presets';
import type { Block, EmbedProvider } from '@/schemas/block';

type ColumnsBlock = Extract<Block, { block_type: 'columns' }>;
type SectionBlock = Extract<Block, { block_type: 'section' }>;
type TabsBlock = Extract<Block, { block_type: 'tabs' }>;

export const NEW_BLOCK_TYPES = [
  'rich_text',
  'heading',
  'callout',
  'quote',
  'divider',
  'definition',
  'code',
  'html',
  'html_app',
  'image',
  'gallery',
  'video',
  'embed',
  'audio',
  'attachment',
  'accordion',
  'table',
  'question_set',
  'flashcards',
  'cloze',
  'self_check',
  'chart',
  'equation',
  'diagram',
  'mind_map',
  'concept_map',
  'columns',
  'section',
  'spacer',
  'timeline',
  'tabs',
  'collection',
  'outcomes'
] as const;

export type NewBlockType = (typeof NEW_BLOCK_TYPES)[number];

export const NEW_BLOCK_LABEL: Record<NewBlockType, string> = {
  rich_text: 'Rich text',
  heading: 'Heading',
  callout: 'Callout',
  quote: 'Quote',
  divider: 'Divider',
  definition: 'Definition',
  code: 'Code',
  html: 'HTML',
  html_app: 'HTML app',
  image: 'Image',
  gallery: 'Gallery',
  video: 'Video',
  embed: 'Embed',
  audio: 'Audio',
  attachment: 'Attachment',
  accordion: 'Accordion',
  table: 'Table',
  question_set: 'Question set',
  flashcards: 'Flashcards',
  cloze: 'Cloze',
  self_check: 'Self check',
  chart: 'Chart',
  equation: 'Equation',
  diagram: 'Diagram',
  mind_map: 'Mind map',
  concept_map: 'Concept map',
  columns: 'Columns',
  section: 'Section',
  spacer: 'Spacer',
  timeline: 'Timeline',
  tabs: 'Tabs',
  collection: 'Collection',
  outcomes: 'Outcomes'
};

export const EMBED_INSERT_PRESETS = [
  { value: 'embed:google_maps', label: 'Map', provider: 'google_maps' as const },
  { value: 'embed:google_slides', label: 'Slides', provider: 'google_slides' as const },
  { value: 'embed:google_docs', label: 'Document', provider: 'google_docs' as const },
  { value: 'embed:pdf', label: 'PDF', provider: 'pdf' as const }
] as const;

export type EmbedInsertValue = (typeof EMBED_INSERT_PRESETS)[number]['value'];
export type InsertMenuValue = NewBlockType | EmbedInsertValue;

export const INSERT_MENU_LABEL: Record<InsertMenuValue, string> = {
  ...NEW_BLOCK_LABEL,
  'embed:google_maps': 'Map',
  'embed:google_slides': 'Slides',
  'embed:google_docs': 'Document',
  'embed:pdf': 'PDF'
};

export function expandGroupTypesForMenu(
  types: readonly NewBlockType[]
): InsertMenuValue[] {
  const out: InsertMenuValue[] = [];
  for (const t of types) {
    out.push(t);
    if (t === 'embed') {
      for (const preset of EMBED_INSERT_PRESETS) out.push(preset.value);
    }
  }
  return out;
}

export const BLOCK_GROUPS: Array<{ label: string; types: readonly NewBlockType[] }> = [
  {
    label: 'Basic',
    types: [
      'rich_text',
      'heading',
      'callout',
      'quote',
      'divider',
      'definition',
      'code',
      'html',
      'html_app'
    ]
  },
  {
    label: 'Media',
    types: ['image', 'gallery', 'video', 'embed', 'audio', 'attachment']
  },
  {
    label: 'Teaching',
    types: ['accordion', 'table', 'question_set', 'timeline', 'outcomes']
  },
  {
    label: 'Learning',
    types: ['flashcards', 'cloze', 'self_check']
  },
  {
    label: 'Visualisation',
    types: ['chart', 'equation', 'diagram', 'mind_map', 'concept_map']
  },
  {
    label: 'Layout',
    types: ['section', 'columns', 'spacer', 'tabs', 'collection']
  }
];

export const HOMEPAGE_BLOCK_GROUPS = BLOCK_GROUPS.filter((group) => group.label !== 'Learning').map(
  (group) =>
    group.label === 'Teaching'
      ? { ...group, types: group.types.filter((type) => type !== 'outcomes') }
      : group
);

export const LESSON_BLOCK_GROUPS = BLOCK_GROUPS.map((group) =>
  group.label === 'Layout'
    ? {
        ...group,
        types: group.types.filter((t) => t !== 'collection')
      }
    : group
);

/** Block types allowed inside a columns cell */
export const COLUMN_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) =>
    t !== 'columns' &&
    t !== 'section' &&
    t !== 'timeline' &&
    t !== 'tabs' &&
    t !== 'collection'
);

/** Block types allowed inside a section */
export const SECTION_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) => t !== 'section' && t !== 'collection'
);

/** Block types allowed inside a tabs panel */
export const TAB_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) => t !== 'tabs' && t !== 'section' && t !== 'collection'
);

function nowIso(): string {
  return new Date().toISOString();
}

function sharedBlockFields(id: string) {
  return {
    id,
    type: 'block' as const,
    visibility: 'student_teacher' as const,
    layout: {},
    print: {},
    settings: {},
    created_at: nowIso(),
    updated_at: nowIso(),
    schema_version: 1 as const
  };
}

export function createEmbedBlock(id: string, provider: EmbedProvider): Extract<Block, { block_type: 'embed' }> {
  return {
    ...sharedBlockFields(id),
    block_type: 'embed',
    variant: 'large',
    content: { url: '', provider }
  };
}

export function createFromInsertMenu(value: string, id: string): Block {
  const preset = EMBED_INSERT_PRESETS.find((p) => p.value === value);
  if (preset) {
    return createEmbedBlock(id, preset.provider);
  }
  return createBlock(value as NewBlockType, id);
}

export function createBlock(type: NewBlockType, id: string): Block {
  const shared = sharedBlockFields(id);

  switch (type) {
    case 'rich_text':
      return { ...shared, block_type: 'rich_text', variant: 'medium', content: { html: '' } };
    case 'heading':
      return { ...shared, block_type: 'heading', variant: 'section', content: { text: '' } };
    case 'callout':
      return {
        ...shared,
        block_type: 'callout',
        variant: 'medium',
        content: { style: 'information', body: '' }
      };
    case 'image':
      return {
        ...shared,
        block_type: 'image',
        variant: 'large',
        content: { url: '', alt_text: '' }
      };
    case 'gallery':
      return {
        ...shared,
        block_type: 'gallery',
        variant: 'large',
        content: {
          layout: 'grid',
          items: [
            { id: `${id}_i1`, url: '', alt_text: '' },
            { id: `${id}_i2`, url: '', alt_text: '' },
            { id: `${id}_i3`, url: '', alt_text: '' }
          ]
        }
      };
    case 'video':
      return {
        ...shared,
        block_type: 'video',
        variant: 'large',
        content: { provider: 'youtube', external_id: '' }
      };
    case 'embed':
      return createEmbedBlock(id, 'generic');
    case 'html':
      return {
        ...shared,
        block_type: 'html',
        variant: 'medium',
        content: { html: '' }
      };
    case 'html_app':
      return {
        ...shared,
        block_type: 'html_app',
        variant: 'large',
        content: { html: '', height_px: 480 }
      };
    case 'quote':
      return {
        ...shared,
        block_type: 'quote',
        variant: 'medium',
        content: { quote: '' }
      };
    case 'divider':
      return {
        ...shared,
        block_type: 'divider',
        variant: 'medium',
        content: {}
      };
    case 'definition':
      return {
        ...shared,
        block_type: 'definition',
        variant: 'medium',
        content: { term: '', definition: '' }
      };
    case 'code':
      return {
        ...shared,
        block_type: 'code',
        variant: 'medium',
        content: { code: '' }
      };
    case 'audio':
      return {
        ...shared,
        block_type: 'audio',
        variant: 'medium',
        content: { url: '' }
      };
    case 'attachment':
      return {
        ...shared,
        block_type: 'attachment',
        variant: 'medium',
        content: { url: '', title: '' }
      };
    case 'accordion':
      return {
        ...shared,
        block_type: 'accordion',
        variant: 'medium',
        content: { items: [{ title: '', body: '' }] }
      };
    case 'table':
      return {
        ...shared,
        block_type: 'table',
        variant: 'large',
        content: {
          headers: ['Column 1', 'Column 2', 'Column 3'],
          rows: [['', '', '']]
        }
      };
    case 'question_set':
      return {
        ...shared,
        block_type: 'question_set',
        variant: 'medium',
        content: {
          questions: [
            { id: `${id}_q1`, prompt: '', kind: 'short_answer', response_space: 'medium' }
          ]
        }
      };
    case 'flashcards':
      return {
        ...shared,
        block_type: 'flashcards',
        variant: 'medium',
        content: {
          cards: [
            { id: `${id}_c1`, front: 'Term', back: 'Definition' },
            { id: `${id}_c2`, front: 'Cue', back: 'Answer' }
          ],
          shuffle: false
        }
      };
    case 'cloze':
      return {
        ...shared,
        block_type: 'cloze',
        variant: 'medium',
        content: {
          text: 'The capital of France is [[Paris]].',
          case_sensitive: false
        }
      };
    case 'self_check':
      return {
        ...shared,
        block_type: 'self_check',
        variant: 'medium',
        content: {
          mode: 'reveal',
          prompt: '',
          answer: ''
        }
      };
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
    case 'columns':
      return {
        ...shared,
        block_type: 'columns',
        variant: 'medium',
        content: {
          preset: '50-50',
          columns: emptyColumnsForPreset('50-50') as ColumnsBlock['content']['columns']
        }
      };
    case 'section':
      return {
        ...shared,
        block_type: 'section',
        variant: 'medium',
        content: { title: '', blocks: [] }
      };
    case 'spacer':
      return {
        ...shared,
        block_type: 'spacer',
        variant: 'medium',
        content: { size: 'medium' }
      };
    case 'timeline':
      return {
        ...shared,
        block_type: 'timeline',
        variant: 'medium',
        content: {
          events: [
            { id: `${id}_e1`, when: '', label: '', description: '' },
            { id: `${id}_e2`, when: '', label: '', description: '' },
            { id: `${id}_e3`, when: '', label: '', description: '' }
          ]
        }
      };
    case 'tabs':
      return {
        ...shared,
        block_type: 'tabs',
        variant: 'medium',
        content: {
          tabs: [
            { id: `${id}_t1`, label: '', blocks: [] },
            { id: `${id}_t2`, label: '', blocks: [] },
            { id: `${id}_t3`, label: '', blocks: [] }
          ]
        }
      };
    case 'collection':
      return {
        ...shared,
        block_type: 'collection',
        variant: 'medium',
        content: { source: 'unit_lessons', title: '' }
      };
    case 'outcomes':
      return {
        ...shared,
        block_type: 'outcomes',
        variant: 'medium',
        content: {}
      };
  }
}

export function cloneBlockWithNewIds(
  block: Block,
  nextId: () => string,
  now: () => string = () => new Date().toISOString()
): Block {
  const stamp = now();
  const cloned = structuredClone(block) as Block;
  cloned.id = nextId();
  cloned.created_at = stamp;
  cloned.updated_at = stamp;

  if (cloned.block_type === 'columns') {
    cloned.content = {
      ...cloned.content,
      columns: cloned.content.columns.map((col) => ({
        ...col,
        blocks: col.blocks.map((child) =>
          cloneBlockWithNewIds(child, nextId, now)
        ) as typeof col.blocks
      }))
    };
  } else if (cloned.block_type === 'section') {
    cloned.content = {
      ...cloned.content,
      blocks: cloned.content.blocks.map((child) =>
        cloneBlockWithNewIds(child, nextId, now)
      ) as SectionBlock['content']['blocks']
    };
  } else if (cloned.block_type === 'timeline') {
    cloned.content = {
      events: cloned.content.events.map((event) => ({
        ...event,
        id: nextId()
      }))
    };
  } else if (cloned.block_type === 'tabs') {
    cloned.content = {
      tabs: cloned.content.tabs.map((panel) => ({
        id: nextId(),
        label: panel.label,
        blocks: panel.blocks.map((child) =>
          cloneBlockWithNewIds(child, nextId, now)
        ) as TabsBlock['content']['tabs'][number]['blocks']
      }))
    };
  } else if (cloned.block_type === 'gallery') {
    cloned.content = {
      ...cloned.content,
      items: cloned.content.items.map((entry) => ({
        ...entry,
        id: nextId()
      }))
    };
  } else if (cloned.block_type === 'flashcards') {
    cloned.content = {
      ...cloned.content,
      cards: cloned.content.cards.map((card) => ({
        ...card,
        id: nextId()
      }))
    };
  } else if (cloned.block_type === 'self_check' && cloned.content.items) {
    cloned.content = {
      ...cloned.content,
      items: cloned.content.items.map((item) => ({
        ...item,
        id: nextId()
      }))
    };
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
  return cloned;
}
