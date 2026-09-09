/**
 * Build a chat-confirm candidate from a Fitness workout template.
 *
 * Do not import netlify/ from browser modules — prepare-web does not publish
 * Functions into Pages, and a missing import kills the whole main.js graph
 * (sign-in never binds → native POST to action="#" → GitHub Pages 405).
 */
import { normalizeLoggerCableType, slugifyWorkoutTitle } from './fitness-logger-draft.js';

/** Matches netlify chat-schema buildPlannedWorkoutSlug (client-safe copy). */
function buildPlannedWorkoutSlug(title) {
  const stem = slugifyWorkoutTitle(title);
  if (!stem || stem === 'workout') return 'workout-planned';
  return `workout-${stem}`;
}

export function buildPlannedCandidateFromTemplate(template, { date, time = '07:30' } = {}) {
  if (!template || typeof template !== 'object') {
    throw new TypeError('template is required');
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('date must be YYYY-MM-DD');
  }
  const clock = typeof time === 'string' && /^\d{2}:\d{2}$/.test(time) ? time : '07:30';
  const slug = buildPlannedWorkoutSlug(template.title);

  return {
    type: 'workout',
    date,
    time: clock,
    slug,
    candidate: {
      type: 'workout',
      date,
      time: clock,
      fields: {
        title: template.title,
        session_kind: template.session_kind ?? 'strength',
        day_type: template.day_type ?? 'workout_45_60',
        status: 'planned',
        focus: Array.isArray(template.focus) ? template.focus : [],
        exercises: (Array.isArray(template.exercises) ? template.exercises : []).map(exercise => ({
          name: exercise?.name,
          ...(exercise?.bench_angle_deg != null ? { bench_angle_deg: exercise.bench_angle_deg } : {}),
          ...(exercise?.intensification != null ? { intensification: exercise.intensification } : {}),
          ...(exercise?.equipment != null ? { equipment: exercise.equipment } : {}),
          sets: (Array.isArray(exercise?.sets) ? exercise.sets : []).map(set => ({
            reps: set?.reps,
            weight_kg: set?.weight_kg,
            cable_type: normalizeLoggerCableType(set?.cable_type)
          }))
        }))
      }
    }
  };
}
