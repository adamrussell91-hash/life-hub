/**
 * Shapes mirroring the read-only server contracts this slice consumes:
 * `entity-search.mjs` (`/api/entities/search`) and `entity-overview.mjs`
 * (`/api/entities/overview`). Nothing here is authored client-side — the
 * server assembles and authorises every field.
 */

export type EntityKind = 'person' | 'organisation' | 'task';

export interface SearchResult {
  ref: string;
  kind: EntityKind;
  display_label: string;
  supporting_label: string | null;
  href: string | null;
  lifecycle_status: string | null;
  visibility: string;
}

export interface SearchGroups {
  person: SearchResult[];
  organisation: SearchResult[];
  task: SearchResult[];
}

export interface PersonRecord {
  schema_version: number;
  id: string;
  kind: 'person';
  display_name: string;
  sort_name: string | null;
  aliases: string[];
  lifecycle_status: string;
  is_self: boolean;
  retention_reason: string | null;
  retention_review_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationRecord {
  schema_version: number;
  id: string;
  kind: 'organisation';
  display_name: string;
  legal_name: string | null;
  aliases: string[];
  lifecycle_status: string;
  retention_reason: string | null;
  retention_review_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EntityRecord = (PersonRecord | OrganisationRecord) & { ref: string };

export interface RelationshipEndpoint {
  ref: string;
  kind: EntityKind;
  display_label: string;
  supporting_label: string | null;
  href: string | null;
  lifecycle_status: string | null;
  visibility: string;
}

export interface RelationshipLink {
  id: string;
  relationship_type: string;
  status: 'current' | 'ended' | string;
  temporal_mode: 'point' | 'period' | string;
  context_key: string | null;
  occurred_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  source_ref: string;
  target_ref: string;
}

export interface RelationshipEntry {
  link: RelationshipLink;
  endpoint: RelationshipEndpoint;
  direction: 'outgoing' | 'incoming';
}

export interface TimelineEntry {
  id: string;
  kind: 'point' | 'period' | 'change';
  date: string | null;
  end_date: string | null;
  label: string;
  context_key: string | null;
  source_ref: string;
  href: string | null;
}

export interface LinkedRecords {
  tasks: RelationshipEndpoint[];
  communications: RelationshipEndpoint[];
  organisations: RelationshipEndpoint[];
  people: RelationshipEndpoint[];
}

export interface EntityOverview {
  entity: EntityRecord;
  current_relationships: RelationshipEntry[];
  historical_relationships: RelationshipEntry[];
  timeline: TimelineEntry[];
  linked_records: LinkedRecords;
}
