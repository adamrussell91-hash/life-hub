/** Shared display strings for workout exercises (Fitness hero + chat proposals). */

export function formatExerciseTitle(exercise) {
  let title = exercise?.name ?? 'Exercise';
  if (exercise?.bench_angle_deg != null) {
    title += ` @ ${exercise.bench_angle_deg}°`;
  }
  return title;
}

export function formatExerciseSets(exercise) {
  return (exercise?.sets ?? [])
    .map(set => {
      const reps = set.reps != null ? `${set.reps}` : '—';
      const cable = set.cable_type ? ` · ${String(set.cable_type).replaceAll('_', ' ')}` : '';
      const weight = set.weight_kg != null ? `${set.weight_kg} kg` : 'BW';
      return `${weight} × ${reps}${cable}`;
    })
    .join(' · ');
}
