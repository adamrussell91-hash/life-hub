import { z } from "zod";

/** Writing stages, in order. Mirrors the Notion "Book Ideas" status column. */
export const STUDIO_STAGES = ["Just an Idea", "Researching", "Outlining", "Writing", "Completed"] as const;
export const StudioStageSchema = z.enum(STUDIO_STAGES);
export type StudioStage = z.infer<typeof StudioStageSchema>;

export const STUDIO_AREAS = ["series", "gifted", "science", "systems", "teachers", "history", "new"] as const;
export const StudioAreaSchema = z.enum(STUDIO_AREAS);
export type StudioArea = z.infer<typeof StudioAreaSchema>;

export const StudioChapterSchema = z.object({
  title: z.string().min(1),
  /** Note refs: a Knowledge page id, or `notion:<id>` for a cited note that never reached Knowledge. */
  notes: z.array(z.string()).default([]),
  /** Other book ideas this chapter cites. */
  cites: z.array(z.string()).optional(),
});
export type StudioChapter = z.infer<typeof StudioChapterSchema>;

export const StudioPartSchema = z.object({
  name: z.string(),
  chapters: z.array(StudioChapterSchema),
});
export type StudioPart = z.infer<typeof StudioPartSchema>;

export const StudioBookSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  title: z.string().min(1),
  short: z.string().min(1),
  subtitle: z.string().default(""),
  area: StudioAreaSchema,
  series: z.string().optional(),
  added: z.string(),
  kind: z.enum(["chapters", "interview", "history", "blank"]),
  stage: StudioStageSchema.default("Just an Idea"),
  blurb: z.string().default(""),
  audience: z.array(z.string()).optional(),
  subjects: z.array(z.string()).optional(),
  level: z.string().optional(),
  notion_url: z.string().optional(),
  cites_books: z.array(z.string()).optional(),
  /** Every note the book page cites, including ones not tied to a chapter. */
  notes: z.array(z.string()).default([]),
  parts: z.array(StudioPartSchema).optional(),
  interview: z
    .object({ questions: z.array(z.tuple([z.string(), z.string()])), cast: z.array(z.string()) })
    .optional(),
  history: z
    .object({
      web_sources: z.number().int().nonnegative(),
      lenses: z.array(z.string()),
      schools: z.array(z.tuple([z.string(), z.number().int().nonnegative()])),
      titles: z.array(z.string()),
    })
    .optional(),
});
export type StudioBook = z.infer<typeof StudioBookSchema>;

export const StudioNoteSchema = z.object({
  title: z.string(),
  words: z.number().int().nonnegative(),
  in_knowledge: z.boolean(),
  notion_id: z.string().optional(),
  /** Title is a topic label: the note was never imported, so its real title is not copied here. */
  topic_label: z.boolean().optional(),
});
export type StudioNote = z.infer<typeof StudioNoteSchema>;

export const StudioDecisionSchema = z.object({
  choice: z.string(),
  at: z.string(),
});
export type StudioDecision = z.infer<typeof StudioDecisionSchema>;

export const StudioDataSchema = z.object({
  schema_version: z.literal(1),
  source: z.string().optional(),
  imported_at: z.string().optional(),
  books: z.array(StudioBookSchema),
  notes: z.record(z.string(), StudioNoteSchema).default({}),
  decisions: z.record(z.string(), StudioDecisionSchema).default({}),
});
export type StudioData = z.infer<typeof StudioDataSchema>;

export function emptyStudio(): StudioData {
  return { schema_version: 1, books: [], notes: {}, decisions: {} };
}

export function parseStudioData(raw: unknown): StudioData {
  const parsed = StudioDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyStudio();
}
