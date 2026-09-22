const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function teachingEventsFromCurriculum(data) {
  const titles = new Map();
  for (const lesson of data?.lessons ?? []) {
    if (typeof lesson?.id === 'string' && lesson.id) {
      titles.set(lesson.id, typeof lesson.title === 'string' && lesson.title ? lesson.title : lesson.id);
    }
  }
  const classTitles = new Map();
  for (const cls of data?.classes ?? []) {
    if (typeof cls?.id === 'string' && cls.id) {
      classTitles.set(cls.id, cls.title || cls.code || cls.id);
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
        time: TIME_KEY.test(row.start_time) ? row.start_time : undefined,
        duration_min: 60,
        title: titles.get(row.lesson_id) || row.lesson_id || 'Lesson',
        class_title: classTitles.get(row.class_id),
        delivery_status: typeof row.delivery_status === 'string' ? row.delivery_status : undefined
      },
      body: ''
    }));
}
