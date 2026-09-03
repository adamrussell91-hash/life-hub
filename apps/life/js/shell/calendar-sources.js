/**
 * Shared umbrella calendar sources.
 * Life logged days are live via loadLiveEvents — this registry only names them.
 * Other hub API hosts stay out of this file. Teaching, Knowledge, and Tasks
 * events load from same-origin umbrella handlers.
 */
export const CALENDAR_SOURCES = [
  {
    id: 'life',
    label: 'Life Hub',
    kind: 'logged-days',
    status: 'live'
  },
  {
    id: 'teaching',
    label: 'Teaching',
    kind: 'scheduled-lessons',
    status: 'live'
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    kind: 'archive',
    status: 'live'
  },
  {
    id: 'tasks',
    label: 'Tasks',
    kind: 'board',
    status: 'live'
  }
];

export function listCalendarSources() {
  return CALENDAR_SOURCES.map(source => ({ ...source }));
}
