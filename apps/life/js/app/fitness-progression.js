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
import { addCalendarDays, daysBetween, getSydneyWeekStart } from '../core/time.js';
import { formatBlockResult } from '../core/workout-plan-groups.js';
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
 * Stable key for a named circuit (Cindy / Pump & Dump). Strip trailing edition
 * words so "Pump & Dump finisher" still finds last week's "Pump & Dump", and
 * fold Cindy nicknames onto one family — the score is the whole AMRAP, not the
 * individual push-up / dip / twist / crunch ghosts.
 */
export function circuitFamilyKey(label) {
  const raw = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\b(?:finisher|remix|edition|lite|style)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  if (/\bcindy\b/.test(raw) || raw === 'pump dump' || raw === 'pump & dump') return 'cindy';
  return raw.replace(/\s*&\s*/g, ' & ');
}

/** True when this exercise is a member of a circuit block (score the block, not the set). */
export function isCircuitMember(exercise, exercises = []) {
  if (exercise?.block?.kind === 'circuit') return true;
  const group = exercise?.superset_group;
  if (group == null) return false;
  return exercises.some(item => (
    item?.superset_group === group && item?.block?.kind === 'circuit'
  ));
}

/**
 * Compare a live circuit score to last time's. AMRAP: more rounds (+ extra reps)
 * wins. For-time: same (or more) rounds in less time wins.
 */
export function compareCircuitGhost(now, then, format = 'amrap') {
  if (!now || !then) return null;
  const nowRounds = num(now.rounds) ?? 0;
  const thenRounds = num(then.rounds) ?? 0;
  const nowExtra = num(now.extra_reps) ?? 0;
  const thenExtra = num(then.extra_reps) ?? 0;
  const roundDelta = nowRounds - thenRounds;
  if (format === 'for_time') {
    const nowTime = positive(now.time_sec);
    const thenTime = positive(then.time_sec);
    if (roundDelta > 0) {
      return { verdict: 'beat', label: `+${roundDelta} round${roundDelta === 1 ? '' : 's'}` };
    }
    if (roundDelta < 0) return { verdict: 'below', label: `${roundDelta} rounds` };
    if (nowTime != null && thenTime != null) {
      const delta = thenTime - nowTime;
      if (delta > 0) return { verdict: 'beat', label: `−${delta}s` };
      if (delta === 0) return { verdict: 'matched', label: 'matched' };
      return { verdict: 'below', label: `+${Math.abs(delta)}s` };
    }
    return null;
  }
  const nowScore = nowRounds * 1000 + nowExtra;
  const thenScore = thenRounds * 1000 + thenExtra;
  const extraDelta = nowExtra - thenExtra;
  if (nowScore > thenScore) {
    if (roundDelta > 0) {
      return { verdict: 'beat', label: `+${roundDelta} round${roundDelta === 1 ? '' : 's'}` };
    }
    return { verdict: 'beat', label: `+${extraDelta} extra rep${Math.abs(extraDelta) === 1 ? '' : 's'}` };
  }
  if (nowScore === thenScore) return { verdict: 'matched', label: 'matched' };
  if (roundDelta < 0) return { verdict: 'below', label: `${roundDelta} rounds` };
  return { verdict: 'below', label: `${extraDelta} extra reps` };
}

/** Last completed circuit scores keyed by family, for gym-mode Cindy ghosts. */
export function buildLastCircuits(events, date) {
  const latest = new Map();
  for (const { record } of events ?? []) {
    if (record?.type !== 'workout' || record.status !== 'completed' || !record.date || record.date >= date) continue;
    for (const exercise of record.exercises ?? []) {
      if (exercise?.block?.kind !== 'circuit' || !exercise.block?.result) continue;
      const label = String(exercise.superset_label ?? '').trim() || exercise.name;
      const key = circuitFamilyKey(label);
      if (!key) continue;
      const existing = latest.get(key);
      if (existing && existing.date > record.date) continue;
      latest.set(key, {
        key,
        label,
        date: record.date,
        format: exercise.block.format || 'amrap',
        result: { ...exercise.block.result },
        timeCapSec: positive(exercise.block.time_cap_sec)
      });
    }
  }
  return Object.fromEntries(latest);
}

export function lastCircuitFor(block, lastCircuits) {
  const key = circuitFamilyKey(block?.label);
  return key ? lastCircuits?.[key] ?? null : null;
}

