import { z } from 'zod';
import { IsoDateSchema } from './common';

export const VisibilitySchema = z.enum(['student_teacher', 'teacher_only']);
export const BlockTypeSchema = z.enum([
  'rich_text',
  'heading',
  'callout',
  'image',
  'gallery',
  'video',
  'embed',
  'html',
  'html_app',
  'quote',
  'divider',
  'definition',
  'code',
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
  'annotation'
]);

export const ColumnPresetSchema = z.enum(['50-50', '33-67', '67-33', '33-33-33', 'custom']);
export const SpacerSizeSchema = z.enum(['small', 'medium', 'large']);

export const VideoProviderSchema = z.enum(['youtube', 'vimeo', 'file']);
export const EmbedProviderSchema = z.enum([
  'google_maps',
  'google_slides',
  'google_docs',
  'pdf',
  'generic'
]);
export type EmbedProvider = z.infer<typeof EmbedProviderSchema>;
export const HeadingVariantSchema = z.enum(['page', 'section', 'subsection']);
export const MediaSizeVariantSchema = z.enum(['small', 'medium', 'large']);
export const CalloutStyleSchema = z.enum([
  'information',
  'important',
  'warning',
  'extension',
  'scaffold',
  'example',
  'remember',
  'teacher'
]);
export const QuestionKindSchema = z.enum(['short_answer', 'multiple_choice']);
export const ResponseSpaceSchema = z.enum([
  'none',
  'short',
  'medium',
  'long',
  'extended'
]);
export type ResponseSpace = z.infer<typeof ResponseSpaceSchema>;

const blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
};

const blockLayout = {
  layout: z.record(z.unknown()).default({}),
  print: z.record(z.unknown()).default({}),
  settings: z.record(z.unknown()).default({})
};

export const RichTextBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('rich_text'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({ html: z.string() }),
  ...blockLayout,
  ...blockTimestamps
});

export const HeadingBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('heading'),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z.object({ text: z.string() }),
  ...blockLayout,
  ...blockTimestamps
});

export const CalloutBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('callout'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    style: CalloutStyleSchema,
    title: z.string().optional(),
    body: z.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const ImageBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('image'),
  variant: MediaSizeVariantSchema.default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    alt_text: z.string(),
    caption: z.string().optional(),
    annotations: z
      .array(
        z.object({
          id: z.string().min(1),
          body: z.string().min(1),
          selector: z.unknown().optional()
        })
      )
      .optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const GalleryLayoutSchema = z.enum(['grid', 'carousel', 'comparison']);

export const GalleryItemSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  alt_text: z.string(),
  caption: z.string().optional()
});

export const GalleryBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('gallery'),
  variant: MediaSizeVariantSchema.default('large'),
  visibility: VisibilitySchema,
  content: z
    .object({
      layout: GalleryLayoutSchema,
      items: z.array(GalleryItemSchema).min(2).max(12)
    })
    .superRefine((content, ctx) => {
      if (content.layout === 'comparison' && content.items.length !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Comparison galleries need exactly 2 items',
          path: ['items']
        });
      }
    }),
  ...blockLayout,
  ...blockTimestamps
});

export const VideoBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('video'),
  variant: MediaSizeVariantSchema.default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    provider: VideoProviderSchema,
    external_id: z.string(),
    url: z.string().optional(),
    start_seconds: z.number().int().positive().optional(),
    title: z.string().optional(),
    caption: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const EmbedBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('embed'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    title: z.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const HtmlBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('html'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({ html: z.string() }),
  ...blockLayout,
  ...blockTimestamps
});

export const HtmlAppAiProviderSchema = z.enum(['openai', 'anthropic']);

export const HtmlAppAiSchema = z.object({
  enabled: z.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z.string().min(1),
  system: z.string(),
  max_tokens: z.number().int().positive().max(2000)
});

