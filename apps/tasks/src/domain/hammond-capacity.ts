import type {
  PlanningProfile,
  TimeWindow,
  WeekdayWindows
} from '@/schemas/planning-profile';
import { FALLBACK_WORKDAY } from '@/domain/schedule-compose';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export type DayCapacity = {
  date: string;
  weekday: (typeof WEEKDAY_KEYS)[number];
  work_windows: TimeWindow[];
  protected_windows: TimeWindow[];
  work_source: 'profile' | 'fallback';
  available_minutes: number;
};

function minutesOf(hhmm: string): number | null {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function windowMinutes(windows: TimeWindow[]): number {
  return windows.reduce((sum, w) => {
    const a = minutesOf(w.start);
    const b = minutesOf(w.end);
    if (a == null || b == null || b <= a) return sum;
    return sum + (b - a);
  }, 0);
}

export function weekdayKeyForDate(dateKey: string): (typeof WEEKDAY_KEYS)[number] {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return WEEKDAY_KEYS[d.getUTCDay()]!;
}

export function dayCapacity(
  date: string,
  profile: PlanningProfile | null
): DayCapacity {
  const weekday = weekdayKeyForDate(date);
  const work = profile?.work_windows?.[weekday] ?? [];
  const protectedWindows = profile?.protected_windows?.[weekday] ?? [];
  if (!work.length) {
    const start = minutesOf(FALLBACK_WORKDAY.start)!;
    const end = minutesOf(FALLBACK_WORKDAY.end)!;
    const protectedMins = windowMinutes(protectedWindows);
    return {
      date,
      weekday,
      work_windows: [{ start: FALLBACK_WORKDAY.start, end: FALLBACK_WORKDAY.end }],
      protected_windows: protectedWindows,
      work_source: 'fallback',
      available_minutes: Math.max(0, end - start - protectedMins)
    };
  }
  return {
    date,
    weekday,
    work_windows: work,
    protected_windows: protectedWindows,
    work_source: 'profile',
    available_minutes: Math.max(0, windowMinutes(work) - windowMinutes(protectedWindows))
  };
}

export function protectedSpansForDate(
  date: string,
  profile: PlanningProfile | null
): Array<{ start: number; end: number; title: string; kind: 'protected' }> {
  const cap = dayCapacity(date, profile);
  return cap.protected_windows
    .map((w) => {
      const start = minutesOf(w.start);
      const end = minutesOf(w.end);
      if (start == null || end == null) return null;
      return {
        start,
        end,
        title: w.label || 'Protected time',
        kind: 'protected' as const
      };
    })
    .filter(Boolean) as Array<{
    start: number;
    end: number;
    title: string;
    kind: 'protected';
  }>;
}

export type MultiscalePlan = {
  quarter: Array<{ id: string; title: string }>;
  month: Array<{ id: string; title: string }>;
  week: Array<{ id: string; title: string; project_ids: string[] }>;
};

export function buildMultiscalePlan(input: {
  quarter?: Array<{ id: string; title: string }>;
  month?: Array<{ id: string; title: string }>;
  week?: Array<{ id: string; title: string; project_ids?: string[] }>;
}): MultiscalePlan {
  return {
    quarter: (input.quarter ?? []).slice(0, 3),
    month: (input.month ?? []).slice(0, 3),
    week: (input.week ?? []).slice(0, 3).map((w) => ({
      id: w.id,
      title: w.title,
      project_ids: w.project_ids ?? []
    }))
  };
}

export function emptyWindows(): WeekdayWindows {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}
