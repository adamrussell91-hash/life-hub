// Check-in: the private guide text (data/professional/guides/check-in.json in life-hub-data) and the
// sealed handover record. The wording lives only in the private repo; this file holds shapes only.
import { z } from 'zod';
import { isValidMeetingId } from './meeting-schema.mjs';

export const CHECK_IN_STEP_IDS = ['open', 'safety', 'listen', 'hope', 'help'];
export const CHECK_IN_ID_RE = /^checkin_[a-z0-9-]{8,64}$/;
const SLUG = /^[a-z0-9-]{2,40}$/;

const Line = z.string().trim().min(1).max(300);
const Lines = z.array(Line).max(8).default([]);

export const CheckInStepTextSchema = z.object({
  id: z.enum(CHECK_IN_STEP_IDS),
  title: z.string().trim().min(1).max(40),
  ask: z.string().trim().min(1).max(300),
  hint: z.string().trim().max(600).optional(),
  say: Lines,
  listen: Lines,
  chips: z.array(z.object({ label: z.string().trim().min(1).max(60), items: z.array(z.string().trim().min(1).max(60)).min(1).max(12) })).max(4).optional()
});

export const CheckInSideTextSchema = z.object({
  id: z.string().regex(SLUG),
  label: z.string().trim().min(1).max(80),
  ask: z.string().trim().min(1).max(300),
  hint: z.string().trim().max(600).optional(),
  steps: z.array(Line).min(1).max(10),
  report: z.boolean().default(false)
});

export const CheckInTextSchema = z.object({
  version: z.literal(1),
  steps: z.array(CheckInStepTextSchema).length(CHECK_IN_STEP_IDS.length)
    .refine((steps) => steps.every((s, i) => s.id === CHECK_IN_STEP_IDS[i]), 'Steps must be open, safety, listen, hope, help, in order.'),
  sides: z.array(CheckInSideTextSchema).max(10)
    .refine((sides) => new Set(sides.map((s) => s.id)).size === sides.length, 'Side card ids must be unique.'),
  safety: z.object({
    title: z.string().trim().min(1).max(80),
    steps: z.array(Line).min(1).max(6),
    contacts: z.array(z.object({ role: z.string().trim().min(1).max(60), how: z.string().trim().max(80).default('') })).max(6).default([])
  }),
  follow_ups: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
  sources: z.array(z.string().trim().min(1).max(300)).max(12).default([])
});

const Stamp = z.string().refine((s) => Number.isFinite(Date.parse(s)), 'a timestamp');
const Short = (max) => z.string().trim().max(max).default('');

export const CheckInRecordSchema = z.object({
  id: z.string().regex(CHECK_IN_ID_RE),
  meeting_id: z.string().refine(isValidMeetingId, 'a meeting id'),
  person_ref: z.string().trim().min(1).max(200),
  person_name: z.string().trim().min(1).max(120),
  safety: z.enum(['none', 'concern']).nullable().default(null),
  sides: z.array(z.string().regex(SLUG)).max(10).default([])
    .refine((s) => new Set(s).size === s.length, 'sides must be unique'),
  lines: z.object(Object.fromEntries(CHECK_IN_STEP_IDS.map((id) => [id, Short(300).optional()]))).strict().default({}),
  said: Short(2000),
  help: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  handed_to: Short(300),
  follow_ups: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
  report: z.enum(['not_needed', 'to_do', 'made']).nullable().default(null),
  created_at: Stamp,
  updated_at: Stamp
}).strict();

/** The fields a list returns: who, which meeting, when. Never anything said or done. */
export function checkInSummary(record) {
  return {
    id: record.id,
    meeting_id: record.meeting_id,
    person_ref: record.person_ref,
    person_name: record.person_name,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}
