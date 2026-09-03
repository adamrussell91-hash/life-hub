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
  'columns',
  'section',
  'spacer',
  'timeline',
  'tabs',
  'collection',
  'outcomes'
]);

export const ColumnPresetSchema = z.enum(['50-50', '33-67', '67-33', '33-33-33', 'custom']);
export const SpacerSizeSchema = z.enum(['small', 'medium', 'large']);

export const VideoProviderSchema = z.enum(['youtube', 'vimeo']);
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
    caption: z.string().optional()
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

export const FlashcardItemSchema = z.object({
  id: z.string().min(1),
  front: z.string(),
  back: z.string(),
  image_url: z.string().optional(),
  image_alt: z.string().optional()
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

export const TimelineBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('timeline'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    events: z.array(TimelineEventSchema).min(1).max(12)
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
  OutcomesBlockSchema
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
    TimelineBlockSchema
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
    TimelineBlockSchema
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
      TabsBlockSchema,
      CollectionBlockSchema
    ])
    .superRefine((block, ctx) => {
      if (block.block_type === 'section') {
        refineLinkedSection(block, ctx);
      }
    })
);

export type Block = z.infer<typeof BlockSchema>;
