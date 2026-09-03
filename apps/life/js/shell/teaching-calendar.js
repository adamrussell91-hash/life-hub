export function teachingEventsFromCurriculum(data) {
  const titles = new Map();
  for (const lesson of data?.lessons ?? []) {
    if (typeof lesson?.id === 'string' && lesson.id) {
      titles.set(lesson.id, typeof lesson.title === 'string' && lesson.title ? lesson.title : lesson.id);
    }
  }

  return (data?.scheduled_lessons ?? [])
    .filter(row => row && typeof row.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .map(row => ({
      path: `teaching:${row.id}`,
      record: {
        type: 'scheduled_lesson',
        id: row.id,
        date: row.date,
        title: titles.get(row.lesson_id) || row.lesson_id || 'Lesson',
        delivery_status: typeof row.delivery_status === 'string' ? row.delivery_status : undefined
      },
      body: ''
    }));
}
