/**
 * Mentoring & coaching: one card per relationship. Pure — no DOM, no fetch.
 *
 * Who appears: anyone with a current mentor / mentee relationship role, plus
 * anyone a coaching sheet is about (coachees). Sessions are the meetings
 * linked to that person, plus any meeting holding a coaching sheet about them.
 */

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
}

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
}

export interface MentoringInput {
  people: DirectoryPersonRow[];
  meetings: MeetingRecord[];
  /** Meeting ids linked to each person (from their overview), keyed by person ref. */
  linkedMeetings?: Map<string, Set<string>>;
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

function session(meeting: MeetingRecord): MentoringSession {
  return { meetingId: meeting.id, title: meeting.title, start: meeting.scheduled_start };
}

/** Which directory rows belong on the page, before any per-person reads. */
export function mentoringPeople(people: DirectoryPersonRow[], meetings: MeetingRecord[]): DirectoryPersonRow[] {
  const coached = sheetsAbout(meetings);
  return people.filter(
    (row) => row.lifecycle_status !== 'archived' && (relationshipKind(row) !== null || coached.has(row.ref))
  );
}

export function buildMentoringCards(input: MentoringInput): MentoringCard[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const coached = sheetsAbout(input.meetings);
  const byId = new Map(input.meetings.map((meeting) => [meeting.id, meeting]));
  const cards: MentoringCard[] = [];

  for (const row of mentoringPeople(input.people, input.meetings)) {
    const relation = relationshipKind(row) ?? { kind: 'coachee' as const, detail: null };
    const sheets = (coached.get(row.ref) ?? []).sort((a, b) => b.sheet.updated_at.localeCompare(a.sheet.updated_at));

    const sessionIds = new Set(input.linkedMeetings?.get(row.ref) ?? []);
    for (const { meeting } of sheets) sessionIds.add(meeting.id);
    const sessions = [...sessionIds]
      .map((id) => byId.get(id))
      .filter((meeting): meeting is MeetingRecord => Boolean(meeting) && liveMeeting(meeting!))
      .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
    const past = sessions.filter((meeting) => Date.parse(meeting.scheduled_start) <= nowMs);
    const future = sessions.filter((meeting) => Date.parse(meeting.scheduled_start) > nowMs);
    const last = past[past.length - 1] ?? null;
    const next = future[0] ?? null;
    const sinceLast = last ? (nowMs - Date.parse(last.scheduled_start)) / 86_400_000 : Infinity;

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
      lastSession: last ? session(last) : null,
      nextSession: next ? session(next) : null,
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
      dueCatchUp: !next && sinceLast > CATCH_UP_DAYS
    });
  }

  // Catch-ups first, then the soonest booked session, then by name.
  return cards.sort((a, b) => {
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
