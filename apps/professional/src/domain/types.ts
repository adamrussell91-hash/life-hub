/**
 * Shapes mirroring the server contracts this hub consumes.
 */

export type EntityKind =
  | 'person'
  | 'organisation'
  | 'task'
  | 'communication'
  | 'meeting'
  | 'event'
  | 'application'
  | 'program'
  | 'lesson';

export type SearchableEntityKind = 'person' | 'organisation' | 'task' | 'application' | 'program';

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
  program?: SearchResult[];
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
  meetings?: RelationshipEndpoint[];
  events?: RelationshipEndpoint[];
  applications?: RelationshipEndpoint[];
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

export type MeetingState =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show';

export interface MeetingOccurrenceHistoryEntry {
  scheduled_start: string;
  scheduled_end: string;
  time_zone: string;
  changed_at: string;
  reason?: string;
}

export interface MeetingRecord {
  schema_version: number;
  id: string;
  title: string;
  scheduled_start: string;
  scheduled_end: string;
  time_zone: string;
  location_text: string | null;
  agenda: string | null;
  notes: string | null;
  state: MeetingState;
  occurrence_history: MeetingOccurrenceHistoryEntry[];
  created_at: string;
  updated_at: string;
  incomplete_links?: IncompleteLinksProjection | null;
  preparation_operation?: FollowUpOperationProjection | null;
  follow_up_operation?: FollowUpOperationProjection | null;
}

export type EventOccurrenceState = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
export type AttendanceState = 'registered' | 'attended' | 'partial' | 'absent';

export interface EventCertificate {
  name?: string;
  issued_at?: string | null;
  reference?: string;
}

export interface EventRecord {
  schema_version: number;
  id: string;
  title: string;
  event_type: 'professional_development' | string;
  start: string;
  end: string;
  time_zone: string;
  all_day: boolean;
  occurrence_state: EventOccurrenceState;
  location_text: string | null;
  accreditation_category: string | null;
  hours: number | null;
  attendance_state: AttendanceState | null;
  certificate: EventCertificate | null;
  created_at: string;
  updated_at: string;
  incomplete_links?: IncompleteLinksProjection | null;
  learning_operation?: FollowUpOperationProjection | null;
}

export type ApplicationPipelineStatus =
  | 'drafting'
  | 'ready'
  | 'submitted'
  | 'under_review'
  | 'interviewing'
  | 'offer'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'unsuccessful';

export type ApplicationDocumentType = 'resume' | 'cover_letter' | 'selection_criteria' | 'other';
export type ApplicationDocumentStatus = 'draft' | 'final' | 'submitted';
export type InterviewFormat = 'in_person' | 'video' | 'phone' | 'other';
export type InterviewResult = 'pending' | 'advanced' | 'unsuccessful' | 'withdrawn';
export type InterviewLifecycleState = 'planned' | 'completed' | 'cancelled';
export type OutcomeStatus = 'none' | 'offer' | 'accepted' | 'declined' | 'unsuccessful';
export type RefereeRole = 'professional' | 'character' | 'academic';

/** Allowed next pipeline states — mirrors APPLICATION_PIPELINE_TRANSITIONS. */
export const APPLICATION_PIPELINE_TRANSITIONS: Record<
  ApplicationPipelineStatus,
  readonly ApplicationPipelineStatus[]
> = {
  drafting: ['ready', 'withdrawn'],
  ready: ['submitted', 'drafting', 'withdrawn'],
  submitted: ['under_review', 'interviewing', 'offer', 'unsuccessful', 'withdrawn'],
  under_review: ['interviewing', 'offer', 'unsuccessful', 'withdrawn'],
  interviewing: ['offer', 'unsuccessful', 'withdrawn', 'interviewing'],
  offer: ['accepted', 'declined', 'withdrawn'],
  accepted: [],
  declined: [],
  withdrawn: [],
  unsuccessful: []
};

export interface ApplicationAdvertisement {
  title: string | null;
  url: string | null;
  source: string | null;
  summary: string | null;
  captured_at: string | null;
}

export interface ApplicationDocument {
  id: string;
  document_type: ApplicationDocumentType;
  label: string;
  url: string | null;
  storage_ref: string | null;
  version: string;
  status: ApplicationDocumentStatus;
}

export interface SelectionCriterion {
  id: string;
  criterion: string;
  response: string | null;
  order: number;
  completed: boolean;
}

export interface InterviewRound {
  id: string;
  scheduled_at: string | null;
  time_zone: string | null;
  format: InterviewFormat;
  location_text: string | null;
  preparation_notes: string | null;
  panel_notes: string | null;
  result: InterviewResult | null;
  lifecycle_state: InterviewLifecycleState;
}

export interface ApplicationOutcome {
  status: OutcomeStatus;
  date: string | null;
  offer_details: string | null;
  reason: string | null;
}

export interface ApplicationRecord {
  schema_version: number;
  id: string;
  position_title: string;
  advertisement: ApplicationAdvertisement;
  closing_date: string | null;
  pipeline_status: ApplicationPipelineStatus;
  documents: ApplicationDocument[];
  selection_criteria: SelectionCriterion[];
  interview_rounds: InterviewRound[];
  outcome: ApplicationOutcome;
  reflection: string | null;
  created_at: string;
  updated_at: string;
  /** Resolved from Universal Links (`applies_to`); never copied into Application JSON. */
  organisation?: { ref: string; display_label: string } | null;
  incomplete_links?: IncompleteLinksProjection | null;
  application_action_operation?: FollowUpOperationProjection | null;
}

export interface CareerSectionItem {
  ref?: string;
  id?: string;
  kind?: string;
  display_label?: string;
  supporting_label?: string | null;
  href?: string | null;
  lifecycle_status?: string | null;
  position_title?: string;
  pipeline_status?: string;
  closing_date?: string | null;
  updated_at?: string;
  title?: string;
  event_type?: string;
  start?: string;
  end?: string;
  occurrence_state?: string;
  role?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface CareerSection {
  status: 'ok' | 'unavailable';
  items: CareerSectionItem[];
  reason?: string;
}

export interface CareerOverview {
  applications: CareerSection;
  employment: CareerSection;
  professional_development: CareerSection;
  people: CareerSection;
  organisations: CareerSection;
  deferred: string[];
}
