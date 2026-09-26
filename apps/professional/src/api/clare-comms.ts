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

export async function clareHandwriting(file: File): Promise<{ text: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return call<{ text: string }>('handwriting', { image: { media_type: file.type, data: btoa(binary) } });
}
