export type CalendarItemPatch = {
  date?: string;
  start_time?: string | null;
  duration_min?: number;
  title?: string;
  notes?: string;
};

export function itemRecord(item: unknown): Record<string, unknown>;
export function itemType(item: unknown): string;
export function itemId(item: unknown): string;
export function itemTypeLabel(item: unknown): string;
export function canMoveItem(item: unknown): boolean;
export function canResizeItem(item: unknown): boolean;
export function editableFields(item: unknown): Array<'title' | 'date' | 'time' | 'duration' | 'notes'>;
export function newTabHref(
  item: unknown,
  opts?: { routeFor?: (item: unknown) => string | null | undefined; location?: { href: string } | null }
): string | null;
export function newTabLabel(item: unknown): string;
export function itemPatchRequest(
  item: unknown,
  patch: CalendarItemPatch
): { path: string; method: string; body: Record<string, unknown> } | null;
export function saveCalendarItem(
  apiFetch: ((path: string, init?: RequestInit) => Promise<Response>) | undefined,
  item: unknown,
  patch: CalendarItemPatch
): Promise<unknown>;
export function dragPatch(
  item: unknown,
  target: { date: string; start_time?: string | null; end_time?: string | null }
): CalendarItemPatch;
