import type { LedgerItem, MeetingDecision, MeetingMinutes, MeetingRecord } from '@/domain/types';

export const PDF_MAX_BYTES = 4_000_000;
const DECISIONS_MAX = 50;

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Add minutes decisions not already on the meeting. Ids run dm_1, dm_2… */
export function mergeMinutesDecisions(
  existing: MeetingDecision[],
  incoming: Array<{ text: string; agenda_heading: string | null }>
): { decisions: MeetingDecision[]; added: number } {
  const seen = new Set(existing.map((decision) => norm(decision.text)));
  let n = existing.reduce((max, decision) => Math.max(max, Number(/^dm_(\d+)$/.exec(decision.id)?.[1] ?? 0)), 0);
  const decisions = [...existing];
  let added = 0;
  for (const decision of incoming) {
    if (decisions.length >= DECISIONS_MAX || seen.has(norm(decision.text))) continue;
    seen.add(norm(decision.text));
    decisions.push({ id: `dm_${++n}`, text: decision.text, agenda_heading: decision.agenda_heading, source: 'minutes' });
    added += 1;
  }
  return { decisions, added };
}

/** Notes rebuild their own decisions; minutes ones stay. */
export function keepMinutesDecisions(
  existing: MeetingDecision[],
  fromNotes: Array<{ text: string; agenda_heading: string | null }>
): MeetingDecision[] {
  const notes = fromNotes.map((decision, index) => ({ id: `d_${index + 1}`, ...decision }));
  return [...notes, ...existing.filter((decision) => decision.source === 'minutes')].slice(0, DECISIONS_MAX);
}

/** Adam's minutes actions are owed to the chair, else the first attendee. */
export function ownerForMine(attendees: Array<{ ref: string; role: string | null }>): string | null {
  return (attendees.find((attendee) => attendee.role === 'chair') ?? attendees[0])?.ref ?? null;
}

export function savedLine(counts: MeetingMinutes['saved_counts']): string {
  const bits = [
    [counts.tasks, 'task'], [counts.promises, 'promise'], [counts.decisions, 'decision']
  ].filter(([n]) => (n as number) > 0).map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`);
  if (!bits.length) return 'Nothing new to add.';
  return `Added ${bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0]}.`;
}

export type MinutesSaveDeps = {
  uploadFile: (meetingId: string, data: string) => Promise<{ file_key: string }>;
  createLedgerItem: (body: { person_ref: string; direction: 'you_owe' | 'they_owe'; text: string; comm_ref: string; due?: string | null }) => Promise<{ item: LedgerItem; created: boolean }>;
  makeActionTask: (item: LedgerItem, sourceRef: string) => Promise<LedgerItem>;
  createLooseTask: (title: string, sourceRef: string) => Promise<void>;
  saveMeeting: (patch: { minutes: MeetingMinutes; decisions: MeetingDecision[] }) => Promise<MeetingRecord>;
  now?: () => Date;
};

export type MinutesSaveInput = {
  record: MeetingRecord;
  meetingRef: string;
  attendees: Array<{ ref: string; role: string | null }>;
  pdfData: string | null;
  sections: MeetingMinutes['sections'];
  mine: Array<{ text: string; due: string | null }>;
  others: Array<{ text: string; person_ref: string; due: string | null }>;
  decisions: Array<{ text: string; agenda_heading: string | null }>;
};

/** Save what Adam ticked. Ledger create is idempotent, so a replaced set of minutes never doubles up. */
export async function saveMinutesReview(input: MinutesSaveInput, deps: MinutesSaveDeps): Promise<{ record: MeetingRecord; counts: MeetingMinutes['saved_counts'] }> {
  const { record, meetingRef } = input;
  const fileKey = input.pdfData ? (await deps.uploadFile(record.id, input.pdfData)).file_key : record.minutes?.file_key ?? null;
  const counts = { tasks: 0, promises: 0, decisions: 0 };
  const owedTo = ownerForMine(input.attendees);
  for (const action of input.mine) {
    if (!owedTo) {
      await deps.createLooseTask(action.text, meetingRef);
      counts.tasks += 1;
      continue;
    }
    const { item, created } = await deps.createLedgerItem({ person_ref: owedTo, direction: 'you_owe', text: action.text, comm_ref: meetingRef, due: action.due });
    if (!created) continue;
    await deps.makeActionTask(item, meetingRef);
    counts.tasks += 1;
  }
  for (const action of input.others) {
    const { created } = await deps.createLedgerItem({ person_ref: action.person_ref, direction: 'they_owe', text: action.text, comm_ref: meetingRef, due: action.due });
    if (created) counts.promises += 1;
  }
  const merged = mergeMinutesDecisions(record.decisions ?? [], input.decisions);
  counts.decisions = merged.added;
  const minutes: MeetingMinutes = {
    sections: input.sections,
    file_key: fileKey,
    source: 'page',
    added_at: (deps.now?.() ?? new Date()).toISOString(),
    saved_counts: counts
  };
  return { record: await deps.saveMeeting({ minutes, decisions: merged.decisions }), counts };
}
