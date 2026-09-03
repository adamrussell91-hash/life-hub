export type ScheduleNeighborRow = {
  lesson_id: string;
  published: boolean;
  schedule_order: number;
  title: string;
};

export type ScheduleNeighbor = {
  lesson_id: string;
  title: string;
};

export function scheduleNeighbors(
  schedule: ScheduleNeighborRow[],
  lessonId: string
): { prev?: ScheduleNeighbor; next?: ScheduleNeighbor } {
  const published = [...schedule]
    .filter((row) => row.published)
    .sort((a, b) => a.schedule_order - b.schedule_order);

  const index = published.findIndex((row) => row.lesson_id === lessonId);
  if (index < 0) return {};

  const result: { prev?: ScheduleNeighbor; next?: ScheduleNeighbor } = {};
  const prev = published[index - 1];
  const next = published[index + 1];
  if (prev) result.prev = { lesson_id: prev.lesson_id, title: prev.title };
  if (next) result.next = { lesson_id: next.lesson_id, title: next.title };
  return result;
}
