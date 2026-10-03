import { z } from "zod";

export const ShelfStanceSchema = z.enum(["supports", "complicates", "extends"]);
export type ShelfStance = z.infer<typeof ShelfStanceSchema>;

export const ChapterSchema = z.object({
  title: z.string(),
  start: z.number().int().positive(),
  label: z.string().optional(),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const ShelfBookSchema = z.object({
  label: z.string(),
  author: z.string().optional(),
  edition: z.string().optional(),
  pages: z.number().int().positive().optional(),
  chapters: z.array(ChapterSchema).optional(),
  notebook: z.string().optional(),
  reading: z.object({ page: z.number().int().positive().nullable().optional(), updated_at: z.string().optional() }).optional(),
  /** Set when Claude estimated the facts; cleared once Adam pastes or types real ones. */
  estimated: z.object({ by: z.string(), confidence: z.enum(["high", "medium", "low"]), at: z.string() }).optional(),
  updated_at: z.string().optional(),
});
export type ShelfBook = z.infer<typeof ShelfBookSchema>;

export const PlacementSchema = z.object({
  pageId: z.string(),
  page: z.number().int().positive().optional(),
  guessed: z.boolean().optional(),
  stance: ShelfStanceSchema.optional(),
  gaps: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  lastOpened: z.string().optional(),
  updated_at: z.string().optional(),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const FactsJobSchema = z.object({
  status: z.enum(["none", "running", "done"]),
  total: z.number().optional(),
  finished: z.number().optional(),
  filled: z.number().optional(),
  unknown: z.array(z.string()).optional(),
  failed: z.array(z.string()).optional(),
  lowConfidence: z.array(z.string()).optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
});
export type FactsJob = z.infer<typeof FactsJobSchema>;

export type ShelfData = { books: ShelfBook[]; placements: Placement[]; factsJob?: FactsJob };

/** Drops malformed rows instead of failing the whole shelf. */
export function parseShelfData(raw: unknown): ShelfData {
  const value = (raw && typeof raw === "object" ? raw : {}) as { books?: unknown; placements?: unknown };
  const rows = <T>(list: unknown, schema: z.ZodType<T>) =>
    (Array.isArray(list) ? list : []).flatMap(item => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  const job = FactsJobSchema.safeParse((value as { factsJob?: unknown }).factsJob);
  return {
    books: rows(value.books, ShelfBookSchema),
    placements: rows(value.placements, PlacementSchema),
    ...(job.success ? { factsJob: job.data } : {}),
  };
}

export type BookFactsInput = {
  label: string;
  author?: string | null;
  edition?: string | null;
  pages?: number | null;
  chapters?: Chapter[] | null;
  notebook?: string | null;
  reading?: { page?: number | null } | true | null;
};

export type PlacementInput = {
  pageId: string;
  page?: number | null;
  guessed?: boolean | null;
  stance?: ShelfStance | null;
  gaps?: string[] | null;
  themes?: string[] | null;
  lastOpened?: string | null;
};
