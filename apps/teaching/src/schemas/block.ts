import { z } from 'zod';
import { SKILL_STRANDS } from '../skills/schema';
import { IsoDateSchema } from './common';
import { KaplanQualifiersSchema } from './kaplan';
import { DiscernQualifierSchema } from './discern';
import { LensAttachmentsSchema, LensLevelSchema, LogicSchema } from './lens';
import { QuizQuestionDraftSchema, QuizQuestionKindSchema } from '../quiz/core';
import {
  AnalogyMoveContentSchema,
  AnalogyTypesContentSchema,
  ConceptFeaturesContentSchema,
  FluidAnalogyContentSchema,
  QuestionQuadrantContentSchema,
  TeacherNoteBlockContentSchema,
  ThinkingIntentionsContentSchema,
  ThinkingMoveContentSchema,
  ThinkingReflectionContentSchema,
  ToolkitSkillContentSchema,
  ToolkitToolContentSchema,
  ToolkitValueContentSchema
} from './toolkit';

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
  'classroom_tools',
  'countdown',
  'definition',
  'code',
  'audio',
  'attachment',
  'accordion',
  'table',
  'peer_feedback',
  'question_drop',
  'brainstorm',
  'hinge_question',
  'continuum_line',
  'curriculum_lines',
  'quiz_question',
  'question_set',
  'discern_confirm',
  'flashcards',
  'cloze',
  'self_check',
  'note_cue',
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
  'annotation',
  'toolkit_skill',
  'toolkit_tool',
  'toolkit_value',
  'thinking_move',
  'question_quadrant',
  'concept_features',
  'thinking_intentions',
  'thinking_reflection',
  'fluid_analogy',
  'analogy_types',
  'analogy_close_reading',
  'analogy_pattern',
  'analogy_reverse',
  'analogy_problem',
  'analogy_metaphor',
  'analogy_transfer',
  'analogy_chains',
  'teacher_note'
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
  'cultural_warning',
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
  qualifiers: KaplanQualifiersSchema.optional(),
  discern: DiscernQualifierSchema.optional(),
  lenses: LensAttachmentsSchema.optional(),
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

/** A scene's voiceover in a lecture: one short clip the teacher records. */
export const NarrationSchema = z.object({
  url: z.string().min(1),
  duration_s: z.number().min(0).max(900),
  transcript: z.string().max(8000).optional()
});
export type Narration = z.infer<typeof NarrationSchema>;

/** Lecture: a heading starts a scene. `one` reveals its blocks one tap at a time. */
export const RevealSchema = z.enum(['all', 'one']);

export const HeadingBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('heading'),
  variant: HeadingVariantSchema,
  visibility: VisibilitySchema,
  content: z.object({
    text: z.string(),
    narration: NarrationSchema.optional(),
    reveal: RevealSchema.optional()
  }),
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
    body: z.string(),
    related_to: z.object({
      block_id: z.string().min(1),
      question_id: z.string().min(1).optional()
    }).optional()
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

/** One timer in a classroom tools stack, e.g. "Reading time", 5 minutes. */
export const TimerSegmentSchema = z.object({
  label: z.string().max(60),
  minutes: z.number().min(0.25).max(180)
});
export type TimerSegment = z.infer<typeof TimerSegmentSchema>;

export const ClassroomToolIdSchema = z.enum([
  'timer',
  'stopwatch',
  'names',
  'number',
  'groups',
  'technique',
  'scores',
  'coin',
  'dice'
]);
export type ClassroomToolId = z.infer<typeof ClassroomToolIdSchema>;

export const DividerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('divider'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z
    .object({
      /** The faint gear at the end of the rule that slides out the classroom tools. */
      tools: z.boolean().default(true),
      /** Timers saved with the lesson, ready when it opens. */
      timer_stack: z.array(TimerSegmentSchema).max(8).default([])
    })
    .default({}),
  ...blockLayout,
  ...blockTimestamps
});

/** The classroom toolbox as its own block, taking a block's slot on the page. */
export const ClassroomToolsBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('classroom_tools'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z
    .object({
      timer_stack: z.array(TimerSegmentSchema).max(8).default([]),
      /** Tool to show open when the page loads. Falls back if the viewer cannot use it. */
      start_tool: ClassroomToolIdSchema.optional()
    })
    .default({}),
  ...blockLayout,
  ...blockTimestamps
});

