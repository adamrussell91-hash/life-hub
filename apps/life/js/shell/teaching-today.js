const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function minutesOf(time) {
  if (!TIME_RE.test(time)) return null;
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

export function todaysLessonsFromCurriculum(data, { date, nowMinutes } = {}) {
  const classes = new Map();
  for (const cls of data?.classes ?? []) {
    if (typeof cls?.id === 'string' && cls.id) classes.set(cls.id, cls);
  }
  const lessonTitles = new Map();
  for (const lesson of data?.lessons ?? []) {
    if (typeof lesson?.id === 'string' && lesson.id) {
      lessonTitles.set(lesson.id, typeof lesson.title === 'string' ? lesson.title : '');
    }
  }

  const rows = (data?.scheduled_lessons ?? [])
    .filter(row => row && typeof row.id === 'string' && row.date === date)
    .filter(row => row.delivery_status !== 'cancelled' && row.delivery_status !== 'skipped')
    .map(row => {
      const cls = classes.get(row.class_id);
      return {
        id: row.id,
        classTitle: cls?.title || cls?.code || 'Class',
        lessonTitle: lessonTitles.get(row.lesson_id) || '',
        startTime: TIME_RE.test(row.start_time) ? row.start_time : null,
        startMinutes: minutesOf(row.start_time),
        order: Number.isFinite(row.schedule_order) ? row.schedule_order : 0
      };
    })
    .sort((a, b) => {
      if (a.startMinutes !== null && b.startMinutes !== null) return a.startMinutes - b.startMinutes;
      if (a.startMinutes !== null) return -1;
      if (b.startMinutes !== null) return 1;
      return a.order - b.order;
    });

  let nextMarked = false;
  return rows.map(row => {
    const isPast = row.startMinutes !== null && typeof nowMinutes === 'number' && row.startMinutes < nowMinutes;
    const isNext = !isPast && !nextMarked;
    if (isNext) nextMarked = true;
    return {
      id: row.id,
      classTitle: row.classTitle,
      lessonTitle: row.lessonTitle,
      startTime: row.startTime,
      isPast,
      isNext
    };
  });
}

export function nextLessonFromCurriculum(data, options) {
  const lessons = todaysLessonsFromCurriculum(data, options);
  return lessons.find(lesson => lesson.isNext) ?? null;
}