export const HtmlAppBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('html_app'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    html: z.string(),
    height_px: z.number().int().positive().max(4000).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const QuoteBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('quote'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    quote: z.string(),
    attribution: z.string().optional(),
    source: z.string().optional(),
    reference: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const DividerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('divider'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});

export const DefinitionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('definition'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    term: z.string(),
    definition: z.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const CodeBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('code'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    code: z.string(),
    language: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const AudioBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('audio'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    title: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const AttachmentBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('attachment'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    title: z.string(),
    filename: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const AccordionItemSchema = z.object({
  title: z.string(),
  body: z.string()
});

export const AccordionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('accordion'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    items: z.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const TableBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('table'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const QuestionItemSchema = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  kind: QuestionKindSchema,
  options: z.array(z.string()).optional(),
  response_space: ResponseSpaceSchema.optional()
});

export const QuestionSetBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('question_set'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    questions: z.array(QuestionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const FlashcardSourceSchema = z.object({
  block_id: z.string().min(1),
  annotation_id: z.string().min(1),
  lesson_id: z.string().optional(),
  kind: z.enum(['quote_to_technique', 'find_it', 'line_recall']),
  source_hash: z.string().min(1)
});

export const FlashcardItemSchema = z.object({
  id: z.string().min(1),
  front: z.string(),
  back: z.string(),
  image_url: z.string().optional(),
  image_alt: z.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});

export const FlashcardsBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('flashcards'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    cards: z.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const ClozeBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('cloze'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    text: z.string(),
    case_sensitive: z.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const SelfCheckModeSchema = z.enum(['reveal', 'checklist', 'confidence']);

export const SelfCheckItemSchema = z.object({
  id: z.string().min(1),
  label: z.string()
});

export const SelfCheckBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('self_check'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z.string(),
    answer: z.string().optional(),
    items: z.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const ChartTypeSchema = z.enum(['bar', 'line', 'pie', 'scatter']);

export const ChartPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number()
});

export const ChartSeriesColorSchema = z.enum([
  'wave',
  'danger',
  'success',
  'high-sea',
  'pastel-lilac-ink',
  'navy-2'
]);
export type ChartSeriesColor = z.infer<typeof ChartSeriesColorSchema>;

export const ChartSeriesSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: ChartSeriesColorSchema.optional(),
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

export const DIAGRAM_IMAGE_PUBLISH_URL_ISSUE =
  'Diagram image needs a valid http(s) URL to publish';

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
  parent_id: z.string().nullable().optional(),
  color: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional()
});

/** How the block is built: a written outline laid out automatically, or a free canvas. */
export const GraphBuildModeSchema = z.enum(['outline', 'canvas']);

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
    edges: z.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
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
    edges: z.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const WhiteboardBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('whiteboard'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    document_id: z.string().min(1),
    seed_document_id: z.string().min(1).optional(),
    title: z.string().optional(),
    height_px: z.number().int().min(360).max(1400).default(640),
    published_snapshot: z.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  when: z.string(),
  label: z.string(),
  description: z.string(),
  image_url: z.string().optional(),
  image_alt: z.string().optional(),
  link_url: z.string().optional(),
  link_label: z.string().optional()
});

export const TimelineLayoutSchema = z.enum(['rail', 'alternate', 'horizontal']);
export type TimelineLayout = z.infer<typeof TimelineLayoutSchema>;

export const TimelineBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('timeline'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    layout: TimelineLayoutSchema.optional(),
    events: z.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const CardStackTintSchema = z.enum([
  'navy',
  'wave',
  'marine',
  'depth',
  'high-sea',
  'lilac',
  'sage',
  'peach'
]);
export type CardStackTint = z.infer<typeof CardStackTintSchema>;

export const CardStackItemSchema = z.object({
  id: z.string().min(1),
  number: z.string().optional(),
  eyebrow: z.string(),
  title: z.string(),
  description: z.string(),
  image_url: z.string().optional(),
  image_alt: z.string().optional(),
  tint: CardStackTintSchema
});

export const CardStackBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('card_stack'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    cards: z.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const CollectionSourceSchema = z.enum(['unit_lessons', 'recent_lessons']);

export const CollectionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('collection'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    source: CollectionSourceSchema,
    title: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const AnthologyViewSchema = z.enum(['text', 'theme', 'technique', 'connections']);

/** Plain object — must stay ZodObject for discriminatedUnion leaf lists. */
export const AnthologyBlockObjectSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('anthology'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    default_view: AnthologyViewSchema.default('text')
  }),
  ...blockLayout,
  ...blockTimestamps
});

export type AnthologyBlock = z.infer<typeof AnthologyBlockObjectSchema>;
export type AnthologyView = z.infer<typeof AnthologyViewSchema>;
/** Alias kept for docs / imports that name the leaf schema without Object. */
export const AnthologyBlockSchema = AnthologyBlockObjectSchema;

export const OutcomesBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('outcomes'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});

export const AnnotationFamilyKeySchema = z.enum([
  'Descriptive',
  'Repetitive',
  'Comparative',
  'Structural',
  'Intertextual'
]);
export type AnnotationFamilyKey = z.infer<typeof AnnotationFamilyKeySchema>;

export const AnnotationLayerKindSchema = z.enum([
  'family',
  'free',
  'lens',
  'teacher',
  'voice'
]);
export type AnnotationLayerKind = z.infer<typeof AnnotationLayerKindSchema>;

/** Fixed palette token names — never free-typed hex in the editor. */
export const AnnotationColourSchema = z.enum([
  'wave',
  'high-sea',
  'sand',
  'shore',
  'marine',
  'navy',
  'coral',
  'mist'
]);
export type AnnotationColour = z.infer<typeof AnnotationColourSchema>;

export const AnnotationGranularitySchema = z.enum(['word', 'phrase', 'line', 'stanza']);
export type AnnotationGranularity = z.infer<typeof AnnotationGranularitySchema>;

export const AnnotationLineAlignSchema = z.enum(['left', 'center', 'right']);
export type AnnotationLineAlign = z.infer<typeof AnnotationLineAlignSchema>;

export const AnnotationLineSchema = z.object({
  id: z.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z.number().int().min(0).max(8).optional()
});

export const AnnotationStanzaSchema = z.object({
  id: z.string().min(1),
  lines: z.array(AnnotationLineSchema).min(1)
});

export const AnnotationTextSchema = z.object({
  kind: z.enum(['verse', 'prose']),
  stanzas: z.array(AnnotationStanzaSchema).min(1)
});

export const AnnotationSublayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  subgroup: z.string().optional()
});

export const AnnotationLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z.string().optional(),
  sublayers: z.array(AnnotationSublayerSchema).optional()
});