/** Header for an assessment page: the task, its due date and how many days are left. */
export const CountdownBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('countdown'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().max(200).default(''),
    /** YYYY-MM-DD, or empty until the teacher sets it. */
    due_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
    /** HH:MM, 24-hour, or empty for no time. */
    due_time: z.string().regex(/^(\d{2}:\d{2})?$/).default(''),
    /** When the task was set, so the bar can show days gone. Optional. */
    set_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
    note: z.string().max(400).default('')
  }),
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
  /**
   * The Voice block. `listen` plays a clip (the original audio block); `respond`
   * and `viva` have students record a spoken answer and submit their best take.
   * Viva adds dot points the timer walks through. `url` is only used by listen.
   */
  content: z.object({
    url: z.string(),
    title: z.string().optional(),
    mode: z.enum(['listen', 'respond', 'viva']).default('listen'),
    prompt: z.string().max(4000).optional(),
    time_limit_s: z.number().int().min(30).max(300).optional(),
    student_chooses_time: z.boolean().optional(),
    scaffold: z
      .array(z.object({ label: z.string().max(80), weight: z.number().min(0.5).max(3).default(1) }))
      .max(8)
      .optional(),
    code_groups: z.array(z.enum(['composition', 'viva', 'speaking'])).optional()
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
  response_space: ResponseSpaceSchema.optional(),
  /** The 4 levels format's band; absent means guessed from the question's opening words. */
  level: z.enum(['beginner', 'detective', 'judge', 'inventor']).optional(),
  /** Reasoning chart format: which logic this question walks. Absent means Student's choice. */
  logic: LogicSchema.optional()
});

export const PeerFeedbackBlockSchema = z.object({
  id: z.string().min(1), type: z.literal('block'),
  block_type: z.literal('peer_feedback'), variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    prompt: z.string().max(4000),
    /** comments: two feedback boxes, one reader. annotate: notes on the text, two readers. */
    mode: z.enum(['comments', 'annotate']).default('comments'),
    strength_prompt: z.string().max(300).default('One thing that works well…'),
    suggestion_prompt: z.string().max(300).default('One suggestion or question…')
  }), ...blockLayout, ...blockTimestamps
});

/**
 * Continuum line: students place their symbol on a line for each statement
 * about one stimulus and give a reason. Snapped statements land on the ends
 * or the named stops; the rules live on the server.
 */
export const ContinuumStatementSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(300).default(''),
  snap: z.boolean().default(false)
});
export const ContinuumLineBlockSchema = z.object({
  id: z.string().min(1), type: z.literal('block'),
  block_type: z.literal('continuum_line'), variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    stimulus: z.object({
      kind: z.enum(['text', 'image', 'video']).default('text'),
      text: z.string().max(2000).default(''),
      url: z.string().max(2000).default(''),
      alt_text: z.string().max(500).default('')
    }).default({ kind: 'text', text: '', url: '', alt_text: '' }),
    scale: z.object({
      left: z.string().max(40).default('Implied'),
      right: z.string().max(40).default('Not implied'),
      stops: z.array(z.string().max(40)).max(3).default([])
    }).default({ left: 'Implied', right: 'Not implied', stops: [] }),
    statements: z.array(ContinuumStatementSchema).max(10).default([]),
    pace: z.enum(['teacher', 'student']).default('teacher'),
    replace: z.boolean().default(true)
  }), ...blockLayout, ...blockTimestamps
});

/**
 * Brainstorm: students send short answers to one question; the teacher's board
 * shows them as orbiting symbols, then reveals them as a grid, cloud or groups.
 * `per_student` 0 means unlimited (the server still caps it).
 */
export const BrainstormBlockSchema = z.object({
  id: z.string().min(1), type: z.literal('block'),
  block_type: z.literal('brainstorm'), variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    question: z.string().max(500).default(''),
    safety: z.enum(['instant', 'approve', 'reveal']).default('approve'),
    per_student: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)]).default(3),
    max_length: z.number().int().min(20).max(280).default(140),
    layout: z.enum(['grid', 'cloud', 'groups']).default('grid')
  }), ...blockLayout, ...blockTimestamps
});

/**
 * Hinge question: one quick multiple-choice check at the turning point of a
 * lesson. Each wrong option names the misconception it reveals. The right
 * answer, the misconception notes and the move-on / reteach thresholds are
 * teacher-only: publish strips them, and the server reads them from the draft.
 */
export const HingeOptionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().max(300).default(''),
  misconception: z.string().max(300).default('')
});

