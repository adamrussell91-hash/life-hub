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
  | 'lesson'
  | 'page'
  | 'unit'
  | 'class';

export type SearchableEntityKind =
  | 'person'
  | 'organisation'
  | 'task'
  | 'application'
  | 'program'
  | 'page'
  | 'unit'
  | 'lesson'
  | 'class'
  | 'event'
  | 'meeting';
// A comma-joined list of any SearchableEntityKind — kept as `string` rather
// than an enumerated union of literal combinations, so a caller (the
// generic tag-anything widget in particular) can request any subset of
// kinds without this type needing a new literal added for it.
export type SearchableEntityKinds = string;

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
  application?: SearchResult[];
  program?: SearchResult[];
  [kind: string]: SearchResult[] | undefined;
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
  /** R2 object key for the org crest (people redesign Phase 1), or null. */
  logo_key: string | null;
  lifecycle_status: string;
  retention_reason: string | null;
  retention_review_at: string | null;
  /** R2 object key for crest image; null until uploaded. */
  logo_key?: string | null;
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
  role: string | null;
  context_key: string | null;
  occurred_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  source_ref: string;
  target_ref: string;
  /**
   * Registry-declared, relationship-type-specific data (registry key:
   * `metadata_keys`) — e.g. `professional_relationship`'s
   * `human_label`, a directional human-readable phrasing (e.g. "mentor
   * of") that the generic `role` enum value alone can't express. Always
   * present as an object (possibly empty) as of the `entity-overview.mjs`
   * pass-through added for Feature 1.3; optional here only because older
   * cached/mocked fixtures may omit it.
   */
  metadata?: Record<string, unknown>;
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
  /**
   * The underlying link's target ref. Like `source_ref`, this is NOT
   * necessarily a person ref — for a Task/Communication/Meeting/Event-
   * derived entry it may be the record on the other side of that link.
   * Together with `source_ref`, this is what lets a caller ask "does this
   * timeline entry involve entity X" without assuming which side X was on.
   */
  target_ref: string;
  href: string | null;
  context_href: string | null;
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

export interface SharedContextWithSelf {
  ref: string;
  display_label: string;
  relationship_type: string;
}

export interface EntityOverview {
  entity: EntityRecord;
  current_relationships: RelationshipEntry[];
  historical_relationships: RelationshipEntry[];
  timeline: TimelineEntry[];
  linked_records: LinkedRecords;
  /** Current organisations this person shares with the operator. Empty when
   * there is no self Person, the subject IS self, or there is no overlap. */
  shared_contexts_with_self?: SharedContextWithSelf[];
}

/**
 * Feature 1.4/1.5: a free-text, timestamped note about an entity — "evidence"
 * that a claim (a relationship, a state) is grounded in something someone
 * actually observed, rather than an assumption. `source` records where the
 * observation came from; `linked_ref`, when present, points at the specific
 * meeting/communication/etc. it was captured during (Phase 1 has no UI to
 * set this — see `apps/professional/src/components/observations-tab.ts`).
 */
export type ObservationSource = 'meeting' | 'communication' | 'manual' | 'imported';

