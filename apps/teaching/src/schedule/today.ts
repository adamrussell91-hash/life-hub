/**
 * Resolves the "today" date for schedule UI (Home Today/Week, Class current, etc.).
 *
 * Default: wall-clock local YYYY-MM-DD.
 * Overrides (in order): VITE_SCHEDULE_ANCHOR_DATE env, then curriculum
 * `schedule_anchor_date` when running under Vitest (MODE === 'test').
 */
export function localTodayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function resolveScheduleToday(anchorDate?: string): string {
  const envOverride = import.meta.env.VITE_SCHEDULE_ANCHOR_DATE;
  if (typeof envOverride === 'string' && envOverride.trim() !== '') {
    return envOverride.trim();
  }

  if (import.meta.env.MODE === 'test' && anchorDate) {
    return anchorDate;
  }

  return localTodayYmd();
}
