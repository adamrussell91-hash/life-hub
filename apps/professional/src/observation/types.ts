/**
 * Classroom observation (NESA Proficient Teacher). One record shared by up to three linked meetings:
 * Planning, Observing, Reflecting. The record lives in its own store; each meeting holds only
 * `observation: { id, phase }`. Spec: docs/superpowers/specs/2026-11-16-classroom-observation-design.md
 */
export const OBSERVATION_PHASES = ['planning', 'observing', 'reflecting'] as const;
export type ObservationPhase = (typeof OBSERVATION_PHASES)[number];

export const OBSERVATION_ID_RE = /^obs_[a-z0-9-]{8,64}$/;

export type ObservationKind = 'nesa_proficient';
export type LogKind = 'strength' | 'next' | 'ask' | 'said' | 'transition';
export type Decision = 'observed' | 'partial' | 'not';

export interface LookFor {
  id: string;
  label: string;
  /** Single upper-case letter used as the quick key, e.g. 'Q'. */
  key: string;
}

export interface PlannedDescriptor {
  /** Proficient descriptor code, e.g. '3.5.2'. */
  code: string;
  why: string;
  practice: string;
  demonstrate: string;
  planned_impact: string;
  how_know: string;
  look_fors: LookFor[];
}

export interface LogEntry {
  id: string;
  /** ISO time the line was logged. */
  at: string;
  /** Lesson clock when logged, 'mm:ss' from Start. */
  clock: string;
  descriptor: string | null;
  /** LookFor id, or null. */
  look_for: string | null;
  kind: LogKind;
  text: string;
}

export interface WriteUpRow {
  practice: string;
  strengths: string;
  decision: Decision | null;
  comments: string;
  /** Cells Adam has edited by hand; "Gather from log again" leaves these alone. */
  edited: Array<'practice' | 'strengths'>;
}

export interface ReflectionRow {
  teacher: string;
  feedback: string;
  /** True once Adam edits feedback; redrafting then leaves it alone. */
  feedback_edited: boolean;
}

export interface Signature {
  name: string;
  date: string;
}

export interface Observation {
  id: string;
  kind: ObservationKind;
  status: 'open' | 'done';
  teacher: { person_ref: string; name: string; nesa_number: string; email: string; school: string };
  supervisor: { name: string; nesa_number: string };
  /** YYYY-MM-DD of the Planning meeting; starts the two-week clock. */
  planned_on: string;
  meetings: Partial<Record<ObservationPhase, string>>;
  lesson: { title: string; link: string; syllabus_link: string };
  plan_all_students: string;
  plan_measure: string;
  descriptors: PlannedDescriptor[];
  /** Lesson clock state for Observing. */
  clock: { started_at: string | null; paused_ms: number; paused_at: string | null; ended_at: string | null };
  log: LogEntry[];
  write_up: Record<string, WriteUpRow>;
  reflection: Record<string, ReflectionRow>;
  signatures: { teacher: Signature; supervisor: Signature };
  created_at: string;
  updated_at: string;
}

export interface ObservationSummary {
  id: string;
  kind: ObservationKind;
  status: 'open' | 'done';
  person_ref: string;
  teacher_name: string;
  planned_on: string;
  meetings: Partial<Record<ObservationPhase, string>>;
  updated_at: string;
}

/** What a meeting record holds. */
export interface MeetingObservationLink {
  id: string;
  phase: ObservationPhase;
}
