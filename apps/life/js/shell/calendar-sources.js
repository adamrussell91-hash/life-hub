/**
 * Shared umbrella calendar sources.
 * Life logged days are live via loadLiveEvents — this registry only names them.
 * Other hub API hosts stay out of this file until those folds land.
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
    status: 'pending'
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    kind: 'archive',
    status: 'pending'
  }
];

export function listCalendarSources() {
  return CALENDAR_SOURCES.map(source => ({ ...source }));
}
