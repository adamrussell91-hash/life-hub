/**
 * Tie inference — shared constants (Network Ecology TIE-INFERENCE-BRIEF).
 */

/** Records with more people than this yield no pairs (all-staff / whole-school). */
export const TIE_RECORD_PEOPLE_CAP = 12;

/** Max evidence excerpts sent to Claude per candidate. */
export const TIE_MAX_EXCERPTS = 10;

/** Max characters per excerpt (centred on where the pair appears). */
export const TIE_EXCERPT_CHARS = 400;

/** Max Claude calls per kick-off CLI run (overridable via --limit). */
export const TIE_KICKOFF_CALL_CAP = 400;

/** Max Claude calls per nightly scheduled run. */
export const TIE_NIGHTLY_CALL_CAP = 40;

/** Re-classify when evidence count grew by at least this absolute delta. */
export const TIE_RECLASSIFY_MIN_GROWTH = 2;

/** Or by this fraction of last_classified_count. */
export const TIE_RECLASSIFY_GROWTH_RATIO = 0.5;

/** Re-propose a declined pair only if evidence count has at least tripled. */
export const TIE_DECLINED_REPROPOSE_FACTOR = 3;

export const TIE_STATE_KEY = '_ties/state.json';
export const TIE_DECLINED_PAIRS_KEY = '_ties/declined-pairs.json';

export const TIE_PROPOSER = 'ties';

export const TIE_ALLOWED_ROLES = Object.freeze([
  'colleague',
  'former_colleague',
  'mentor',
  'mentee',
  'academic_contact',
  'research_collaborator',
  'recruiter',
  'referee',
  'conference_contact',
  'introduction',
  'other'
]);

export const TIE_SOURCE_IDS = Object.freeze([
  'comms',
  'meetings',
  'events',
  'threads',
  'promises',
  'profiles',
  'organisations',
  'applications',
  'tasks',
  'knowledge'
]);
