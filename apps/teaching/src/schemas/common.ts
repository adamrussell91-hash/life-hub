import { z } from 'zod';

export const StatusSchema = z.enum(['active', 'archived', 'trashed']);
export const IsoDateSchema = z.string().datetime();

export const CommonFields = {
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: StatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
};

/** Optional trash metadata — merge onto entities that support soft-delete, not into CommonFields. */
export const TrashFieldsSchema = z.object({
  trashed_at: IsoDateSchema.optional(),
  previous_status: z.enum(['active', 'archived']).optional(),
  trash_reason: z.string().min(1).optional()
});

export const TrashFields = {
  trashed_at: IsoDateSchema.optional(),
  previous_status: z.enum(['active', 'archived']).optional(),
  trash_reason: z.string().min(1).optional()
};
