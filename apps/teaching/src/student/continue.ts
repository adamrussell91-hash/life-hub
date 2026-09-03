import type { PublishedClassScheduleRow } from '@/student/published-class';

export function publishedSchedule(
  schedule: PublishedClassScheduleRow[]
): PublishedClassScheduleRow[] {
  return [...schedule]
    .filter((row) => row.published)
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return a.schedule_order - b.schedule_order;
    });
}

export function pickStudentContinue(
  schedule: PublishedClassScheduleRow[],
  today: string
): PublishedClassScheduleRow | null {
  const published = publishedSchedule(schedule);
  if (published.length === 0) return null;

  const todayRow = published.find((row) => row.date === today);
  if (todayRow) return todayRow;

  const upcoming = published.find((row) => row.date > today);
  if (upcoming) return upcoming;

  return published[published.length - 1] ?? null;
}

export function continueLabel(date: string, today: string): string {
  if (date === today) return "Today's lesson";
  if (date > today) return 'Up next';
  return 'Continue';
}
