import { apiGet, apiPost } from './client';
import type { EntityOverview, EntityRecord, SearchableEntityKinds, SearchGroups } from '@/domain/types';

export interface SearchOptions {
  signal?: AbortSignal;
}

export interface CreateEntityInput {
  kind: 'person' | 'organisation';
  display_name: string;
}

/** `POST /api/entities` — creates a Person or Organisation identity with
 * only a display name; every other field grows through later activity
 * (`identity-schema.mjs`'s `validatePersonCreateInput`/`validateOrganisation
 * CreateInput` fill in the rest server-side). Returns the redacted record
 * plus its canonical `ref`, same shape `fetchEntityOverview`'s `entity`
 * field uses. */
export function createEntity(input: CreateEntityInput, options: SearchOptions = {}): Promise<EntityRecord> {
  return apiPost<EntityRecord>('/api/entities', input, { signal: options.signal });
}

/** `GET /api/entities/search?q=<encoded>&kinds=<kind[,kind]>` — one request. */
export function searchEntities(
  query: string,
  kinds: SearchableEntityKinds,
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
