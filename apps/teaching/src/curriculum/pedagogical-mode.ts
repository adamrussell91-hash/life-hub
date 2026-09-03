import { z } from 'zod';

export const PEDAGOGICAL_MODES = [
  'lab',
  'workshop',
  'lesson',
  'lecture',
  'tutorial',
  'seminar',
  'project',
  'case_study',
  'game',
  'station_rotation',
  'design_sprint',
  'assessment'
] as const;

export type PedagogicalMode = (typeof PEDAGOGICAL_MODES)[number];

export const PedagogicalModeSchema = z.enum(PEDAGOGICAL_MODES);

export const DEFAULT_PEDAGOGICAL_MODE: PedagogicalMode = 'lesson';

export const PEDAGOGICAL_MODE_LABELS: Record<PedagogicalMode, string> = {
  lab: 'Lab',
  workshop: 'Workshop',
  lesson: 'Lesson',
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  seminar: 'Seminar',
  project: 'Project',
  case_study: 'Case Study',
  game: 'Game',
  station_rotation: 'Station Rotation',
  design_sprint: 'Design Sprint',
  assessment: 'Assessment'
};

export function isPedagogicalMode(value: unknown): value is PedagogicalMode {
  return typeof value === 'string' && (PEDAGOGICAL_MODES as readonly string[]).includes(value);
}

/** Missing / invalid modes display and filter as Lesson for compatibility. */
export function resolvePedagogicalMode(value: unknown): PedagogicalMode {
  return isPedagogicalMode(value) ? value : DEFAULT_PEDAGOGICAL_MODE;
}

export function pedagogicalModeLabel(value: unknown): string {
  return PEDAGOGICAL_MODE_LABELS[resolvePedagogicalMode(value)];
}
