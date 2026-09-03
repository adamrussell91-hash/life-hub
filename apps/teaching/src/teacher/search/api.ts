import { apiGet } from '@/api/client';
import type { ContentSearchHit } from './types';

export function fetchContentSearch(q: string): Promise<{ hits: ContentSearchHit[] }> {
  const params = new URLSearchParams({ q });
  return apiGet(`/api/search?${params.toString()}`);
}
