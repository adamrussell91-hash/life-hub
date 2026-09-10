export const INTUITIVE_SCAN_TZ = 'Australia/Sydney';
export const INTUITIVE_SCAN_HOURS = [6, 8, 10, 13, 15, 18] as const;

export type IntuitiveScanMeta = {
  ran_at: string;
  model: string | null;
  raised: number;
  skipped: number;
  judged: number;
  skipped_ai: boolean;
  reason: string | null;
};

export function hourInTimeZone(now: Date, timeZone: string = INTUITIVE_SCAN_TZ): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour: 'numeric',
    hour12: false
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  return hour === 24 ? 0 : hour;
}

/** Six local-day slots — DST-safe because we read Australia/Sydney, not a UTC cron list. */
export function isIntuitiveScanSlot(
  now: Date = new Date(),
  timeZone: string = INTUITIVE_SCAN_TZ
): boolean {
  return (INTUITIVE_SCAN_HOURS as readonly number[]).includes(hourInTimeZone(now, timeZone));
}

export function parseIntuitiveScanMeta(raw: unknown): IntuitiveScanMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.ran_at !== 'string' || !body.ran_at) return null;
  return {
    ran_at: body.ran_at,
    model: typeof body.model === 'string' ? body.model : null,
    raised: Number(body.raised) || 0,
    skipped: Number(body.skipped) || 0,
    judged: Number(body.judged) || 0,
    skipped_ai: Boolean(body.skipped_ai),
    reason: typeof body.reason === 'string' ? body.reason : null
  };
}
