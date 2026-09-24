export const PRIORITY_AREAS = [
  'Curriculum & assessment',
  'Students with disability',
  'Aboriginal education',
  'Wellbeing'
] as const;

export type PriorityArea = (typeof PRIORITY_AREAS)[number];

export const PRIORITY_AREA_MAX = 80;

export function isPriorityArea(value: string | null | undefined): value is PriorityArea {
  return (PRIORITY_AREAS as readonly string[]).includes(value ?? '');
}

export function priorityAreaName(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, ' ') ?? '';
  if (!trimmed || trimmed.length > PRIORITY_AREA_MAX) return null;
  return trimmed;
}

/** Event type stays on `accreditation_category`. Priority is `priority_area`.
 * Older events packed both into `Kind · Area`; those still count toward the area. */
export function splitEventLabels(record: {
  accreditation_category?: string | null;
  priority_area?: string | null;
}): { category: string | null; priority: string | null } {
  const explicit = priorityAreaName(record.priority_area);
  const raw = record.accreditation_category?.trim() ?? '';
  if (!raw) return { category: null, priority: explicit };
  const separator = raw.indexOf(' · ');
  if (separator === -1) return { category: raw, priority: explicit };
  const head = raw.slice(0, separator);
  const tail = raw.slice(separator + 3);
  if (isPriorityArea(tail)) return { category: head || null, priority: explicit ?? tail };
  return { category: raw, priority: explicit };
}
