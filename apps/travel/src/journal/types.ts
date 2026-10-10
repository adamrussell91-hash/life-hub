/** Phase 1 journal read-model types (fixtures always use lifecycle `live`). */

export type JournalLifecycle = 'live' | 'deleted' | 'archived';

/** Set when soft-deleted; cascade children reference the parent row id. */
export type JournalDeletedMeta = {
  deleted_at?: string;
  deleted_with?: string;
};

export type JournalLocationSource = 'exif' | 'inferred' | 'manual';

export type JournalTransitionMode = 'flight' | 'train' | 'car' | 'ferry' | 'other';

export interface JournalCoordinates {
  lat: number;
  lon: number;
}

export interface JournalPlace {
  name: string;
}

export interface JournalMedia extends JournalDeletedMeta {
  id: string;
  /** Display URL for Phase 1 fixtures (local path or data URL). */
  url: string;
  width: number;
  height: number;
  lifecycle: JournalLifecycle;
  /** SHA-256 hex of original bytes when known (live API journal). */
  checksum?: string;
  caption?: string;
}

export interface JournalTransitionDisplayOverride {
  local_date?: string;
  departure_label?: string;
  arrival_label?: string;
}

export interface JournalMoment extends JournalDeletedMeta {
  id: string;
  leg_id: string;
  local_date: string;
  media_ids: string[];
  display_order: number;
  lifecycle: JournalLifecycle;
  local_time?: string;
  place?: JournalPlace;
  coordinates?: JournalCoordinates;
  location_source?: JournalLocationSource;
  text?: string;
}

export interface JournalDay extends JournalDeletedMeta {
  id: string;
  leg_id: string;
  local_date: string;
  lifecycle: JournalLifecycle;
  /** True when the day has no moments yet (empty day marker in the story). */
  empty_marker?: boolean;
}

export interface JournalLeg extends JournalDeletedMeta {
  id: string;
  trip_id: string;
  pattern_id: string;
  destination: string;
  timezone: string;
  order: number;
  lifecycle: JournalLifecycle;
  city_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface JournalTransition extends JournalDeletedMeta {
  id: string;
  from_leg_id: string;
  to_leg_id: string;
  mode: JournalTransitionMode;
  lifecycle: JournalLifecycle;
  local_date?: string;
  departure_label?: string;
  arrival_label?: string;
  /** Linked trip itinerary item (flight/train ticket). Journal display only — never mutates bookings on save. */
  itinerary_item_id?: string;
  /** Owner-corrected labels; does not write back to itinerary. */
  display_override?: JournalTransitionDisplayOverride;
}

export interface JournalFixture extends JournalDeletedMeta {
  id: string;
  schema_version: 1;
  trip_id: string;
  title: string;
  revision: number;
  lifecycle: JournalLifecycle;
  legs: JournalLeg[];
  days: JournalDay[];
  moments: JournalMoment[];
  media: JournalMedia[];
  transitions: JournalTransition[];
}
