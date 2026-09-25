import { z } from 'zod';

const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A span Adam has decided cannot move. `ends_on` is inclusive and must not precede `starts_on`. */
export const LifeWallValueSchema = z
  .object({
    starts_on: DateKeySchema,
    ends_on: DateKeySchema,
    label: z.string().nullable()
  })
  .superRefine((wall, ctx) => {
    if (wall.ends_on < wall.starts_on) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ends_on must be on or after starts_on',
        path: ['ends_on']
      });
    }
  });

export const LifeWallFieldSchema = LifeWallValueSchema.nullable().optional();

export type LifeWall = z.infer<typeof LifeWallValueSchema>;
