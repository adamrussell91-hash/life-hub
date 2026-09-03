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

export const PageCoverSchema = z.object({
  url: z.string().min(1)
});

export const ProjectTypeSchema = z.enum(['standard', 'excursion', 'academic_program']);
export const ProjectStatusSchema = z.enum(['active', 'stalled', 'revived', 'archived_dead']);

export const ProjectSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  parent_goal_id: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  arc_summary: z.string().default(''),
  type: ProjectTypeSchema.default('standard'),
  milestones: z.array(MilestoneSchema).default([]),
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
  page_blocks: z.array(PageBlockSchema).optional()
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type PermissionNote = z.infer<typeof PermissionNoteSchema>;
export type PageCover = z.infer<typeof PageCoverSchema>;

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
  page_blocks: true
}).extend({
  title: z.string().min(1)
});

export const ProjectUpdateSchema = ProjectCreateSchema.partial();
