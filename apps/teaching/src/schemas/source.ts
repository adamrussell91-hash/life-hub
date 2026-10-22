import { z } from 'zod';
import { IsoDateSchema } from './common';

/** Where an imported record came from. Re-imports match on page_id. */
export const SourceSchema = z.object({
  system: z.literal('notion'),
  page_id: z.string().min(1).max(64),
  imported_at: IsoDateSchema,
  last_edited_at: IsoDateSchema
});

export type Source = z.infer<typeof SourceSchema>;