export const HingeBackupSchema = z.object({
  prompt: z.string().max(500).default(''),
  options: z.array(HingeOptionSchema).max(5).default([]),
  correct_id: z.string().max(40).default(''),
  source: z.enum(['teacher', 'ann']).default('teacher')
});

export const HingeQuestionBlockSchema = z.object({
  id: z.string().min(1), type: z.literal('block'),
  block_type: z.literal('hinge_question'), variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    prompt: z.string().max(500).default(''),
    options: z.array(HingeOptionSchema).max(5).default([]),
    correct_id: z.string().max(40).default(''),
    seconds: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]).default(60),
    move_on: z.number().int().min(1).max(100).default(80),
    reteach: z.number().int().min(0).max(99).default(50),
    /** A parallel question for the re-check after re-teaching. Teacher-written, or drafted by Ann in focus view. */
    backup: HingeBackupSchema.optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z.boolean().optional()
  }), ...blockLayout, ...blockTimestamps
});

/**
 * Curriculum lines: a unit's curriculum map drawn as a transit map. Each strand
 * of learning is a line, each station is one week's work on that strand at a
 * depth (introduced, reinforced, mastered), and every line runs into the
 * assessment terminus. A station is a lesson link or a text label; stations on
 * several strands that link the same lesson in the same week join into an
 * interchange. Checkpoints are interchanges made by hand.
 */
export const CurriculumLinesColourSchema = z.enum([
  'wave', 'wave_deep', 'green', 'green_deep', 'amber', 'amber_deep', 'lilac', 'lilac_deep', 'navy', 'navy_deep'
]);
export const CurriculumLinesLevelSchema = z.enum(['introduced', 'reinforced', 'mastered']);
export const CurriculumLinesStrandSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(60).default(''),
  colour: CurriculumLinesColourSchema.default('wave')
});
export const CurriculumLinesStationSchema = z.object({
  id: z.string().min(1).max(64),
  strand_id: z.string().min(1).max(64),
  week: z.number().int().min(1).max(20),
  level: CurriculumLinesLevelSchema.default('reinforced'),
  label: z.string().max(120).default(''),
  lesson_id: z.string().min(1).max(64).optional()
});
export const CurriculumLinesCheckpointSchema = z.object({
  id: z.string().min(1).max(64),
  week: z.number().int().min(1).max(20),
  label: z.string().max(80).default(''),
  lesson_id: z.string().min(1).max(64).optional(),
  strand_ids: z.array(z.string().min(1).max(64)).min(1).max(8)
});
export const CurriculumLinesTerminusSchema = z.object({
  label: z.string().max(80).default('Assessment task'),
  detail: z.string().max(160).optional(),
  when: z.string().max(24).optional(),
  lesson_id: z.string().min(1).max(64).optional()
});
/** Version 1: free-text strands, one station per strand per week. Converted on read. */
export const CurriculumLinesV1ContentSchema = z.object({
  title: z.string().max(120).optional(),
  weeks: z.number().int().min(1).max(20).default(8),
  strands: z.array(CurriculumLinesStrandSchema).min(1).max(8),
  stations: z.array(CurriculumLinesStationSchema).max(160).default([]),
  checkpoints: z.array(CurriculumLinesCheckpointSchema).max(20).default([]),
  terminus: CurriculumLinesTerminusSchema.default({ label: 'Assessment task' })
});

/**
 * Network lines live on the subject; which lines a lesson serves lives on the
 * lesson. The block keeps only what belongs to this unit's map: light-rail
 * stops, gates, drag nudges and the terminus.
 */
export const NetworkLineModeSchema = z.enum(['train', 'metro', 'light_rail']);
/**
 * What a line stands for in the syllabus alignment: a train carries the
 * Understanding or Responding dot points, a metro a textual concept, light
 * rail a strand of the HSC skills continuum. The unit map's coverage panel reads it.
 */
