import { z } from 'zod';

/** Peel optional/default/prefault wrappers so a patch field never fills itself in. */
function withoutDefault(field: z.ZodType): z.ZodType {
  let inner: z.ZodType = field;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodDefault || inner instanceof z.ZodPrefault) {
    inner = inner.unwrap() as z.ZodType;
  }
  return inner;
}

/**
 * A patch of `schema`: every key optional, and a key that is not sent stays absent.
 * zod 4's `.partial()` keeps field defaults, so a patch of one key would reset every
 * defaulted key beside it. This keeps zod 3's `.partial()` behaviour.
 */
export function patchOf<Shape extends z.ZodRawShape, Config extends z.core.$ZodObjectConfig>(
  schema: z.ZodObject<Shape, Config>
): z.ZodObject<{ -readonly [K in keyof Shape]: z.ZodOptional<Shape[K]> }, Config> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) shape[key] = withoutDefault(field as z.ZodType).optional();
  return schema.extend(shape) as unknown as z.ZodObject<{ -readonly [K in keyof Shape]: z.ZodOptional<Shape[K]> }, Config>;
}
