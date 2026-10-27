import { blankQuestion } from '@/quiz/core';
import { starterHingeOptions } from '@/blocks/hinge-question/shared';
import { starterCurriculumLinesContent } from '@/blocks/curriculum-lines/starter';
import { emptyColumnsForPreset } from '@/blocks/column-presets';
import type { Block, EmbedProvider } from '@/schemas/block';
import { analogyTypesContent, fluidAnalogyContent } from '@/toolkit/analogy';
import { analogyMoveContent } from '@/toolkit/analogy-moves';
import {
  conceptContent,
  intentionsContent,
  moveContent,
  quadrantContent,
  reflectionContent,
  skillContent,
  toolContent,
  valueContent
} from '@/toolkit/content';

type ColumnsBlock = Extract<Block, { block_type: 'columns' }>;
type SectionBlock = Extract<Block, { block_type: 'section' }>;
type TabsBlock = Extract<Block, { block_type: 'tabs' }>;

export const NEW_BLOCK_TYPES = [
  'rich_text',
  'heading',
  'callout',
  'quote',
  'divider',
  'classroom_tools',
  'countdown',
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
  'peer_feedback',
  'question_drop',
  'done',
  'brainstorm',
  'hinge_question',
  'continuum_line',
  'quiz_question',
  'question_set',
  'flashcards',
  'cloze',
  'self_check',
  'note_cue',
  'with_teacher',
  'faded_example',
  'chart',
  'equation',
  'diagram',
  'mind_map',
  'concept_map',
  'curriculum_lines',
  'whiteboard',
  'columns',
  'section',
  'spacer',
  'timeline',
  'card_stack',
  'tabs',
  'collection',
  'anthology',
  'outcomes',
  'annotation',
  'teacher_note',
  'toolkit_skill',
  'toolkit_tool',
  'toolkit_value',
  'thinking_move',
  'question_quadrant',
  'concept_features',
  'thinking_intentions',
  'thinking_reflection',
  'analogy_types',
  'analogy_close_reading',
  'analogy_pattern',
  'analogy_reverse',
  'analogy_problem',
  'analogy_metaphor',
  'analogy_transfer',
  'analogy_chains',
  'fluid_analogy'
] as const;

export type NewBlockType = (typeof NEW_BLOCK_TYPES)[number];

export const NEW_BLOCK_LABEL: Record<NewBlockType, string> = {
  rich_text: 'Rich text',
  heading: 'Heading',
  callout: 'Callout',
  quote: 'Quote',
  divider: 'Divider',
  classroom_tools: 'Classroom tools',
  countdown: 'Countdown',
  definition: 'Definition',
  code: 'Code',
  html: 'HTML',
  html_app: 'HTML app',
  image: 'Image',
  gallery: 'Gallery',
  video: 'Video',
  embed: 'Embed',
  audio: 'Voice',
  attachment: 'Attachment',
  accordion: 'Accordion',
  table: 'Table',
  peer_feedback: 'Peer feedback',
  question_drop: 'Question drop',
  done: 'Done',
  brainstorm: 'Brainstorm',
  hinge_question: 'Hinge question',
  continuum_line: 'Continuum line',
  quiz_question: 'Quiz question',
  question_set: 'Question set',
  flashcards: 'Flashcards',
  cloze: 'Cloze',
  self_check: 'Self check',
  note_cue: 'Note cue',
  with_teacher: 'With teacher',
  faded_example: 'Faded example',
  chart: 'Chart',
  equation: 'Equation',
  diagram: 'Diagram',
  mind_map: 'Mind map',
  concept_map: 'Concept map',
  curriculum_lines: 'Curriculum lines',
  whiteboard: 'Whiteboard',
  columns: 'Columns',
  section: 'Section',
  spacer: 'Spacer',
  timeline: 'Timeline',
  card_stack: 'Card stack',
  tabs: 'Tabs',
  collection: 'Collection',
  anthology: 'Anthology',
  outcomes: 'Outcomes',
  annotation: 'Annotation',
  teacher_note: 'Teacher note',
  toolkit_skill: 'Skill',
  toolkit_tool: 'Tool',
  toolkit_value: 'Value',
  thinking_move: 'Thinking move',
  question_quadrant: 'Question Quadrant',
  concept_features: 'Features of a Concept',
  thinking_intentions: 'Thinking intentions',
  thinking_reflection: 'Thinking reflection',
  analogy_types: 'Analogy types',
  analogy_close_reading: 'Close Reading',
  analogy_pattern: 'Pattern Translation',
  analogy_reverse: 'Reverse Analogising',
  analogy_problem: 'Problem Solving',
  analogy_metaphor: 'Metaphorical Analysis',
  analogy_transfer: 'Conceptual Transfer',
  analogy_chains: 'Analogical Chains',
  fluid_analogy: 'Fluid analogy (earlier version)'
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
      'teacher_note',
      'quote',
      'table',
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
    types: ['outcomes', 'classroom_tools', 'countdown']
  },
  {
    label: 'Thinking Toolkit',
    types: [
      'thinking_intentions',
      'toolkit_skill',
      'toolkit_tool',
      'toolkit_value',
      'thinking_move',
      'question_quadrant',
      'concept_features',
      'continuum_line',
      'thinking_reflection'
    ]
  },
  {
    label: 'Analogous Thinking',
    types: [
      'analogy_types',
      'analogy_close_reading',
      'analogy_pattern',
      'analogy_reverse',
      'analogy_problem',
      'analogy_metaphor',
      'analogy_transfer',
      'analogy_chains'
    ]
  },
  {
    label: 'Learning',
    types: ['peer_feedback', 'brainstorm', 'hinge_question', 'question_drop', 'done', 'quiz_question', 'question_set', 'flashcards', 'cloze', 'self_check', 'note_cue', 'faded_example', 'with_teacher', 'annotation']
  },
  {
    label: 'Visualisation',
    types: ['chart', 'table', 'timeline', 'equation', 'diagram', 'mind_map', 'concept_map', 'curriculum_lines', 'whiteboard']
  },
  {
    label: 'Layout',
    types: [
      'section',
      'columns',
      'divider',
      'spacer',
      'accordion',
      'tabs',
      'card_stack',
      'collection',
      'anthology'
    ]
  }
];

