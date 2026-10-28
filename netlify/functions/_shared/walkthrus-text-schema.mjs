// The private WalkThrus text file, one per set: data/teaching/walkthrus/<set>.json in life-hub-data.
// The wording lives only there. Techniques are checked against the public catalogue by the reader.
import { z } from 'zod';

const Label = z.string().max(120);
const Body = z.string().max(2000);

export const WalkthruStepSchema = z.object({ n: z.number().int().min(1).max(5), label: Label, text: Body });
export const WalkthruTechniqueTextSchema = z.object({
  id: z.string().regex(/^w\d+-[a-z0-9-]{2,80}$/),
  steps: z.array(WalkthruStepSchema).min(1).max(5),
  footer: Body.optional()
});
export const WalkthruFrameworkTextSchema = z.object({
  id: z.string().regex(/^w\d+-fw-[a-z0-9-]{2,40}$/),
  summary: z.string().max(4000)
});
export const WalkthruSetTextSchema = z.object({
  set: z.number().int().min(1).max(20),
  techniques: z.array(WalkthruTechniqueTextSchema).max(120),
  frameworks: z.array(WalkthruFrameworkTextSchema).max(20).default([])
});
export const WalkthrusTextSchema = z.object({
  sets: z.array(WalkthruSetTextSchema).min(1).max(20),
  fetched_at: z.string().optional()
});
