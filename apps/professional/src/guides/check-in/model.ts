// Check-in: the pure parts. No DOM, no network.
import { CHECK_IN_STEP_IDS, type CheckInRecord, type CheckInSummary, type CheckInText } from './types';

export function newCheckIn(input: { id: string; meetingId: string; personRef: string; personName: string; now: string }): CheckInRecord {
  return {
    id: input.id,
    meeting_id: input.meetingId,
    person_ref: input.personRef,
    person_name: input.personName,
    safety: null,
    sides: [],
    lines: {},
    said: '',
    help: [],
    handed_to: '',
    follow_ups: [],
    report: null,
    created_at: input.now,
    updated_at: input.now
  };
}

export function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Adds a side card once, in the order opened. */
export function withSide(record: CheckInRecord, sideId: string): CheckInRecord {
  return record.sides.includes(sideId) ? record : { ...record, sides: [...record.sides, sideId] };
}

/** The step lines, in step order, as the first draft of "what was said". */
export function draftSaid(record: CheckInRecord): string {
  return CHECK_IN_STEP_IDS.map((id) => record.lines[id]?.trim() ?? '').filter(Boolean).join('\n');
}

/** Handover opens with "what was said" drafted from the step lines, unless it's been written. */
export function forHandover(record: CheckInRecord): CheckInRecord {
  return record.said.trim() ? record : { ...record, said: draftSaid(record) };
}

/** True when an opened side card is one that may need a report. */
export function reportMayBeNeeded(record: CheckInRecord, text: CheckInText): boolean {
  return record.sides.some((id) => text.sides.find((s) => s.id === id)?.report);
}

/** Anything worth asking before throwing away. */
export function hasContent(record: CheckInRecord): boolean {
  return Boolean(
    record.safety || record.sides.length || record.said.trim() || record.help.length || record.handed_to.trim()
      || record.follow_ups.length || record.report || Object.values(record.lines).some((l) => l?.trim())
  );
}

/** Follow-ups ticked since the last save: each becomes one task. */
export function newFollowUps(before: string[], after: string[]): string[] {
  return after.filter((item) => !before.includes(item));
}

/** A task title that says what to do and nothing about who or why. */
export function followUpTaskTitle(item: string): string {
  return `Follow-up: ${item}`;
}

export function shortTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** The profile timeline marker: that a check-in happened, and where to find it. Nothing else. */
export function checkInTimelinePoints(list: CheckInSummary[]): Array<{ id: string; at: string; label: string }> {
  return list.map((s) => ({ id: `check_in_${s.id}`, at: s.created_at, label: 'Check-in · see meeting' }));
}