const PAGE_ONLY_TYPES = new Set(['collection', 'anthology']);
/** Unit plan pages only: it maps the unit's lessons. */
const UNIT_ONLY_TYPES = new Set(['curriculum_lines']);
const TOOLKIT_GROUP_TYPES = [
  'thinking_intentions',
  'toolkit_skill',
  'toolkit_tool',
  'toolkit_value',
  'thinking_move',
  'question_quadrant',
  'concept_features',
  'continuum_line',
  'thinking_reflection',
  'analogy_types',
  'analogy_close_reading',
  'analogy_pattern',
  'analogy_reverse',
  'analogy_problem',
  'analogy_metaphor',
  'analogy_transfer',
  'analogy_chains',
  'fluid_analogy'
];

const HOMEPAGE_EXCLUDED = new Set([
  ...UNIT_ONLY_TYPES,
  'peer_feedback',
  'brainstorm',
  'hinge_question',
  'question_drop',
  'done',
  'quiz_question',
  ...TOOLKIT_GROUP_TYPES,
  'teacher_note',
  'flashcards',
  'cloze',
  'self_check',
  'note_cue',
  'with_teacher',
  'faded_example',
  'outcomes',
  'annotation',
  'anthology'
]);

// Preserve homepage block availability even when a block changes category.
export const HOMEPAGE_BLOCK_GROUPS = BLOCK_GROUPS.map((group) => ({
  ...group,
  types: group.types.filter((type) => !HOMEPAGE_EXCLUDED.has(type))
})).filter((group) => group.types.length > 0);

/** Unit plan: homepage set plus anthology. */
export const UNIT_PLAN_BLOCK_GROUPS = BLOCK_GROUPS.map((group) => ({
  ...group,
  types: group.types.filter(
    (type) =>
      !['peer_feedback', 'brainstorm', 'hinge_question', 'question_drop', 'done', 'quiz_question', 'flashcards', 'cloze', 'self_check', 'note_cue', 'with_teacher', 'faded_example', 'outcomes', 'annotation', ...TOOLKIT_GROUP_TYPES].includes(
        type
      )
  )
})).filter((group) => group.types.length > 0);

export const LESSON_BLOCK_GROUPS = BLOCK_GROUPS.map((group) => ({
  ...group,
  types: group.types.filter((t) => !UNIT_ONLY_TYPES.has(t) && (group.label !== 'Layout' || !PAGE_ONLY_TYPES.has(t)))
}));

/** Block types allowed inside a columns cell */
export const COLUMN_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) =>
    t !== 'columns' &&
    t !== 'section' &&
    t !== 'timeline' &&
    t !== 'card_stack' &&
    t !== 'tabs' &&
    !PAGE_ONLY_TYPES.has(t)
);

/** Block types allowed inside a section */
export const SECTION_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) => t !== 'section' && !PAGE_ONLY_TYPES.has(t)
);

/** Block types allowed inside a tabs panel */
export const TAB_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) => t !== 'tabs' && t !== 'section' && !PAGE_ONLY_TYPES.has(t)
);

