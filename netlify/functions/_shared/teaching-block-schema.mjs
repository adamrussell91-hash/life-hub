// Generated from apps/teaching/src/schemas/block.ts; regenerate with scripts/generate-alchemy-schema.mjs.

// apps/teaching/src/schemas/block.ts
import { z as z4 } from "zod";

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

// apps/teaching/src/schemas/kaplan.ts
import { z as z2 } from "zod";
var KaplanLensSchema = z2.enum(["patterns", "multiple_perspectives", "ethics"]);
var ThreePromptsSchema = z2.tuple([
  z2.string().max(1200),
  z2.string().max(1200),
  z2.string().max(1200)
]);
var KaplanQualifierSchema = z2.object({
  lens: KaplanLensSchema,
  focus: z2.string().trim().max(200).default(""),
  mode: z2.enum(["notes", "discussion"]).default("notes"),
  prompts: ThreePromptsSchema.optional(),
  supports: z2.tuple([
    z2.string().max(1200).nullable(),
    z2.string().max(1200).nullable(),
    z2.string().max(1200).nullable()
  ]).optional()
});
var KaplanQualifiersSchema = z2.array(KaplanQualifierSchema).max(3).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.lens)).size !== items.length) {
    ctx.addIssue({ code: z2.ZodIssueCode.custom, message: "Use each Kaplan lens once per block." });
  }
});

