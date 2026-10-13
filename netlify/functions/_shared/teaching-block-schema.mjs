// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z2 } from "zod";

// apps/teaching/src/schemas/common.ts
import { z } from "zod";
var StatusSchema = z.enum(["active", "archived", "trashed"]);
var IsoDateSchema = z.string().datetime();
var CommonFields = {
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: StatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
};
var TrashFieldsSchema = z.object({
  trashed_at: IsoDateSchema.optional(),
  previous_status: z.enum(["active", "archived"]).optional(),
  trash_reason: z.string().min(1).optional()
});
var TrashFields = {
  trashed_at: IsoDateSchema.optional(),
  previous_status: z.enum(["active", "archived"]).optional(),
  trash_reason: z.string().min(1).optional()
};

// apps/teaching/src/schemas/block.ts
var VisibilitySchema = z2.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z2.enum([
  "rich_text",
  "heading",
  "callout",
  "image",
  "gallery",
  "video",
  "embed",
  "html",
  "html_app",
  "quote",
  "divider",
  "definition",
  "code",
  "audio",
  "attachment",
  "accordion",
  "table",
  "question_set",
  "flashcards",
  "cloze",
  "self_check",
  "chart",
  "equation",
  "diagram",
  "mind_map",
  "concept_map",
  "whiteboard",
  "columns",
  "section",
  "spacer",
  "timeline",
  "card_stack",
  "tabs",
  "collection",
  "outcomes"
]);
var ColumnPresetSchema = z2.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z2.enum(["small", "medium", "large"]);
var VideoProviderSchema = z2.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z2.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z2.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z2.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z2.enum([
  "information",
  "important",
  "warning",
  "extension",
  "scaffold",
  "example",
  "remember",
  "teacher"
]);
var QuestionKindSchema = z2.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z2.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z2.literal(1)
};
var blockLayout = {
  layout: z2.record(z2.unknown()).default({}),
  print: z2.record(z2.unknown()).default({}),
  settings: z2.record(z2.unknown()).default({})
};
var RichTextBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("rich_text"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({ html: z2.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HeadingBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z2.object({ text: z2.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("callout"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    style: CalloutStyleSchema,
    title: z2.string().optional(),
    body: z2.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z2.object({
    url: z2.string(),
    alt_text: z2.string(),
    caption: z2.string().optional(),
    annotations: z2.array(
      z2.object({
        id: z2.string().min(1),
        body: z2.string().min(1),
        selector: z2.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z2.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z2.object({
  id: z2.string().min(1),
  url: z2.string(),
  alt_text: z2.string(),
  caption: z2.string().optional()
});
var GalleryBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z2.object({
    layout: GalleryLayoutSchema,
    items: z2.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z2.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z2.object({
    provider: VideoProviderSchema,
    external_id: z2.string(),
    url: z2.string().optional(),
    start_seconds: z2.number().int().positive().optional(),
    title: z2.string().optional(),
    caption: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("embed"),
  variant: z2.string().default("large"),
  visibility: VisibilitySchema,
  content: z2.object({
    url: z2.string(),
    title: z2.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("html"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({ html: z2.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z2.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z2.object({
  enabled: z2.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z2.string().min(1),
  system: z2.string(),
  max_tokens: z2.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("html_app"),
  variant: z2.string().default("large"),
  visibility: VisibilitySchema,
  content: z2.object({
    title: z2.string().optional(),
    html: z2.string(),
    height_px: z2.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("quote"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    quote: z2.string(),
    attribution: z2.string().optional(),
    source: z2.string().optional(),
    reference: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DividerBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("divider"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("definition"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    term: z2.string(),
    definition: z2.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("code"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    code: z2.string(),
    language: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("audio"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    url: z2.string(),
    title: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("attachment"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    url: z2.string(),
    title: z2.string(),
    filename: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z2.object({
  title: z2.string(),
  body: z2.string()
});
var AccordionBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("accordion"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    items: z2.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("table"),
  variant: z2.string().default("large"),
  visibility: VisibilitySchema,
  content: z2.object({
    headers: z2.array(z2.string()),
    rows: z2.array(z2.array(z2.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z2.object({
  id: z2.string().min(1),
  prompt: z2.string(),
  kind: QuestionKindSchema,
  options: z2.array(z2.string()).optional(),
  response_space: ResponseSpaceSchema.optional()
});
var QuestionSetBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("question_set"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    title: z2.string().optional(),
    questions: z2.array(QuestionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardItemSchema = z2.object({
  id: z2.string().min(1),
  front: z2.string(),
  back: z2.string(),
  image_url: z2.string().optional(),
  image_alt: z2.string().optional()
});
var FlashcardsBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("flashcards"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    cards: z2.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z2.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("cloze"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    title: z2.string().optional(),
    text: z2.string(),
    case_sensitive: z2.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z2.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z2.object({
  id: z2.string().min(1),
  label: z2.string()
});
var SelfCheckBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("self_check"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    title: z2.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z2.string(),
    answer: z2.string().optional(),
    items: z2.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z2.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z2.object({
  x: z2.union([z2.string(), z2.number()]),
  y: z2.number()
});
var ChartSeriesColorSchema = z2.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z2.object({
  id: z2.string().min(1),
  name: z2.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z2.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("chart"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    chart_type: ChartTypeSchema,
    title: z2.string().optional(),
    x_label: z2.string().optional(),
    y_label: z2.string().optional(),
    series: z2.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("equation"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    latex: z2.string(),
    caption: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z2.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("diagram"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    source: DiagramSourceSchema,
    image_url: z2.string().optional(),
    image_alt: z2.string().optional(),
    svg_markup: z2.string().optional(),
    caption: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z2.object({
  id: z2.string().min(1),
  label: z2.string(),
  parent_id: z2.string().nullable().optional(),
  color: z2.string().optional(),
  x: z2.number().optional(),
  y: z2.number().optional()
});
var GraphBuildModeSchema = z2.enum(["outline", "canvas"]);
var GraphEdgeSchema = z2.object({
  id: z2.string().min(1),
  from: z2.string().min(1),
  to: z2.string().min(1),
  label: z2.string().optional()
});
var MindMapBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("mind_map"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    title: z2.string().optional(),
    nodes: z2.array(GraphNodeSchema).min(1).max(24),
    edges: z2.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("concept_map"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    title: z2.string().optional(),
    nodes: z2.array(GraphNodeSchema).min(1).max(24),
    edges: z2.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("whiteboard"),
  variant: z2.string().default("large"),
  visibility: VisibilitySchema,
  content: z2.object({
    document_id: z2.string().min(1),
    seed_document_id: z2.string().min(1).optional(),
    title: z2.string().optional(),
    height_px: z2.number().int().min(360).max(1400).default(640),
    published_snapshot: z2.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z2.object({
  id: z2.string().min(1),
  when: z2.string(),
  label: z2.string(),
  description: z2.string(),
  image_url: z2.string().optional(),
  image_alt: z2.string().optional(),
  link_url: z2.string().optional(),
  link_label: z2.string().optional()
});
var TimelineBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("timeline"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    events: z2.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z2.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z2.object({
  id: z2.string().min(1),
  number: z2.string().optional(),
  eyebrow: z2.string(),
  title: z2.string(),
  description: z2.string(),
  image_url: z2.string().optional(),
  image_alt: z2.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("card_stack"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    title: z2.string().optional(),
    cards: z2.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z2.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("collection"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    source: CollectionSourceSchema,
    title: z2.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var OutcomesBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("outcomes"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var leafBlockSchemas = [
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
  OutcomesBlockSchema
];
var SpacerBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("spacer"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z2.lazy(
  () => z2.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z2.array(
  z2.object({
    width: z2.number().int().min(1).max(12),
    blocks: z2.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("columns"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z2.lazy(
  () => z2.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("tabs"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    tabs: z2.array(
      z2.object({
        id: z2.string().min(1),
        label: z2.string(),
        blocks: z2.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z2.lazy(
  () => z2.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SectionLinkSchema = z2.object({
  mode: z2.literal("linked"),
  source_composition_id: z2.string().min(1)
});
var SectionBlockObjectSchema = z2.object({
  id: z2.string().min(1),
  type: z2.literal("block"),
  block_type: z2.literal("section"),
  variant: z2.string().default("medium"),
  visibility: VisibilitySchema,
  content: z2.object({
    title: z2.string(),
    collapsed_in_editor: z2.boolean().optional(),
    blocks: z2.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z2.lazy(
  () => z2.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    SectionBlockObjectSchema,
    TimelineBlockSchema,
    CardStackBlockSchema,
    TabsBlockSchema,
    CollectionBlockSchema
  ]).superRefine((block, ctx) => {
    if (block.block_type === "section") {
      refineLinkedSection(block, ctx);
    }
  })
);
export {
  AccordionBlockSchema,
  AccordionItemSchema,
  AttachmentBlockSchema,
  AudioBlockSchema,
  BlockSchema,
  BlockTypeSchema,
  CalloutBlockSchema,
  CalloutStyleSchema,
  CardStackBlockSchema,
  CardStackItemSchema,
  CardStackTintSchema,
  ChartBlockSchema,
  ChartPointSchema,
  ChartSeriesColorSchema,
  ChartSeriesSchema,
  ChartTypeSchema,
  ClozeBlockSchema,
  CodeBlockSchema,
  CollectionBlockSchema,
  CollectionSourceSchema,
  ColumnChildBlockSchema,
  ColumnPresetSchema,
  ColumnsBlockSchema,
  ConceptMapBlockSchema,
  DIAGRAM_IMAGE_PUBLISH_URL_ISSUE,
  DefinitionBlockSchema,
  DiagramBlockSchema,
  DiagramSourceSchema,
  DividerBlockSchema,
  EmbedBlockSchema,
  EmbedProviderSchema,
  EquationBlockSchema,
  FlashcardItemSchema,
  FlashcardsBlockSchema,
  GalleryBlockSchema,
  GalleryItemSchema,
  GalleryLayoutSchema,
  GraphBuildModeSchema,
  GraphEdgeSchema,
  GraphNodeSchema,
  HeadingBlockSchema,
  HeadingVariantSchema,
  HtmlAppAiProviderSchema,
  HtmlAppAiSchema,
  HtmlAppBlockSchema,
  HtmlBlockSchema,
  ImageBlockSchema,
  MediaSizeVariantSchema,
  MindMapBlockSchema,
  OutcomesBlockSchema,
  QuestionItemSchema,
  QuestionKindSchema,
  QuestionSetBlockSchema,
  QuoteBlockSchema,
  ResponseSpaceSchema,
  RichTextBlockSchema,
  SectionBlockSchema,
  SectionChildBlockSchema,
  SectionLinkSchema,
  SelfCheckBlockSchema,
  SelfCheckItemSchema,
  SelfCheckModeSchema,
  SpacerBlockSchema,
  SpacerSizeSchema,
  TabChildBlockSchema,
  TableBlockSchema,
  TabsBlockSchema,
  TimelineBlockSchema,
  TimelineEventSchema,
  VideoBlockSchema,
  VideoProviderSchema,
  VisibilitySchema,
  WhiteboardBlockSchema
};
