// Classroom observation (NESA Proficient Teacher): the record shared by up to three linked meetings.
// Mirrors apps/professional/src/observation/types.ts. Plain JSON, not sealed.
import { z } from 'zod';
import { isValidMeetingId } from './meeting-schema.mjs';

export const OBSERVATION_ID_RE = /^obs_[a-z0-9-]{8,64}$/;
export const OBSERVATION_PHASES = ['planning', 'observing', 'reflecting'];
export const MAX_LOG_ENTRIES = 2000;

const Stamp = z.string().refine((s) => Number.isFinite(Date.parse(s)), 'a timestamp');
const Text = (max = 4000) => z.string().max(max).default('');
const Id = z.string().trim().min(1).max(80);
const Code = z.string().regex(/^[1-7]\.[1-9]\.[1-9]$/);
const MeetingRef = z.string().refine(isValidMeetingId, 'a meeting id');

const LookForSchema = z.object({
  id: Id,
  label: Text(200),
  key: z.string().max(1).default('')
});

const DescriptorSchema = z.object({
  code: Code,
  why: Text(),
  practice: Text(),
  demonstrate: Text(),
  planned_impact: Text(),
  how_know: Text(),
  look_fors: z.array(LookForSchema).max(12).default([])
});

const LogEntrySchema = z.object({
  id: Id,
  at: Stamp,
  clock: z.string().max(12).default(''),
  descriptor: Code.nullable().default(null),
  look_for: Id.nullable().default(null),
  kind: z.enum(['strength', 'next', 'ask', 'said', 'transition']),
  text: Text(2000)
});

const WriteUpRowSchema = z.object({
  practice: Text(),
  strengths: Text(),
  decision: z.enum(['observed', 'partial', 'not']).nullable().default(null),
  comments: Text(),
  edited: z.array(z.enum(['practice', 'strengths'])).max(2).default([])
});

const ReflectionRowSchema = z.object({
  teacher: Text(),
  feedback: Text(),
  feedback_edited: z.boolean().default(false)
});

const SignatureSchema = z.object({ name: Text(120), date: Text(40) }).default({ name: '', date: '' });

export const ObservationSchema = z.object({
  id: z.string().regex(OBSERVATION_ID_RE),
  kind: z.literal('nesa_proficient'),
  status: z.enum(['open', 'done']).default('open'),
  teacher: z.object({
    person_ref: z.string().trim().max(200).default(''),
    name: Text(120),
    nesa_number: Text(40),
    email: Text(160),
    school: Text(160)
  }),
  supervisor: z.object({ name: Text(120), nesa_number: Text(40) }).default({ name: '', nesa_number: '' }),
  planned_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meetings: z.object({
    planning: MeetingRef.optional(),
    observing: MeetingRef.optional(),
    reflecting: MeetingRef.optional()
  }).default({}),
  lesson: z.object({ title: Text(300), link: Text(600), syllabus_link: Text(600) }).default({ title: '', link: '', syllabus_link: '' }),
  plan_all_students: Text(),
  plan_measure: Text(),
  descriptors: z.array(DescriptorSchema).max(4).default([])
    .refine((d) => new Set(d.map((x) => x.code)).size === d.length, 'descriptors must be unique'),
  clock: z.object({
    started_at: Stamp.nullable().default(null),
    paused_ms: z.number().int().min(0).max(1e9).default(0),
    paused_at: Stamp.nullable().default(null),
    ended_at: Stamp.nullable().default(null)
  }).default({ started_at: null, paused_ms: 0, paused_at: null, ended_at: null }),
  log: z.array(LogEntrySchema).max(MAX_LOG_ENTRIES).default([]),
  write_up: z.record(Code, WriteUpRowSchema).default({}),
  reflection: z.record(Code, ReflectionRowSchema).default({}),
  signatures: z.object({ teacher: SignatureSchema, supervisor: SignatureSchema }).default({ teacher: { name: '', date: '' }, supervisor: { name: '', date: '' } }),
  created_at: Stamp,
  updated_at: Stamp
});

/** What a list returns: who, when, which meetings. Never notes. */
export function observationSummary(record) {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    person_ref: record.teacher.person_ref,
    teacher_name: record.teacher.name,
    planned_on: record.planned_on,
    meetings: record.meetings,
    updated_at: record.updated_at
  };
}
