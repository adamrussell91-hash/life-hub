import type { ClareContext } from '@/api/clare-comms';
import { blockPlainText } from '@/lib/inline-promises';

function daysLate(due: string | null, todayKey: string): number | undefined {
  if (!due || due >= todayKey) return undefined;
  return Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
}

export function buildClareContext(input: {
  title: string;
  kind: ClareContext['kind'];
  when: string;
  purpose?: string | null;
  withPeople: Array<{ ref: string; name: string }>;
  alsoConcerned?: Array<{ ref: string; name: string }>;
  attendees?: Array<{ ref: string; name: string }>;
  previousSummaries: Array<{ when: string; summary: string }>;
  ledger: Array<{ direction: 'you_owe' | 'they_owe'; text: string; status: string; due: string | null }>;
  blocks: unknown[];
  summary?: string | null;
  todayKey: string;
  extra?: Partial<ClareContext>;
}): ClareContext {
  return {
    title: input.title,
    kind: input.kind,
    when: input.when,
    purpose: input.purpose ?? null,
    people: [
      ...input.withPeople.map((person) => ({ ...person, role: 'with' as const })),
      ...(input.alsoConcerned ?? []).map((person) => ({ ...person, role: 'also concerned' as const })),
      ...(input.attendees ?? []).map((person) => ({ ...person, role: 'attendee' as const }))
    ],
    previous: input.previousSummaries,
    open_promises: input.ledger
      .filter((item) => item.status === 'open')
      .map((item) => {
        const late = daysLate(item.due, input.todayKey);
        return { direction: item.direction, text: item.text, ...(late !== undefined ? { days_late: late } : {}) };
      }),
    notes: blockPlainText(input.blocks),
    summary: input.summary ?? null,
    ...input.extra
  };
}
