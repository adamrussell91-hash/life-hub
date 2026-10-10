/**
 * The one list of entity kinds the "@ tag anything" search can find, and
 * the words people see for them. Every hub's tagger reads this, so a kind
 * added to `/api/entities/search` shows up everywhere at once instead of
 * in whichever hub remembered to add it to its own copy.
 */

/** Every kind `/api/entities/search` can return, in display order. */
export const TAGGABLE_KINDS = Object.freeze([
  'person',
  'organisation',
  'event',
  'meeting',
  'page',
  'unit',
  'lesson',
  'class',
  'task',
  'goal',
  'project',
  'program',
  'application',
  'achievement',
  'future',
  'stepping_stone',
  'communication'
]);

const KIND_LABELS = Object.freeze({
  person: 'Person',
  organisation: 'Organisation',
  event: 'Event',
  meeting: 'Meeting',
  page: 'Knowledge note',
  unit: 'Teaching unit',
  lesson: 'Lesson',
  class: 'Class',
  task: 'Task',
  goal: 'Goal',
  project: 'Project',
  program: 'Program',
  application: 'Job application',
  achievement: 'Achievement',
  future: 'Career future',
  stepping_stone: 'Stepping stone',
  communication: 'Communication'
});

const KIND_GROUP_LABELS = Object.freeze({
  person: 'People',
  organisation: 'Organisations',
  event: 'Events',
  meeting: 'Meetings',
  page: 'Knowledge notes',
  unit: 'Teaching units',
  lesson: 'Lessons',
  class: 'Classes',
  task: 'Tasks',
  goal: 'Goals',
  project: 'Projects',
  program: 'Programs',
  application: 'Job applications',
  achievement: 'Achievements',
  future: 'Career futures',
  stepping_stone: 'Stepping stones',
  communication: 'Communications'
});

/**
 * The category buttons above the search. Picking one searches only those
 * kinds, so the server only opens the stores that hold them.
 */
export const KIND_FILTERS = Object.freeze([
  { id: 'people', label: 'People', kinds: ['person'] },
  { id: 'organisations', label: 'Organisations', kinds: ['organisation'] },
  { id: 'events', label: 'Events & meetings', kinds: ['event', 'meeting'] },
  { id: 'notes', label: 'Knowledge notes', kinds: ['page'] },
  { id: 'teaching', label: 'Teaching', kinds: ['unit', 'lesson', 'class'] },
  { id: 'tasks', label: 'Tasks & goals', kinds: ['task', 'goal', 'project', 'program'] },
  { id: 'career', label: 'Career', kinds: ['application', 'achievement', 'future', 'stepping_stone'] },
  { id: 'communications', label: 'Communications', kinds: ['communication'] }
]);

function fallbackLabel(kind) {
  return kind.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** "page" → "Knowledge note". Used on a single result or chip. */
export function kindLabel(kind) {
  if (typeof kind !== 'string' || !kind) return null;
  return KIND_LABELS[kind] ?? fallbackLabel(kind);
}

/** "page" → "Knowledge notes". Used as a results subheading. */
export function kindGroupLabel(kind) {
  if (typeof kind !== 'string' || !kind) return '';
  return KIND_GROUP_LABELS[kind] ?? fallbackLabel(kind);
}
