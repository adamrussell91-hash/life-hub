import { apiPost } from '@/api/client';

/** A new page in Knowledge › Notes. Used for "Make note" on a PD talk. */
export function createKnowledgeNote(
  body: { title: string; body: string; tags: string[] },
  options: { signal?: AbortSignal } = {}
): Promise<{ id: string; title: string }> {
  return apiPost('/api/knowledge/pages', { title: body.title, body: body.body, area: 'notes', tags: body.tags }, { signal: options.signal });
}
