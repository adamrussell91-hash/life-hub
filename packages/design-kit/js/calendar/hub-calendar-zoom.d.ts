export const CALENDAR_ZOOMS: readonly string[];
export function normalizeCalendarZoom(value: unknown): string;
export function calendarZoomHref(hub: string, zoom?: string): string;
export function parseCalendarZoom(
  loc?: { pathname?: string; hash?: string },
  hub?: string
): string | null;
