/**
 * How an exercise is measured and what it counts toward. The tracking type is
 * never shown as a label: it decides which numbers a set carries, what "better"
 * means for progress, and whether the move feeds kg tonnage / e1RM (weighted
 * only) or its own reps / seconds tracking.
 *
 *  weighted        external load × reps (AEKE K1 cable work). Progress = load / e1RM.
 *  bodyweight_reps reps against bodyweight (push-ups, pull-ups, dips). Optional
 *                  weight_kg is added load. Progress = best reps in a set.
 *  timed           held or performed for time (plank, yoga pose, dead hang, flow).
 *                  Progress = longest duration_sec.
 *  reps_in_time    as many reps as possible in a fixed window (push-ups in 60 s).
 *                  Progress = most reps for the same time_cap_sec.
 */
export const TRACKING_TYPES = ['weighted', 'bodyweight_reps', 'timed', 'reps_in_time'];

/** What the work counts toward in summaries — not which page tile renders it. */
export const COUNTS_AS = ['strength', 'bodyweight', 'mobility', 'conditioning'];

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

const DEFAULT_COUNTS_AS = {
  weighted: 'strength',
  bodyweight_reps: 'bodyweight',
  timed: 'mobility',
  reps_in_time: 'conditioning'
};

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Explicit exercise.tracking wins, then the Exercise Library's tracking_type,
 * then the shape of the sets themselves. Old records with only reps/kg infer
 * as weighted, so nothing about existing workouts changes.
 */
export function resolveTrackingType(exercise, libraryEntry = null) {
  if (TRACKING_TYPES.includes(exercise?.tracking)) return exercise.tracking;
  if (TRACKING_TYPES.includes(libraryEntry?.tracking_type)) return libraryEntry.tracking_type;
  const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
  if (sets.some(set => positive(set?.time_cap_sec))) return 'reps_in_time';
  if (sets.some(set => positive(set?.duration_sec))) return 'timed';
  if (sets.length && sets.every(set => set?.cable_type === 'none' && !positive(set?.weight_kg))) {
    return 'bodyweight_reps';
  }
  return 'weighted';
}

export function resolveCountsAs(trackingType, libraryEntry = null) {
  if (COUNTS_AS.includes(libraryEntry?.counts_as)) return libraryEntry.counts_as;
  return DEFAULT_COUNTS_AS[trackingType] ?? 'strength';
}

/**
 * Best single-set performance for a tracking type, as a comparable number plus
 * the set it came from. reps_in_time only compares sets inside the same window,
 * so the best is keyed by time_cap_sec (the longest window's best wins ties of
 * "which window" only when no window is requested).
 */
export function bestSetPerformance(sets, trackingType, { timeCapSec = null } = {}) {
  let best = null;
  for (const set of Array.isArray(sets) ? sets : []) {
    let value = null;
    if (trackingType === 'timed') {
      value = positive(set?.duration_sec);
    } else if (trackingType === 'reps_in_time') {
      const cap = positive(set?.time_cap_sec);
      if (!cap || (timeCapSec != null && cap !== timeCapSec)) continue;
      value = positive(set?.reps);
    } else if (trackingType === 'bodyweight_reps') {
      value = positive(set?.reps);
    } else {
      value = positive(set?.weight_kg);
    }
    if (value == null) continue;
    if (!best || value > best.value) best = { value, set };
  }
  return best;
}

export function performanceUnit(trackingType) {
  if (trackingType === 'timed') return 'sec';
  if (trackingType === 'weighted') return 'kg';
  return 'reps';
}

/** Human line for one set, used by chat, Confirm cards and the template library. */
export function describeSet(set, trackingType) {
  const added = positive(set?.weight_kg);
  const load = added ? ` +${set.weight_kg} kg` : '';
  if (trackingType === 'timed') {
    const seconds = positive(set?.duration_sec);
    return `${seconds != null ? `${seconds} s` : '— s'} hold${load}`;
  }
  if (trackingType === 'reps_in_time') {
    const cap = positive(set?.time_cap_sec);
    const reps = set?.reps != null ? `${set.reps} reps` : 'max reps';
    return `${reps} in ${cap != null ? `${cap} s` : '— s'}${load}`;
  }
  if (trackingType === 'bodyweight_reps') {
    const reps = set?.reps != null ? `${set.reps} reps` : '— reps';
    return `bodyweight${load} × ${reps}`;
  }
  return null;
}

/**
 * Copy a set keeping the tracking fields, so templates, the logger draft and
 * history never silently drop a hold time or a time window.
 */
export function copyWorkoutSet(set, { cableType } = {}) {
  const out = {
    reps: set?.reps,
    weight_kg: set?.weight_kg,
    cable_type: cableType !== undefined ? cableType : set?.cable_type
  };
  if (set?.duration_sec != null) out.duration_sec = set.duration_sec;
  if (set?.time_cap_sec != null) out.time_cap_sec = set.time_cap_sec;
  return out;
}
