import { apiGet } from './client';
import type { EntityOverview, SearchGroups } from '@/domain/types';

export interface SearchOptions {
  signal?: AbortSignal;
}

/** `GET /api/entities/search?q=<encoded>&kinds=<kind[,kind]>` — one request. */
export function searchEntities(
  query: string,
  kinds: 'person' | 'organisation' | 'person,organisation',
  options: SearchOptions = {}
): Promise<{ groups: SearchGroups }> {
  const params = new URLSearchParams({ q: query, kinds });
  return apiGet<{ groups: SearchGroups }>(`/api/entities/search?${params.toString()}`, {
    signal: options.signal
  });
}

/** `GET /api/entities/overview?ref=<encoded canonical ref>` */
export function fetchEntityOverview(ref: string, options: SearchOptions = {}): Promise<EntityOverview> {
  const params = new URLSearchParams({ ref });
  return apiGet<EntityOverview>(`/api/entities/overview?${params.toString()}`, {
    signal: options.signal
  });
}