export function describeCircuitGhost(previous) {
  if (!previous?.result) return '';
  const score = formatBlockResult({ result: previous.result });
  if (!score) return '';
  const when = previous.date ? ` (${previous.date})` : '';
  return `Ghost · ${previous.label || 'circuit'} last time${when}: ${score}`;
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
      const entry = bests[key] ?? (bests[key] = { name: canonicalExerciseName(exercise.name), tracking, maxKg: 0, maxE1rm: 0, maxReps: 0, maxSec: 0, firstDate: null, firstKg: 0, firstReps: 0 });
      if (!entry.firstDate || record.date < entry.firstDate) {
        entry.firstDate = record.date;
        entry.firstKg = Math.max(0, ...(exercise.sets ?? []).map(set => positive(set?.weight_kg) ?? 0));
        entry.firstReps = Math.max(0, ...(exercise.sets ?? []).map(set => positive(set?.reps) ?? 0));
      }
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
  lastCircuits = null,
  exerciseBests = null,
  board = null,
  libraryByName = null,
  previousVolume = null,
  elapsedMs = 0,
  weekStreak = null
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
    // Circuit members are not raced set-for-set — CINDY ghosts are the whole
    // score (rounds in the window), tallied once on the block below.
    if (isCircuitMember(exercise, exercises)) {
      const tracking = resolveTrackingType(exercise);
      for (const set of exercise.sets ?? []) {
        if (!isHardSet(set, tracking) && tracking !== 'timed') continue;
        setsLogged += 1;
        if (set.failed) failureSets += 1;
      }
      continue;
    }
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
    .map(exercise => {
      const name = exercise.superset_label || exercise.name;
      const previous = lastCircuits?.[circuitFamilyKey(name)] ?? null;
      const ghost = compareCircuitGhost(exercise.block.result, previous?.result, exercise.block.format || 'amrap');
      if (ghost) {
        ghostsRaced += 1;
        if (ghost.verdict === 'beat') {
          ghostsBeaten += 1;
          beats.push({ name, label: ghost.label });
        } else if (ghost.verdict === 'matched') ghostsMatched += 1;
      }
      return { name, result: exercise.block.result, ghost };
    });

  let streak = null;
  if (weekStreak?.thisWeek && draft?.session_kind !== 'walk') {
    const sessions = weekStreak.thisWeek.sessions + 1;
    const target = weekStreak.thisWeek.target;
    const secured = sessions >= target;
    const run = secured && weekStreak.thisWeek.sessions < target ? weekStreak.current + 1 : weekStreak.current;
    streak = secured
      ? `Week ${sessions}/${target} — streak secured: ${run} week${run === 1 ? '' : 's'}.`
      : `Week ${sessions}/${target} — ${target - sessions} more keeps the ${weekStreak.current}-week streak alive.`;
  }
  return {
    title: draft?.title ?? 'Session',
    streak,
    aeke: draft?.aeke && Object.keys(draft.aeke).length ? { ...draft.aeke } : null,
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

// ── Tier 2: protected week streaks ─────────────────────────────────────────

const ILLNESS_RE = /\b(?:ill|illness|sick|unwell|fever|flu|cold|covid|virus|infection|flare|migraine|hospital|surgery|injur(?:y|ed)|gastro|vomit|bedridden)\b/i;

/** Sessions that count toward the weekly streak — a dog walk is movement, not a session. */
function countsTowardStreak(record) {
  return record.status === 'completed' && record.session_kind !== 'walk';
}

function illnessDay(record) {
  if (record?.type === 'workout' && record.status === 'skipped') {
    return ILLNESS_RE.test(`${record.title ?? ''} ${record.notes ?? ''}`);
  }
  if (record?.type === 'diary') {
    return Array.isArray(record.symptoms) && record.symptoms.length > 0
      && ILLNESS_RE.test(`${record.symptoms.join(' ')} ${record.challenges ?? ''} ${record.notes ?? ''}`);
  }
  return false;
}

/**
 * Weekly streak: a Mon–Sun week that hits `target` sessions extends it. A week
 * with illness days (a skipped session for illness, or diary symptoms) is
 * frozen — it neither breaks nor extends the run. The current week never breaks
 * the streak while it is still in progress.
 */
export function buildWeekStreak(events, date, { target = 3 } = {}) {
  const sessions = new Map();
  const ill = new Map();
  let earliest = null;
  for (const { record } of events ?? []) {
    if (!record?.date || record.date > date) continue;
    const week = getSydneyWeekStart(record.date);
    if (record.type === 'workout' && countsTowardStreak(record)) {
      const days = sessions.get(week) ?? new Set();
      days.add(`${record.date}|${record.title ?? ''}`);
      sessions.set(week, days);
      if (!earliest || record.date < earliest) earliest = record.date;
    }
    if (illnessDay(record)) {
      const days = ill.get(week) ?? new Set();
      days.add(record.date);
      ill.set(week, days);
    }
  }
  const thisWeek = getSydneyWeekStart(date);
  const weekInfo = week => {
    const count = sessions.get(week)?.size ?? 0;
    const illDays = ill.get(week)?.size ?? 0;
    return { week, count, hit: count >= target, protected: count < target && illDays > 0 };
  };
  const current = weekInfo(thisWeek);
  let streak = current.hit ? 1 : 0;
  let protectedWeeks = 0;
  const firstWeek = earliest ? getSydneyWeekStart(earliest) : thisWeek;
  for (let week = addCalendarDays(thisWeek, -7); week >= firstWeek; week = addCalendarDays(week, -7)) {
    const info = weekInfo(week);
    if (info.hit) streak += 1;
    else if (info.protected) protectedWeeks += 1;
    else break;
  }
  let longest = 0;
  let run = 0;
  for (let week = firstWeek; week <= thisWeek; week = addCalendarDays(week, 7)) {
    const info = weekInfo(week);
    if (info.hit) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (!info.protected && week !== thisWeek) {
      run = 0;
    }
  }
  return {
    current: streak,
    longest: Math.max(longest, streak),
    target,
    protectedWeeks,
    thisWeek: {
      sessions: current.count,
      target,
      remaining: Math.max(0, target - current.count),
      protected: current.protected,
      daysLeft: 6 - daysBetween(thisWeek, date)
    }
  };
}

// ── Tier 2: Seasons ────────────────────────────────────────────────────────

/** The Season Chadwick stamped on the most recent session, with where we are in it. */
export function buildSeasonStatus(events, date) {
  const stamped = (events ?? [])
    .map(({ record }) => record)
    .filter(record => record?.type === 'workout' && record.season?.name && record.date <= addCalendarDays(date, 7))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latest = stamped[0]?.season;
  if (!latest?.start || !latest.weeks) return null;
  const end = addCalendarDays(latest.start, latest.weeks * 7 - 1);
  if (date > addCalendarDays(end, 7)) return null;
  const inSeason = stamped.filter(record => record.season?.name === latest.name);
  const completed = inSeason.filter(record => record.status === 'completed');
  const elapsed = Math.max(0, daysBetween(latest.start, date));
  return {
    name: latest.name,
    mission: latest.mission ?? '',
    start: latest.start,
    end,
    weeks: latest.weeks,
    week: Math.min(latest.weeks, Math.floor(elapsed / 7) + 1),
    daysLeft: Math.max(0, daysBetween(date, end)),
    progress: Math.min(1, (elapsed + 1) / (latest.weeks * 7)),
    sessions: completed.length,
    benchmarkSessions: completed.filter(record => record.season?.benchmark).length,
    finished: date > end
  };
}

// ── Tier 2: Benchmark Wall ─────────────────────────────────────────────────

function circuitName(exercises, owner) {
  if (owner.superset_label) return owner.superset_label;
  return exercises.filter(item => item.superset_group === owner.superset_group).map(item => item.name).join(' + ');
}

/**
 * Every repeatable test, over time: circuits with a score, reps-in-a-window
 * tests, anything Chadwick flagged `benchmark`, and the AEKE score.
 * Each row: { key, name, unit, better: 'higher' | 'lower', points[{date, value, label}], latest, best, delta }.
 */
export function buildBenchmarkWall(events, date) {
  const rows = new Map();
  const add = (key, name, unit, better, point) => {
    const row = rows.get(key) ?? { key, name, unit, better, points: [] };
    row.points.push(point);
    rows.set(key, row);
  };
  for (const { record } of events ?? []) {
    if (record?.type !== 'workout' || record.status !== 'completed' || !record.date || record.date > date) continue;
    const exercises = record.exercises ?? [];
    for (const exercise of exercises) {
      const result = exercise.block?.result;
      if (exercise.block?.kind === 'circuit' && result && (positive(result.rounds) || positive(result.time_sec))) {
        const name = circuitName(exercises, exercise);
        if (exercise.block.format === 'for_time' && positive(result.time_sec)) {
          const rounds = positive(result.rounds) ?? 0;
          const mins = Math.floor(result.time_sec / 60);
          const secs = String(result.time_sec % 60).padStart(2, '0');
          add(`circuit:${exerciseKey(name)}:${rounds}`, `${name} (${rounds} rounds)`, 'time', 'lower',
            { date: record.date, value: result.time_sec, label: `${mins}:${secs}` });
        } else {
          const rounds = positive(result.rounds) ?? 0;
          const extra = positive(result.extra_reps) ?? 0;
          add(`circuit:${exerciseKey(name)}`, name, 'rounds', 'higher',
            { date: record.date, value: rounds * 1000 + extra, label: extra ? `${rounds} + ${extra}` : `${rounds} rounds` });
        }
      }
      const tracking = resolveTrackingType(exercise);
      const sets = exercise.sets ?? [];
      if (tracking === 'reps_in_time') {
        const byCap = new Map();
        for (const set of sets) {
          const cap = positive(set?.time_cap_sec);
          const reps = positive(set?.reps);
          if (cap && reps) byCap.set(cap, Math.max(byCap.get(cap) ?? 0, reps));
        }
        for (const [cap, reps] of byCap) {
          add(`rit:${exerciseKey(exercise.name)}:${cap}`, `${canonicalExerciseName(exercise.name)} in ${cap}s`, 'reps', 'higher',
            { date: record.date, value: reps, label: `${reps} reps` });
        }
      } else if (exercise.benchmark) {
        if (tracking === 'timed') {
          const sec = Math.max(0, ...sets.map(set => positive(set?.duration_sec) ?? 0));
          if (sec) add(`hold:${exerciseKey(exercise.name)}`, canonicalExerciseName(exercise.name), 'sec', 'higher', { date: record.date, value: sec, label: `${sec}s` });
        } else if (tracking === 'bodyweight_reps') {
          const reps = Math.max(0, ...sets.map(set => positive(set?.reps) ?? 0));
          if (reps) add(`reps:${exerciseKey(exercise.name)}`, canonicalExerciseName(exercise.name), 'reps', 'higher', { date: record.date, value: reps, label: `${reps} reps` });
        } else {
          let best = null;
          for (const set of sets) {
            const e1rm = estimateOneRepMax(set?.weight_kg, set?.reps);
            if (e1rm != null && (!best || e1rm > best.e1rm)) best = { e1rm, set };
          }
          if (best) {
            add(`lift:${exerciseKey(exercise.name)}`, canonicalExerciseName(exercise.name), 'e1RM kg', 'higher',
              { date: record.date, value: Math.round(best.e1rm * 10) / 10, label: `${formatKg(best.set.weight_kg)} × ${best.set.reps}` });
          }
        }
      }
    }
    const score = positive(record.aeke?.score);
    if (score) add('aeke:score', 'AEKE score', 'score', 'higher', { date: record.date, value: score, label: String(score) });
  }
  return [...rows.values()]
    .map(row => {
      const points = row.points.sort((a, b) => a.date.localeCompare(b.date));
      const pick = row.better === 'lower'
        ? points.reduce((best, point) => (point.value < best.value ? point : best))
        : points.reduce((best, point) => (point.value > best.value ? point : best));
      const latest = points.at(-1);
      const previous = points.at(-2) ?? null;
      const improved = previous
        ? (row.better === 'lower' ? latest.value < previous.value : latest.value > previous.value)
        : null;
      return { ...row, points, latest, best: pick, previous, improved, isBest: latest === pick && points.length > 1 };
    })
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name));
}

