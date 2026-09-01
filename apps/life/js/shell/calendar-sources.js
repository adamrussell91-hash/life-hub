/**
 * Shared umbrella calendar sources.
 * Empty on purpose: no live feeds, and no Teaching / Knowledge / Tasks APIs.
 * Life’s existing logged-day calendar stays on loadLiveEvents.
 */
export const CALENDAR_SOURCES = [];

export function listCalendarSources() {
  return [...CALENDAR_SOURCES];
}
