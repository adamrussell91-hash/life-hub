import { z } from 'zod';

export const KaplanLensSchema = z.enum(['patterns', 'multiple_perspectives', 'ethics']);
const ThreePromptsSchema = z.tuple([
  z.string().max(1200), z.string().max(1200), z.string().max(1200)
]);

/** Optional process attached to an existing block, never a separate block type. */
export const KaplanQualifierSchema = z.object({
  lens: KaplanLensSchema,
  focus: z.string().trim().max(200).default(''),
  mode: z.enum(['notes', 'discussion']).default('notes'),
  prompts: ThreePromptsSchema.optional(),
  supports: z.tuple([
    z.string().max(1200).nullable(), z.string().max(1200).nullable(), z.string().max(1200).nullable()
  ]).optional()
});

export const KaplanQualifiersSchema = z.array(KaplanQualifierSchema).max(3).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.lens)).size !== items.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use each Kaplan lens once per block.' });
  }
});

export type KaplanLens = z.infer<typeof KaplanLensSchema>;
export type KaplanQualifier = z.infer<typeof KaplanQualifierSchema>;
