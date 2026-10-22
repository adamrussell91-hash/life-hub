import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';
import { CoverSchema } from './cover';
import { SourceSchema } from './source';
import { INITIALS_PATTERN, STUDENT_ID_PATTERN } from './student-initials';
import { validateTimetable, type ClassTimetable } from '../schedule/timetable';

export const ClassTimetableSchema = z.unknown().transform((value, ctx): ClassTimetable => {
  try { return validateTimetable(value); } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : 'Invalid timetable' });
    return z.NEVER;
  }
});

export const ClassHomepageSchema = z.object({
  announcements: z.array(BlockSchema),
  resources: z.array(BlockSchema),
  custom: z.array(BlockSchema)
});

export type ClassHomepage = z.infer<typeof ClassHomepageSchema>;

/**
 * One student on a class list, for the classroom name picker, groups and quiz initials.
 * Lives only on the class record (teacher side). `skip_picker` quietly leaves
 * the student out of the name picker and is never shown on a lesson page.
 */
export const ClassStudentSchema = z.object({
  name: z.string().min(1).max(80),
  skip_picker: z.boolean().default(false),
  /** Never changes once saved, so renames keep a student's quiz results. */
  id: z.string().regex(STUDENT_ID_PATTERN).optional(),
  /** What the student types to take a quiz. Unique within the class. */
  initials: z.string().regex(INITIALS_PATTERN).optional()
});

export type ClassStudent = z.infer<typeof ClassStudentSchema>;

export const MAX_CLASS_STUDENTS = 60;

export const ClassSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('class'),
  code: z.string().min(1),
  display_name: z.string().min(1).optional(),
  academic_year: z.number().int(),
  year_id: z.string().min(1),
  subject_id: z.string().min(1),
  active_unit_ids: z.array(z.string().min(1)),
  current_unit_id: z.string().min(1).optional(),
  current_scheduled_lesson_id: z.string().min(1).optional(),
  meeting_days: z.array(z.number().int().min(1).max(7)).optional(),
  timetable: ClassTimetableSchema.optional(),
  homepage: ClassHomepageSchema.optional(),
  cover: CoverSchema.optional(),
  students: z.array(ClassStudentSchema).max(MAX_CLASS_STUDENTS).optional(),
  source: SourceSchema.optional()
});

export type Class = z.infer<typeof ClassSchema>;