/** Defined here (not in faded-example.ts) so create-block never imports the editors module graph. */
const FADED_DEFAULT_PARTS = ['Technique', 'Where', 'Effect'] as const;

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
    case 'teacher_note':
      return {
        ...shared,
        visibility: 'teacher_only',
        block_type: 'teacher_note',
        variant: 'medium',
        content: { title: 'Teacher note', html: '' }
      };
    case 'toolkit_skill':
      return {
        ...shared,
        block_type: 'toolkit_skill',
        variant: 'medium',
        content: skillContent('skill:justify', id)
      };
    case 'toolkit_tool':
      return {
        ...shared,
        block_type: 'toolkit_tool',
        variant: 'medium',
        content: toolContent('tool:distinction', id)
      };
    case 'toolkit_value':
      return {
        ...shared,
        block_type: 'toolkit_value',
        variant: 'medium',
        content: valueContent('value:precision', id)
      };
    case 'thinking_move':
      return {
        ...shared,
        block_type: 'thinking_move',
        variant: 'medium',
        content: moveContent('skill:justify', ['tool:reasons'], 'value:relevance', id)
      };
    case 'question_quadrant':
      return {
        ...shared,
        block_type: 'question_quadrant',
        variant: 'medium',
        content: quadrantContent(id)
      };
    case 'concept_features':
      return {
        ...shared,
        block_type: 'concept_features',
        variant: 'medium',
        content: conceptContent(id)
      };
    case 'thinking_intentions':
      return {
        ...shared,
        block_type: 'thinking_intentions',
        variant: 'medium',
        content: intentionsContent()
      };
    case 'thinking_reflection':
      return {
        ...shared,
        block_type: 'thinking_reflection',
        variant: 'medium',
        content: reflectionContent()
      };
    case 'analogy_close_reading':
    case 'analogy_pattern':
    case 'analogy_reverse':
    case 'analogy_problem':
    case 'analogy_metaphor':
    case 'analogy_transfer':
    case 'analogy_chains':
      return {
        ...shared,
        block_type: type,
        variant: 'medium',
        content: analogyMoveContent(type)
      } as Block;
    case 'fluid_analogy':
      return {
        ...shared,
        block_type: 'fluid_analogy',
        variant: 'medium',
        content: fluidAnalogyContent('analogy:close_reading', id)
      };
    case 'analogy_types':
      return {
        ...shared,
        block_type: 'analogy_types',
        variant: 'medium',
        content: analogyTypesContent()
      };
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
        content: { tools: true, timer_stack: [] }
      };
    case 'classroom_tools':
      return {
        ...shared,
        block_type: 'classroom_tools',
        variant: 'medium',
        content: { timer_stack: [] }
      };
    case 'countdown':
      return {
        ...shared,
        block_type: 'countdown',
        variant: 'medium',
        content: { title: '', due_date: '', due_time: '15:00', set_date: '', note: '' }
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
        content: { url: '', mode: 'listen' }
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
    case 'peer_feedback':
      return { ...shared, block_type: 'peer_feedback', variant: 'medium', content: {
        prompt: '', mode: 'comments', strength_prompt: 'One thing that works well…', suggestion_prompt: 'One suggestion or question…'
      } };
    case 'curriculum_lines':
      return { ...shared, block_type: 'curriculum_lines', variant: 'large', content: starterCurriculumLinesContent() };
    case 'brainstorm':
      return { ...shared, block_type: 'brainstorm', variant: 'medium', content: {
        question: '', safety: 'approve', per_student: 3, max_length: 140, layout: 'grid'
      } };
    case 'hinge_question':
      return { ...shared, block_type: 'hinge_question', variant: 'medium', content: {
        prompt: '', options: starterHingeOptions(id), correct_id: '', seconds: 60, move_on: 80, reteach: 50
      } };
    case 'continuum_line':
      return { ...shared, block_type: 'continuum_line', variant: 'medium', content: {
        stimulus: { kind: 'text', text: '', url: '', alt_text: '' },
        scale: { left: 'Implied', right: 'Not implied', stops: [] },
        statements: [{ id: `${id}_s1`, text: '', snap: false }],
        pace: 'teacher', replace: true
      } };
    case 'question_drop':
      return { ...shared, block_type: 'question_drop', variant: 'medium', content: {
        target_quiz_id: '', prompt: '', kinds: [], marks_min: 1, marks_max: 3, per_student: 1, accepting: true
      } };
    case 'done':
      return { ...shared, block_type: 'done', variant: 'small', content: { label: 'I’ve finished this' } };
    case 'quiz_question':
      return { ...shared, block_type: 'quiz_question', variant: 'medium', content: {
        question: blankQuestion('multiple_choice', id)
      } };
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
    case 'note_cue':
      return { ...shared, block_type: 'note_cue', variant: 'medium', content: { kind: 'own_words', prompt: '' } };
    case 'with_teacher':
      return { ...shared, block_type: 'with_teacher', variant: 'medium', content: { talking_points: [] } };
    case 'faded_example':
      return {
        ...shared,
        block_type: 'faded_example',
        variant: 'medium',
        content: { prompt: '', extract: '', parts: FADED_DEFAULT_PARTS.map((label) => ({ label, answer: '' })), blanks: [] }
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
    case 'whiteboard':
      return {
        ...shared,
        block_type: 'whiteboard',
        variant: 'large',
        content: {
          document_id: `whiteboard_${id}`,
          title: '',
          height_px: 640
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
    case 'card_stack':
      return {
        ...shared,
        block_type: 'card_stack',
        variant: 'medium',
        content: {
          title: '',
          cards: [
            { id: `${id}_c1`, eyebrow: '', title: '', description: '', tint: 'navy' },
            { id: `${id}_c2`, eyebrow: '', title: '', description: '', tint: 'wave' },
            { id: `${id}_c3`, eyebrow: '', title: '', description: '', tint: 'marine' }
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
    case 'anthology':
      return {
        ...shared,
        block_type: 'anthology',
        variant: 'medium',
        content: { title: '', default_view: 'text' }
      };
    case 'outcomes':
      return {
        ...shared,
        block_type: 'outcomes',
        variant: 'medium',
        content: {}
      };
    case 'annotation':
      return {
        ...shared,
        block_type: 'annotation',
        variant: 'medium',
        content: {
          text: {
            kind: 'verse',
            stanzas: [{ id: `${id}_stanza_1`, lines: [{ id: `${id}_line_1`, text: '' }] }]
          },
          layers: [],
          annotations: [],
          settings: { show_markers: true }
        }
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
  } else if (cloned.block_type === 'card_stack') {
    cloned.content = {
      ...cloned.content,
      cards: cloned.content.cards.map((card) => ({
        ...card,
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
  } else if (cloned.block_type === 'whiteboard') {
    const sourceDocumentId =
      cloned.content.seed_document_id ?? cloned.content.document_id;
    const { published_snapshot: _publishedSnapshot, ...content } = cloned.content;
    cloned.content = {
      ...content,
      document_id: `whiteboard_${cloned.id}`,
      seed_document_id: sourceDocumentId
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
  } else if (cloned.block_type === 'annotation') {
    const stanzaMap = new Map<string, string>();
    const lineMap = new Map<string, string>();
    const layerMap = new Map<string, string>();
    const sublayerMap = new Map<string, string>();
    cloned.content = {
      ...cloned.content,
      text: {
        ...cloned.content.text,
        stanzas: cloned.content.text.stanzas.map((stanza) => {
          const stanzaId = nextId();
          stanzaMap.set(stanza.id, stanzaId);
          return {
            id: stanzaId,
            lines: stanza.lines.map((line) => {
              const lineId = nextId();
              lineMap.set(line.id, lineId);
              return { ...line, id: lineId };
            })
          };
        })
      },
      layers: cloned.content.layers.map((layer) => {
        const layerId = nextId();
        layerMap.set(layer.id, layerId);
        return {
          ...layer,
          id: layerId,
          sublayers: layer.sublayers?.map((sub) => {
            const subId = nextId();
            sublayerMap.set(sub.id, subId);
            return { ...sub, id: subId };
          })
        };
      }),
      annotations: cloned.content.annotations.map((ann) => ({
        ...ann,
        id: nextId(),
        layer_id: layerMap.get(ann.layer_id) ?? ann.layer_id,
        sublayer_id: ann.sublayer_id
          ? (sublayerMap.get(ann.sublayer_id) ?? ann.sublayer_id)
          : undefined,
        anchor: {
          ...ann.anchor,
          stanza: stanzaMap.get(ann.anchor.stanza) ?? ann.anchor.stanza,
          line: ann.anchor.line ? (lineMap.get(ann.anchor.line) ?? ann.anchor.line) : undefined
        },
        created_at: stamp,
        updated_at: stamp
      })),
      settings: {
        ...cloned.content.settings,
        default_layer_id: cloned.content.settings.default_layer_id
          ? (layerMap.get(cloned.content.settings.default_layer_id) ??
            cloned.content.settings.default_layer_id)
          : undefined
      }
    };
  }
  return cloned;
}
