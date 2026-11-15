/**
 * Mentoring & coaching: one card per relationship. Pure — no DOM, no fetch.
 *
 * Who appears: anyone with a current mentor / mentee relationship role,
 * anyone a coaching sheet is about (coachees), and anyone with a mentorship
 * record, which is how a finished mentorship stays on the page. Sessions are
 * the meetings linked to that person, plus any meeting holding a coaching
 * sheet about them.
 */

import type { MentorshipKind, MentorshipStatus, MentorshipSummary } from '@/api/mentorships';
import type { DirectoryPersonRow } from '@/api/people-directory';
import type { MeetingRecord } from '@/domain/types';
import type { CoachingSheet } from '@/guides/coaching-sheet';
import { techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';

export type MentoringKind = 'mentee' | 'coachee' | 'mentor';

export const MENTORING_KIND_LABEL: Record<MentoringKind, string> = {
  mentee: 'Mentee',
  coachee: 'Coaching',
  mentor: 'Mentor'
};

/** No session for this long, and nothing booked: the card asks for a catch-up. */
export const CATCH_UP_DAYS = 42;

export interface MentoringSession {
  meetingId: string;
  title: string;
  start: string;
  /** The technique of a coaching sheet written in this meeting, if any. */
  technique?: string | null;
}

/**
 * What the badge on a card shows: the school crest for accreditation, the
 * NSW HALT mark for Highly Accomplished and Lead, a plain chip for the rest.
 */
export type MentoringBadge =
  | { style: 'crest'; label: string; organisationRef: string | null }
  | { style: 'halt'; label: string }
  | { style: 'chip'; label: string; tone: MentoringKind };

export const ACCREDITATION_LABEL = 'Accreditation mentor';
export const HALT_LEVEL_LABEL: Record<'halt_highly_accomplished' | 'halt_lead', string> = {
  halt_highly_accomplished: 'Highly Accomplished',
  halt_lead: 'Lead'
};

export const MENTORSHIP_KIND_LABEL: Record<MentorshipKind, string> = {
  accreditation: ACCREDITATION_LABEL,
  halt_highly_accomplished: 'NSW HALT: Highly Accomplished',
  halt_lead: 'NSW HALT: Lead',
  coaching: 'Coaching',
  other: 'Other mentoring'
};

export interface MentoringSheetSummary {
  meetingId: string;
  technique: string;
  decision: CoachingSheet['decision'];
  updatedAt: string;
}

export interface MentoringCard {
  personId: string;
  personRef: string;
  name: string;
  initials: string;
  kind: MentoringKind;
  /** The relationship's own label when it says more than the kind ("Accreditation"). */
  detail: string | null;
  roleLine: string;
  warmthBand: DirectoryPersonRow['warmth_band'];
  lastSession: MentoringSession | null;
  nextSession: MentoringSession | null;
  sessionCount: number;
  sheetCount: number;
  latestSheet: MentoringSheetSummary | null;
  youOwe: number;
  theyOwe: number;
  nextLabel: string | null;
  dueCatchUp: boolean;
  /** The saved mentorship, when there is one. */
  mentorshipId: string | null;
  /** How the operator mentors them: saved, or read from the relationship label until it is. */
  type: MentorshipKind;
  /** False while `type` is only a reading of the relationship label. */
  typeSaved: boolean;
  badge: MentoringBadge;
  status: MentorshipStatus;
  focus: string | null;
  startedOn: string | null;
  completedOn: string | null;
  outcome: string | null;
}

export interface MentoringInput {
  people: DirectoryPersonRow[];
  meetings: MeetingRecord[];
  /** Meeting ids linked to each person (from their overview), keyed by person ref. */
  linkedMeetings?: Map<string, Set<string>>;
  /** Saved mentorships; a person's active one wins, then the latest. */
  mentorships?: MentorshipSummary[];
  now?: Date;
}

const DEFAULT_ROLE_LABEL: Record<string, string> = { mentor: 'Mentor', mentee: 'Mentee' };

function relationshipKind(row: DirectoryPersonRow): { kind: MentoringKind; detail: string | null } | null {
  const current = row.relationship_roles.filter((role) => role.current);
  const mentee = current.find((role) => role.role === 'mentee');
  const mentor = current.find((role) => role.role === 'mentor');
  const pick = mentee ?? mentor;
  if (!pick) return null;
  const label = pick.label?.trim() ?? '';
  return {
    kind: pick.role as MentoringKind,
    detail: label && label !== DEFAULT_ROLE_LABEL[pick.role] ? label : null
  };
}

/** The role a finished mentorship had, once the relationship itself is no longer current. */
function pastRelationshipKind(row: DirectoryPersonRow): MentoringKind | null {
  if (row.relationship_roles.some((role) => role.role === 'mentee')) return 'mentee';
  if (row.relationship_roles.some((role) => role.role === 'mentor')) return 'mentor';
  return null;
}

/** One mentorship per person: the active one, else the most recently updated. */
export function mentorshipByPerson(mentorships: MentorshipSummary[] = []): Map<string, MentorshipSummary> {
  const byPerson = new Map<string, MentorshipSummary>();
  for (const record of mentorships) {
    const held = byPerson.get(record.person_ref);
    const better =
      !held ||
      (record.status === 'active' && held.status !== 'active') ||
      (record.status === held.status && record.updated_at > held.updated_at);
    if (better) byPerson.set(record.person_ref, record);
  }
  return byPerson;
}

/** Until a type is saved, the relationship's own label is the best reading of it. */
export function mentorshipKindFromLabel(label: string | null, kind: MentoringKind): MentorshipKind {
  const text = (label ?? '').toLowerCase();
  if (/accredit|proficient/.test(text)) return 'accreditation';
  if (/\blead\b/.test(text) && !/highly/.test(text)) return 'halt_lead';
  if (/halt|highly accomplished/.test(text)) return 'halt_highly_accomplished';
  return kind === 'coachee' ? 'coaching' : 'other';
}

export function mentoringBadgeFor(input: {
  type: MentorshipKind;
  kind: MentoringKind;
  label: string | null;
  organisationRef: string | null;
}): MentoringBadge {
  if (input.type === 'accreditation') {
    return { style: 'crest', label: ACCREDITATION_LABEL, organisationRef: input.organisationRef };
  }
  if (input.type === 'halt_highly_accomplished' || input.type === 'halt_lead') {
    return { style: 'halt', label: HALT_LEVEL_LABEL[input.type] };
  }
  const own = input.label?.trim();
  if (input.type === 'coaching') return { style: 'chip', label: own || 'Coaching', tone: 'coachee' };
  return { style: 'chip', label: own || MENTORING_KIND_LABEL[input.kind], tone: input.kind };
}

function techniqueName(id: string): string {
  const entry = techniqueById(id) as { name?: string } | null;
  return entry?.name ?? id;
}

function liveMeeting(meeting: MeetingRecord): boolean {
  return meeting.state !== 'cancelled';
}

function sheetsAbout(meetings: MeetingRecord[]): Map<string, Array<{ meeting: MeetingRecord; sheet: CoachingSheet }>> {
  const byPerson = new Map<string, Array<{ meeting: MeetingRecord; sheet: CoachingSheet }>>();
  for (const meeting of meetings) {
    for (const sheet of meeting.coaching_sheets ?? []) {
      if (!sheet.person_ref) continue;
      const list = byPerson.get(sheet.person_ref) ?? [];
      list.push({ meeting, sheet });
      byPerson.set(sheet.person_ref, list);
    }
  }
  return byPerson;
}

function session(meeting: MeetingRecord, technique: string | null = null): MentoringSession {
  return { meetingId: meeting.id, title: meeting.title, start: meeting.scheduled_start, technique };
}

/**
 * Which directory rows belong on the page, before any per-person reads. A
 * saved mentorship keeps its person here whatever has happened to the
 * relationship since.
 */
export function mentoringPeople(
  people: DirectoryPersonRow[],
  meetings: MeetingRecord[],
  mentorships: MentorshipSummary[] = []
): DirectoryPersonRow[] {
  const coached = sheetsAbout(meetings);
  const saved = mentorshipByPerson(mentorships);
  return people.filter(
    (row) =>
      saved.has(row.ref) ||
      (row.lifecycle_status !== 'archived' && (relationshipKind(row) !== null || coached.has(row.ref)))
  );
}

/**
 * Every session with one person, oldest first: their linked meetings plus
 * any meeting holding a coaching sheet about them. Cancelled ones are left out.
 */
export function mentoringSessions(
  personRef: string,
  meetings: MeetingRecord[],
  linkedIds: Iterable<string> = []
): MentoringSession[] {
  const byId = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  const ids = new Set(linkedIds);
  const technique = new Map<string, string>();
  for (const meeting of meetings) {
    for (const sheet of meeting.coaching_sheets ?? []) {
      if (sheet.person_ref !== personRef) continue;
      ids.add(meeting.id);
      if (!technique.has(meeting.id)) technique.set(meeting.id, techniqueName(sheet.technique_id));
    }
  }
  return [...ids]
    .map((id) => byId.get(id))
    .filter((meeting): meeting is MeetingRecord => Boolean(meeting) && liveMeeting(meeting!))
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
    .map((meeting) => session(meeting, technique.get(meeting.id) ?? null));
}

export function buildMentoringCards(input: MentoringInput): MentoringCard[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const coached = sheetsAbout(input.meetings);
  const saved = mentorshipByPerson(input.mentorships);
  const cards: MentoringCard[] = [];

  for (const row of mentoringPeople(input.people, input.meetings, input.mentorships)) {
    const record = saved.get(row.ref) ?? null;
    const relation =
      relationshipKind(row) ??
      (coached.has(row.ref)
        ? { kind: 'coachee' as const, detail: null }
        : { kind: pastRelationshipKind(row) ?? ('mentee' as const), detail: null });
    const sheets = (coached.get(row.ref) ?? []).sort((a, b) => b.sheet.updated_at.localeCompare(a.sheet.updated_at));

    const sessions = mentoringSessions(row.ref, input.meetings, input.linkedMeetings?.get(row.ref) ?? []);
    const past = sessions.filter((entry) => Date.parse(entry.start) <= nowMs);
    const future = sessions.filter((entry) => Date.parse(entry.start) > nowMs);
    const last = past[past.length - 1] ?? null;
    const next = future[0] ?? null;
    const sinceLast = last ? (nowMs - Date.parse(last.start)) / 86_400_000 : Infinity;

    const status: MentorshipStatus = record?.status ?? 'active';
    const type = record?.kind ?? mentorshipKindFromLabel(relation.detail, relation.kind);
    const latest = sheets[0];
    cards.push({
      personId: row.id,
      personRef: row.ref,
      name: row.display_name,
      initials: row.initials,
      kind: relation.kind,
      detail: relation.detail,
      roleLine: row.job_title && row.organisation ? `${row.job_title} · ${row.organisation.display_name}` : row.organisation?.display_name ?? '',
      warmthBand: row.warmth_band,
      lastSession: last,
      nextSession: next,
      sessionCount: sessions.length,
      sheetCount: sheets.length,
      latestSheet: latest
        ? {
            meetingId: latest.meeting.id,
            technique: techniqueName(latest.sheet.technique_id),
            decision: latest.sheet.decision,
            updatedAt: latest.sheet.updated_at
          }
        : null,
      youOwe: row.you_owe_count,
      theyOwe: row.they_owe_count,
      nextLabel: row.next_label,
      // A finished mentorship never asks for a catch-up.
      dueCatchUp: status === 'active' && !next && sinceLast > CATCH_UP_DAYS,
      mentorshipId: record?.id ?? null,
      type,
      typeSaved: Boolean(record),
      badge: mentoringBadgeFor({
        type,
        kind: relation.kind,
        label: record ? record.label : relation.detail,
        // Until a crest is chosen, their own school's is the likeliest one.
        organisationRef: record?.organisation_ref ?? row.organisation?.ref ?? null
      }),
      status,
      focus: record?.focus ?? null,
      startedOn: record?.started_on ?? null,
      completedOn: record?.completed_on ?? null,
      outcome: record?.outcome ?? null
    });
  }

  // Active first: catch-ups, then the soonest booked session, then by name.
  // Finished ones follow, the most recently finished first.
  return cards.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    if (a.status === 'completed') {
      return (b.completedOn ?? '').localeCompare(a.completedOn ?? '') || a.name.localeCompare(b.name);
    }
    if (a.dueCatchUp !== b.dueCatchUp) return a.dueCatchUp ? -1 : 1;
    const an = a.nextSession?.start ?? '9999';
    const bn = b.nextSession?.start ?? '9999';
    return an.localeCompare(bn) || a.name.localeCompare(b.name);
  });
}

/** "today", "3 days ago", "in 2 weeks", "5 weeks ago". */
export function relativeDays(iso: string, now: Date = new Date()): string {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(new Date(iso)) - day(now)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const n = Math.abs(days);
  const amount = n < 14 ? `${n} days` : n < 70 ? `${Math.round(n / 7)} weeks` : `${Math.round(n / 30)} months`;
  return days > 0 ? `in ${amount}` : `${amount} ago`;
}
