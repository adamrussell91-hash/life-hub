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
  'assessment',
  'quiz'
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
  assessment: 'Assessment',
  quiz: 'Quiz'
};

export function isPedagogicalMode(value: unknown): value is PedagogicalMode {
  return typeof value === 'string' && (PEDAGOGICAL_MODES as readonly string[]).includes(value);
}

/** Missing / invalid modes display and filter as Lesson for compatibility. */
export function resolvePedagogicalMode(value: unknown): PedagogicalMode {
  return isPedagogicalMode(value) ? value : DEFAULT_PEDAGOGICAL_MODE;
}

/** Lesson types that play through their own player, which has no place for quiz questions. */
const PLAYER_MODES: ReadonlySet<PedagogicalMode> = new Set(['lecture', 'design_sprint', 'case_study', 'tutorial']);

/** True when quiz questions and group sets in a lesson of this type reach students. */
export function quizRunsIn(value: unknown): boolean {
  return !PLAYER_MODES.has(resolvePedagogicalMode(value));
}

export function pedagogicalModeLabel(value: unknown): string {
  return PEDAGOGICAL_MODE_LABELS[resolvePedagogicalMode(value)];
}