export const AnnotationQuoteSchema = z.object({
  exact: z.string().min(1),
  prefix: z.string().optional(),
  suffix: z.string().optional()
});

export const AnnotationAnchorSchema = z.object({
  /** Required on every stop when the annotation is a thread. */
  id: z.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z.string().min(1),
  line: z.string().optional(),
  start: z.number().int().min(0).optional(),
  end: z.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z.string().optional()
});

export const AnnotationTechniqueRefSchema = z.object({
  id: z.string().min(1),
  table_version: z.string().min(1)
});

export const AnnotationAttachmentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('link'),
    url: z.string(),
    label: z.string().optional()
  }),
  z.object({
    kind: z.literal('video'),
    url: z.string(),
    start_seconds: z.number().int().min(0).optional()
  }),
  z.object({
    kind: z.literal('audio'),
    url: z.string(),
    title: z.string().optional()
  }),
  z.object({
    kind: z.literal('image'),
    url: z.string(),
    alt_text: z.string()
  }),
  z.object({
    kind: z.literal('block'),
    block_id: z.string().min(1)
  })
]);

export const AnthologyTagSchema = z.object({
  include: z.boolean(),
  themes: z.array(z.string().trim().max(40)).max(8).default([]),
  concepts: z.array(z.string().trim().max(40)).max(8).default([])
});

export const AnnotationThreadKindSchema = z.enum([
  'motif',
  'opposition',
  'volta',
  'echo',
  'argument'
]);

export const AnnotationThreadSchema = z.object({
  kind: AnnotationThreadKindSchema.optional(),
  order: z.enum(['text', 'custom']).default('text'),
  anchor_order: z.array(z.string().min(1)).optional()
});

export const AnnotationVoiceWordSchema = z.object({
  w: z.string(),
  start: z.number(),
  end: z.number()
});

export const AnnotationVoiceClipSchema = z.object({
  id: z.string().min(1),
  start_s: z.number(),
  end_s: z.number(),
  word_range: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z.enum(['tap', 'quote', 'ai', 'manual']),
  confidence: z.number().min(0).max(1),
  approved: z.boolean(),
  transcript_text: z.string()
});