// apps/teaching/src/schemas/toolkit.ts
import { z as z3 } from "zod";
var TkStepSchema = z3.object({
  id: z3.string().min(1),
  title: z3.string(),
  prompt: z3.string()
});
var TkRevealSchema = z3.object({
  id: z3.string().min(1),
  label: z3.string(),
  body: z3.string()
});
var TkTeacherNoteSchema = z3.object({
  what: z3.string().default(""),
  run: z3.array(z3.string()).default([]),
  say: z3.array(z3.string()).default([]),
  watch: z3.array(z3.string()).default([]),
  extra_label: z3.string().default(""),
  extra: z3.array(z3.string()).default([]),
  time: z3.string().default(""),
  source: z3.string().default(""),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z3.boolean().default(false)
});
var TkJotsSchema = z3.record(z3.string()).default({});
var TkItemListSchema = z3.array(z3.string().min(1)).default([]);
var ToolkitSkillContentSchema = z3.object({
  item: z3.string().min(1),
  label: z3.string(),
  definition: z3.string(),
  definition_source: z3.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z3.string().default(""),
  context: z3.string().default(""),
  steps: z3.array(TkStepSchema).max(8),
  show_test: z3.boolean().default(true),
  checks: z3.array(z3.string()).max(8).default([]),
  reveals: z3.array(TkRevealSchema).max(6).default([]),
  links: z3.object({ tools: TkItemListSchema, values: TkItemListSchema }).default({ tools: [], values: [] }),
  show_links: z3.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolFrameSchema = z3.enum(["fork", "steps", "converter", "stress"]);
var PairLevelSchema = z3.enum(["none", "level1", "level2", "level3", "maths", "inquiry"]);
var StressVerdictSchema = z3.enum(["survives", "fails", "qualifies"]);
var ForkSlotsSchema = z3.object({
  kind: z3.string().default(""),
  marker: z3.string().default(""),
  a: z3.string().default(""),
  b: z3.string().default("")
});
var ToolkitToolContentSchema = z3.object({
  item: z3.string().min(1),
  label: z3.string(),
  definition: z3.string(),
  definition_source: z3.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z3.string().default(""),
  frame: ToolFrameSchema,
  sentence: z3.string().default(""),
  steps: z3.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z3.string().default(""),
  converters: z3.array(z3.object({ id: z3.string().min(1), closed: z3.string(), open: z3.string() })).max(10).default([]),
  statements: z3.array(
    z3.object({
      id: z3.string().min(1),
      text: z3.string(),
      verdict: StressVerdictSchema,
      reason: z3.string()
    })
  ).max(10).default([]),
  pair_level: PairLevelSchema.default("none"),
  reveals: z3.array(TkRevealSchema).max(6).default([]),
  links: z3.object({ skills: TkItemListSchema, tools: TkItemListSchema }).default({ skills: [], tools: [] }),
  show_links: z3.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ToolkitValueContentSchema = z3.object({
  item: z3.string().min(1),
  label: z3.string(),
  definition: z3.string(),
  definition_source: z3.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z3.string().default(""),
  claim: z3.string().default(""),
  options: z3.array(z3.object({ id: z3.string().min(1), text: z3.string() })).max(8).default([]),
  probes: z3.array(z3.object({ id: z3.string().min(1), question: z3.string(), asks: z3.string() })).max(8).default([]),
  instruction: z3.string().default(""),
  model: z3.object({ label: z3.string(), body: z3.string() }).default({ label: "", body: "" }),
  discussion: z3.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingMoveStepSchema = z3.object({
  id: z3.string().min(1),
  tool: z3.string().min(1),
  prompt: z3.string(),
  frame: z3.string(),
  example: z3.string()
});
var ThinkingMoveContentSchema = z3.object({
  skill: z3.string().min(1),
  tools: z3.array(z3.string().min(1)).min(1).max(5),
  value: z3.string().min(1),
  community: z3.string().default(""),
  /** Student instruction shown at the top of the block. */
  guide: z3.string().default(""),
  stimulus: z3.string().default(""),
  steps: z3.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z3.array(z3.string()).max(8).default([]),
  why: z3.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z3.string().default(""),
  teacher_jots: TkJotsSchema.optional()
});
var QuadrantSchema = z3.enum(["comprehension", "research", "speculation", "inquiry"]);
var QuestionQuadrantContentSchema = z3.object({
  /** Student instruction shown at the top of the block. */
  guide: z3.string().default(""),
  stimulus: z3.string().default(""),
  procedure: z3.enum(["sort", "create"]).default("sort"),
  questions: z3.array(z3.object({ id: z3.string().min(1), text: z3.string(), quadrant: QuadrantSchema })).max(16).default([]),
  converters: z3.array(z3.object({ id: z3.string().min(1), closed: z3.string(), open: z3.string() })).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ConceptGameKindSchema = z3.enum(["kind_sort", "degree_line", "word_sort"]);
var ConceptFeaturesContentSchema = z3.object({
  /** Student instruction shown at the top of the block. */
  guide: z3.string().default(""),
  concepts: z3.array(
    z3.object({
      id: z3.string().min(1),
      label: z3.string(),
      central: z3.boolean(),
      contestable: z3.boolean(),
      common: z3.boolean()
    })
  ).max(8).default([]),
  analogy: z3.object({ stem: z3.string(), example: z3.string() }).default({ stem: "", example: "" }),
  game: z3.object({
    kind: ConceptGameKindSchema,
    left: z3.string(),
    middle: z3.string(),
    right: z3.string(),
    cards: z3.array(z3.object({ id: z3.string().min(1), text: z3.string(), prompt: z3.string() })).max(16)
  }).default({ kind: "kind_sort", left: "", middle: "?", right: "", cards: [] }),
  criteria: z3.array(z3.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var ThinkingIntentionsContentSchema = z3.object({
  content: z3.string().default(""),
  skills: z3.array(z3.string().min(1)).max(2).default([]),
  tools: z3.array(z3.string().min(1)).max(6).default([]),
  values: z3.array(z3.string().min(1)).max(4).default([]),
  community: z3.array(z3.string().min(1)).max(2).default([]),
  success: z3.array(z3.string()).max(6).default([])
});
var ThinkingReflectionContentSchema = z3.object({
  variant: z3.enum(["lesson", "unit"]).default("lesson"),
  /** Student instruction shown at the top of the block. */
  guide: z3.string().default(""),
  concept: z3.string().default(""),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTierSchema = z3.object({
  task: z3.string().default(""),
  steps: z3.array(TkStepSchema).max(6).default([]),
  example: z3.string().default("")
});
var FluidAnalogyContentSchema = z3.object({
  kind: z3.string().min(1),
  label: z3.string(),
  definition: z3.string(),
  /** The text, character or idea students work with. */
  focus: z3.string().default(""),
  /** The level students start at. */
  level: z3.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z3.boolean().default(true),
  tiers: z3.array(AnalogyTierSchema).length(3),
  show_check: z3.boolean().default(true),
  checks: z3.array(z3.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z3.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var AnalogyTypesContentSchema = z3.object({
  /** Student instruction shown at the top of the block. */
  guide: z3.string().default(""),
  focus: z3.string().default(""),
  /** Types marked "This lesson". */
  types: z3.array(z3.string().min(1)).max(7).default([]),
  show_contrast: z3.boolean().default(true),
  weak: z3.string().default(""),
  strong: z3.string().default(""),
  why: z3.string().default(""),
  process: z3.array(z3.string()).max(8).default([]),
  show_check: z3.boolean().default(true),
  checks: z3.array(z3.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});
var TeacherNoteBlockContentSchema = z3.object({
  title: z3.string().default("Teacher note"),
  html: z3.string().default("")
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
var VisibilitySchema = z4.enum(["student_teacher", "teacher_only"]);
var BlockTypeSchema = z4.enum([
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
  "peer_feedback",
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
var ColumnPresetSchema = z4.enum(["50-50", "33-67", "67-33", "33-33-33", "custom"]);
var SpacerSizeSchema = z4.enum(["small", "medium", "large"]);
var VideoProviderSchema = z4.enum(["youtube", "vimeo", "file"]);
var EmbedProviderSchema = z4.enum([
  "google_maps",
  "google_slides",
  "google_docs",
  "pdf",
  "generic"
]);
var HeadingVariantSchema = z4.enum(["page", "section", "subsection"]);
var MediaSizeVariantSchema = z4.enum(["small", "medium", "large"]);
var CalloutStyleSchema = z4.enum([
  "information",
  "important",
  "warning",
  "extension",
  "scaffold",
  "example",
  "remember",
  "teacher"
]);
var QuestionKindSchema = z4.enum(["short_answer", "multiple_choice"]);
var ResponseSpaceSchema = z4.enum([
  "none",
  "short",
  "medium",
  "long",
  "extended"
]);
var blockTimestamps = {
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z4.literal(1)
};
var blockLayout = {
  qualifiers: KaplanQualifiersSchema.optional(),
  layout: z4.record(z4.unknown()).default({}),
  print: z4.record(z4.unknown()).default({}),
  settings: z4.record(z4.unknown()).default({})
};
var RichTextBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("rich_text"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({ html: z4.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HeadingBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("heading"),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z4.object({ text: z4.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var CalloutBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("callout"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    style: CalloutStyleSchema,
    title: z4.string().optional(),
    body: z4.string(),
    related_to: z4.object({
      block_id: z4.string().min(1),
      question_id: z4.string().min(1).optional()
    }).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ImageBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("image"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z4.object({
    url: z4.string(),
    alt_text: z4.string(),
    caption: z4.string().optional(),
    annotations: z4.array(
      z4.object({
        id: z4.string().min(1),
        body: z4.string().min(1),
        selector: z4.unknown().optional()
      })
    ).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GalleryLayoutSchema = z4.enum(["grid", "carousel", "comparison"]);
var GalleryItemSchema = z4.object({
  id: z4.string().min(1),
  url: z4.string(),
  alt_text: z4.string(),
  caption: z4.string().optional()
});
var GalleryBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("gallery"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z4.object({
    layout: GalleryLayoutSchema,
    items: z4.array(GalleryItemSchema).min(2).max(12)
  }).superRefine((content, ctx) => {
    if (content.layout === "comparison" && content.items.length !== 2) {
      ctx.addIssue({
        code: z4.ZodIssueCode.custom,
        message: "Comparison galleries need exactly 2 items",
        path: ["items"]
      });
    }
  }),
  ...blockLayout,
  ...blockTimestamps
});
var VideoBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("video"),
  variant: MediaSizeVariantSchema.default("large"),
  visibility: VisibilitySchema,
  content: z4.object({
    provider: VideoProviderSchema,
    external_id: z4.string(),
    url: z4.string().optional(),
    start_seconds: z4.number().int().positive().optional(),
    title: z4.string().optional(),
    caption: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EmbedBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("embed"),
  variant: z4.string().default("large"),
  visibility: VisibilitySchema,
  content: z4.object({
    url: z4.string(),
    title: z4.string().optional(),
    provider: EmbedProviderSchema.optional(),
    embed_url: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("html"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({ html: z4.string() }),
  ...blockLayout,
  ...blockTimestamps
});
var HtmlAppAiProviderSchema = z4.enum(["openai", "anthropic"]);
var HtmlAppAiSchema = z4.object({
  enabled: z4.literal(true),
  provider: HtmlAppAiProviderSchema,
  model: z4.string().min(1),
  system: z4.string(),
  max_tokens: z4.number().int().positive().max(2e3)
});
var HtmlAppBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("html_app"),
  variant: z4.string().default("large"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    html: z4.string(),
    height_px: z4.number().int().positive().max(4e3).optional(),
    ai: HtmlAppAiSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuoteBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("quote"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    quote: z4.string(),
    attribution: z4.string().optional(),
    source: z4.string().optional(),
    reference: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DividerBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("divider"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var DefinitionBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("definition"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    term: z4.string(),
    definition: z4.string()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CodeBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("code"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    code: z4.string(),
    language: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AudioBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("audio"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    url: z4.string(),
    title: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AttachmentBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("attachment"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    url: z4.string(),
    title: z4.string(),
    filename: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AccordionItemSchema = z4.object({
  title: z4.string(),
  body: z4.string()
});
var AccordionBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("accordion"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    items: z4.array(AccordionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TableBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("table"),
  variant: z4.string().default("large"),
  visibility: VisibilitySchema,
  content: z4.object({
    headers: z4.array(z4.string()),
    rows: z4.array(z4.array(z4.string()))
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionItemSchema = z4.object({
  id: z4.string().min(1),
  prompt: z4.string(),
  kind: QuestionKindSchema,
  options: z4.array(z4.string()).optional(),
  response_space: ResponseSpaceSchema.optional()
});
var PeerFeedbackBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("peer_feedback"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    prompt: z4.string().max(4e3),
    strength_prompt: z4.string().max(300).default("One thing that works well\u2026"),
    suggestion_prompt: z4.string().max(300).default("One suggestion or question\u2026")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var QuestionSetBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("question_set"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    questions: z4.array(QuestionItemSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var FlashcardSourceSchema = z4.object({
  block_id: z4.string().min(1),
  annotation_id: z4.string().min(1),
  lesson_id: z4.string().optional(),
  kind: z4.enum(["quote_to_technique", "find_it", "line_recall"]),
  source_hash: z4.string().min(1)
});
var FlashcardItemSchema = z4.object({
  id: z4.string().min(1),
  front: z4.string(),
  back: z4.string(),
  image_url: z4.string().optional(),
  image_alt: z4.string().optional(),
  /** Teacher-only metadata; stripped from the student payload. */
  source: FlashcardSourceSchema.optional()
});
var FlashcardsBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("flashcards"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    cards: z4.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z4.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ClozeBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("cloze"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    text: z4.string(),
    case_sensitive: z4.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SelfCheckModeSchema = z4.enum(["reveal", "checklist", "confidence"]);
var SelfCheckItemSchema = z4.object({
  id: z4.string().min(1),
  label: z4.string()
});
var SelfCheckBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("self_check"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z4.string(),
    answer: z4.string().optional(),
    items: z4.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ChartTypeSchema = z4.enum(["bar", "line", "pie", "scatter"]);
var ChartPointSchema = z4.object({
  x: z4.union([z4.string(), z4.number()]),
  y: z4.number()
});
var ChartSeriesColorSchema = z4.enum([
  "wave",
  "danger",
  "success",
  "high-sea",
  "pastel-lilac-ink",
  "navy-2"
]);
var ChartSeriesSchema = z4.object({
  id: z4.string().min(1),
  name: z4.string(),
  color: ChartSeriesColorSchema.optional(),
  points: z4.array(ChartPointSchema).min(1).max(24)
});
var ChartBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("chart"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    chart_type: ChartTypeSchema,
    title: z4.string().optional(),
    x_label: z4.string().optional(),
    y_label: z4.string().optional(),
    series: z4.array(ChartSeriesSchema).min(1).max(6)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var EquationBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("equation"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    latex: z4.string(),
    caption: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var DiagramSourceSchema = z4.enum(["image", "svg"]);
var DIAGRAM_IMAGE_PUBLISH_URL_ISSUE = "Diagram image needs a valid http(s) URL to publish";
var DiagramBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("diagram"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    source: DiagramSourceSchema,
    image_url: z4.string().optional(),
    image_alt: z4.string().optional(),
    svg_markup: z4.string().optional(),
    caption: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var GraphNodeSchema = z4.object({
  id: z4.string().min(1),
  label: z4.string(),
  parent_id: z4.string().nullable().optional(),
  color: z4.string().optional(),
  x: z4.number().optional(),
  y: z4.number().optional()
});
var GraphBuildModeSchema = z4.enum(["outline", "canvas"]);
var GraphEdgeSchema = z4.object({
  id: z4.string().min(1),
  from: z4.string().min(1),
  to: z4.string().min(1),
  label: z4.string().optional()
});
var MindMapBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("mind_map"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    nodes: z4.array(GraphNodeSchema).min(1).max(24),
    edges: z4.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ConceptMapBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("concept_map"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    nodes: z4.array(GraphNodeSchema).min(1).max(24),
    edges: z4.array(GraphEdgeSchema).max(40),
    mode: GraphBuildModeSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var WhiteboardBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("whiteboard"),
  variant: z4.string().default("large"),
  visibility: VisibilitySchema,
  content: z4.object({
    document_id: z4.string().min(1),
    seed_document_id: z4.string().min(1).optional(),
    title: z4.string().optional(),
    height_px: z4.number().int().min(360).max(1400).default(640),
    published_snapshot: z4.unknown().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TimelineEventSchema = z4.object({
  id: z4.string().min(1),
  when: z4.string(),
  label: z4.string(),
  description: z4.string(),
  image_url: z4.string().optional(),
  image_alt: z4.string().optional(),
  link_url: z4.string().optional(),
  link_label: z4.string().optional()
});
var TimelineLayoutSchema = z4.enum(["rail", "alternate", "horizontal"]);
var TimelineBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("timeline"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    layout: TimelineLayoutSchema.optional(),
    events: z4.array(TimelineEventSchema).min(1).max(12)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CardStackTintSchema = z4.enum([
  "navy",
  "wave",
  "marine",
  "depth",
  "high-sea",
  "lilac",
  "sage",
  "peach"
]);
var CardStackItemSchema = z4.object({
  id: z4.string().min(1),
  number: z4.string().optional(),
  eyebrow: z4.string(),
  title: z4.string(),
  description: z4.string(),
  image_url: z4.string().optional(),
  image_alt: z4.string().optional(),
  tint: CardStackTintSchema
});
var CardStackBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("card_stack"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    cards: z4.array(CardStackItemSchema).min(1).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var CollectionSourceSchema = z4.enum(["unit_lessons", "recent_lessons"]);
var CollectionBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("collection"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    source: CollectionSourceSchema,
    title: z4.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyViewSchema = z4.enum(["text", "theme", "technique", "connections"]);
var AnthologyBlockObjectSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("anthology"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    default_view: AnthologyViewSchema.default("text")
  }),
  ...blockLayout,
  ...blockTimestamps
});
var AnthologyBlockSchema = AnthologyBlockObjectSchema;
var OutcomesBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("outcomes"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({}).default({}),
  ...blockLayout,
  ...blockTimestamps
});
var AnnotationFamilyKeySchema = z4.enum([
  "Descriptive",
  "Repetitive",
  "Comparative",
  "Structural",
  "Intertextual"
]);
var AnnotationLayerKindSchema = z4.enum([
  "family",
  "free",
  "lens",
  "teacher",
  "voice"
]);
var AnnotationColourSchema = z4.enum([
  "wave",
  "high-sea",
  "sand",
  "shore",
  "marine",
  "navy",
  "coral",
  "mist"
]);
var AnnotationGranularitySchema = z4.enum(["word", "phrase", "line", "stanza"]);
var AnnotationLineAlignSchema = z4.enum(["left", "center", "right"]);
var AnnotationLineSchema = z4.object({
  id: z4.string().min(1),
  /** Plain text. Anchor offsets always index into this, never into `html`. */
  text: z4.string(),
  /** Inline formatting only (strong / em / u) over exactly `text`. */
  html: z4.string().optional(),
  align: AnnotationLineAlignSchema.optional(),
  /** Indent steps (poetry layout); 0 or absent = flush. */
  indent: z4.number().int().min(0).max(8).optional()
});
var AnnotationStanzaSchema = z4.object({
  id: z4.string().min(1),
  lines: z4.array(AnnotationLineSchema).min(1)
});
var AnnotationTextSchema = z4.object({
  kind: z4.enum(["verse", "prose"]),
  stanzas: z4.array(AnnotationStanzaSchema).min(1)
});
var AnnotationSublayerSchema = z4.object({
  id: z4.string().min(1),
  name: z4.string().min(1),
  subgroup: z4.string().optional()
});
var AnnotationLayerSchema = z4.object({
  id: z4.string().min(1),
  name: z4.string().min(1),
  kind: AnnotationLayerKindSchema,
  family: AnnotationFamilyKeySchema.optional(),
  colour: AnnotationColourSchema,
  symbol: z4.string().optional(),
  sublayers: z4.array(AnnotationSublayerSchema).optional()
});
var AnnotationQuoteSchema = z4.object({
  exact: z4.string().min(1),
  prefix: z4.string().optional(),
  suffix: z4.string().optional()
});
var AnnotationAnchorSchema = z4.object({
  /** Required on every stop when the annotation is a thread. */
  id: z4.string().min(1).optional(),
  granularity: AnnotationGranularitySchema,
  stanza: z4.string().min(1),
  line: z4.string().optional(),
  start: z4.number().int().min(0).optional(),
  end: z4.number().int().min(0).optional(),
  quote: AnnotationQuoteSchema,
  /** Per-stop caption for thread step-through; sanitised on publish. */
  note_html: z4.string().optional()
});
var AnnotationTechniqueRefSchema = z4.object({
  id: z4.string().min(1),
  table_version: z4.string().min(1)
});
var AnnotationAttachmentSchema = z4.discriminatedUnion("kind", [
  z4.object({
    kind: z4.literal("link"),
    url: z4.string(),
    label: z4.string().optional()
  }),
  z4.object({
    kind: z4.literal("video"),
    url: z4.string(),
    start_seconds: z4.number().int().min(0).optional()
  }),
  z4.object({
    kind: z4.literal("audio"),
    url: z4.string(),
    title: z4.string().optional()
  }),
  z4.object({
    kind: z4.literal("image"),
    url: z4.string(),
    alt_text: z4.string()
  }),
  z4.object({
    kind: z4.literal("block"),
    block_id: z4.string().min(1)
  })
]);
var AnthologyTagSchema = z4.object({
  include: z4.boolean(),
  themes: z4.array(z4.string().trim().max(40)).max(8).default([]),
  concepts: z4.array(z4.string().trim().max(40)).max(8).default([])
});
var AnnotationThreadKindSchema = z4.enum([
  "motif",
  "opposition",
  "volta",
  "echo",
  "argument"
]);
var AnnotationThreadSchema = z4.object({
  /** What links the places, in a few words; shown on the thread button. */
  title: z4.string().trim().max(80).optional(),
  kind: AnnotationThreadKindSchema.optional(),
  order: z4.enum(["text", "custom"]).default("text"),
  anchor_order: z4.array(z4.string().min(1)).optional()
});
var AnnotationVoiceWordSchema = z4.object({
  w: z4.string(),
  start: z4.number(),
  end: z4.number()
});
var AnnotationVoiceClipSchema = z4.object({
  id: z4.string().min(1),
  start_s: z4.number(),
  end_s: z4.number(),
  word_range: z4.tuple([z4.number().int().min(0), z4.number().int().min(0)]),
  anchor: AnnotationAnchorSchema.optional(),
  source: z4.enum(["tap", "quote", "ai", "manual"]),
  confidence: z4.number().min(0).max(1),
  approved: z4.boolean(),
  transcript_text: z4.string()
});
var AnnotationVoiceTrackSchema = z4.object({
  id: z4.string().min(1),
  layer_id: z4.string().min(1),
  kind: z4.enum(["reading", "think_aloud", "feedback"]),
  title: z4.string().min(1),
  audio: z4.object({
    media_id: z4.string().optional(),
    url: z4.string().min(1),
    duration_s: z4.number().min(0),
    mime: z4.string().min(1)
  }),
  transcript: z4.object({
    words: z4.array(AnnotationVoiceWordSchema),
    timing: z4.enum(["word", "segment", "estimated"])
  }),
  taps: z4.array(
    z4.object({
      t: z4.number(),
      anchor: AnnotationAnchorSchema
    })
  ).optional(),
  clips: z4.array(AnnotationVoiceClipSchema).default([]),
  status: z4.enum(["draft", "published"]),
  extras: z4.array(
    z4.object({
      id: z4.string().min(1),
      kind: z4.enum(["where_to_next", "technique_tag", "class_note"]),
      html: z4.string(),
      approved: z4.boolean()
    })
  ).optional()
});
var AnnotationItemSchema = z4.object({
  id: z4.string().min(1),
  layer_id: z4.string().min(1),
  sublayer_id: z4.string().optional(),
  anchor: AnnotationAnchorSchema,
  /** Extra stops; present and non-empty => this annotation is a thread. Max 24. */
  also_anchors: z4.array(AnnotationAnchorSchema).max(24).optional(),
  thread: AnnotationThreadSchema.optional(),
  anthology: AnthologyTagSchema.optional(),
  technique: AnnotationTechniqueRefSchema.optional(),
  body: z4.object({
    html: z4.string(),
    attachments: z4.array(AnnotationAttachmentSchema).default([])
  }),
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema
}).superRefine((ann, ctx) => {
  const extras = ann.also_anchors ?? [];
  if (extras.length === 0) return;
  const primaryId = ann.anchor.id;
  if (!primaryId) {
    ctx.addIssue({
      code: z4.ZodIssueCode.custom,
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
      code: z4.ZodIssueCode.custom,
      message: "Every thread stop needs an id",
      path: ["also_anchors"]
    });
  }
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z4.ZodIssueCode.custom,
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
      code: z4.ZodIssueCode.custom,
      message: "anchor_order must be a permutation of thread stop ids",
      path: ["thread", "anchor_order"]
    });
  }
});
var AnnotationBlockSettingsSchema = z4.object({
  show_markers: z4.boolean().default(true),
  default_layer_id: z4.string().optional(),
  /** Lines of context kept around each stop in thread focus. */
  thread_context: z4.union([z4.literal(0), z4.literal(1)]).optional(),
  /** How notes are drawn on the text. Absent = fineliner. */
  ink_style: z4.enum(["fineliner", "highlighter"]).optional()
});
var AnnotationBlockObjectSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("annotation"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string().optional(),
    attribution: z4.string().optional(),
    text: AnnotationTextSchema,
    layers: z4.array(AnnotationLayerSchema).default([]),
    annotations: z4.array(AnnotationItemSchema).default([]),
    voice_tracks: z4.array(AnnotationVoiceTrackSchema).optional(),
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
        code: z4.ZodIssueCode.custom,
        message: "voice_track.layer_id must point at a voice layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
    if (teacherLayerIds.has(track.layer_id)) {
      ctx.addIssue({
        code: z4.ZodIssueCode.custom,
        message: "voice_track cannot sit on a teacher layer",
        path: ["content", "voice_tracks", index, "layer_id"]
      });
    }
  }
}
var AnnotationBlockSchema = AnnotationBlockObjectSchema.superRefine(refineAnnotationVoiceTracks);
function toolkitBlockSchema(blockType, content) {
  return z4.object({
    id: z4.string().min(1),
    type: z4.literal("block"),
    block_type: z4.literal(blockType),
    variant: z4.string().default("medium"),
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
var TeacherNoteBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("teacher_note"),
  variant: z4.string().default("medium"),
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
  PeerFeedbackBlockSchema,
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
var SpacerBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("spacer"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var ColumnChildBlockSchema = z4.lazy(
  () => z4.discriminatedUnion("block_type", [...leafBlockSchemas, SpacerBlockSchema])
);
var columnsArraySchema = z4.array(
  z4.object({
    width: z4.number().int().min(1).max(12),
    blocks: z4.array(ColumnChildBlockSchema)
  })
).superRefine((columns, ctx) => {
  const sum = columns.reduce((acc, col) => acc + col.width, 0);
  if (sum !== 12) {
    ctx.addIssue({
      code: z4.ZodIssueCode.custom,
      message: "Column widths must sum to 12",
      path: []
    });
  }
});
var ColumnsBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("columns"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    preset: ColumnPresetSchema,
    columns: columnsArraySchema
  }),
  ...blockLayout,
  ...blockTimestamps
});
var TabChildBlockSchema = z4.lazy(
  () => z4.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var TabsBlockSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("tabs"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    tabs: z4.array(
      z4.object({
        id: z4.string().min(1),
        label: z4.string(),
        blocks: z4.array(TabChildBlockSchema)
      })
    ).min(2).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});
var SectionChildBlockSchema = z4.lazy(
  () => z4.discriminatedUnion("block_type", [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);
var SectionLinkSchema = z4.object({
  mode: z4.literal("linked"),
  source_composition_id: z4.string().min(1)
});
var SectionBlockObjectSchema = z4.object({
  id: z4.string().min(1),
  type: z4.literal("block"),
  block_type: z4.literal("section"),
  variant: z4.string().default("medium"),
  visibility: VisibilitySchema,
  content: z4.object({
    title: z4.string(),
    collapsed_in_editor: z4.boolean().optional(),
    blocks: z4.array(SectionChildBlockSchema),
    link: SectionLinkSchema.optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
function refineLinkedSection(section, ctx) {
  if (section.content.link && section.content.blocks.length > 0) {
    ctx.addIssue({
      code: z4.ZodIssueCode.custom,
      message: "Linked sections must have empty content.blocks",
      path: ["content", "blocks"]
    });
  }
}
var SectionBlockSchema = SectionBlockObjectSchema.superRefine(refineLinkedSection);
var BlockSchema = z4.lazy(
  () => z4.discriminatedUnion("block_type", [
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
  PeerFeedbackBlockSchema,
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
