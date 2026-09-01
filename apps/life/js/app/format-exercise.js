/** Shared display strings for workout exercises (Fitness hero + chat proposals). */

const CABLE_LABELS = {
  constant_force: 'constant force',
  concentric: 'concentric',
  eccentric: 'eccentric',
  elastic: 'elastic',
  rowing: 'rowing',
  none: 'none (not on cables)'
};

export function formatCableType(value) {
  if (value == null || value === '') return '';
  return CABLE_LABELS[value] ?? String(value).replaceAll('_', ' ');
}

export function formatExerciseTitle(exercise) {
  let title = exercise?.name ?? 'Exercise';
  if (exercise?.bench_angle_deg != null) {
    title += ` @ ${exercise.bench_angle_deg}°`;
  }
  return title;
}

export function formatExerciseSetCount(exercise) {
  const count = Array.isArray(exercise?.sets) ? exercise.sets.length : 0;
  return count === 1 ? '1 set' : `${count} sets`;
}

export function formatExerciseSets(exercise) {
  return (exercise?.sets ?? [])
    .map((set, index) => {
      const reps = set.reps != null ? `${set.reps} reps` : '— reps';
      const weight = set.weight_kg != null ? `${set.weight_kg} kg` : 'bodyweight';
      const cable = set.cable_type
        ? ` · cable: ${formatCableType(set.cable_type)}`
        : '';
      return `Set ${index + 1}: ${weight} × ${reps}${cable}`;
    })
    .join('\n');
}

export function humanizeFieldLabel(key) {
  const labels = {
    title: 'Title',
    session_kind: 'Session kind',
    day_type: 'Day type',
    status: 'Status',
    duration_min: 'Duration (min)',
    avg_hr: 'Avg HR',
    calories_kcal: 'Calories (kcal)',
    distance_km: 'Distance (km)',
    recovery_flag_next_day: 'Recovery flag next day',
    meal: 'Meal',
    calories: 'Calories',
    protein_g: 'Protein (g)',
    fat_g: 'Fat (g)',
    carbs_g: 'Carbs (g)',
    sodium_mg: 'Sodium (mg)',
    calcium_mg: 'Calcium (mg)',
    polyphenol_score: 'Polyphenol score',
    omega3: 'Omega-3',
    weight_kg: 'Weight (kg)',
    body_fat_pct: 'Body fat %',
    routine: 'Routine',
    completed: 'Completed',
    mood: 'Mood',
    mood_score: 'Mood score',
    energy: 'Energy',
    notes: 'Notes'
  };
  if (labels[key]) return labels[key];
  return String(key).replaceAll('_', ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}
