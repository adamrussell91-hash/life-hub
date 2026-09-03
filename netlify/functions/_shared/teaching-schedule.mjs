export function utcIsoWeekday(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function formatYmd(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function generateScheduleDates({ startDate, meetingDays, lessonCount }) {
  const days = [...new Set(meetingDays)].filter(day => day >= 1 && day <= 7).sort((a, b) => a - b);
  if (days.length === 0 || lessonCount < 1) {
    throw Object.assign(new Error('Invalid meetingDays or lessonCount'), {
      status: 400,
      code: 'validation_error'
    });
  }

  const out = [];
  const [year, month, day] = startDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  while (out.length < lessonCount) {
    const ymd = formatYmd(cursor);
    if (days.includes(utcIsoWeekday(ymd))) out.push(ymd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function applyScheduleUnit({
  cls,
  unit,
  existing,
  startDate,
  meetingDays,
  nowIso,
  idFactory
}) {
  const scheduledLessonIds = new Set(
    existing
      .filter(row => row.class_id === cls.id && row.unit_id === unit.id)
      .map(row => row.lesson_id)
  );
  const lessonIds = Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [];
  const missing = lessonIds.filter(lessonId => !scheduledLessonIds.has(lessonId));
  if (missing.length === 0) {
    return { ok: false, code: 'already_scheduled', message: 'Already scheduled' };
  }

  const dates = generateScheduleDates({
    startDate,
    meetingDays,
    lessonCount: missing.length
  });
  const maxOrder = Math.max(0, ...existing.map(row => Number(row.schedule_order) || 0));
  const created = missing.map((lessonId, index) => ({
    id: idFactory(lessonId),
    type: 'scheduled_lesson',
    class_id: cls.id,
    lesson_id: lessonId,
    unit_id: unit.id,
    date: dates[index],
    schedule_order: maxOrder + index + 1,
    delivery_status: 'planned',
    created_at: nowIso,
    updated_at: nowIso,
    schema_version: 1
  }));

  const activeUnitIds = Array.isArray(cls.active_unit_ids) ? cls.active_unit_ids : [];
  return {
    ok: true,
    class: {
      ...cls,
      meeting_days: meetingDays,
      active_unit_ids: activeUnitIds.includes(unit.id) ? activeUnitIds : [...activeUnitIds, unit.id],
      current_unit_id: cls.current_unit_id ?? unit.id,
      current_scheduled_lesson_id: cls.current_scheduled_lesson_id ?? created[0]?.id,
      updated_at: nowIso
    },
    created
  };
}