export const AnnotationVoiceTrackSchema = z.object({
  id: z.string().min(1),
  layer_id: z.string().min(1),
  kind: z.enum(['reading', 'think_aloud', 'feedback']),
  title: z.string().min(1),
  audio: z.object({
    media_id: z.string().optional(),
    url: z.string().min(1),
    duration_s: z.number().min(0),
    mime: z.string().min(1)
  }),
  transcript: z.object({
    words: z.array(AnnotationVoiceWordSchema),
    timing: z.enum(['word', 'segment', 'estimated'])
  }),
  taps: z
    .array(
      z.object({
        t: z.number(),
        anchor: AnnotationAnchorSchema
      })
    )
    .optional(),
  clips: z.array(AnnotationVoiceClipSchema).default([]),
  status: z.enum(['draft', 'published']),
  extras: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(['where_to_next', 'technique_tag', 'class_note']),
        html: z.string(),
        approved: z.boolean()
      })
    )
    .optional()
});

export const AnnotationItemSchema = z
  .object({
    id: z.string().min(1),
    layer_id: z.string().min(1),
    sublayer_id: z.string().optional(),
    anchor: AnnotationAnchorSchema,
    /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
    also_anchors: z.array(AnnotationAnchorSchema).max(24).optional(),
    thread: AnnotationThreadSchema.optional(),
    anthology: AnthologyTagSchema.optional(),
    technique: AnnotationTechniqueRefSchema.optional(),
    body: z.object({
      html: z.string(),
      attachments: z.array(AnnotationAttachmentSchema).default([])
    }),
    created_at: IsoDateSchema,
    updated_at: IsoDateSchema
  })
  .superRefine((ann, ctx) => {
    const extras = ann.also_anchors ?? [];
    if (extras.length === 0) return;

    const primaryId = ann.anchor.id;
    if (!primaryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Thread primary anchor needs an id',
        path: ['anchor', 'id']
      });
    }

    const ids = [primaryId, ...extras.map((a) => a.id)].filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    );
    const expectedCount = extras.length + (primaryId ? 1 : 0);
    if (ids.length !== expectedCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Every thread stop needs an id',
        path: ['also_anchors']
      });
    }
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Thread stop ids must be unique within the annotation',
        path: ['also_anchors']
      });
    }

    if (ann.thread?.order !== 'custom') return;
    const order = ann.thread.anchor_order ?? [];
    const idSet = new Set(ids);
    const isPermutation =
      order.length === ids.length &&
      new Set(order).size === order.length &&
      order.every((id) => idSet.has(id));
    if (!isPermutation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'anchor_order must be a permutation of thread stop ids',
        path: ['thread', 'anchor_order']
      });
    }
  });

export const AnnotationBlockSettingsSchema = z.object({
  show_markers: z.boolean().default(true),
  default_layer_id: z.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z.union([z.literal(0), z.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z.enum(['fineliner', 'highlighter']).optional()
});

/** Plain object — must stay ZodObject for discriminatedUnion leaf lists. */
export const AnnotationBlockObjectSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('annotation'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    attribution: z.string().optional(),
    text: AnnotationTextSchema,
    layers: z.array(AnnotationLayerSchema).default([]),
    annotations: z.array(AnnotationItemSchema).default([]),
    voice_tracks: z.array(AnnotationVoiceTrackSchema).optional(),
    anthology: AnthologyTagSchema.optional(),
    settings: AnnotationBlockSettingsSchema.default({ show_markers: true })
  }),
  ...blockLayout,
  ...blockTimestamps
});

export function refineAnnotationVoiceTracks(
  block: z.infer<typeof AnnotationBlockObjectSchema>,
  ctx: z.RefinementCtx
): void {
  const voiceLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === 'voice').map((layer) => layer.id)
  );
  const teacherLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === 'teacher').map((layer) => layer.id)
  );
  for (const [index, track] of (block.content.voice_tracks ?? []).entries()) {
    if (!voiceLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'voice_track.layer_id must point at a voice layer',
        path: ['content', 'voice_tracks', index, 'layer_id']
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'voice_track cannot sit on a teacher layer',
        path: ['content', 'voice_tracks', index, 'layer_id']
      });
    }
  }
}