// ── Tier 2: readiness ──────────────────────────────────────────────────────

/** 1–5 check-in → what to do with the plan. */
export function readinessAdvice(readiness) {
  const values = ['sleep', 'soreness', 'energy'].map(key => Number(readiness?.[key])).filter(value => value >= 1 && value <= 5);
  if (values.length < 3) return null;
  const score = values.reduce((sum, value) => sum + value, 0) / values.length;
  const worst = Math.min(...values);
  if (score <= 2.4 || worst === 1) {
    return {
      adjusted: 'lighter',
      score,
      title: 'Flat day — go lighter',
      detail: 'Loads drop about 10% and every set stops 2 reps short of failure. You still bank the session; the streak still counts.'
    };
  }
  if (score >= 4.3) {
    return {
      adjusted: 'push',
      score,
      title: 'Green light — chase the targets',
      detail: 'You are fresh. Use the targets, hunt the ghosts, take the last set close to failure.'
    };
  }
  return {
    adjusted: 'as_planned',
    score,
    title: 'Solid — run it as planned',
    detail: 'Hit the plan, beat a ghost or two, keep 1–2 reps in the tank until the last set.'
  };
}

/** K1-friendly 10% drop, rounded to 0.5 kg. */
export function lighterLoad(kg) {
  const value = Number(kg) || 0;
  return Math.max(0, Math.round(value * 0.9 * 2) / 2);
}

