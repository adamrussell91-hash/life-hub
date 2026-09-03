import { z } from 'zod';

export const PropertyOptionSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers, and underscores'),
  label: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
});

export type PropertyOption = z.infer<typeof PropertyOptionSchema>;

export const TaskPropertyConfigSchema = z.object({
  schema_version: z.literal(1),
  domains: z.array(PropertyOptionSchema).min(1),
  priorities: z.array(PropertyOptionSchema).min(1),
  statuses: z.array(PropertyOptionSchema).min(1),
  kinds: z.array(PropertyOptionSchema).min(1),
  buckets: z.array(PropertyOptionSchema).min(1),
  sources: z.array(PropertyOptionSchema).min(1),
  tags: z.array(PropertyOptionSchema)
});

export type TaskPropertyConfig = z.infer<typeof TaskPropertyConfigSchema>;

export type TaskPropertyListKey = keyof Pick<
  TaskPropertyConfig,
  'domains' | 'priorities' | 'statuses' | 'kinds' | 'buckets' | 'sources' | 'tags'
>;

export const TASK_PROPERTY_LIST_KEYS: TaskPropertyListKey[] = [
  'domains',
  'priorities',
  'statuses',
  'kinds',
  'buckets',
  'sources',
  'tags'
];

export function propertyIds(config: TaskPropertyConfig, key: TaskPropertyListKey): string[] {
  return config[key].map((entry) => entry.id);
}

export function propertyLabel(
  config: TaskPropertyConfig,
  key: TaskPropertyListKey,
  id: string
): string {
  return config[key].find((entry) => entry.id === id)?.label ?? id.replace(/_/g, ' ');
}

export function assertUniquePropertyIds(
  list: PropertyOption[],
  listName: string
): void {
  const seen = new Set<string>();
  for (const entry of list) {
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate ${listName} id: ${entry.id}`);
    }
    seen.add(entry.id);
  }
}

export function validateTaskPropertyConfig(config: TaskPropertyConfig): TaskPropertyConfig {
  const parsed = TaskPropertyConfigSchema.parse(config);
  for (const key of TASK_PROPERTY_LIST_KEYS) {
    assertUniquePropertyIds(parsed[key], key);
  }
  return parsed;
}

export function validateTaskClassifierPatch(
  patch: Partial<{
    domain: string;
    priority: string;
    status: string;
    kind: string;
    bucket: string;
    source: string;
    tags: string[];
  }>,
  config: TaskPropertyConfig
): void {
  if (patch.domain != null && !propertyIds(config, 'domains').includes(patch.domain)) {
    throw new Error(`Unknown domain: ${patch.domain}`);
  }
  if (patch.priority != null && !propertyIds(config, 'priorities').includes(patch.priority)) {
    throw new Error(`Unknown priority: ${patch.priority}`);
  }
  if (patch.status != null && !propertyIds(config, 'statuses').includes(patch.status)) {
    throw new Error(`Unknown status: ${patch.status}`);
  }
  if (patch.kind != null && !propertyIds(config, 'kinds').includes(patch.kind)) {
    throw new Error(`Unknown kind: ${patch.kind}`);
  }
  if (patch.bucket != null && !propertyIds(config, 'buckets').includes(patch.bucket)) {
    throw new Error(`Unknown bucket: ${patch.bucket}`);
  }
  if (patch.source != null && !propertyIds(config, 'sources').includes(patch.source)) {
    throw new Error(`Unknown source: ${patch.source}`);
  }
}
