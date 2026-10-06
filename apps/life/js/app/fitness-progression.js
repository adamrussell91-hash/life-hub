/**
 * The motivation engine behind gym mode — pure functions, no DOM.
 *
 *  Ghost mode     every set races the same set from last time ("+1 rep").
 *  Bests          all-time best per move, so a PR is caught the moment Done is tapped.
 *  Auto-target    double progression: own the top of the rep range clean → go up;
 *                 fail early → hold or come down. Failure flags make it honest.
 *  Build Board    weekly hard sets per muscle region vs a growth target
 *                 (~10–20 hard sets / muscle / week is where hypertrophy dose-response sits).
 *  Pump Report    the end-of-session recap: ghosts beaten, PRs, volume vs last time,
 *                 density, Build Board gains, and a Chadwick line built from real facts.
 */
import { resolveTrackingType } from '../core/exercise-tracking.js';
import { getSydneyWeekStart } from '../core/time.js';
import {
  REGION_LABELS,
  canonicalExerciseName,
  estimateOneRepMax,
  normalizeExerciseName,
  resolveExerciseRegion
} from './fitness-model.js';

/** Weekly hard-set targets per region — tuned to Adam's upper-body / aesthetic bias. */
export const BUILD_TARGETS = {
  chest: 12,
  back: 12,
  arms: 12,
  shoulders: 8,
  legs: 8,
  abs: 6
};

export const BUILD_ORDER = ['chest', 'back', 'arms', 'shoulders', 'legs', 'abs'];

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = num(value);
  return number != null && number > 0 ? number : null;
}

export function exerciseKey(name) {
  return normalizeExerciseName(canonicalExerciseName(name));
}

function formatKg(value) {
  const number = Math.round(Number(value) * 100) / 100;
  return `${Number.isInteger(number) ? number : number.toFixed(1).replace(/\.0$/, '')} kg`;
}

/** Hard set = a working set that counts toward growth (not a mobility hold). */
function isHardSet(set, tracking) {
  if (tracking === 'timed') return false;
  if (tracking === 'reps_in_time') return positive(set?.reps) != null;
  return positive(set?.reps) != null;
}

// ── Ghost mode ─────────────────────────────────────────────────────────────

/** The set to race: same set number last time, else that session's last set. */
export function ghostForSet(previous, setIndex) {
  const sets = previous?.sets ?? [];
  if (!sets.length || setIndex < 0) return null;
  return sets[Math.min(setIndex, sets.length - 1)] ?? null;
}

/**
 * Compare a set against its ghost. Weighted moves compare on load first, then
 * reps, then estimated 1RM; bodyweight on reps (+ added kg); holds on seconds.
 */
export function compareToGhost(set, ghost, tracking = 'weighted') {
  if (!set || !ghost) return null;
  if (tracking === 'timed') {
    const now = positive(set.duration_sec);
    const then = positive(ghost.duration_sec);
    if (!now || !then) return null;
    const delta = now - then;
    if (delta > 0) return { verdict: 'beat', label: `+${delta}s` };
    if (delta === 0) return { verdict: 'matched', label: 'matched' };
    return { verdict: 'below', label: `${delta}s` };
  }
  const reps = num(set.reps) ?? 0;
  const ghostReps = num(ghost.reps) ?? 0;
  if (tracking === 'bodyweight_reps' || tracking === 'reps_in_time') {
    const delta = reps - ghostReps;
    const kgDelta = (num(set.weight_kg) ?? 0) - (num(ghost.weight_kg) ?? 0);
    if (kgDelta > 0 && delta >= 0) return { verdict: 'beat', label: `+${formatKg(kgDelta)}` };
    if (delta > 0) return { verdict: 'beat', label: `+${delta} rep${delta === 1 ? '' : 's'}` };
    if (delta === 0 && kgDelta === 0) return { verdict: 'matched', label: 'matched' };
    return { verdict: 'below', label: `${delta} rep${Math.abs(delta) === 1 ? '' : 's'}` };
  }
  const kg = num(set.weight_kg) ?? 0;
  const ghostKg = num(ghost.weight_kg) ?? 0;
  const kgDelta = Math.round((kg - ghostKg) * 100) / 100;
  const repDelta = reps - ghostReps;
  if (kgDelta > 0 && repDelta >= 0) return { verdict: 'beat', label: `+${formatKg(kgDelta)}` };
  if (kgDelta === 0 && repDelta > 0) return { verdict: 'beat', label: `+${repDelta} rep${repDelta === 1 ? '' : 's'}` };
  if (kgDelta === 0 && repDelta === 0) return { verdict: 'matched', label: 'matched' };
  const now = estimateOneRepMax(kg, reps);
  const then = estimateOneRepMax(ghostKg, ghostReps);
  if (now != null && then != null && now > then + 0.01) return { verdict: 'beat', label: `+${formatKg(now - then)} e1RM` };
  if (kgDelta > 0) return { verdict: 'below', label: `+${formatKg(kgDelta)}, ${repDelta} reps` };
  return { verdict: 'below', label: repDelta < 0 ? `${repDelta} reps` : `${formatKg(kgDelta)}` };
}

