import { z } from 'zod';
import { sanitizeApstFocus } from '@/domain/apst';
import { LifeWallFieldSchema } from './life-wall';
import { PageBlockSchema } from './page-block';

export const schemaVersion = z.literal(1);

/** Classifier ids are configured at runtime — see Tools → Properties. */
export const TaskDomainSchema = z.string().min(1);
export const TaskKindSchema = z.string().min(1);
export const TaskBucketSchema = z.string().min(1);

export const TaskStatusSchema = z.string().min(1);
export const TaskPrioritySchema = z.string().min(1);
export const TaskSourceSchema = z.string().min(1);

export const DependencyTypeSchema = z.enum(['FS', 'SS', 'FF']);

export const DependencyLinkSchema = z.object({
  from_id: z.string().min(1),
  type: DependencyTypeSchema.default('FS'),
  offset_days: z.number().int().default(0)
});

/** Compact action-matching contexts (place, device, person, …). */
export const TaskContextSchema = z.object({
  kind: z.enum(['place', 'device', 'person', 'other']).default('other'),
  value: z.string().min(1)
});

export const CognitiveLoadSchema = z.enum(['low', 'medium', 'high']);
export const TaskDepthSchema = z.enum(['deep', 'shallow', 'admin']);
export const WaitingStatusSchema = z.enum(['waiting', 'follow_up_due', 'resolved']);

/** How developed a Someday / Maybe idea is — independent of how many there are. */
export const SomedayMaturitySchema = z.enum(['new', 'developing', 'set']);
/** What altitude a Someday idea would land at if promoted — Hammond Horizons vocabulary. */
export const SomedayHorizonSchema = z.enum(['area', 'goal', 'project']);
/** Which Someday bucket an idea belongs to. Career stays in Tasks; the other two also feed Life Hub Future Map. */
export const SomedayKindSchema = z.enum(['bucket_list', 'dreams_jar', 'career']);
const OriginDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Workload that appears when scripts are collected. Null clears it. */
export const MarkingSchema = z
  .object({
    class_label: z.string().min(1),
    scripts: z.number().int().positive(),
    minutes_per_script: z.number().positive().nullable(),
    collected_on: OriginDateSchema,
    return_by: OriginDateSchema,
    scripts_marked: z.number().int().nonnegative().default(0)
  })
  .nullable();

export type OdysseyNode = {
  id: string;
  title: string;
  question: string;
  resources: number;
  confidence: number;
  coherence: number;
  children: OdysseyNode[];
};

/** One branch in a Someday item's Odyssey tree — recursive, so a path can branch again.
 *  All fields required by design: `newOdysseyNode()` always fills every one, so the
 *  recursive ZodType stays exact (input === output) instead of fighting `.default()` variance. */
export const OdysseyNodeSchema: z.ZodType<OdysseyNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    title: z.string(),
    question: z.string(),
    resources: z.number().min(0).max(100),
    confidence: z.number().min(0).max(100),
    coherence: z.number().min(0).max(100),
    children: z.array(OdysseyNodeSchema)
  })
);

