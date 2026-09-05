const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const WRITABLE = new Set(['diary', 'workout', 'meal']);

export function isWritableCalendarType(type) {
  return WRITABLE.has(type);
}

export function slugForLog(type, { meal, time } = {}) {
  if (type === 'meal') {
    return MEALS.includes(meal) ? meal : 'snack';
  }
  const hhmm = String(time ?? '00:00').replace(':', '');
  return `${type}-${hhmm}`;
}

export function inferMealSlot(title, time) {
  const lower = String(title ?? '').trim().toLowerCase();
  if (MEALS.includes(lower)) return lower;
  const hours = typeof time === 'string' ? Number(time.slice(0, 2)) : NaN;
  if (hours < 11) return 'breakfast';
  if (hours < 15) return 'lunch';
  if (hours < 21) return 'dinner';
  return 'snack';
}

export function candidateForLog({ type, title, date, time, notes }) {
  const trimmed = String(title ?? '').trim();
  if (!date) throw new TypeError('date is required');
  if (type === 'workout') {
    if (!trimmed) throw new TypeError('Workout title is required');
    return {
      type: 'workout',
      date,
      ...(time ? { time } : {}),
      notes: notes ?? '',
      fields: {
        title: trimmed,
        status: 'planned',
        session_kind: 'other',
        day_type: 'workout_45_60',
        duration_min: 60,
        exercises: []
      }
    };
  }
  if (type === 'meal') {
    const meal = inferMealSlot(trimmed, time);
    return {
      type: 'meal',
      date,
      ...(time ? { time } : {}),
      notes: MEALS.includes(trimmed.toLowerCase()) ? '' : trimmed,
      fields: {
        meal,
        calories: 0,
        protein_g: 0,
        fat_g: 0,
        sodium_mg: 0,
        calcium_mg: 0,
        polyphenol_score: 0,
        omega3: 'none'
      }
    };
  }
  if (!trimmed && !notes) throw new TypeError('Diary text is required');
  return {
    type: 'diary',
    date,
    ...(time ? { time } : {}),
    notes: notes || trimmed,
    fields: {
      source_agent: 'import'
    }
  };
}
