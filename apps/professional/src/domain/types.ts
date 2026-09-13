/**
 * Shapes mirroring the server contracts this hub consumes.
 */

export type EntityKind = 'person' | 'organisation' | 'task' | 'communication';

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
  communication?: SearchResult[];
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

export type CommunicationDirection = 'outbound' | 'inbound';
export type CommunicationChannel =
  | 'email'
  | 'phone'
  | 'message'
  | 'in_person'
  | 'video'
  | 'other';

export interface IncompleteLinksProjection {
  operation_id: string;
  status: string;
  completed_link_ids: string[];
  failed_intent_ids: string[];
  pending_intent_ids: string[];
}

export interface FollowUpOperationProjection {
  operation_id: string;
  status: 'in_progress' | 'incomplete' | 'committed' | string;
  task_id: string | null;
  title: string;
  completed_intent_ids: string[];
  completed_link_ids: string[];
  failed_intent_ids: string[];
  failed_relationships: Array<{
    intent_id: string;
    relationship_type: string;
    target_ref: string;
    error_code?: string;
  }>;
  pending_intent_ids: string[];
}

export interface CommunicationRecord {
  schema_version: number;
  id: string;
  direction: CommunicationDirection;
  channel: CommunicationChannel;
  occurred_at: string;
  subject: string;
  summary: string;
  status: 'completed' | 'received';
  created_at: string;
  updated_at: string;
  incomplete_links?: IncompleteLinksProjection | null;
  follow_up_operation?: FollowUpOperationProjection | null;
}
