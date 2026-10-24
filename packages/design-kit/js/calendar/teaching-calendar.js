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

  const dated = (data?.scheduled_lessons ?? [])
    .filter(row => row && typeof row.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date));
  const { rows, alsoBySlot } = placeUntimed(dated, titles);
  const links = lessonLinks(rows, titles);

  return rows
    .map(row => ({
      path: `teaching:${row.id}`,
      record: {
        type: 'scheduled_lesson',
        id: row.id,
        lesson_id: typeof row.lesson_id === 'string' ? row.lesson_id : undefined,
        class_id: typeof row.class_id === 'string' ? row.class_id : undefined,
        date: row.date,
        // A lesson with a date but no period, on a day its class has no period, rides
        // the all-day row. It never invents a 9 am block.
        ...(TIME_KEY.test(row.start_time)
          ? {
            time: row.start_time,
            duration_min: TIME_KEY.test(row.end_time) && row.end_time > row.start_time
              ? minutes(row.end_time) - minutes(row.start_time) : 60
          }
          : { all_day: true }),
        ...(alsoBySlot.has(row.id) ? { also_lessons: alsoBySlot.get(row.id) } : {}),
        title: titles.get(row.lesson_id) || 'Untitled lesson',
        class_title: classTitles.get(row.class_id),
        unit_id: row.unit_id,
        room: row.room,
        period: row.period,
        cycle_day: row.cycle_day,
        planning_status: (() => {
          const lesson = data?.lessons?.find(lesson => lesson.id === row.lesson_id);
          return lesson?.planning_status ?? (Array.isArray(lesson?.blocks) ? (lesson.blocks.length ? 'planned' : 'not_planned') : undefined);
        })(),
        delivery_status: typeof row.delivery_status === 'string' ? row.delivery_status : undefined,
        ...links.get(row.id)
      },
      body: ''
    }));
}

const live = row => row.delivery_status !== 'skipped' && row.delivery_status !== 'rescheduled';

/**
 * A lesson dated from its page has no period. On a day its class has a period, it joins
 * that period's card ("also …") instead of drawing its own block. On a day with no
 * period it stays, untimed, for the all-day row. The same lesson saved twice for one
 * class and day shows once.
 */
function placeUntimed(dated, titles) {
  const seen = new Set();
  const rows = [];
  const alsoBySlot = new Map();
  for (const row of dated) {
    if (TIME_KEY.test(row.start_time)) {
      rows.push(row);
      continue;
    }
    const key = `${row.class_id}|${row.lesson_id}|${row.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const slots = dated
      .filter(other => TIME_KEY.test(other.start_time) && other.class_id === row.class_id && other.date === row.date && live(other))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    if (!slots.length) {
      rows.push(row);
      continue;
    }
    if (slots.some(slot => slot.lesson_id === row.lesson_id)) continue;
    const also = alsoBySlot.get(slots[0].id) ?? [];
    also.push({ id: row.id, lesson_id: row.lesson_id, title: titles.get(row.lesson_id) || 'Untitled lesson' });
    alsoBySlot.set(slots[0].id, also);
  }
  return { rows, alsoBySlot };
}

const slotOrder = (a, b) => a.date.localeCompare(b.date) || String(a.start_time ?? '').localeCompare(String(b.start_time ?? ''));

/**
 * One lesson can be taught over several slots of a class (a poem over Thursday and
 * Friday). Each slot learns which part it is, every slot of its lesson, and the lesson
 * in the class's slot before it (so the card can offer "Same lesson as …").
 */
function lessonLinks(rows, titles) {
  const byClass = new Map();
  for (const row of rows) {
    const key = typeof row.class_id === 'string' ? row.class_id : '';
    byClass.set(key, [...(byClass.get(key) ?? []), row]);
  }
  const out = new Map();
  for (const classRows of byClass.values()) {
    const ordered = [...classRows].sort(slotOrder);
    const byLesson = new Map();
    for (const row of ordered) byLesson.set(row.lesson_id, [...(byLesson.get(row.lesson_id) ?? []), row]);
    ordered.forEach((row, index) => {
      const sessions = byLesson.get(row.lesson_id) ?? [row];
      const before = ordered[index - 1];
      out.set(row.id, {
        ...(sessions.length > 1 ? {
          session_index: sessions.indexOf(row) + 1,
          session_count: sessions.length,
          sessions: sessions.map(s => ({ id: s.id, date: s.date, ...(s.period ? { period: s.period } : {}) }))
        } : {}),
        ...(before && before.lesson_id !== row.lesson_id && typeof before.lesson_id === 'string'
          ? { previous_lesson: { id: before.lesson_id, title: titles.get(before.lesson_id) || 'Untitled lesson' } }
          : {})
      });
    });
  }
  return out;
}
