export type CalendarSourceId =
  | 'teaching'
  | 'professional'
  | 'tasks'
  | 'health'
  | 'fitness'
  | 'corey';
export const CALENDAR_SOURCES: readonly Readonly<{ id: CalendarSourceId; label: string }>[];
export function listCalendarSources(): readonly Readonly<{ id: CalendarSourceId; label: string }>[];
