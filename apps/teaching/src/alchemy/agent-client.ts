import { apiGet, apiPost, apiPut } from '@/api/client';

export type AgentSource = { noteId: string; title: string; quote: string };
export type AgentProposal = {
  id: string; blockId: string; path: string; oldStr: string; newStr: string; why: string;
  source: AgentSource | null; blockLabel: string; blockType: string;
};
export type AgentResult = { summary: string; proposals: AgentProposal[]; stoppedEarly: boolean; rules?: { id: string; title: string } | null };
export type AgentJob = {
  job: string; kind: 'lesson' | 'unit'; id: string; blockId: string | null; scope: 'lesson' | 'block';
  status: 'working' | 'done' | 'error';
  progress: Array<{ at: string; text: string }>;
  result: AgentResult | null;
  error: { message?: string } | null;
  decisions: Record<string, 'accepted' | 'dismissed'>;
  created_at: string;
};
export type AgentSettings = { rulesNoteId: string | null; rulesNoteTitle: string | null };

export const POLL_MS = 2500;

export function startAgentReview(body: { kind: 'lesson' | 'unit'; id: string; blockId?: string; request?: string }): Promise<AgentJob> {
  return apiPost<AgentJob>('/api/alchemy-agent', body);
}
export function readAgentJob(id: string, signal?: AbortSignal): Promise<AgentJob> {
  return apiGet<AgentJob>(`/api/alchemy-agent?job=${encodeURIComponent(id)}`, { signal });
}
export function latestAgentReview(kind: 'lesson' | 'unit', id: string): Promise<AgentJob | null> {
  return apiGet<AgentJob | null>(`/api/alchemy-agent?kind=${kind}&id=${encodeURIComponent(id)}`);
}
export function recordDecision(job: string, proposal: string, action: 'accepted' | 'dismissed'): Promise<AgentJob> {
  return apiPost<AgentJob>('/api/alchemy-agent', { action, job, proposal });
}
export function readAgentSettings(): Promise<AgentSettings> {
  return apiGet<AgentSettings>('/api/alchemy-agent/settings');
}
export function searchRulesNotes(text: string): Promise<{ notes: Array<{ id: string; title: string }> }> {
  return apiGet(`/api/alchemy-agent/settings?search=${encodeURIComponent(text)}`);
}
export function saveRulesNote(rulesNoteId: string | null): Promise<AgentSettings> {
  return apiPut<AgentSettings>('/api/alchemy-agent/settings', { rulesNoteId });
}

/** Polls a review until it finishes; `onUpdate` hears each state. */
export async function followAgentJob(first: AgentJob, onUpdate: (job: AgentJob) => void, signal: AbortSignal): Promise<AgentJob> {
  let current = first;
  onUpdate(current);
  while (current.status === 'working') {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, POLL_MS);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    current = await readAgentJob(current.job, signal);
    onUpdate(current);
  }
  return current;
}

/** Display text for a patch side: markup removed, spacing tidied. */
export function patchText(value: string): string {
  const text = value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return text || value.trim();
}
