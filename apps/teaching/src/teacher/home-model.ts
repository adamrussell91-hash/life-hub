import type { ScheduledLesson } from '@/schemas';
import type { CurriculumLessonSummary } from '@/teacher/nav';

export const HOME_ATTENTION_LIMIT = 8;

export function selectUnpublishedChanges(
  lessons: CurriculumLessonSummary[],
  limit = HOME_ATTENTION_LIMIT
): CurriculumLessonSummary[] {
  return lessons
    .filter(
      (lesson) =>
        Boolean(lesson.published_at) &&
        lesson.updated_at > (lesson.published_at as string)
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit);
}

export function selectRecentlyEdited(
  lessons: CurriculumLessonSummary[],
  limit = HOME_ATTENTION_LIMIT
): CurriculumLessonSummary[] {
  return [...lessons]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit);
}

export function selectTodaySchedule(
  scheduled: ScheduledLesson[],
  anchorDate: string
): ScheduledLesson[] {
  return scheduled.filter((entry) => entry.date === anchorDate);
}

export interface WeekDayGroup {
  date: string;
  entries: ScheduledLesson[];
}

/** Monday-start week containing `anchorDate` (YYYY-MM-DD). Omits empty days. */
export function groupWeekSchedule(
  scheduled: ScheduledLesson[],
  anchorDate: string
): WeekDayGroup[] {
  const anchor = parseYmd(anchorDate);
  const monday = startOfWeekMonday(anchor);
  const days: WeekDayGroup[] = [];

  for (let i = 0; i < 7; i += 1) {
    const d = addDays(monday, i);
    const ymd = formatYmd(d);
    const entries = scheduled.filter((e) => e.date === ymd);
    if (entries.length > 0) {
      days.push({ date: ymd, entries });
    }
  }

  return days;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getUTCDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