export const LineAlignmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('points'), group: z.enum(['U', 'R']) }),
  z.object({ kind: z.literal('concept'), key: z.string().regex(/^[A-Z]{2,5}$/) }),
  z.object({ kind: z.literal('strand'), strand: z.enum(SKILL_STRANDS) })
]);
export type LineAlignment = z.infer<typeof LineAlignmentSchema>;
/** A syllabus dot point a lesson teaches: focus area id and point id, e.g. "human:U2". */
export const DotPointRefSchema = z.string().regex(/^[a-z0-9-]{2,40}:[UR]\d{1,2}$/);
export const NetworkLineSchema = z.object({
  id: z.string().min(1).max(64),
  mode: NetworkLineModeSchema,
  name: z.string().max(60).default(''),
  short: z.string().max(4).optional(),
  colour: CurriculumLinesColourSchema.default('wave'),
  alignment: LineAlignmentSchema.optional()
});
/** What kind of session a lesson is, for the student's next-step choices. */
export const LessonKindSchema = z.enum(['lesson', 'workshop', 'lecture']);
/** The lessons that can come after this one; more than one is a choice, and the map splits. */
export const AfterLessonIdsSchema = z.array(z.string().min(1).max(64)).max(6);
export type LessonKind = z.infer<typeof LessonKindSchema>;
export const LineStopSchema = z.object({
  line_id: z.string().min(1).max(64),
  level: CurriculumLinesLevelSchema.optional(),
  /** Set from the lesson's dot points; it follows them until the teacher takes it off. */
  auto: z.literal(true).optional()
});
/** Lines a teacher took off a lesson that its dot points would put it on. */
export const LineOffSchema = z.array(z.string().min(1).max(64)).max(24);
export const NetworkNudgesSchema = z.record(
  z.string().min(1).max(160),
  z.object({ dx: z.number().min(-2000).max(2000), dy: z.number().min(-2000).max(2000) })
).refine((value) => Object.keys(value).length <= 120, { message: 'At most 120 nudges' });
export const CurriculumRailStopSchema = z.object({
  id: z.string().min(1).max(64),
  line_id: z.string().min(1).max(64),
  after_lesson_id: z.string().min(1).max(64).optional(),
  kind: z.enum(['stop', 'extension', 'support']).default('stop'),
  lesson_id: z.string().min(1).max(64).optional(),
  block_id: z.string().min(1).max(120).optional(),
  label: z.string().max(120).default(''),
  /** Who may take the straight track past a support stop, e.g. "90%+ on the techniques quiz". */
  skip_rule: z.string().max(80).optional()
});
export const CurriculumGateSchema = z.object({
  id: z.string().min(1).max(64),
  after_lesson_id: z.string().min(1).max(64).optional(),
  label: z.string().max(80).default(''),
  lesson_id: z.string().min(1).max(64).optional(),
  line_ids: z.array(z.string().min(1).max(64)).max(24).default([])
});
export const CurriculumLinesV2ContentSchema = z.object({
  version: z.literal(2),
  title: z.string().max(120).optional(),
  rail_stops: z.array(CurriculumRailStopSchema).max(60).default([]),
  gates: z.array(CurriculumGateSchema).max(12).default([]),
  nudges: NetworkNudgesSchema.default({}),
  /** Map-only station order; lessons not listed follow in unit order. */
  station_order: z.array(z.string().min(1).max(64)).max(200).optional(),
  /** Lessons left off this map (they stay in the unit). */
  hidden_lessons: z.array(z.string().min(1).max(64)).max(200).optional(),
  /** The syllabus focus area this unit covers; unset is worked out from the unit's title. */
  focus_area: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  terminus: CurriculumLinesTerminusSchema.default({ label: 'Assessment task' })
});
export const CurriculumLinesBlockSchema = z.object({
  id: z.string().min(1), type: z.literal('block'),
  block_type: z.literal('curriculum_lines'), variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.union([CurriculumLinesV2ContentSchema, CurriculumLinesV1ContentSchema]),
  ...blockLayout, ...blockTimestamps
});
export type CurriculumLinesBlock = z.infer<typeof CurriculumLinesBlockSchema>;
export type CurriculumLinesV1Content = z.infer<typeof CurriculumLinesV1ContentSchema>;
export type CurriculumLinesV2Content = z.infer<typeof CurriculumLinesV2ContentSchema>;
export type NetworkLine = z.infer<typeof NetworkLineSchema>;
export type NetworkLineMode = z.infer<typeof NetworkLineModeSchema>;
export type LineStop = z.infer<typeof LineStopSchema>;
export type NetworkNudges = z.infer<typeof NetworkNudgesSchema>;
export type CurriculumRailStop = z.infer<typeof CurriculumRailStopSchema>;
export type CurriculumGate = z.infer<typeof CurriculumGateSchema>;

export function isCurriculumLinesV2(content: CurriculumLinesBlock['content']): content is CurriculumLinesV2Content {
  return (content as { version?: number }).version === 2;
}

