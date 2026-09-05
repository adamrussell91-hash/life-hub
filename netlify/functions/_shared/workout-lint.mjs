// Deterministic protocol lint (Phase 6a): config/chadwick-protocol.md is ~200 lines of
// rules enforced only by model attention. This mechanically checks a proposed workout
// against a handful of the protocol's own numeric/structural rules and surfaces the
// result as a non-blocking warning on the confirm card -- Adam can always override.
//
// Deliberately narrow: only checks that don't require any extra data (no exercise
// library lookups, no new schema fields). The protocol's "≥3 hits per focus muscle"
// rule is skipped -- the plan marks it explicitly optional, and checking it would need
// a target_area cross-reference against the exercise library that isn't loaded here.

const MIN_EXERCISES = 5;
const MAX_EXERCISES = 9;
const MAX_INTENSIFICATION_EXERCISES = 2;
const WARMUP_PATTERN = /warm[\s-]?up/i;

function isStrengthLike(sessionKind) {
  return sessionKind === 'strength' || sessionKind == null;
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
    Array.isArray(exercise?.sets) && exercise.sets.some(set => !set?.cable_type)
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

  if (record.status === 'completed' && /^planned session$/i.test(String(record.title ?? '').trim())) {
    warnings.push('Completed session is still titled "Planned session" — give it a real unique title before it becomes history.');
  }

  return warnings;
}
