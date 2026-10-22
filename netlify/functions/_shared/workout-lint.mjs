// Deterministic protocol lint (Phase 6a): config/chadwick-protocol.md is ~200 lines of
// rules enforced only by model attention. This mechanically checks a proposed workout
// against a handful of the protocol's own numeric/structural rules and surfaces the
// result as a non-blocking warning on the confirm card -- Adam can always override.
//
// Deliberately narrow: only checks that don't require any extra data (no exercise
// library lookups, no new schema fields). The protocol's "≥3 hits per focus muscle"
// rule is skipped -- the plan marks it explicitly optional, and checking it would need
// a target_area cross-reference against the exercise library that isn't loaded here.

import { resolveTrackingType } from '../../../apps/life/js/core/exercise-tracking.js';

const MIN_EXERCISES = 5;
const MAX_EXERCISES = 9;
const MAX_INTENSIFICATION_EXERCISES = 2;
const WARMUP_PATTERN = /warm[\s-]?up/i;

function isStrengthLike(sessionKind) {
  return sessionKind === 'strength' || sessionKind == null;
}

const MAX_INTERVAL_CABLE_REPS = 20;

// The AEKE needs ~30 s to register a finished set and reset, so in a work:rest
// interval block cable stations must alternate with bodyweight ones (the last
// station wraps to the first), and a cable station is a fixed count, not max reps.
// Death By climbs a rep every minute, which only works as bodyweight.
function lintTimedBlocks(exercises) {
  const warnings = [];
  const groups = new Map();
  exercises.forEach(exercise => {
    const key = exercise?.superset_group ?? exercise;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(exercise);
  });
  for (const members of groups.values()) {
    const block = members.find(member => member?.block?.format)?.block;
    if (!block || (block.format !== 'intervals' && block.format !== 'emom')) continue;
    const cable = members.map(member => resolveTrackingType(member) === 'weighted');
    const label = members[0]?.superset_label || members[0]?.name || 'Timed block';
    if (block.format === 'intervals') {
      const backToBack = members.length > 1 && cable.some((isCable, index) => isCable && cable[(index + 1) % members.length]);
      if (backToBack) warnings.push(`${label}: two cable stations run back to back — alternate cable and bodyweight so the AEKE has time to reset.`);
      const heavy = members.some((member, index) => cable[index] && (member.sets ?? []).some(set => !(Number(set?.reps) > 0) || Number(set.reps) > MAX_INTERVAL_CABLE_REPS));
      if (heavy) warnings.push(`${label}: cable stations need a fixed rep count of ${MAX_INTERVAL_CABLE_REPS} or fewer.`);
    }
    if (block.format === 'emom' && members.length === 1 && cable[0]) {
      const reps = (members[0].sets ?? []).map(set => Number(set?.reps) || 0);
      if (reps.length > 2 && reps.every((count, index) => index === 0 || count > reps[index - 1])) {
        warnings.push(`${label}: Death By climbs a rep every minute — make it a bodyweight move, not a cable one.`);
      }
    }
  }
  return warnings;
}

export function lintWorkoutProposal(record) {
  const warnings = [];
  if (!record || record.type !== 'workout') return warnings;
  if (!isStrengthLike(record.session_kind)) return warnings;

  const exercises = Array.isArray(record.exercises) ? record.exercises : [];
  if (exercises.length === 0) return warnings;

  if (exercises.length < MIN_EXERCISES || exercises.length > MAX_EXERCISES) {
    warnings.push(`${exercises.length} exercises — the protocol default is 5-9 per session.`);
  }

  const intensifiedCount = exercises.filter(exercise => exercise?.intensification != null).length;
  if (intensifiedCount > MAX_INTENSIFICATION_EXERCISES) {
    warnings.push(`${intensifiedCount} exercises carry an intensification tag — the protocol caps this at 2 per session.`);
  }

  const missingCableType = exercises.some(exercise => (
    resolveTrackingType(exercise) === 'weighted'
    && Array.isArray(exercise?.sets) && exercise.sets.some(set => !set?.cable_type)
  ));
  if (missingCableType) {
    warnings.push('At least one strength set is missing cable_type.');
  }

  const hasWarmup = exercises.some(exercise => WARMUP_PATTERN.test(exercise?.name ?? ''));
  if (!hasWarmup) {
    warnings.push('No exercise looks like a warmup by name — the protocol requires a 5-minute specific warmup.');
  }

  const setSplitCount = exercises.filter(exercise => /\bset\s+\d+\s*$/i.test(exercise?.name ?? '')).length;
  if (setSplitCount > 0) {
    warnings.push(`${setSplitCount} exercises look like set rows (e.g. "Bar Press set 1") — log one row per exercise with multiple sets, not one exercise per set.`);
  }

  warnings.push(...lintTimedBlocks(exercises));

  if (record.status === 'completed' && /^(?:planned session|strength session)$/i.test(String(record.title ?? '').trim())) {
    warnings.push('Completed session still has a generic title — give it a real unique title before it becomes history.');
  }

  if (record.status === 'planned') {
    const missingCues = exercises.filter(exercise => {
      const cues = exercise?.coach_cues;
      if (!cues || typeof cues !== 'object') return true;
      return !(cues.start || cues.rest || cues.final_set);
    }).length;
    if (missingCues > 0) {
      warnings.push(`${missingCues} exercises are missing coach_cues (start/rest/final_set) — mid-session presence needs them on planned sessions.`);
    }
    const focusCount = Array.isArray(record.focus) ? record.focus.filter(Boolean).length : 0;
    if (record.day_type === 'workout_30' && focusCount > 2) {
      warnings.push(`${focusCount} focus areas on a workout_30 day — protocol default is 2 focuses in the 30-minute window.`);
    }
    if (record.day_type === 'workout_45_60' && focusCount > 0 && focusCount < 2) {
      warnings.push(`${focusCount} focus area on a workout_45_60 day — use the extra room for at least 2 focuses.`);
    }
  }

  return warnings;
}
