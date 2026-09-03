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
  'Leadership'
] as const;

const nullableText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

const text = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? '');

export const ProgramSchema = z.object({
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
  not_available_nsw: z.boolean().default(false),
  not_available_reason: text,
  created_at: z.string(),
  updated_at: z.string()
});

export const ProgramCreateSchema = ProgramSchema.omit({
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
  not_available_nsw: true,
  not_available_reason: true
}).extend({
  name: z.string().trim().min(1)
});

export const ProgramUpdateSchema = ProgramCreateSchema.partial();

export type Program = z.infer<typeof ProgramSchema>;
export type ProgramCreate = z.infer<typeof ProgramCreateSchema>;
export type ProgramUpdate = z.infer<typeof ProgramUpdateSchema>;