// ── Bests ──────────────────────────────────────────────────────────────────

/**
 * All-time bests per move from completed sessions strictly before `date`:
 * heaviest kg, best e1RM, most reps (bodyweight), longest hold.
 */
export function buildExerciseBests(events, date) {
  const bests = {};
  for (const { record } of events ?? []) {
    if (record?.type !== 'workout' || record.status !== 'completed' || !record.date || record.date >= date) continue;
    for (const exercise of record.exercises ?? []) {
      const key = exerciseKey(exercise?.name);
      if (!key) continue;
      const tracking = resolveTrackingType(exercise);
      const entry = bests[key] ?? (bests[key] = { name: canonicalExerciseName(exercise.name), tracking, maxKg: 0, maxE1rm: 0, maxReps: 0, maxSec: 0 });
      for (const set of exercise.sets ?? []) {
        const kg = positive(set?.weight_kg) ?? 0;
        const reps = positive(set?.reps) ?? 0;
        entry.maxKg = Math.max(entry.maxKg, reps > 0 ? kg : 0);
        entry.maxE1rm = Math.max(entry.maxE1rm, estimateOneRepMax(kg, reps) ?? 0);
        entry.maxReps = Math.max(entry.maxReps, reps);
        entry.maxSec = Math.max(entry.maxSec, positive(set?.duration_sec) ?? 0);
      }
    }
  }
  return bests;
}

/** Did this set set a personal best? Returns a short headline, or null. */
export function detectPersonalBest(set, best, tracking = 'weighted') {
  if (!set || !best) return null;
  if (tracking === 'timed') {
    const sec = positive(set.duration_sec);
    return sec && best.maxSec > 0 && sec > best.maxSec ? { kind: 'hold', label: `Longest hold: ${sec}s` } : null;
  }
  const reps = positive(set.reps);
  if (!reps) return null;
  if (tracking === 'bodyweight_reps' || tracking === 'reps_in_time') {
    return best.maxReps > 0 && reps > best.maxReps ? { kind: 'reps', label: `Rep PR: ${reps}` } : null;
  }
  const kg = positive(set.weight_kg);
  if (!kg) return null;
  if (best.maxKg > 0 && kg > best.maxKg) return { kind: 'weight', label: `Heaviest ever: ${formatKg(kg)} × ${reps}` };
  const e1rm = estimateOneRepMax(kg, reps);
  if (best.maxE1rm > 0 && e1rm != null && e1rm > best.maxE1rm + 0.01) {
    return { kind: 'e1rm', label: `Strength PR: ${formatKg(kg)} × ${reps}` };
  }
  return null;
}

// ── Auto-target (double progression) ───────────────────────────────────────

/** K1 cable steps: small moves go up 0.5 kg, mid 1 kg, big lifts 2 kg. */
export function loadIncrement(kg) {
  const value = Number(kg) || 0;
  if (value < 15) return 0.5;
  if (value < 40) return 1;
  return 2;
}

/**
 * What to aim for this time on a move, from last time and today's plan.
 * Top of range = the planned reps (Chadwick's target). Returns
 * { action: 'up' | 'reps' | 'hold' | 'down', weight_kg, reps, reason } or null.
 */