export interface ObservationRecord {
  schema_version: number;
  id: string;
  about_ref: string;
  text: string;
  occurred_at: string;
  source: ObservationSource;
  linked_ref: string | null;
  created_at: string;
  updated_at: string;
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
  priority_area?: string | null;
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

/**
 * People Home (Phase 2, Feature 2.1+) — response shapes for the three
 * aggregation endpoints People Home consumes. Field names/shapes mirror
 * `netlify/functions/_shared/people-home-signals.mjs` and
 * `people-cohorts.mjs` exactly, confirmed by direct read of those modules
 * (not inferred from the brief).
 */
export interface PeopleHomeSignalCounts {
  active_relationships: number;
  upcoming_interactions: number;
  recent_relationship_changes: number;
  current_opportunity_windows: number;
}

export interface ReconnectSuggestion {
  link_id: string;
  person_ref: string;
  display_name: string | null;
  days_since_last_interaction: number | null;
  reasons: string[];
  active_shared_contexts: number;
}

/** The two sides of a `professional_relationship` link, as returned by
 * `describePerson` in `people-home-signals.mjs` — `display_name` is null
 * when the referenced person could not be resolved in the scan. */
export interface RelationshipCounterpart {
  ref: string;
  display_name: string | null;
}

export type RelationshipChangeType = 'opened' | 'closed' | 'role_changed';

export interface RelationshipChangeEntry {
  link_id: string;
  change_type: RelationshipChangeType | string;
  changed_at: string;
  source: RelationshipCounterpart;
  target: RelationshipCounterpart;
  role: string | null;
  human_label: string | null;
}

export interface NewConnectionEntry {
  ref: string;
  display_name: string | null;
  created_at: string;
}

export interface DormantReviewEntry {
  link_id: string;
  source: RelationshipCounterpart;
  target: RelationshipCounterpart;
  role: string | null;
  human_label: string | null;
  reasons: string[];
  days_since_last_interaction: number | null;
}

export interface PeopleHomeSignalsResponse {
  signals: PeopleHomeSignalCounts;
  reconnect_suggestions: ReconnectSuggestion[];
  recent_changes: RelationshipChangeEntry[];
  new_connections: NewConnectionEntry[];
  dormant_for_review: DormantReviewEntry[];
}

export interface CohortMember {
  ref: string;
  display_name: string | null;
}

export interface DynamicCohort {
  kind: string;
  key: string;
  label: string;
  organisation_ref: string;
  members: CohortMember[];
}

export interface PeopleCohortsResponse {
  cohorts: DynamicCohort[];
}

export interface PeopleActivityItem {
  id: string;
  kind: 'point' | 'period' | 'change' | string;
  date: string | null;
  end_date: string | null;
  relationship_type: string;
  status: string;
  label: string;
  source_ref: string;
  target_ref: string;
  href: string | null;
}

export interface PeopleActivityResponse {
  items: PeopleActivityItem[];
  next_cursor: string | null;
}

/**
 * Person Brief (Phase 3, Feature 3.1 — `GET /api/people/brief?id=`). Only
 * the synchronous, non-LLM sections `_shared/person-brief.mjs` assembles —
 * "Since you last spoke" and "Talking points" (Feature 3.2) are NOT part of
 * this shape; the view renders those from its own placeholder state, marked
 * with `data-brief-llm-section` for a follow-up task to find and wire up.
 */
export interface PersonBriefNextInteraction {
  kind: 'meeting' | 'event';
  title: string;
  start: string;
  end: string | null;
  time_zone: string;
  location: string | null;
  href: string | null;
}

export interface PersonBriefHeader {
  person: { ref: string; display_name: string; href: string | null };
  role: string | null;
  organisation: { ref: string; display_name: string; href: string | null } | null;
  /** `null` means SOURCE-BRIEF.md section 50's "Empty Brief" copy renders
   * in place of the meeting-meta block; every other Brief section still
   * renders normally either way. */
  next_interaction: PersonBriefNextInteraction | null;
}

export interface PersonBriefOpenLoop {
  ref: string;
  label: string;
  href: string | null;
  status: string;
}

export interface PersonBriefSharedWorkItem {
  kind: 'communication' | 'task' | 'meeting' | 'event' | 'application' | string;
  label: string;
  href: string | null;
  status: string | null;
}

export interface PersonBriefMutualConnection {
  ref: string;
  display_label: string;
  href: string | null;
}

export interface PersonBrief {
  header: PersonBriefHeader;
  who_they_are: string;
  open_loops: PersonBriefOpenLoop[];
  current_shared_work: PersonBriefSharedWorkItem[];
  mutual_connections: PersonBriefMutualConnection[];
}

/**
 * "Since you last spoke" / "Talking points" (Phase 3, Feature 3.2 —
 * `POST /api/people/brief?id=<id>&action=generate`). `since_last_spoke[0]`
 * is always the deterministic opening line ("You last met 3 months ago,
 * at ... . Since then:"), built server-side from real structured data —
 * never generated by the LLM; the remaining entries are the LLM's
 * "since then" bullets. `last_meaningful_interaction` is the ISO date the
 * server anchored the window to (or `null`), included for callers that want
 * to show it separately.
 */
export interface PersonBriefGeneration {
  since_last_spoke: string[];
  talking_points: string[];
  last_meaningful_interaction: string | null;
}

/**
 * Relational Search (Phase 3, Feature 3.3), Layer 1 — structured filters
 * only (`GET /api/people/relational-search?organisation_ref=&role=&text=`).
 * Every filter is optional but at least one must be set; the server
 * rejects an all-empty query with 400 `missing_filter`. Results are never
 * ranked or scored (brief Principle 6) — only filtered, explained via
 * `matched_reasons`, and returned in a stable alphabetical order.
 */
export interface RelationalSearchFilters {
  organisation_ref?: string;
  role?: string;
  text?: string;
}

export interface RelationalSearchResult {
  person_ref: string;
  display_name: string;
  matched_reasons: string[];
}

export interface RelationalSearchResponse {
  results: RelationalSearchResult[];
}

/**
 * `POST /api/people/relational-search?action=plan` (Phase 5, Layer 2 —
 * natural-language relational search). Plans AND executes in one call:
 * `organisation_ref`/`organisation_matched`/`role`/`text` are the RESOLVED
 * Layer 1 filter the model's free-text question was translated into (for
 * UI transparency — "never opaque"), `organisation_name` is the resolved
 * display name (or the model's raw guess, on no match), and `unsupported`/
 * `unsupported_reason` are set instead of a forced bad-fit filter when the
 * question genuinely needs more than organisation/role/text can express.
 */
export interface RelationalSearchPlanResponse {
  organisation_ref: string;
  organisation_name: string;
  organisation_matched: boolean;
  role: string;
  text: string;
  unsupported: boolean;
  unsupported_reason: string;
  results: RelationalSearchResult[];
}

/** `GET /api/relationship-registry` projection — only the fields this app's
 * client code needs (role dropdown sourcing for Relational Search's `role`
 * filter uses `allowed_roles` off the `professional_relationship` entry). */
export interface RelationshipRegistryDeclaration {
  key: string;
  source_kinds: string[];
  target_kinds: string[];
  inverse_label: string;
  cardinality: string;
  temporal_mode: string;
  role_mode: string;
  metadata_keys: string[];
  allowed_visibility: string[];
  allowed_roles?: string[];
}

export interface RelationshipRegistryResponse {
  relationships: RelationshipRegistryDeclaration[];
}

/**
 * Network Ecology (Phase 4) — response shapes mirrored directly from
 * `netlify/functions/_shared/network-ecology-world.mjs`'s
 * `assembleWorldGraph`/`assembleEgoGraph` and
 * `netlify/functions/_shared/habitat-classification.mjs`'s
 * `classifyHabitat`/`computeBridgePeople` (confirmed by direct read of
 * those modules, not inferred).
 */
export type HabitatType = 'forest' | 'reef' | 'savannah' | 'wetland' | 'island';

export interface NetworkEcologyNode {
  ref: string;
  kind: 'person' | 'organisation';
  display_name: string;
}

export interface NetworkEcologyEdge {
  source_ref: string;
  target_ref: string;
  relationship_type: string;
}

export interface NetworkEcologyCluster {
  id: string;
  kind: 'organisation' | 'event';
  label: string;
  member_refs: string[];
  habitat: HabitatType | null;
}

export interface NetworkEcologyBridgePerson {
  ref: string;
  display_name: string;
  organisation_refs: string[];
  description: string;
}

/** `GET /api/network-ecology/world`. */
export interface NetworkEcologyWorld {
  nodes: NetworkEcologyNode[];
  edges: NetworkEcologyEdge[];
  clusters: NetworkEcologyCluster[];
  bridge_people: NetworkEcologyBridgePerson[];
}

/** `GET /api/network-ecology/history?date=` (Phase 4, Feature 4.6 — History
 * mode). Mirrors `NetworkEcologyWorld` exactly, plus the echoed `date` (the
 * server's parsed cutoff instant, ISO-formatted) so the client can confirm
 * exactly what point in time it is displaying. Event (Wetland) clusters are
 * never present here — `clusters` is always `kind: 'organisation'` only,
 * a documented backend scoping decision (see
 * `netlify/functions/_shared/network-ecology-history.mjs`'s own doc
 * comment) — the type does not need to say so itself since `NetworkEcologyCluster`
 * already allows `kind: 'event'` in general. */
export interface NetworkEcologyHistory {
  date: string;
  nodes: NetworkEcologyNode[];
  edges: NetworkEcologyEdge[];
  clusters: NetworkEcologyCluster[];
  bridge_people: NetworkEcologyBridgePerson[];
}

/** `GET /api/network-ecology/ego?ref=&hops=`. */
export interface NetworkEcologyEgo {
  nodes: NetworkEcologyNode[];
  edges: NetworkEcologyEdge[];
}

/** `GET /api/people/self` (Phase 4, Feature 4.4 support — see
 * `netlify/functions/people-self.mjs`). */
export interface SelfPersonRef {
  ref: string;
  display_name: string | null;
}

export interface SelfPersonResponse {
  self: SelfPersonRef | null;
}
