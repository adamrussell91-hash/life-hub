// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z3 } from "zod";

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

// apps/teaching/src/schemas/toolkit.ts
import { z as z2 } from "zod";
var TkStepSchema = z2.object({
  id: z2.string().min(1),
  title: z2.string(),
  prompt: z2.string()
});
var TkRevealSchema = z2.object({
  id: z2.string().min(1),
  label: z2.string(),
  body: z2.string()
});
var TkTeacherNoteSchema = z2.object({
  what: z2.string().default(""),
  run: z2.array(z2.string()).default([]),
  say: z2.array(z2.string()).default([]),
  watch: z2.array(z2.string()).default([]),
  extra_label: z2.string().default(""),
  extra: z2.array(z2.string()).default([]),
  time: z2.string().default(""),
  source: z2.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z2.boolean().default(false)
});
var TkJotsSchema = z2.record(z2.string()).default({});
var TkItemListSchema = z2.array(z2.string().min(1)).default([]);
var ToolkitSkillContentSchema = z2.object({
  item: z2.string().min(1),
  label: z2.string(),
  definition: z2.string(),
  definition_source: z2.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z2.string().default(""),
  context: z2.string().default(""),
  steps: z2.array(TkStepSchema).max(8),
  show_test: z2.boolean().default(true),
  checks: z2.array(z2.string()).max(8).default([]),
  reveals: z2.array(TkRevealSchema).max(6).default([]),
  links: z2.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z2.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z2.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z2.enum(["none", "level1", "level2", "level3", "maths", "inquiry"]);
var StressVerdictSchema = z2.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z2.object({
  kind: z2.string().default(""),
  marker: z2.string().default(""),
  a: z2.string().default(""),
  b: z2.string().default("")
});
var ToolkitToolContentSchema = z2.object({
  item: z2.string().min(1),
  label: z2.string(),
  definition: z2.string(),
  definition_source: z2.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z2.string().default(""),
  frame: ToolFrameSchema,
  sentence: z2.string().default(""),
  steps: z2.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z2.string().default(""),
  converters: z2.array(z2.object({ id: z2.string().min(1), closed: z2.string(), open: z2.string() })).max(10).default([]),
  statements: z2.array(
    z2.object({
      id: z2.string().min(1),
      text: z2.string(),
      verdict: StressVerdictSchema,
      reason: z2.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z2.array(TkRevealSchema).max(6).default([]),
  links: z2.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z2.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z2.object({
  item: z2.string().min(1),
  label: z2.string(),
  definition: z2.string(),
  definition_source: z2.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z2.string().default(""),
  claim: z2.string().default(""),
  options: z2.array(z2.object({ id: z2.string().min(1), text: z2.string() })).max(8).default([]),
  probes: z2.array(z2.object({ id: z2.string().min(1), question: z2.string(), asks: z2.string() })).max(8).default([]),
  instruction: z2.string().default(""),
  model: z2.object({ label: z2.string(), body: z2.string() }).default({ label: "", body: "" }),
  discussion: z2.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z2.object({
  id: z2.string().min(1),
  tool: z2.string().min(1),
  prompt: z2.string(),
  frame: z2.string(),
  example: z2.string()
});
var ThinkingMoveContentSchema = z2.object({
  skill: z2.string().min(1),
  tools: z2.array(z2.string().min(1)).min(1).max(5),
  value: z2.string().min(1),
  community: z2.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z2.string().default(""),
  stimulus: z2.string().default(""),
  steps: z2.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z2.array(z2.string()).max(8).default([]),
  why: z2.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z2.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z2.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z2.object({
  /** Student instruction shown at the top of the block. */
  guide: z2.string().default(""),
  stimulus: z2.string().default(""),
  procedure: z2.enum(["sort", "create"]).default("sort"),
  questions: z2.array(z2.object({ id: z2.string().min(1), text: z2.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z2.array(z2.object({ id: z2.string().min(1), closed: z2.string(), open: z2.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z2.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z2.object({
  /** Student instruction shown at the top of the block. */
  guide: z2.string().default(""),
  concepts: z2.array(
    z2.object({
      id: z2.string().min(1),
      label: z2.string(),
      central: z2.boolean(),
      contestable: z2.boolean(),
      common: z2.boolean()
    })
  ).max(8).default([]),
  analogy: z2.object({ stem: z2.string(), example: z2.string() }).default({ stem: "", example: "" }),
  game: z2.object({
    kind: ConceptGameKindSchema,
    left: z2.string(),
    middle: z2.string(),
    right: z2.string(),
    cards: z2.array(z2.object({ id: z2.string().min(1), text: z2.string(), prompt: z2.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z2.array(z2.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z2.object({
  content: z2.string().default(""),
  skills: z2.array(z2.string().min(1)).max(2).default([]),
  tools: z2.array(z2.string().min(1)).max(6).default([]),
  values: z2.array(z2.string().min(1)).max(4).default([]),
  community: z2.array(z2.string().min(1)).max(2).default([]),
  success: z2.array(z2.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z2.object({
  variant: z2.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z2.string().default(""),
  concept: z2.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z2.object({
  task: z2.string().default(""),
  steps: z2.array(TkStepSchema).max(6).default([]),
  example: z2.string().default("")
});
var FluidAnalogyContentSchema = z2.object({
  kind: z2.string().min(1),
  label: z2.string(),
  definition: z2.string(),
  /** The text, character or idea students work with. */
  focus: z2.string().default(""),
  /** The level students start at. */
  level: z2.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z2.boolean().default(true),
  tiers: z2.array(AnalogyTierSchema).length(3),
  show_check: z2.boolean().default(true),
  checks: z2.array(z2.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z2.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z2.object({
  /** Student instruction shown at the top of the block. */
  guide: z2.string().default(""),
  focus: z2.string().default(""),
  /** Types marked "This lesson". */
  types: z2.array(z2.string().min(1)).max(7).default([]),
  show_contrast: z2.boolean().default(true),
  weak: z2.string().default(""),
  strong: z2.string().default(""),
  why: z2.string().default(""),
  process: z2.array(z2.string()).max(8).default([]),
  show_check: z2.boolean().default(true),
  checks: z2.array(z2.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z2.object({
  title: z2.string().default("Teacher note"),
  html: z2.string().default("")
});
var TOOLKIT_NOTE_BLOCK_TYPES = [
  "toolkit_skill",
  "toolkit_tool",
  "toolkit_value",
  "thinking_move",
  "question_quadrant",
  "concept_features",
  "thinking_reflection"
];
var TOOLKIT_BLOCK_TYPES = [
  ...TOOLKIT_NOTE_BLOCK_TYPES,
  "thinking_intentions"
];

// apps/teaching/src/schemas/block.ts
var VisibilitySchema = z3.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z3.enum([
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
  "anthology",
  "outcomes",
  "annotation",
  "toolkit_skill",
  "toolkit_tool",
  "toolkit_value",
  "thinking_move",
  "question_quadrant",
  "concept_features",
  "thinking_intentions",
  "thinking_reflection",
  "fluid_analogy",
  "analogy_types",
  "teacher_note"
]);
var ColumnPresetSchema = z3.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z3.enum(["small", "medium", "large"]);
var VideoProviderSchema = z3.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z3.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z3.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z3.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z3.enum([
  "information",
  "important",
  "warning",
  "extension",
  "scaffold",
  "example",
  "remember",
  "teacher"
]);
var QuestionKindSchema = z3.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z3.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z3.literal(1)
};
var blockLayout = {
  layout: z3.record(z3.unknown()).default({}),
  print: z3.record(z3.unknown()).default({}),
  settings: z3.record(z3.unknown()).default({})
};
var RichTextBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("rich_text"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({ html: z3.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HeadingBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z3.object({ text: z3.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("callout"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    style: CalloutStyleSchema,
    title: z3.string().optional(),
    body: z3.string(),
    related_to: z3.object({
      block_id: z3.string().min(1),
      question_id: z3.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z3.object({
    url: z3.string(),
    alt_text: z3.string(),
    caption: z3.string().optional(),
    annotations: z3.array(
      z3.object({
        id: z3.string().min(1),
        body: z3.string().min(1),
        selector: z3.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z3.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z3.object({
  id: z3.string().min(1),
  url: z3.string(),
  alt_text: z3.string(),
  caption: z3.string().optional()
});
var GalleryBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z3.object({
    layout: GalleryLayoutSchema,
    items: z3.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z3.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z3.object({
    provider: VideoProviderSchema,
    external_id: z3.string(),
    url: z3.string().optional(),
    start_seconds: z3.number().int().positive().optional(),
    title: z3.string().optional(),
    caption: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("embed"),
  variant: z3.string().default("large"),
  visibility: VisibilitySchema,
  content: z3.object({
    url: z3.string(),
    title: z3.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("html"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({ html: z3.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z3.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z3.object({
  enabled: z3.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z3.string().min(1),
  system: z3.string(),
  max_tokens: z3.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("html_app"),
  variant: z3.string().default("large"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    html: z3.string(),
    height_px: z3.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("quote"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    quote: z3.string(),
    attribution: z3.string().optional(),
    source: z3.string().optional(),
    reference: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DividerBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("divider"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("definition"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    term: z3.string(),
    definition: z3.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("code"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    code: z3.string(),
    language: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("audio"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    url: z3.string(),
    title: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("attachment"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    url: z3.string(),
    title: z3.string(),
    filename: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z3.object({
  title: z3.string(),
  body: z3.string()
});
var AccordionBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("accordion"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    items: z3.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("table"),
  variant: z3.string().default("large"),
  visibility: VisibilitySchema,
  content: z3.object({
    headers: z3.array(z3.string()),
    rows: z3.array(z3.array(z3.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z3.object({
  id: z3.string().min(1),
  prompt: z3.string(),
  kind: QuestionKindSchema,
  options: z3.array(z3.string()).optional(),
  response_space: ResponseSpaceSchema.optional()
});
var QuestionSetBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("question_set"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    questions: z3.array(QuestionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z3.object({
  block_id: z3.string().min(1),
  annotation_id: z3.string().min(1),
  lesson_id: z3.string().optional(),
  kind: z3.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z3.string().min(1)
});
var FlashcardItemSchema = z3.object({
  id: z3.string().min(1),
  front: z3.string(),
  back: z3.string(),
  image_url: z3.string().optional(),
  image_alt: z3.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("flashcards"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    cards: z3.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z3.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("cloze"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    text: z3.string(),
    case_sensitive: z3.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z3.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z3.object({
  id: z3.string().min(1),
  label: z3.string()
});
var SelfCheckBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("self_check"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z3.string(),
    answer: z3.string().optional(),
    items: z3.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z3.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z3.object({
  x: z3.union([z3.string(), z3.number()]),
  y: z3.number()
});
var ChartSeriesColorSchema = z3.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z3.object({
  id: z3.string().min(1),
  name: z3.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z3.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("chart"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    chart_type: ChartTypeSchema,
    title: z3.string().optional(),
    x_label: z3.string().optional(),
    y_label: z3.string().optional(),
    series: z3.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("equation"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    latex: z3.string(),
    caption: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z3.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("diagram"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    source: DiagramSourceSchema,
    image_url: z3.string().optional(),
    image_alt: z3.string().optional(),
    svg_markup: z3.string().optional(),
    caption: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z3.object({
  id: z3.string().min(1),
  label: z3.string(),
  parent_id: z3.string().nullable().optional(),
  color: z3.string().optional(),
  x: z3.number().optional(),
  y: z3.number().optional()
});
var GraphBuildModeSchema = z3.enum(["outline", "canvas"]);
var GraphEdgeSchema = z3.object({
  id: z3.string().min(1),
  from: z3.string().min(1),
  to: z3.string().min(1),
  label: z3.string().optional()
});
var MindMapBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("mind_map"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    nodes: z3.array(GraphNodeSchema).min(1).max(24),
    edges: z3.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("concept_map"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    nodes: z3.array(GraphNodeSchema).min(1).max(24),
    edges: z3.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("whiteboard"),
  variant: z3.string().default("large"),
  visibility: VisibilitySchema,
  content: z3.object({
    document_id: z3.string().min(1),
    seed_document_id: z3.string().min(1).optional(),
    title: z3.string().optional(),
    height_px: z3.number().int().min(360).max(1400).default(640),
    published_snapshot: z3.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z3.object({
  id: z3.string().min(1),
  when: z3.string(),
  label: z3.string(),
  description: z3.string(),
  image_url: z3.string().optional(),
  image_alt: z3.string().optional(),
  link_url: z3.string().optional(),
  link_label: z3.string().optional()
});
var TimelineLayoutSchema = z3.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("timeline"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    layout: TimelineLayoutSchema.optional(),
    events: z3.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z3.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z3.object({
  id: z3.string().min(1),
  number: z3.string().optional(),
  eyebrow: z3.string(),
  title: z3.string(),
  description: z3.string(),
  image_url: z3.string().optional(),
  image_alt: z3.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("card_stack"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    cards: z3.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z3.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("collection"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    source: CollectionSourceSchema,
    title: z3.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z3.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("anthology"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyBlockSchema = AnthologyBlockObjectSchema;
var OutcomesBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("outcomes"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z3.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z3.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z3.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z3.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z3.enum(["left", "center", "right"]);
var AnnotationLineSchema = z3.object({
  id: z3.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z3.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z3.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z3.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z3.object({
  id: z3.string().min(1),
  lines: z3.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z3.object({
  kind: z3.enum(["verse", "prose"]),
  stanzas: z3.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z3.object({
  id: z3.string().min(1),
  name: z3.string().min(1),
  subgroup: z3.string().optional()
});
var AnnotationLayerSchema = z3.object({
  id: z3.string().min(1),
  name: z3.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z3.string().optional(),
  sublayers: z3.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z3.object({
  exact: z3.string().min(1),
  prefix: z3.string().optional(),
  suffix: z3.string().optional()
});
var AnnotationAnchorSchema = z3.object({
  /** Required on every stop when the annotation is a thread. */
  id: z3.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z3.string().min(1),
  line: z3.string().optional(),
  start: z3.number().int().min(0).optional(),
  end: z3.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z3.string().optional()
});
var AnnotationTechniqueRefSchema = z3.object({
  id: z3.string().min(1),
  table_version: z3.string().min(1)
});
var AnnotationAttachmentSchema = z3.discriminatedUnion("kind", [
  z3.object({
    kind: z3.literal("link"),
    url: z3.string(),
    label: z3.string().optional()
  }),
  z3.object({
    kind: z3.literal("video"),
    url: z3.string(),
    start_seconds: z3.number().int().min(0).optional()
  }),
  z3.object({
    kind: z3.literal("audio"),
    url: z3.string(),
    title: z3.string().optional()
  }),
  z3.object({
    kind: z3.literal("image"),
    url: z3.string(),
    alt_text: z3.string()
  }),
  z3.object({
    kind: z3.literal("block"),
    block_id: z3.string().min(1)
  })
]);
var AnthologyTagSchema = z3.object({
  include: z3.boolean(),
  themes: z3.array(z3.string().trim().max(40)).max(8).default([]),
  concepts: z3.array(z3.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z3.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z3.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z3.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z3.enum(["text", "custom"]).default("text"),
  anchor_order: z3.array(z3.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z3.object({
  w: z3.string(),
  start: z3.number(),
  end: z3.number()
});
var AnnotationVoiceClipSchema = z3.object({
  id: z3.string().min(1),
  start_s: z3.number(),
  end_s: z3.number(),
  word_range: z3.tuple([z3.number().int().min(0), z3.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z3.enum(["tap", "quote", "ai", "manual"]),
  confidence: z3.number().min(0).max(1),
  approved: z3.boolean(),
  transcript_text: z3.string()
});
var AnnotationVoiceTrackSchema = z3.object({
  id: z3.string().min(1),
  layer_id: z3.string().min(1),
  kind: z3.enum(["reading", "think_aloud", "feedback"]),
  title: z3.string().min(1),
  audio: z3.object({
    media_id: z3.string().optional(),
    url: z3.string().min(1),
    duration_s: z3.number().min(0),
    mime: z3.string().min(1)
  }),
  transcript: z3.object({
    words: z3.array(AnnotationVoiceWordSchema),
    timing: z3.enum(["word", "segment", "estimated"])
  }),
  taps: z3.array(
    z3.object({
      t: z3.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z3.array(AnnotationVoiceClipSchema).default([]),
  status: z3.enum(["draft", "published"]),
  extras: z3.array(
    z3.object({
      id: z3.string().min(1),
      kind: z3.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z3.string(),
      approved: z3.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z3.object({
  id: z3.string().min(1),
  layer_id: z3.string().min(1),
  sublayer_id: z3.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z3.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  body: z3.object({
    html: z3.string(),
    attachments: z3.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "Thread primary anchor needs an id",
      path: ["anchor", "id"]
    });
  }
  const ids = [primaryId, ...extras.map((a) => a.id)].filter(
    (id) => typeof id === "string" && id.length > 0
  );
  const expectedCount = extras.length + (primaryId ? 1 : 0);
  if (ids.length !== expectedCount) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "Thread stop ids must be unique within the annotation",
      path: ["also_anchors"]
    });
  }
  if (ann.thread?.order !== "custom") return;
  const order = ann.thread.anchor_order ?? [];
  const idSet = new Set(ids);
  const isPermutation = order.length === ids.length && new Set(order).size === order.length && order.every((id) => idSet.has(id));
  if (!isPermutation) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z3.object({
  show_markers: z3.boolean().default(true),
  default_layer_id: z3.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z3.union([z3.literal(0), z3.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z3.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("annotation"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string().optional(),
    attribution: z3.string().optional(),
    text: AnnotationTextSchema,
    layers: z3.array(AnnotationLayerSchema).default([]),
    annotations: z3.array(AnnotationItemSchema).default([]),
    voice_tracks: z3.array(AnnotationVoiceTrackSchema).optional(),
    anthology: AnthologyTagSchema.optional(),
    settings: AnnotationBlockSettingsSchema.default({ show_markers: true })
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineAnnotationVoiceTracks(block, ctx) {
  const voiceLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === "voice").map((layer) => layer.id)
  );
  const teacherLayerIds = new Set(
    block.content.layers.filter((layer) => layer.kind === "teacher").map((layer) => layer.id)
  );
  for (const [index, track] of (block.content.voice_tracks ?? []).entries()) {
    if (!voiceLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z3.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z3.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z3.object({
    id: z3.string().min(1),
    type: z3.literal("block"),
    block_type: z3.literal(blockType),
    variant: z3.string().default("medium"),
    visibility: VisibilitySchema,
    content,
    ...blockLayout,
    ...blockTimestamps
  });
}
var ToolkitSkillBlockSchema = toolkitBlockSchema("toolkit_skill", ToolkitSkillContentSchema);
var ToolkitToolBlockSchema = toolkitBlockSchema("toolkit_tool", ToolkitToolContentSchema);
var ToolkitValueBlockSchema = toolkitBlockSchema("toolkit_value", ToolkitValueContentSchema);
var ThinkingMoveBlockSchema = toolkitBlockSchema("thinking_move", ThinkingMoveContentSchema);
var QuestionQuadrantBlockSchema = toolkitBlockSchema(
  "question_quadrant",
  QuestionQuadrantContentSchema
);
var ConceptFeaturesBlockSchema = toolkitBlockSchema(
  "concept_features",
  ConceptFeaturesContentSchema
);
var ThinkingIntentionsBlockSchema = toolkitBlockSchema(
  "thinking_intentions",
  ThinkingIntentionsContentSchema
);
var ThinkingReflectionBlockSchema = toolkitBlockSchema(
  "thinking_reflection",
  ThinkingReflectionContentSchema
);
var FluidAnalogyBlockSchema = toolkitBlockSchema("fluid_analogy", FluidAnalogyContentSchema);
var AnalogyTypesBlockSchema = toolkitBlockSchema("analogy_types", AnalogyTypesContentSchema);
var TeacherNoteBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("teacher_note"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema.transform(() => "teacher_only"),
  content: TeacherNoteBlockContentSchema,
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
  OutcomesBlockSchema,
  AnnotationBlockObjectSchema,
  AnthologyBlockObjectSchema,
  ToolkitSkillBlockSchema,
  ToolkitToolBlockSchema,
  ToolkitValueBlockSchema,
  ThinkingMoveBlockSchema,
  QuestionQuadrantBlockSchema,
  ConceptFeaturesBlockSchema,
  ThinkingIntentionsBlockSchema,
  ThinkingReflectionBlockSchema,
  FluidAnalogyBlockSchema,
  AnalogyTypesBlockSchema,
  TeacherNoteBlockSchema
];
var SpacerBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("spacer"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z3.lazy(
  () => z3.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z3.array(
  z3.object({
    width: z3.number().int().min(1).max(12),
    blocks: z3.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("columns"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z3.lazy(
  () => z3.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("tabs"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    tabs: z3.array(
      z3.object({
        id: z3.string().min(1),
        label: z3.string(),
        blocks: z3.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z3.lazy(
  () => z3.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SectionLinkSchema = z3.object({
  mode: z3.literal("linked"),
  source_composition_id: z3.string().min(1)
});
var SectionBlockObjectSchema = z3.object({
  id: z3.string().min(1),
  type: z3.literal("block"),
  block_type: z3.literal("section"),
  variant: z3.string().default("medium"),
  visibility: VisibilitySchema,
  content: z3.object({
    title: z3.string(),
    collapsed_in_editor: z3.boolean().optional(),
    blocks: z3.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z3.lazy(
  () => z3.discriminatedUnion("block_type", [
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
    if (block.block_type === "annotation") {
      refineAnnotationVoiceTracks(block, ctx);
    }
  })
);
export {
  AccordionBlockSchema,
  AccordionItemSchema,
  AnalogyTypesBlockSchema,
  AnnotationAnchorSchema,
  AnnotationAttachmentSchema,
  AnnotationBlockObjectSchema,
  AnnotationBlockSchema,
  AnnotationBlockSettingsSchema,
  AnnotationColourSchema,
  AnnotationFamilyKeySchema,
  AnnotationGranularitySchema,
  AnnotationItemSchema,
  AnnotationLayerKindSchema,
  AnnotationLayerSchema,
  AnnotationLineAlignSchema,
  AnnotationLineSchema,
  AnnotationQuoteSchema,
  AnnotationStanzaSchema,
  AnnotationSublayerSchema,
  AnnotationTechniqueRefSchema,
  AnnotationTextSchema,
  AnnotationThreadKindSchema,
  AnnotationThreadSchema,
  AnnotationVoiceClipSchema,
  AnnotationVoiceTrackSchema,
  AnnotationVoiceWordSchema,
  AnthologyBlockObjectSchema,
  AnthologyBlockSchema,
  AnthologyTagSchema,
  AnthologyViewSchema,
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
  ConceptFeaturesBlockSchema,
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
  FlashcardSourceSchema,
  FlashcardsBlockSchema,
  FluidAnalogyBlockSchema,
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
  QuestionQuadrantBlockSchema,
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
  TeacherNoteBlockSchema,
  ThinkingIntentionsBlockSchema,
  ThinkingMoveBlockSchema,
  ThinkingReflectionBlockSchema,
  TimelineBlockSchema,
  TimelineEventSchema,
  TimelineLayoutSchema,
  ToolkitSkillBlockSchema,
  ToolkitToolBlockSchema,
  ToolkitValueBlockSchema,
  VideoBlockSchema,
  VideoProviderSchema,
  VisibilitySchema,
  WhiteboardBlockSchema,
  refineAnnotationVoiceTracks
};
