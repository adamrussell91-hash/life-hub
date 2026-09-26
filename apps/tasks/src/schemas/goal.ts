import { z } from 'zod';
import { LifeWallFieldSchema } from './life-wall';
import { schemaVersion } from './task';

export const GoalStatusSchema = z.enum(['active', 'parked', 'achieved', 'dropped', 'archived']);
export const GoalSphereSchema = z.enum(['life', 'work', 'professional']);
export const GoalStructureSchema = z.enum(['woop', 'smarter', 'okr', 'lead_lag', 'floor_target_stretch']);

const Text = z.string().default('');
const Num = z.number().nullable().default(null);

export const GoalFrameSchema = z.object({
  woop: z.object({ wish: Text, outcome: Text, obstacle: Text, plan: Text }).optional(),
  smarter: z
    .object({
      specific: Text, measurable: Text, achievable: Text, relevant: Text,
      time_bound: Text, evaluate: Text, readjust: Text
    })
    .optional(),
  okr: z
    .object({
      objective: Text,
      key_results: z.array(z.object({ id: z.string(), label: z.string(), target: Num, current: Num })).default([])
    })
    .optional(),
  lead_lag: z.object({ lag: Text }).optional(),
  floor_target_stretch: z
    .object({ unit: Text, floor: Num, target: Num, stretch: Num, current: Num })
    .optional()
});

export const GoalMilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_date: z.string().nullable().default(null),
  status: z.enum(['open', 'done']).default('open')
});

export const GoalSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  parent_area_id: z.string().nullable().default(null),
  /** The Someday / Maybe idea this goal was promoted from — the idea itself stays put. */
  parent_someday_id: z.string().nullable().optional(),
  status: GoalStatusSchema.default('active'),
  sphere: GoalSphereSchema.default('life'),
  structure: GoalStructureSchema.default('woop'),
  frame: GoalFrameSchema.default({}),
  lead_measure: z.object({ label: z.string(), per_week: z.number().int().min(1) }).nullable().default(null),
  /** Manual "+1" taps per Monday key, added to the automatic count. */
  week_log: z.record(z.string(), z.object({ manual: z.number().int().min(0) })).default({}),
  /** Monday keys of planned rest weeks — drawn dashed, never as a miss. */
  rest_weeks: z.array(z.string()).default([]),
  if_then: z.object({ cue: z.string(), action: z.string(), obstacle: z.string().default('') }).nullable().default(null),
  next_start: z.string().nullable().default(null),
  due_date: z.string().nullable().default(null),
  milestones: z.array(GoalMilestoneSchema).default([]),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  life_wall: LifeWallFieldSchema
});

export type Goal = z.infer<typeof GoalSchema>;
export type GoalSphere = z.infer<typeof GoalSphereSchema>;
export type GoalStructure = z.infer<typeof GoalStructureSchema>;
export type GoalFrame = z.infer<typeof GoalFrameSchema>;

const DEFAULTS = GoalSchema.parse({
  schema_version: 1, id: '_', title: '_', created_at: '', updated_at: ''
});

/**
 * Server records are normalised already; this guards stale caches and mock data.
 * A record that fails parsing keeps its own fields over v2 defaults instead of throwing.
 */
export function normalizeGoal(raw: Goal): Goal {
  const parsed = GoalSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const source = raw as Partial<Goal>;
  return {
    ...DEFAULTS,
    id: source.id ?? DEFAULTS.id,
    title: source.title ?? DEFAULTS.title,
    description: typeof source.description === 'string' ? source.description : '',
    created_at: source.created_at ?? '',
    updated_at: source.updated_at ?? '',
    tags: Array.isArray(source.tags) ? source.tags.filter((t): t is string => typeof t === 'string') : []
  };
}

export const GoalCreateSchema = GoalSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
})
  .partial()
  .extend({ title: z.string().min(1) });

export const GoalUpdateSchema = GoalCreateSchema.partial();
