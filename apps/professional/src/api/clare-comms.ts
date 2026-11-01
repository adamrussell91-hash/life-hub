import { apiPost } from '@/api/client';

export type ClareContext = {
  title: string;
  kind: 'comm' | 'meeting' | 'event';
  when: string;
  purpose?: string | null;
  people: Array<{ ref: string; name: string; role: 'with' | 'also concerned' | 'attendee' }>;
  previous: Array<{ when: string; summary: string }>;
  open_promises: Array<{ direction: 'you_owe' | 'they_owe'; text: string; days_late?: number }>;
  notes: string;
  summary?: string | null;
  time_zone?: string;
  purpose_tag?: string | null;
  thread_ref?: string | null;
  channel?: string;
  guides?: Array<{ about: string; guide: string; context: string; moves: string[] }>;
};

export type ClareBrief = { points: Array<{ text: string; source: string }>; owed_line: string | null };
export type ClareSummary = {
  summary: string;
  promises: Array<{ direction: 'you_owe' | 'they_owe'; person_ref: string; text: string; due: string | null }>;
  numbers: Array<{ label: string; value: string }>;
};
export type ClareDraft = { person_ref: string; to: string; subject: string; body: string };

const call = <T>(action: string, extra: object) => apiPost<T>('/api/clare/comms', { action, ...extra });

export const clareBrief = (context: ClareContext) => call<ClareBrief>('brief', { context });
export const clareSummary = (context: ClareContext) => call<ClareSummary>('summary', { context });
export const clareDrafts = (context: ClareContext) => call<{ drafts: ClareDraft[] }>('drafts', { context });
export const clarePurposeCheck = (context: ClareContext) => call<{ met: boolean; note: string }>('purpose_check', { context });
export const clareTaskTitle = (context: { title: string; notes: string }) => call<{ title: string }>('task_title', { context });
export const clareProposeNext = (context: ClareContext) =>
  call<{ date: string; time: string; duration_min: number; reason: string; ghost_id: string; queued: boolean }>('propose_next', { context });

export async function fileBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function clareHandwriting(file: File): Promise<{ text: string }> {
  return call<{ text: string }>('handwriting', { image: { media_type: file.type, data: await fileBase64(file) } });
}

export type ClareMinutesReview = {
  sections: Array<{ heading: string; text: string }>;
  mine: Array<{ text: string; due: string | null }>;
  others: Array<{ text: string; person_ref: string; person_name: string; due: string | null }>;
  unmatched: Array<{ text: string; who_text: string; due: string | null }>;
  decisions: Array<{ text: string; agenda_heading: string | null }>;
  differences: Array<{ text: string }>;
};

export const clareMinutes = (
  context: ClareContext & { agenda_headings: string[] },
  minutes: { pdf: { media_type: 'application/pdf'; data: string } } | { text: string }
) => call<ClareMinutesReview>('minutes', { context, minutes });