/**
 * Question drop: students write a question that feeds a quiz lesson in the
 * same unit. The teacher picks the quiz and approves each question there.
 */
export const QuestionDropBlockSchema = z.object({
  id: z.string().min(1), type: z.literal('block'),
  block_type: z.literal('question_drop'), variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    target_quiz_id: z.string().max(64).default(''),
    prompt: z.string().max(500).default(''),
    kinds: z.array(QuizQuestionKindSchema).max(20).default([]),
    marks_min: z.number().int().min(1).max(20).default(1),
    marks_max: z.number().int().min(1).max(20).default(3),
    per_student: z.number().int().min(1).max(5).default(1),
    accepting: z.boolean().default(true)
  }), ...blockLayout, ...blockTimestamps
});

/**
 * Discern Confirm: the closing step of a Discern qualifier. Created after the
 * block it belongs to and linked back by id; the teacher can drag it anywhere
 * later in the lesson.
 */
export const DiscernConfirmBlockSchema = z.object({
  id: z.string().min(1), type: z.literal('block'),
  block_type: z.literal('discern_confirm'), variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    target_block_id: z.string().max(120).default('')
  }), ...blockLayout, ...blockTimestamps
});

/** One question in a quiz lesson. Answers are split off on publish and never reach students. */
export const QuizQuestionBlockSchema = z.object({
  id: z.string().min(1), type: z.literal('block'),
  block_type: z.literal('quiz_question'), variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    question: QuizQuestionDraftSchema,
    /** Teacher-only: the question came from a student's Question drop. */
    from_submission: z.string().max(200).optional()
  }), ...blockLayout, ...blockTimestamps
});

