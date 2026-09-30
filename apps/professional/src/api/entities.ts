import { apiGet, apiPatch, apiPost } from './client';
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

export interface UpdatePersonInput {
  display_name?: string;
  sort_name?: string | null;
  aliases?: string[];
  professional_profile?: {
    summary?: string | null;
    linkedin_url?: string | null;
    current_workplace?: string | string[] | null;
  };
}

/** `PATCH /api/entities?ref=<canonical ref>&action=update` — ordinary
 * Person fields plus optional professional_profile edits (notes / LinkedIn /
 * workplace labels). `is_self` and lifecycle stay off this path. */
export function updatePerson(
  ref: string,
  patch: UpdatePersonInput,
  options: SearchOptions = {}
): Promise<EntityRecord> {
  const params = new URLSearchParams({ ref, action: 'update' });
  return apiPatch<EntityRecord>(`/api/entities?${params.toString()}`, patch, { signal: options.signal });
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

export interface DedupePersonRef {
  ref: string;
  id: string;
  name: string;
}

export interface DedupeAction {
  kind: 'copy' | 'combined' | 'twin';
  remove: DedupePersonRef;
  into: DedupePersonRef[];
  student: boolean;
  links: number;
  blocked: string | null;
}

export interface DedupePlan {
  ready: DedupeAction[];
  kept: DedupeAction[];
  unresolved: Array<{ kind: 'combined'; remove: DedupePersonRef; names: string[]; missing: string[]; links: number }>;
}

export interface DedupeResult {
  done: Array<DedupeAction & { moved: number }>;
  failed: Array<DedupeAction & { error: string }>;
  skipped: string[];
  /** Confirmed ids not reached in this call; send them again. */
  remaining: string[];
}

/** Read-only preview of duplicate Person records in the store. */
export function fetchPeopleDedupePlan(): Promise<DedupePlan> {
  return apiPost<DedupePlan>('/api/entities/admin', { action: 'plan_people_dedupe' });
}

/** Merges the confirmed copies: links move to the kept record, the copy is deleted. */
export function applyPeopleDedupe(confirmIds: string[]): Promise<DedupeResult> {
  return apiPost<DedupeResult>('/api/entities/admin', { action: 'apply_people_dedupe', confirm_ids: confirmIds });
}
