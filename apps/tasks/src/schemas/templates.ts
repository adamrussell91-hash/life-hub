import { z } from 'zod';
import { schemaVersion, TaskDomainSchema } from './task';
import { ProjectTypeSchema, MilestoneSchema } from './project';

export const FrameworkEntrySchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  name: z.string().min(1),
  best_suited_task_pattern: z.string(),
  reasoning_template: z.string()
});

export type FrameworkEntry = z.infer<typeof FrameworkEntrySchema>;

export const ExcursionTemplateSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  name: z.string().min(1),
  default_lead_times: z.object({
    permission_note_days: z.number().int(),
    staff_email_days: z.number().int(),
    risk_assessment_days: z.number().int(),
    payment_days: z.number().int().optional()
  }),
  checklist_items: z.array(z.string()).default([])
});

export type ExcursionTemplate = z.infer<typeof ExcursionTemplateSchema>;

export const TaskTemplateSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  name: z.string().min(1),
  domain: TaskDomainSchema,
  default_fields: z.object({
    title_pattern: z.string().optional(),
    framework_used: z.string().nullable().optional(),
    estimated_duration: z.number().nullable().optional(),
    priority: z.string().optional(),
    tags: z.array(z.string()).optional()
  }),
  created_from: z.string().nullable().default(null),
  created_at: z.string()
});

export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

export const ProjectTemplateSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  name: z.string().min(1),
  type: ProjectTypeSchema,
  excursion_template_id: z.string().nullable().default(null),
  default_milestones: z
    .array(MilestoneSchema.omit({ id: true, project_id: true }).partial({ status: true, due_date: true }))
    .default([]),
  created_from: z.string().nullable().default(null),
  created_at: z.string()
});

export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema>;

export const ReviewLogSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  project_id: z.string(),
  outcome: z.enum(['revived', 'frankensteined', 'buried', 'closed']),
  reason: z.string(),
  merge_into_project_id: z.string().nullable().default(null),
  /** Planned-vs-actual snapshot at closure (nullable for stall outcomes). */
  baseline_end_date: z.string().nullable().default(null),
  current_end_date: z.string().nullable().default(null),
  slip_days: z.number().nullable().default(null),
  created_at: z.string()
});

export type ReviewLog = z.infer<typeof ReviewLogSchema>;

export const AgentActionLogSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  agent: z.string(),
  action: z.enum(['create', 'update', 'delete']),
  entity_type: z.enum(['task', 'project', 'milestone', 'template', 'stress_flag']),
  entity_id: z.string(),
  reason: z.string(),
  created_at: z.string()
});

export type AgentActionLog = z.infer<typeof AgentActionLogSchema>;