export const QuestionSetBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('question_set'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    questions: z.array(QuestionItemSchema),
    /** Shape of the set; absent means standard. See src/blocks/formats/registry.ts. */
    format: z.enum(['standard', 'human_experience_table', 'anchor_bridge', 'question_levels', 'because_but_so', 'reasoning_chart']).optional(),
    /** Human experience table settings, kept when switching format away and back. */
    table: z.object({
      rows: z.number().int().min(3).max(5).default(3),
      example: z.boolean().default(true)
    }).optional(),
    /** Reasoning chart settings, kept when switching format away and back. */
    reasoning: z.object({
      level: LensLevelSchema.default('core'),
      student_level: z.boolean().default(true)
    }).optional()
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
    case_sensitive: z.boolean().optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z.boolean().optional()
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
    items: z.array(SelfCheckItemSchema).max(12).optional(),
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const NOTE_CUE_KINDS = ['copy', 'own_words', 'draw', 'question'] as const;
export const NoteCueKindSchema = z.enum(NOTE_CUE_KINDS);

/** A prompt to write in their book. In a lecture it pauses until they tick Done. */
export const NoteCueBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('note_cue'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    kind: NoteCueKindSchema,
    prompt: z.string().max(500)
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

/**
 * A feedback code on an annotation note (AR, TS+ …). The code's words are
 * copied in when tagged, so students can read them without the teacher's
 * code library, and a later edit to the library doesn't rewrite old notes.
 */
export const AnnotationCodeRefSchema = z.object({
  id: z.string().min(1).max(40),
  code: z.string().regex(/^[A-Z]{1,3}$/),
  label: z.string().max(60),
  descriptor: z.string().max(600).default(''),
  colour: z.enum(['blue', 'sage', 'peach', 'gold', 'lilac']).default('blue'),
  positive: z.boolean().default(false)
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
  /** What links the places, in a few words; shown on the thread button. */
  title: z.string().trim().max(80).optional(),
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
    code: AnnotationCodeRefSchema.optional(),
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
export type AnnotationCodeRef = z.infer<typeof AnnotationCodeRefSchema>;
export type AnthologyTag = z.infer<typeof AnthologyTagSchema>;

function toolkitBlockSchema<T extends string, C extends z.ZodTypeAny>(blockType: T, content: C) {
  return z.object({
    id: z.string().min(1),
    type: z.literal('block'),
    block_type: z.literal(blockType),
    variant: z.string().default('medium'),
    visibility: VisibilitySchema,
    content,
    ...blockLayout,
    ...blockTimestamps
  });
}

export const ToolkitSkillBlockSchema = toolkitBlockSchema('toolkit_skill', ToolkitSkillContentSchema);
export const ToolkitToolBlockSchema = toolkitBlockSchema('toolkit_tool', ToolkitToolContentSchema);
export const ToolkitValueBlockSchema = toolkitBlockSchema('toolkit_value', ToolkitValueContentSchema);
export const ThinkingMoveBlockSchema = toolkitBlockSchema('thinking_move', ThinkingMoveContentSchema);
export const QuestionQuadrantBlockSchema = toolkitBlockSchema(
  'question_quadrant',
  QuestionQuadrantContentSchema
);
export const ConceptFeaturesBlockSchema = toolkitBlockSchema(
  'concept_features',
  ConceptFeaturesContentSchema
);
export const ThinkingIntentionsBlockSchema = toolkitBlockSchema(
  'thinking_intentions',
  ThinkingIntentionsContentSchema
);
export const ThinkingReflectionBlockSchema = toolkitBlockSchema(
  'thinking_reflection',
  ThinkingReflectionContentSchema
);

export const FluidAnalogyBlockSchema = toolkitBlockSchema('fluid_analogy', FluidAnalogyContentSchema);
export const AnalogyTypesBlockSchema = toolkitBlockSchema('analogy_types', AnalogyTypesContentSchema);
export const AnalogyCloseReadingBlockSchema = toolkitBlockSchema('analogy_close_reading', AnalogyMoveContentSchema);
export const AnalogyPatternBlockSchema = toolkitBlockSchema('analogy_pattern', AnalogyMoveContentSchema);
export const AnalogyReverseBlockSchema = toolkitBlockSchema('analogy_reverse', AnalogyMoveContentSchema);
export const AnalogyProblemBlockSchema = toolkitBlockSchema('analogy_problem', AnalogyMoveContentSchema);
export const AnalogyMetaphorBlockSchema = toolkitBlockSchema('analogy_metaphor', AnalogyMoveContentSchema);
export const AnalogyTransferBlockSchema = toolkitBlockSchema('analogy_transfer', AnalogyMoveContentSchema);
export const AnalogyChainsBlockSchema = toolkitBlockSchema('analogy_chains', AnalogyMoveContentSchema);

/** Always teacher-only: any stored visibility is read back as `teacher_only`. */
export const TeacherNoteBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('teacher_note'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema.transform(() => 'teacher_only' as const),
  content: TeacherNoteBlockContentSchema,
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
  ClassroomToolsBlockSchema,
  CountdownBlockSchema,
  DefinitionBlockSchema,
  CodeBlockSchema,
  AudioBlockSchema,
  AttachmentBlockSchema,
  AccordionBlockSchema,
  TableBlockSchema,
  PeerFeedbackBlockSchema,
  QuestionDropBlockSchema,
  BrainstormBlockSchema,
  HingeQuestionBlockSchema,
  ContinuumLineBlockSchema,
  CurriculumLinesBlockSchema,
  QuizQuestionBlockSchema,
  DiscernConfirmBlockSchema,
  QuestionSetBlockSchema,
  FlashcardsBlockSchema,
  ClozeBlockSchema,
  SelfCheckBlockSchema,
  NoteCueBlockSchema,
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
  AnalogyCloseReadingBlockSchema,
  AnalogyPatternBlockSchema,
  AnalogyReverseBlockSchema,
  AnalogyProblemBlockSchema,
  AnalogyMetaphorBlockSchema,
  AnalogyTransferBlockSchema,
  AnalogyChainsBlockSchema,
  TeacherNoteBlockSchema
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

const SectionInnerChildBlockSchema = z.lazy(() =>
  z.discriminatedUnion('block_type', [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    TabsBlockSchema,
    TimelineBlockSchema,
    CardStackBlockSchema
  ])
);

/** Lecture: a gate's second look. One level only: it holds ordinary blocks, never another section. */
export const SidePathSectionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('section'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string(),
    collapsed_in_editor: z.boolean().optional(),
    blocks: z.array(SectionInnerChildBlockSchema),
    side_path: z.literal(true),
    narration: NarrationSchema.optional()
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
    CardStackBlockSchema,
    SidePathSectionSchema
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
    link: SectionLinkSchema.optional(),
    /** Lecture: the chapter intro clip. */
    narration: NarrationSchema.optional(),
    /** Lecture: a "write it in your book" cue at the chapter's end. On unless `enabled: false`. */
    takeaway: z.object({ enabled: z.boolean(), prompt: z.string().max(300).optional() }).optional(),
    /** Lecture: plays only after a wrong answer on the gate just above it. */
    side_path: z.boolean().optional()
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