// ── Tier 3: attentional focus cues ─────────────────────────────────────────

const FOCUS_RULES = [
  // Isolation → internal focus (mind–muscle): more growth in the target muscle.
  [/\bcurl\b/i, 'internal', 'Squeeze the biceps hard at the top — feel them do all of it, slow on the way down.'],
  [/\b(?:tricep|triceps|pushdown|kickback|extension)\b/i, 'internal', 'Lock out and squeeze the triceps — feel the back of the arm, not the shoulder.'],
  [/\b(?:fly|flye|pec deck|crossover)\b/i, 'internal', 'Hug a tree — squeeze the pecs together and feel the stretch open them.'],
  [/\b(?:lateral raise|rear delt|reverse fly|face pull)\b/i, 'internal', 'Lead with the elbows and feel the side of the shoulder lift the weight.'],
  [/\b(?:crunch|twist|woodchop|serratus|leg raise)\b/i, 'internal', 'Ribs to hips — feel the abs shorten, breathe out hard at the squeeze.'],
  [/\b(?:shrug|calf)\b/i, 'internal', 'Pause at the top and feel the muscle hold it there.'],
  // Compound → external focus: better force and performance.
  [/\b(?:hip thrust|glute bridge)\b/i, 'external', 'Drive the bar up toward the ceiling through your heels.'],
  [/\b(?:press|push up|push-up|pushup|dip)\b/i, 'external', 'Push the bar (or the floor) away from you, fast and strong.'],
  [/\b(?:row|pulldown|pull-down|pull up|pull-up|pullup)\b/i, 'external', 'Drive your elbows back toward the wall behind you.'],
  [/\b(?:squat|lunge|split|leg press|step up)\b/i, 'external', 'Push the floor away — drive straight up.'],
  [/\b(?:deadlift|rdl|hinge|good morning)\b/i, 'external', 'Push your hips back to the wall, then drive them forward to stand tall.']
];

