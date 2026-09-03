import { apiPost } from '@/api/client';
import { parseAlchemyResult, type AlchemyResult } from '@/alchemy/connections';

export const DEFAULT_KNOWLEDGE_HUB_ORIGIN = 'https://knowledge-hub.adam-russell.com';

export function knowledgeHubOrigin(): string {
  const baked = import.meta.env.VITE_KNOWLEDGE_HUB_ORIGIN as string | undefined;
  return (baked?.replace(/\/+$/, '') || DEFAULT_KNOWLEDGE_HUB_ORIGIN).replace(/\/+$/, '');
}

export async function runAlchemyLab(lessonText: string): Promise<AlchemyResult> {
  const data = await apiPost<unknown>('/api/alchemy-lab', { lessonText });
  return parseAlchemyResult(data);
}