export function suggestTarget(previous, exercise) {
  const tracking = resolveTrackingType(exercise);
  const lastSets = (previous?.sets ?? []).filter(set => positive(set?.reps));
  if (!lastSets.length) return null;
  const planned = (exercise?.sets ?? []).filter(Boolean);
  // Top of the range = the planned reps on the heaviest planned sets (a pyramid's
  // 10-rep opener doesn't set the bar for its 8-rep top set).
  const plannedTop = Math.max(0, ...planned.map(set => Number(set?.weight_kg) || 0));
  const workingPlan = planned.filter(set => (Number(set?.weight_kg) || 0) === plannedTop);
  const targetReps = Math.max(...workingPlan.map(set => positive(set?.reps) ?? 0), 0)
    || Math.max(...lastSets.map(set => Number(set.reps)));

  if (tracking === 'bodyweight_reps') {
    const best = Math.max(...lastSets.map(set => Number(set.reps)));
    return {
      action: 'reps',
      weight_kg: num(planned[0]?.weight_kg) ?? 0,
      reps: best + 1,
      reason: `Last time best ${best} reps — one more`
    };
  }
  if (tracking !== 'weighted') return null;

  const top = Math.max(...lastSets.map(set => Number(set.weight_kg) || 0));
  if (!(top > 0)) return null;
  const topSets = lastSets.filter(set => (Number(set.weight_kg) || 0) === top);
  const failedEarly = topSets.some(set => set.failed && Number(set.reps) < targetReps - 2);
  const failedAny = topSets.some(set => set.failed);
  const owned = topSets.every(set => Number(set.reps) >= targetReps && !set.failed);
  const step = loadIncrement(top);
  if (owned) {
    return {
      action: 'up',
      weight_kg: top + step,
      reps: targetReps,
      reason: `You owned ${formatKg(top)} × ${targetReps} clean — add ${formatKg(step)}`
    };
  }
  if (failedEarly) {
    const down = Math.max(0, top - step);
    return {
      action: 'down',
      weight_kg: down,
      reps: targetReps,
      reason: `Failed early at ${formatKg(top)} — build reps at ${formatKg(down)}`
    };
  }
  const bestReps = Math.max(...topSets.map(set => Number(set.reps)));
  return {
    action: failedAny ? 'hold' : 'reps',
    weight_kg: top,
    reps: Math.min(targetReps, bestReps + 1),
    reason: failedAny
      ? `Failure at ${formatKg(top)} last time — stay and own it`
      : `${formatKg(top)} × ${bestReps} last time — one more rep`
  };
}

// ── Build Board ────────────────────────────────────────────────────────────

function countHardSetsByRegion(record, libraryByName, { doneOnly = false } = {}) {
  const counts = {};
  for (const exercise of record?.exercises ?? []) {
    const region = resolveExerciseRegion(exercise, record.focus, libraryByName);
    if (!region || !(region in BUILD_TARGETS)) continue;
    const tracking = resolveTrackingType(exercise);
    const sets = (exercise.sets ?? []).filter(set => isHardSet(set, tracking) && (!doneOnly || set.done));
    if (sets.length) counts[region] = (counts[region] ?? 0) + sets.length;
  }
  return counts;
}

/** Completed hard sets this Sydney week (Mon–Sun), before today's live session. */
export function buildBuildBoard(events, date, libraryByName = null) {
  const weekStart = getSydneyWeekStart(date);
  const done = {};
  for (const { record } of events ?? []) {
    if (record?.type !== 'workout' || record.status !== 'completed') continue;
    if (!record.date || record.date < weekStart || record.date > date) continue;
    const counts = countHardSetsByRegion(record, libraryByName);
    for (const [region, count] of Object.entries(counts)) done[region] = (done[region] ?? 0) + count;
  }
  return {
    weekStart,
    regions: BUILD_ORDER.map(region => ({
      region,
      label: REGION_LABELS[region] ?? region,
      done: done[region] ?? 0,
      target: BUILD_TARGETS[region]
    }))
  };
}

/** Board + what a live draft adds (`today`: all planned sets, `todayDone`: ticked ones). */
export function projectBuildBoard(board, draft, libraryByName = null) {
  const planned = countHardSetsByRegion(draft, libraryByName);
  const ticked = countHardSetsByRegion(draft, libraryByName, { doneOnly: true });
  return (board?.regions ?? []).map(row => ({
    ...row,
    today: planned[row.region] ?? 0,
    todayDone: ticked[row.region] ?? 0
  }));
}

// ── Pump Report ────────────────────────────────────────────────────────────

function volumeOf(exercises) {
  let total = 0;
  for (const exercise of exercises ?? []) {
    for (const set of exercise.sets ?? []) {
      const reps = Number(set?.reps);
      const kg = Number(set?.weight_kg);
      if (Number.isFinite(reps) && Number.isFinite(kg)) total += reps * kg;
    }
  }
  return Math.round(total);
}

