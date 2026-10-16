import { z } from 'zod';
import { schemaVersion } from './task';

export const PROGRAM_TYPES = [
  'Competition',
  'Program',
  'Event',
  'Association',
  'Website',
  'Gifted Opportunity',
  'Award'
] as const;

export const PROGRAM_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'TBA',
  'Various'
] as const;

export const PROGRAM_AGE_GROUPS = [
  'Year 3',
  'Year 4',
  'Year 5',
  'Year 6',
  'Year 7',
  'Year 8',
  'Year 9',
  'Year 10',
  'Year 11',
  'Year 12'
] as const;

export const PROGRAM_LEVELS = ['High Ability', 'Beginners', 'All Abilities', 'Multiple Levels'] as const;

export const PROGRAM_LENGTHS = ['Single Day', 'Long Term', 'Year Long', 'Recurring'] as const;

export const PROGRAM_COST_BASES = [
  'Free',
  'Per student',
  'Per team',
  'Per entry',
  'Membership',
  'Varies',
  'TBC'
] as const;

export const PROGRAM_SUBJECTS = [
  'Coding',
  'English',
  'Science',
  'Engineering',
  'Legal',
  'Mathematics',
  'Humanities',
  'Website Design',
  'Game Development',
  'Debating',
  'STEM',
  'Computing',
  'Robotics',
  'History',
  'Geography',
  'Film',
  'Arts',
  'Drama',
  'Psychology',
  'Physics',
  'Chemistry',
  'Biology',
  'Astronomy',
  'Neuroscience',
  'Economics',
  'Business',
  'Creative Writing',
  'Essay Writing',
  'Public Speaking',
  'Classics',
  'Languages',
  'Music',
  'Philosophy',
  'Leadership',
  'Civics'
] as const;

/** What the student actually does. Splits a personal line into branches (Adam, 16 Oct 2026). */
export const PROGRAM_FORMATS = [
  'Exam',
  'Written entry',
  'Speaking',
  'Simulation',
  'Project',
  'Creative work',
  'Day event',
  'Program'
] as const;

/** Who designed it: a school's own program, or an outside organiser's (even if sat at school). */
export const PROGRAM_PROVIDERS = ['School', 'External'] as const;

/** Where it happens. An entry can be in more than one place (sat at school, online). */
export const PROGRAM_SETTINGS = ['At school', 'Online', 'Away'] as const;

export const PROGRAM_ENTRIES = ['Individual', 'Team', 'Either'] as const;

export const PROGRAM_ENTRY_ROUTES = ['School enters', 'Student applies', 'Selection'] as const;

const nullableText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

/** How much to trust a date: stated day, "early / mid / late" a month, or the month only. */
export const DatePrecisionSchema = z.enum(['day', 'part', 'month']);
const precision = DatePrecisionSchema.nullable().optional().default(null);

const text = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? '');

function oneOf<T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values).nullable().optional().default(null);
}

const ProgramObject = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  name: z.string().trim().min(1),
  types: z.array(z.string()).default([]),
  subjects: z.array(z.string()).default([]),
  month: nullableText,
  age_groups: z.array(z.string()).default([]),
  competition_level: nullableText,
  competition_length: nullableText,
  location: text,
  organiser: text,
  cost: text,
  cost_basis: nullableText,
  description: text,
  registration_link: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => {
      if (!value) return null;
      return value;
    }),
  registration_window: text,
  /** Classification for branch lines. Null or empty until the entry is recatalogued. */
  format: oneOf(PROGRAM_FORMATS),
  provider: oneOf(PROGRAM_PROVIDERS),
  settings: z.array(z.enum(PROGRAM_SETTINGS)).default([]),
  entry: oneOf(PROGRAM_ENTRIES),
  entry_route: oneOf(PROGRAM_ENTRY_ROUTES),
  /**
   * When this runs or is held (equal for one day), with `dates_precision` saying how sure that is.
   * A `month` or `part` run is a window, not a confirmed day. Null when nothing says when it runs.
   */
  starts_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  ends_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  dates_precision: precision,
  /** Submission deadline (essays, writing, art). */
  due_on: isoDate,
  due_precision: precision,
  /** When registration or entry closes for something that runs later. */
  entries_close_on: isoDate,
  entries_close_precision: precision,
  /** Page the dates came from, so they can be checked again next year. */
  dates_source_url: nullableText,
  /** When someone last confirmed the dates against that page. */
  dates_checked_on: isoDate,
  not_available_nsw: z.boolean().default(false),
  not_available_reason: text,
  created_at: z.string(),
  updated_at: z.string()
});

export const ProgramSchema = ProgramObject.superRefine((program, ctx) => {
  const start = program.starts_on;
  const end = program.ends_on;
  if (!start && !end) return;
  if (!start || !end || end < start) {
    ctx.addIssue({ code: 'custom', message: 'ends_on is before starts_on', path: ['ends_on'] });
  }
});

export const ProgramCreateSchema = ProgramObject.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
}).partial({
  types: true,
  subjects: true,
  month: true,
  age_groups: true,
  competition_level: true,
  competition_length: true,
  location: true,
  organiser: true,
  cost: true,
  cost_basis: true,
  description: true,
  registration_link: true,
  registration_window: true,
  format: true,
  provider: true,
  settings: true,
  entry: true,
  entry_route: true,
  starts_on: true,
  ends_on: true,
  dates_precision: true,
  due_on: true,
  due_precision: true,
  entries_close_on: true,
  entries_close_precision: true,
  dates_source_url: true,
  dates_checked_on: true,
  not_available_nsw: true,
  not_available_reason: true
}).extend({
  name: z.string().trim().min(1)
});

export const ProgramUpdateSchema = ProgramCreateSchema.partial();

export type Program = z.infer<typeof ProgramSchema>;
export type ProgramCreate = z.infer<typeof ProgramCreateSchema>;
export type ProgramUpdate = z.infer<typeof ProgramUpdateSchema>;
