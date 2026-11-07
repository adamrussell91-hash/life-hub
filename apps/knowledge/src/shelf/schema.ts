import { z } from "zod";

export const ShelfKindSchema = z.enum(["person", "idea", "case", "debate", "bridge"]);
export type ShelfKind = z.infer<typeof ShelfKindSchema>;
/** Fluid kinds need a quoted sentence; crystallised kinds do not. */
export const FLUID_KINDS = ["debate", "bridge"] as const satisfies readonly ShelfKind[];
/** When two kinds fit: first wins. `idea` is last — the lazy default. */
export const KIND_PRECEDENCE = ["debate", "bridge", "case", "person", "idea"] as const satisfies readonly ShelfKind[];
export const KindBySchema = z.enum(["adam", "clementine", "claude"]);
export type KindBy = z.infer<typeof KindBySchema>;

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
  completed_on: z.string().optional(),
  updated_at: z.string().optional(),
});
export type ShelfBook = z.infer<typeof ShelfBookSchema>;

export const PlacementSchema = z.object({
  pageId: z.string(),
  page: z.number().int().positive().optional(),
  guessed: z.boolean().optional(),
  kind: ShelfKindSchema.optional(),
  kindGuessed: z.boolean().optional(),
  kindBy: KindBySchema.optional(),
  kindReason: z.string().max(300).optional(),
  kindAt: z.string().optional(),
  gaps: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  lastOpened: z.string().optional(),
  updated_at: z.string().optional(),
});
export type Placement = z.infer<typeof PlacementSchema>;

/** A book Adam wants to read. Lives apart from the shelf until he starts it. */
export const WishSchema = z.object({
  label: z.string(),
  author: z.string().optional(),
  why: z.string().optional(),
  from: z.string().optional(),
  /** Where to read it free online, when it is (open access, public domain). */
  free: z.string().optional(),
  added_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type Wish = z.infer<typeof WishSchema>;

export type WishInput = {
  label: string;
  author?: string | null;
  why?: string | null;
  from?: string | null;
  free?: string | null;
  /** The old title, when an edit renames the wish. */
  was?: string;
};

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

export const KindsJobSchema = z.object({
  status: z.enum(["none", "running", "done"]),
  total: z.number().optional(),
  finished: z.number().optional(),
  applied: z.number().optional(),
  byKind: z.record(z.string(), z.number()).optional(),
  guessed: z.number().optional(),
  downgraded: z.number().optional(),
  unreadable: z.number().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
});
export type KindsJob = z.infer<typeof KindsJobSchema>;

export type ShelfData = { books: ShelfBook[]; placements: Placement[]; wishlist?: Wish[]; factsJob?: FactsJob; kindsJob?: KindsJob };

/** Drops malformed rows instead of failing the whole shelf. */
export function parseShelfData(raw: unknown): ShelfData {
  const value = (raw && typeof raw === "object" ? raw : {}) as { books?: unknown; placements?: unknown; wishlist?: unknown };
  const rows = <T>(list: unknown, schema: z.ZodType<T>) =>
    (Array.isArray(list) ? list : []).flatMap(item => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  const job = FactsJobSchema.safeParse((value as { factsJob?: unknown }).factsJob);
  const kindsJob = KindsJobSchema.safeParse((value as { kindsJob?: unknown }).kindsJob);
  return {
    books: rows(value.books, ShelfBookSchema),
    placements: rows(value.placements, PlacementSchema),
    wishlist: rows(value.wishlist, WishSchema),
    ...(job.success ? { factsJob: job.data } : {}),
    ...(kindsJob.success ? { kindsJob: kindsJob.data } : {}),
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
  completed_on?: string | null;
};

export type PlacementInput = {
  pageId: string;
  page?: number | null;
  guessed?: boolean | null;
  kind?: ShelfKind | null;
  kindGuessed?: boolean | null;
  kindBy?: KindBy | null;
  kindReason?: string | null;
  kindAt?: string | null;
  gaps?: string[] | null;
  themes?: string[] | null;
  lastOpened?: string | null;
};