/** Chadwick's `coach_cues.focus` wins; otherwise a cue chosen by move type. */
export function focusCue(exercise) {
  const written = exercise?.coach_cues?.focus;
  if (typeof written === 'string' && written.trim()) return { kind: 'coach', text: written.trim() };
  const name = String(exercise?.name ?? '');
  for (const [pattern, kind, text] of FOCUS_RULES) {
    if (pattern.test(name)) return { kind, text };
  }
  return null;
}

// ── Tier 3: twinge sites ───────────────────────────────────────────────────

export const TWINGE_SITES = [
  'Right shoulder', 'Left shoulder', 'Right elbow', 'Left elbow', 'Wrist',
  'Lower back', 'Neck', 'Right knee', 'Left knee', 'Hip'
];

// ── Tier 3: rest-time wins ─────────────────────────────────────────────────

/**
 * Short, true progress facts to read while the rest clock runs. Every fact is
 * built from real numbers; nothing is invented when the data is thin.
 */
export function restWins({ exercise = null, bests = null, buildBoard = null, weekStreak = null, ghostsBeaten = 0, prsToday = 0 } = {}) {
  const wins = [];
  if (prsToday > 0) wins.push(`${prsToday} personal best${prsToday === 1 ? '' : 's'} already today.`);
  if (ghostsBeaten > 0) wins.push(`Ghosts beaten so far: ${ghostsBeaten}. Keep the run going.`);
  const best = exercise ? bests?.[exerciseKey(exercise.name)] : null;
  if (best?.firstDate && best.firstKg > 0 && best.maxKg > best.firstKg) {
    const [y, m, d] = best.firstDate.split('-');
    wins.push(`${canonicalExerciseName(exercise.name)}: ${formatKg(best.firstKg)} → ${formatKg(best.maxKg)} since ${d}/${m}/${y.slice(2)}.`);
  } else if (best?.firstDate && best.maxReps > best.firstReps && best.firstReps > 0) {
    wins.push(`${canonicalExerciseName(exercise.name)}: ${best.firstReps} → ${best.maxReps} reps since you started it.`);
  }
  for (const row of buildBoard ?? []) {
    const total = row.done + (row.todayDone ?? 0);
    if (row.target && total >= row.target && row.done < row.target) {
      wins.push(`${row.label} target for the week: done (${total}/${row.target}).`);
    } else if (row.target && total > 0 && total < row.target && (row.todayDone ?? 0) > 0) {
      wins.push(`${row.label}: ${total}/${row.target} hard sets this week — ${row.target - total} to go.`);
    }
  }
  if (weekStreak?.current > 1) wins.push(`${weekStreak.current}-week streak. This session protects it.`);
  return wins;
}