export const TaskSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  kind: TaskKindSchema.default('task'),
  bucket: TaskBucketSchema.default('active'),
  step_order: z.number().int().nonnegative().default(0),
  domain: TaskDomainSchema,
  framework_used: z.string().nullable().default(null),
  estimated_duration: z.number().nonnegative().nullable().default(null),
  actual_duration: z.number().nonnegative().nullable().default(null),
  /** Hard deadline. Distinct from target_date, review_at, and planned work blocks. */
  due_date: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable().default(null),
  status: TaskStatusSchema.default('open'),
  blocked_since: z.string().nullable().default(null),
  priority: TaskPrioritySchema.default('medium'),
  parent_project_id: z.string().nullable().default(null),
  parent_task_id: z.string().nullable().default(null),
  /** The goal that hosts this task directly (not via a project). */
  parent_goal_id: z.string().nullable().default(null),
  depends_on: z.array(z.string()).default([]),
  /** Typed incoming links (FS/SS/FF + offset). When absent, `depends_on` is treated as FS / 0. */
  dependency_links: z.array(DependencyLinkSchema).optional(),
  tags: z.array(z.string()).default([]),
  recurrence_rule: z.string().nullable().default(null),
  /** Time of hard deadline when known. Not planned-work start. */
  due_time: z.string().nullable().default(null),
  remind_at: z.string().nullable().default(null),
  remind_dismissed_at: z.string().nullable().default(null),
  attachments: z.array(z.string()).default([]),
  source: TaskSourceSchema.default('manual'),
  page_blocks: z.array(PageBlockSchema).optional(),
  /** Internal desired completion — never treated as hard overdue. */
  target_date: z.string().nullable().default(null),
  /** When the item should return to attention (Someday / review). */
  review_at: z.string().nullable().default(null),
  waiting_on: z.string().nullable().default(null),
  waiting_since: z.string().nullable().default(null),
  follow_up_at: z.string().nullable().default(null),
  waiting_status: WaitingStatusSchema.nullable().default(null),
  contexts: z.array(TaskContextSchema).default([]),
  cognitive_load: CognitiveLoadSchema.nullable().default(null),
  depth: TaskDepthSchema.nullable().default(null),
  /** Someday / Maybe only — how developed the idea is. Optional/omitted for board tasks and old records. */
  maturity: SomedayMaturitySchema.nullable().optional(),
  /** Someday / Maybe only — free-text life area, used to compute Life coverage. */
  life_area: z.string().nullable().optional(),
  /** Someday / Maybe only — altitude this idea would land at if promoted. */
  horizon_target: SomedayHorizonSchema.nullable().optional(),
  /** Someday / Maybe only — bucket list, dreams jar, or career. */
  someday_kind: SomedayKindSchema.nullable().optional(),
  /** When a bucket-list or dreams-jar item began. May predate created_at. */
  origin_date: OriginDateSchema.nullable().optional(),
  /** Projects spawned by promoting this Someday idea. The idea stays; each attempt is tracked here. */
  linked_project_ids: z.array(z.string()).optional(),
  /** Goals spawned by promoting this Someday idea. The idea stays. */
  linked_goal_ids: z.array(z.string()).optional(),
  /** Someday / Maybe only — branching daydream tree ("Odyssey mode"). */
  odyssey_paths: z.array(OdysseyNodeSchema).optional(),
  /** Dates that cannot move. Null clears a wall; omitted leaves old records unchanged. */
  life_wall: LifeWallFieldSchema,
  /** Marking shadow workload. Null clears it; omitted leaves old records unchanged. */
  marking: MarkingSchema.optional(),
  /** APST focus-area codes. Unknown codes are dropped. Omitted leaves old records unchanged. */
  apst_focus: z.preprocess(
    (value) => (value == null ? undefined : sanitizeApstFocus(value)),
    z.array(z.string()).optional()
  )
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskDomain = z.infer<typeof TaskDomainSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type DependencyType = z.infer<typeof DependencyTypeSchema>;
export type DependencyLink = z.infer<typeof DependencyLinkSchema>;
export type TaskContext = z.infer<typeof TaskContextSchema>;
export type CognitiveLoad = z.infer<typeof CognitiveLoadSchema>;
export type TaskDepth = z.infer<typeof TaskDepthSchema>;
export type WaitingStatus = z.infer<typeof WaitingStatusSchema>;

export const TaskCreateSchema = TaskSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true,
  completed_at: true
}).partial({
  description: true,
  kind: true,
  bucket: true,
  step_order: true,
  framework_used: true,
  estimated_duration: true,
  actual_duration: true,
  due_date: true,
  status: true,
  blocked_since: true,
  priority: true,
  parent_project_id: true,
  parent_task_id: true,
  parent_goal_id: true,
  depends_on: true,
  dependency_links: true,
  tags: true,
  recurrence_rule: true,
  due_time: true,
  remind_at: true,
  remind_dismissed_at: true,
  attachments: true,
  source: true,
  page_blocks: true,
  target_date: true,
  review_at: true,
  waiting_on: true,
  waiting_since: true,
  follow_up_at: true,
  waiting_status: true,
  contexts: true,
  cognitive_load: true,
  depth: true,
  maturity: true,
  life_area: true,
  horizon_target: true,
  someday_kind: true,
  origin_date: true,
  linked_project_ids: true,
  linked_goal_ids: true,
  odyssey_paths: true,
  life_wall: true,
  marking: true,
  apst_focus: true
}).extend({
  title: z.string().min(1),
  domain: TaskDomainSchema
});

export const TaskUpdateSchema = TaskCreateSchema.partial();
