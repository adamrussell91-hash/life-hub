import { z } from 'zod';
import { schemaVersion } from './task';
import { PageBlockSchema } from './page-block';

export const MilestoneStatusSchema = z.enum(['open', 'done', 'missed']);

export const MilestoneSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  title: z.string().min(1),
  due_date: z.string().nullable().default(null),
  status: MilestoneStatusSchema.default('open'),
  depends_on: z.array(z.string()).optional()
});

export const PermissionNoteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  returned: z.boolean()
});

export const ComplianceModuleCategorySchema = z.enum([
  'staff',
  'medical',
  'transport',
  'docs',
  'dayof',
  'post'
]);

export const ComplianceModuleSchema = z.object({
  id: z.string().min(1),
  category: ComplianceModuleCategorySchema,
  label: z.string().min(1),
  sub: z.string().nullable().default(null),
  on: z.boolean(),
  critical: z.boolean()
});

export const PageCoverSchema = z.object({
  url: z.string().min(1)
});

export const MusterStopStatusSchema = z.enum(['pending', 'confirmed', 'short']);

export const MusterStopSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  time: z.string().nullable().default(null),
  status: MusterStopStatusSchema.default('pending'),
  /** Present when status is "short" — how many are unaccounted for. */
  short_by: z.number().int().positive().nullable().default(null)
});

export const ActiveEscalationSchema = z.object({
  stop_id: z.string().min(1),
  started_at: z.string(),
  resolved: z.boolean().default(false)
});

export const MusterLogEntrySchema = z.object({
  at: z.string(),
  label: z.string(),
  note: z.string()
});

export const FolderItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  on: z.boolean()
});

export const ProjectTypeSchema = z.enum(['standard', 'excursion', 'academic_program']);
export const ProjectStatusSchema = z.enum(['active', 'stalled', 'revived', 'archived_dead', 'paused']);
export const QualityBarSchema = z.enum(['good_enough', 'high_quality', 'exceptional']);

export const ProjectSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  parent_goal_id: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  arc_summary: z.string().default(''),
  /** Why this project exists — distinct from description. */
  purpose: z.string().default(''),
  desired_outcome: z.string().default(''),
  quality_bar: QualityBarSchema.nullable().default(null),
  /** When the project should return for review. */
  review_at: z.string().nullable().default(null),
  type: ProjectTypeSchema.default('standard'),
  milestones: z.array(MilestoneSchema).nullish().transform((value) => value ?? []),
  status: ProjectStatusSchema.default('active'),
  baseline_end_date: z.string().nullable().default(null),
  current_end_date: z.string().nullable().default(null),
  review_summary: z.string().nullable().default(null),
  stall_flagged_at: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  // Excursion fields (present when type === 'excursion')
  competition_or_event_type: z.string().nullable().default(null),
  key_dates: z
    .object({
      permission_note_due: z.string().nullable().optional(),
      staff_notification_due: z.string().nullable().optional(),
      payment_due: z.string().nullable().optional(),
      risk_assessment_due: z.string().nullable().optional()
    })
    .nullable()
    .default(null),
  student_group_reference: z.string().nullable().default(null),
  permission_notes: z.array(PermissionNoteSchema).optional(),
  generated_admin_tasks: z.array(z.string()).default([]),
  drafted_documents: z
    .object({
      permission_note_draft: z.string().nullable().optional(),
      staff_absence_email_draft: z.string().nullable().optional()
    })
    .nullable()
    .default(null),
  cover: PageCoverSchema.nullable().optional(),
  page_blocks: z.array(PageBlockSchema).optional(),
  /** Compliance bundle — checklist categories attached to an excursion (present when type === 'excursion'). */
  compliance_modules: z.array(ComplianceModuleSchema).optional(),
  /** Day-of — roll-call points, live escalation state, and the audit log (excursion only). */
  expected_headcount: z.number().int().positive().nullable().default(null),
  day_of_muster: z.array(MusterStopSchema).optional(),
  active_escalation: ActiveEscalationSchema.nullable().default(null),
  muster_log: z.array(MusterLogEntrySchema).optional(),
  /** Post — the excursion folder checklist (excursion only). */
  folder_items: z.array(FolderItemSchema).optional()
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type QualityBar = z.infer<typeof QualityBarSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type PermissionNote = z.infer<typeof PermissionNoteSchema>;
export type PageCover = z.infer<typeof PageCoverSchema>;
export type ComplianceModule = z.infer<typeof ComplianceModuleSchema>;
export type ComplianceModuleCategory = z.infer<typeof ComplianceModuleCategorySchema>;
export type MusterStop = z.infer<typeof MusterStopSchema>;
export type MusterStopStatus = z.infer<typeof MusterStopStatusSchema>;
export type ActiveEscalation = z.infer<typeof ActiveEscalationSchema>;
export type MusterLogEntry = z.infer<typeof MusterLogEntrySchema>;
export type FolderItem = z.infer<typeof FolderItemSchema>;

export const ProjectCreateSchema = ProjectSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
}).partial({
  description: true,
  parent_goal_id: true,
  tags: true,
  arc_summary: true,
  purpose: true,
  desired_outcome: true,
  quality_bar: true,
  review_at: true,
  type: true,
  milestones: true,
  status: true,
  baseline_end_date: true,
  current_end_date: true,
  review_summary: true,
  stall_flagged_at: true,
  competition_or_event_type: true,
  key_dates: true,
  student_group_reference: true,
  permission_notes: true,
  generated_admin_tasks: true,
  drafted_documents: true,
  cover: true,
  page_blocks: true,
  compliance_modules: true,
  expected_headcount: true,
  day_of_muster: true,
  active_escalation: true,
  muster_log: true,
  folder_items: true
}).extend({
  title: z.string().min(1)
});

export const ProjectUpdateSchema = ProjectCreateSchema.partial();