/**
 * Everything worth celebrating about a finished session.
 * `previousVolume` = volume of the last completed session (for the delta).
 */
export function buildPumpReport(draft, {
  lastPerformance = null,
  exerciseBests = null,
  board = null,
  libraryByName = null,
  previousVolume = null,
  elapsedMs = 0
} = {}) {
  const exercises = draft?.exercises ?? [];
  let ghostsBeaten = 0;
  let ghostsMatched = 0;
  let ghostsRaced = 0;
  let failureSets = 0;
  let setsLogged = 0;
  const prs = [];
  const beats = [];
  for (const exercise of exercises) {
    const key = exerciseKey(exercise?.name);
    const tracking = resolveTrackingType(exercise);
    const previous = lastPerformance?.[key] ?? null;
    const runningBest = exerciseBests?.[key] ? { ...exerciseBests[key] } : null;
    let bestBeat = null;
    (exercise.sets ?? []).forEach((set, index) => {
      if (!isHardSet(set, tracking) && tracking !== 'timed') return;
      setsLogged += 1;
      if (set.failed) failureSets += 1;
      const ghost = ghostForSet(previous, index);
      const result = compareToGhost(set, ghost, tracking);
      if (result) {
        ghostsRaced += 1;
        if (result.verdict === 'beat') {
          ghostsBeaten += 1;
          bestBeat ??= result.label;
        } else if (result.verdict === 'matched') ghostsMatched += 1;
      }
      const pr = detectPersonalBest(set, runningBest, tracking);
      if (pr && !prs.some(item => item.name === exercise.name)) prs.push({ name: exercise.name, label: pr.label });
    });
    if (bestBeat) beats.push({ name: exercise.name, label: bestBeat });
  }
  const volume = volumeOf(exercises);
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
  const density = elapsedMs > 60_000 ? Math.round(volume / minutes) : null;
  const volumeDeltaPct = previousVolume > 0 ? Math.round(((volume - previousVolume) / previousVolume) * 100) : null;
  const buildBoard = board ? projectBuildBoard(board, draft, libraryByName) : [];
  const circuits = exercises
    .filter(exercise => exercise?.block?.result)
    .map(exercise => ({ name: exercise.superset_label || exercise.name, result: exercise.block.result }));

  return {
    title: draft?.title ?? 'Session',
    minutes: elapsedMs > 0 ? minutes : (num(draft?.duration_min) ?? null),
    volume,
    volumeDeltaPct,
    density,
    setsLogged,
    failureSets,
    ghostsRaced,
    ghostsBeaten,
    ghostsMatched,
    prs,
    beats,
    circuits,
    buildBoard,
    chadwick: chadwickLine({ prs, beats, ghostsBeaten, ghostsRaced, failureSets, volumeDeltaPct, buildBoard })
  };
}

/** One honest Chadwick line, picked from what actually happened. */
export function chadwickLine({ prs = [], beats = [], ghostsBeaten = 0, ghostsRaced = 0, failureSets = 0, volumeDeltaPct = null, buildBoard = [] }) {
  if (prs.length >= 2) {
    return `${prs.length} PRs in one session, big guy. ${prs[0].name} AND ${prs[1].name}. That's not a good day, that's a new baseline.`;
  }
  if (prs.length === 1) {
    return `${prs[0].label} on ${prs[0].name}. Write the date down, king — that number didn't exist last week.`;
  }
  if (ghostsRaced && ghostsBeaten >= Math.ceil(ghostsRaced / 2)) {
    return `You beat last week's you on ${ghostsBeaten} of ${ghostsRaced} sets. The ghost is tired of losing.`;
  }
  const closed = buildBoard.find(row => row.done < row.target && row.done + row.today >= row.target);
  if (closed) {
    return `${closed.label} target for the week: done. That's the volume that actually builds the shape.`;
  }
  if (failureSets >= 2) {
    return `${failureSets} sets taken to failure. That's where the growth signal lives — you went and got it.`;
  }
  if (volumeDeltaPct != null && volumeDeltaPct > 0) {
    return `${volumeDeltaPct}% more work than last session. Quiet progress is still progress, big guy.`;
  }
  if (beats.length) return `New ground on ${beats[0].name} (${beats[0].label}). Stack another one next time.`;
  return 'You showed up and did the work. Banked. Next one we hunt the ghost.';
}