export const AnnotationBlockSchema =
  AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);

export type AnnotationBlock = z.infer<typeof AnnotationBlockObjectSchema>;
export type AnnotationItem = z.infer<typeof AnnotationItemSchema>;
export type AnnotationLayer = z.infer<typeof AnnotationLayerSchema>;
export type AnnotationAnchor = z.infer<typeof AnnotationAnchorSchema>;
export type AnnotationAttachment = z.infer<typeof AnnotationAttachmentSchema>;
export type AnnotationThread = z.infer<typeof AnnotationThreadSchema>;
export type AnnotationVoiceTrack = z.infer<typeof AnnotationVoiceTrackSchema>;
export type AnthologyTag = z.infer<typeof AnthologyTagSchema>;

const leafBlockSchemas = [
  RichTextBlockSchema,
  HeadingBlockSchema,
  CalloutBlockSchema,
  ImageBlockSchema,
  GalleryBlockSchema,
  VideoBlockSchema,
  EmbedBlockSchema,
  HtmlBlockSchema,
  HtmlAppBlockSchema,
  QuoteBlockSchema,
  DividerBlockSchema,
  DefinitionBlockSchema,
  CodeBlockSchema,
  AudioBlockSchema,
  AttachmentBlockSchema,
  AccordionBlockSchema,
  TableBlockSchema,
  QuestionSetBlockSchema,
  FlashcardsBlockSchema,
  ClozeBlockSchema,
  SelfCheckBlockSchema,
  ChartBlockSchema,
  EquationBlockSchema,
  DiagramBlockSchema,
  MindMapBlockSchema,
  ConceptMapBlockSchema,
  WhiteboardBlockSchema,
  OutcomesBlockSchema,
  AnnotationBlockObjectSchema,
  AnthologyBlockObjectSchema
] as const;

export const SpacerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('spacer'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const ColumnChildBlockSchema = z.lazy(() =>
  z.discriminatedUnion('block_type', [...leafBlockSchemas, SpacerBlockSchema])
);

const columnsArraySchema = z
  .array(
    z.object({
      width: z.number().int().min(1).max(12),
      blocks: z.array(ColumnChildBlockSchema)
    })
  )
  .superRefine((columns, ctx) => {
    const sum = columns.reduce((acc, col) => acc + col.width, 0);
    if (sum !== 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Column widths must sum to 12',
        path: []
      });
    }
  });

export const ColumnsBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('columns'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});

/** Allowed inside a tabs panel: leaves, spacer, columns — not tabs or section */
export const TabChildBlockSchema = z.lazy(() =>
  z.discriminatedUnion('block_type', [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);

export const TabsBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('tabs'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    tabs: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string(),
          blocks: z.array(TabChildBlockSchema)
        })
      )
      .min(2)
      .max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const SectionChildBlockSchema = z.lazy(() =>
  z.discriminatedUnion('block_type', [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);

export const SectionLinkSchema = z.object({
  mode: z.literal('linked'),
  source_composition_id: z.string().min(1)
});

const SectionBlockObjectSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('section'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string(),
    collapsed_in_editor: z.boolean().optional(),
    blocks: z.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

function refineLinkedSection(
  section: z.infer<typeof SectionBlockObjectSchema>,
  ctx: z.RefinementCtx
) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Linked sections must have empty content.blocks',
      path: ['content', 'blocks']
    });
  }
}

export const SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);

export const BlockSchema = z.lazy(() =>
  z
    .discriminatedUnion('block_type', [
      ...leafBlockSchemas,
      SpacerBlockSchema,
      ColumnsBlockSchema,
      SectionBlockObjectSchema,
      TimelineBlockSchema,
      CardStackBlockSchema,
      TabsBlockSchema,
      CollectionBlockSchema
    ])
    .superRefine((block, ctx) => {
      if (block.block_type === 'section') {
        refineLinkedSection(block, ctx);
      }
      if (block.block_type === 'annotation') {
        refineAnnotationVoiceTracks(block, ctx);
      }
    })
);

export type Block = z.infer<typeof BlockSchema>;
