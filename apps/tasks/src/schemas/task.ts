import { z } from 'zod';
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
  due_date: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable().default(null),
  status: TaskStatusSchema.default('open'),
  blocked_since: z.string().nullable().default(null),
  priority: TaskPrioritySchema.default('medium'),
  parent_project_id: z.string().nullable().default(null),
  parent_task_id: z.string().nullable().default(null),
  depends_on: z.array(z.string()).default([]),
  /** Typed incoming links (FS/SS/FF + offset). When absent, `depends_on` is treated as FS / 0. */
  dependency_links: z.array(DependencyLinkSchema).optional(),
  tags: z.array(z.string()).default([]),
  recurrence_rule: z.string().nullable().default(null),
  due_time: z.string().nullable().default(null),
  remind_at: z.string().nullable().default(null),
  remind_dismissed_at: z.string().nullable().default(null),
  attachments: z.array(z.string()).default([]),
  source: TaskSourceSchema.default('manual'),
  page_blocks: z.array(PageBlockSchema).optional()
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskDomain = z.infer<typeof TaskDomainSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type DependencyType = z.infer<typeof DependencyTypeSchema>;
export type DependencyLink = z.infer<typeof DependencyLinkSchema>;

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
  depends_on: true,
  dependency_links: true,
  tags: true,
  recurrence_rule: true,
  due_time: true,
  remind_at: true,
  remind_dismissed_at: true,
  attachments: true,
  source: true,
  page_blocks: true
}).extend({
  title: z.string().min(1),
  domain: TaskDomainSchema
});

export const TaskUpdateSchema = TaskCreateSchema.partial();
