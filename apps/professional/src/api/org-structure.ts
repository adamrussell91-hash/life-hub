import { apiGet, apiPatch, apiPost } from './client';

export interface OrgStructureUnit {
  id: string;
  kind: 'unit';
  name: string;
  organisation_ref: string;
  unit_kind: string;
  order: number;
  lifecycle_status: string;
}

export interface OrgStructurePosition {
  id: string;
  kind: 'position';
  title: string;
  organisation_ref: string;
  unit_ref: string | null;
  is_head: boolean;
  lifecycle_status: string;
}

export interface OrgStructureGraphNode {
  id: string;
  kind: string;
  ref: string;
  name?: string;
  title?: string;
  unit_ref?: string | null;
  is_head?: boolean;
  organisation_ref?: string;
  unit_kind?: string;
  order?: number;
  holder?: {
    person_ref: string;
    display_name: string | null;
    role?: string | null;
    warmth_band: string | null;
  } | null;
}

export interface OrgStructureGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  flag?: string;
  via?: string;
  cycle?: boolean;
  replaces_default?: boolean;
}

export interface OrgStructureGraph {
  organisation_ref: string | null;
  nodes: OrgStructureGraphNode[];
  edges: OrgStructureGraphEdge[];
  members_by_unit: Record<string, Array<{ person_ref: string; role: string | null; link_id: string }>>;
  memberships_by_person: Record<
    string,
    Array<{ unit_ref: string; role: string | null; link_id: string }>
  >;
  member_person_ids: string[];
  member_count: number;
  cycles: string[];
}

export interface OrgStructurePayload {
  organisation_ref: string;
  units: OrgStructureUnit[];
  positions: OrgStructurePosition[];
  links: Array<Record<string, unknown>>;
  graph: OrgStructureGraph;
}

export async function fetchOrgStructure(organisationId: string): Promise<OrgStructurePayload> {
  return apiGet<OrgStructurePayload>(
    `/api/org-structure?organisation_id=${encodeURIComponent(organisationId)}`
  );
}

export async function createOrgUnit(input: {
  organisation_ref: string;
  name: string;
  unit_kind: string;
  order?: number;
}): Promise<OrgStructureUnit> {
  const res = await apiPost<{ unit: OrgStructureUnit }>(
    '/api/org-structure?action=create_unit',
    input
  );
  return res.unit;
}

export async function createOrgPosition(input: {
  organisation_ref: string;
  title: string;
  unit_ref?: string | null;
  is_head?: boolean;
}): Promise<OrgStructurePosition> {
  const res = await apiPost<{ position: OrgStructurePosition }>(
    '/api/org-structure?action=create_position',
    input
  );
  return res.position;
}

export async function patchOrgUnit(
  id: string,
  patch: { name?: string; unit_kind?: string; order?: number }
): Promise<OrgStructureUnit> {
  const res = await apiPatch<{ unit: OrgStructureUnit }>(
    `/api/org-structure?kind=unit&entity_id=${encodeURIComponent(id)}`,
    patch
  );
  return res.unit;
}

export async function patchOrgPosition(
  id: string,
  patch: { title?: string; unit_ref?: string | null; is_head?: boolean }
): Promise<OrgStructurePosition> {
  const res = await apiPatch<{ position: OrgStructurePosition }>(
    `/api/org-structure?kind=position&entity_id=${encodeURIComponent(id)}`,
    patch
  );
  return res.position;
}

export async function createOrgStructureLink(input: {
  organisation_ref: string;
  relationship_type: string;
  source_ref: string;
  target_ref: string;
  role?: string | null;
  valid_from?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ link: Record<string, unknown>; created: boolean }> {
  return apiPost('/api/org-structure?action=create_link', input);
}
