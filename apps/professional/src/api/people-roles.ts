import { apiPost } from './client';
import type { UniversalLinkRecord } from './universal-links';
import type { RoleLinkType } from '@/domain/person-roles';

export interface RoleWriteResult {
  link: UniversalLinkRecord;
  /** False when the org chart couldn't follow; the role itself saved. */
  chart_synced: boolean;
}

/** `POST /api/people/roles` — a person's roles and education. */
export function addPersonRole(body: {
  person_ref: string;
  organisation_ref: string;
  relationship_type: RoleLinkType;
  role?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}): Promise<RoleWriteResult> {
  return apiPost('/api/people/roles', { action: 'add', ...body });
}

export function editPersonRole(body: {
  person_ref: string;
  link_id: string;
  role?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}): Promise<RoleWriteResult> {
  return apiPost('/api/people/roles', { action: 'edit', ...body });
}

export function endPersonRole(body: { person_ref: string; link_id: string; valid_to?: string }): Promise<RoleWriteResult> {
  return apiPost('/api/people/roles', { action: 'end', ...body });
}

export function removePersonRole(body: { person_ref: string; link_id: string }): Promise<RoleWriteResult> {
  return apiPost('/api/people/roles', { action: 'remove', ...body });
}
