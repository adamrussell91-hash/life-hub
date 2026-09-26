import { apiPost } from '@/api/client';
import { parseAlchemyResult, type AlchemyResult } from '@/alchemy/connections';

/** Umbrella Knowledge SPA base (no trailing slash). Override with VITE_KNOWLEDGE_HUB_ORIGIN. */
export const DEFAULT_KNOWLEDGE_HUB_ORIGIN = 'https://life-hub.adam-russell.com/knowledge';

export function knowledgeHubOrigin(): string {
  const baked = import.meta.env.VITE_KNOWLEDGE_HUB_ORIGIN as string | undefined;
  return (baked?.replace(/\/+$/, '') || DEFAULT_KNOWLEDGE_HUB_ORIGIN).replace(/\/+$/, '');
}

export async function runAlchemyLab(lessonText: string): Promise<AlchemyResult> {
  const data = await apiPost<unknown>('/api/alchemy-lab', { lessonText });
  return parseAlchemyResult(data);
}
