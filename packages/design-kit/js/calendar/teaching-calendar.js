const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minutes = time => Number(time.slice(0,2))*60 + Number(time.slice(3,5));

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
        lesson_id: typeof row.lesson_id === 'string' ? row.lesson_id : undefined,
        class_id: typeof row.class_id === 'string' ? row.class_id : undefined,
        date: row.date,
        // Untimed lessons still fill the School band (default first period).
        time: TIME_KEY.test(row.start_time) ? row.start_time : '09:00',
        duration_min: TIME_KEY.test(row.start_time) && TIME_KEY.test(row.end_time) && row.end_time > row.start_time
          ? minutes(row.end_time) - minutes(row.start_time) : 60,
        title: titles.get(row.lesson_id) || row.lesson_id || 'Lesson',
        class_title: classTitles.get(row.class_id),
        unit_id: row.unit_id,
        room: row.room,
        period: row.period,
        cycle_day: row.cycle_day,
        planning_status: (() => {
          const lesson = data?.lessons?.find(lesson => lesson.id === row.lesson_id);
          return lesson?.planning_status ?? (Array.isArray(lesson?.blocks) ? (lesson.blocks.length ? 'planned' : 'not_planned') : undefined);
        })(),
        delivery_status: typeof row.delivery_status === 'string' ? row.delivery_status : undefined
      },
      body: ''
    }));
}
