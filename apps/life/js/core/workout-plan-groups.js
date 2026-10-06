/**
 * Turn flat workout exercises into grouped blocks and an interleaved run order.
 *
 * A block is one lettered slot in the session (coach notation):
 *   single    A      straight sets, AAA
 *   superset  B1 B2  two moves alternated set-for-set: B1 B2, B1 B2, B1 B2
 *   circuit   C1-C3  three+ moves done back-to-back as a round, rest after the round
 *
 * Exercises join a block by sharing `superset_group`. Set index = round: member
 * `sets[0]` is round 1, `sets[1]` round 2, and so on. Block settings (kind,
 * format, rest, time cap, result) live on the first member's `block` object.
 */

export const BLOCK_KINDS = ['superset', 'circuit'];
export const BLOCK_FORMATS = ['rounds', 'for_time', 'amrap'];

/** Seconds of rest after a straight set / a finished round when nothing says otherwise. */
export const DEFAULT_REST_SEC = 90;

function exerciseSets(exercise) {
  return Array.isArray(exercise?.sets) ? exercise.sets : [];
}

function blockSettings(members) {
  const owner = members.find(member => member?.block && typeof member.block === 'object');
  return owner ? owner.block : null;
}

function resolveBlockKind(members, settings) {
  if (members.length < 2) return 'single';
  if (BLOCK_KINDS.includes(settings?.kind)) return settings.kind;
  return members.length >= 3 ? 'circuit' : 'superset';
}

function blockLetter(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function groupWorkoutPlanExercises(exercises = []) {
  const list = Array.isArray(exercises) ? exercises : [];
  const blocks = [];
  const seenGroups = new Set();

  for (let index = 0; index < list.length; index += 1) {
    const exercise = list[index];
    const group = exercise?.superset_group;

    if (group != null && seenGroups.has(group)) continue;

    let members = [{ exercise, index }];
    let label = null;
    if (group != null) {
      seenGroups.add(group);
      members = [];
      for (let j = index; j < list.length; j += 1) {
        if (list[j]?.superset_group !== group) continue;
        if (!label && typeof list[j].superset_label === 'string' && list[j].superset_label.trim()) {
          label = list[j].superset_label.trim();
        }
        members.push({ exercise: list[j], index: j });
      }
    }

    const memberExercises = members.map(member => member.exercise);
    const settings = blockSettings(memberExercises);
    let kind = resolveBlockKind(memberExercises, settings);
    if (kind === 'single' && exercise?.between_sets?.name) kind = 'between';
    const letter = blockLetter(blocks.length);
    blocks.push({
      kind,
      label,
      letter,
      group: group ?? null,
      format: BLOCK_FORMATS.includes(settings?.format) ? settings.format : 'rounds',
      restSec: positiveNumber(settings?.rest_sec) ?? positiveNumber(memberExercises[0]?.rest_sec),
      timeCapSec: positiveNumber(settings?.time_cap_sec),
      result: settings?.result && typeof settings.result === 'object' ? settings.result : null,
      rounds: Math.max(0, ...memberExercises.map(item => exerciseSets(item).length)),
      exercises: memberExercises,
      indexes: members.map(member => member.index)
    });
  }

  return blocks;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function isGroupedBlock(block) {
  return block?.kind === 'superset' || block?.kind === 'circuit';
}

/** "B1", "B2" for grouped members; "A" for a straight block. */
export function blockMemberCode(block, memberIndex) {
  if (!block?.letter) return '';
  return isGroupedBlock(block) ? `${block.letter}${memberIndex + 1}` : block.letter;
}

export function formatSupersetBlockLabel(block, fallbackIndex = 0) {
  if (typeof block?.label === 'string' && block.label.trim()) return block.label.trim();
  if (block?.kind === 'between') return 'Between sets';
  if (block?.kind === 'circuit') return `Circuit ${block.letter ?? fallbackIndex + 1}`;
  if (block?.kind === 'superset') return block.letter ? `Superset ${block.letter}` : `Superset ${fallbackIndex + 1}`;
  return '';
}

function formatSeconds(totalSec) {
  const total = Math.max(0, Math.round(Number(totalSec) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (!minutes) return `${seconds}s`;
  return seconds ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${minutes} min`;
}

/** One line under a grouped block header, e.g. "3 rounds · B1 → B2 · rest 90s after each round". */
export function formatBlockScheme(block) {
  if (!isGroupedBlock(block)) return '';
  const order = block.exercises.map((_, index) => blockMemberCode(block, index)).join(' → ');
  const parts = [];
  if (block.format === 'amrap') {
    parts.push(block.timeCapSec ? `AMRAP ${formatSeconds(block.timeCapSec)}` : 'As many rounds as possible');
  } else {
    const rounds = block.rounds || 1;
    parts.push(`${rounds} round${rounds === 1 ? '' : 's'}${block.format === 'for_time' ? ' for time' : ''}`);
  }
  parts.push(order);
  if (block.restSec) parts.push(`rest ${formatSeconds(block.restSec)} after each round`);
  return parts.join(' · ');
}

/** "3 rounds in 1:36" / "5 + 8 reps" — what a finished circuit scored. */
export function formatBlockResult(block) {
  const result = block?.result;
  if (!result) return '';
  const rounds = Number(result.rounds);
  const extra = Number(result.extra_reps);
  const time = Number(result.time_sec);
  const bits = [];
  if (Number.isFinite(rounds) && rounds > 0) {
    bits.push(Number.isFinite(extra) && extra > 0 ? `${rounds} + ${extra} reps` : `${rounds} round${rounds === 1 ? '' : 's'}`);
  }
  if (Number.isFinite(time) && time > 0) bits.push(`in ${formatSeconds(time)}`);
  return bits.join(' ');
}

export function exerciseHasSetTargets(exercise) {
  return exerciseSets(exercise).length > 0;
}

/**
 * The order Adam actually performs sets in. Straight blocks run AAA; grouped
 * blocks interleave round by round (B1 B2, B1 B2). Each step points back at the
 * real exercise / set index so edits land on the record. `restAfter` marks the
 * moments a rest timer belongs: after a straight set, or after the last member
 * of a round — never between superset partners.
 */
export function buildSessionSteps(exercises = []) {
  const blocks = groupWorkoutPlanExercises(exercises);
  const steps = [];
  blocks.forEach((block, blockIndex) => {
    if (!isGroupedBlock(block)) {
      const exerciseIndex = block.indexes[0];
      const sets = exerciseSets(block.exercises[0]);
      sets.forEach((_, setIndex) => {
        steps.push({
          blockIndex,
          exerciseIndex,
          memberIndex: 0,
          setIndex,
          round: setIndex + 1,
          rounds: sets.length,
          restAfter: true
        });
      });
      if (!sets.length) {
        steps.push({ blockIndex, exerciseIndex, memberIndex: 0, setIndex: -1, round: 0, rounds: 0, restAfter: false });
      }
      return;
    }
    for (let round = 0; round < block.rounds; round += 1) {
      const inRound = block.exercises
        .map((exercise, memberIndex) => ({ exercise, memberIndex }))
        .filter(({ exercise }) => round < exerciseSets(exercise).length);
      inRound.forEach(({ memberIndex }, position) => {
        steps.push({
          blockIndex,
          exerciseIndex: block.indexes[memberIndex],
          memberIndex,
          setIndex: round,
          round: round + 1,
          rounds: block.rounds,
          restAfter: position === inRound.length - 1
        });
      });
    }
  });
  return { blocks, steps };
}

function cleanBlock(block, { withResults }) {
  if (!block || typeof block !== 'object') return null;
  const out = {};
  if (BLOCK_KINDS.includes(block.kind)) out.kind = block.kind;
  if (BLOCK_FORMATS.includes(block.format)) out.format = block.format;
  if (positiveNumber(block.rest_sec)) out.rest_sec = Number(block.rest_sec);
  if (positiveNumber(block.time_cap_sec)) out.time_cap_sec = Number(block.time_cap_sec);
  if (withResults && block.result && typeof block.result === 'object') {
    const result = {};
    for (const key of ['rounds', 'extra_reps', 'time_sec']) {
      const value = Number(block.result[key]);
      if (Number.isFinite(value) && value >= 0) result[key] = value;
    }
    if (Object.keys(result).length) out.result = result;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The structure fields every copy of an exercise must carry (logger draft,
 * template, history tool) so a superset or circuit never flattens back to AAA BBB.
 * `withResults` keeps what happened on the day (circuit score, exercise notes);
 * templates leave it off so last week's notes don't haunt next week's plan.
 */
export function copyExerciseStructure(exercise, { withResults = true } = {}) {
  const out = {};
  if (exercise?.superset_group != null && Number.isFinite(Number(exercise.superset_group))) {
    out.superset_group = Number(exercise.superset_group);
  }
  if (typeof exercise?.superset_label === 'string' && exercise.superset_label.trim()) {
    out.superset_label = exercise.superset_label.trim();
  }
  const block = cleanBlock(exercise?.block, { withResults });
  if (block) out.block = block;
  if (positiveNumber(exercise?.rest_sec)) out.rest_sec = Number(exercise.rest_sec);
  if (exercise?.between_sets && typeof exercise.between_sets === 'object' && exercise.between_sets.name) {
    out.between_sets = {
      ...exercise.between_sets,
      ...(Array.isArray(exercise.between_sets.sets)
        ? { sets: exercise.between_sets.sets.map(set => ({ ...set })) }
        : {})
    };
  }
  if (withResults && typeof exercise?.notes === 'string' && exercise.notes.trim()) {
    out.notes = exercise.notes.trim();
  }
  return out;
}

/** Per-set extras logged on the day: hit failure, and a short note. */
export function copySetExtras(set) {
  const out = {};
  if (set?.failed === true) out.failed = true;
  if (typeof set?.note === 'string' && set.note.trim()) out.note = set.note.trim();
  return out;
}

/**
 * Logger steps: the run order from `buildSessionSteps`, with one change — a
 * circuit round is ONE step covering every member (log a fast round in a single
 * tap). Straight sets and superset members stay one step per set. Every step
 * carries `members: [{ exerciseIndex, setIndex }]`.
 */
export function buildLoggerSteps(exercises = []) {
  const { blocks, steps } = buildSessionSteps(exercises);
  const out = [];
  for (const step of steps) {
    const block = blocks[step.blockIndex];
    const member = { exerciseIndex: step.exerciseIndex, setIndex: step.setIndex };
    if (block?.kind === 'circuit') {
      const previous = out.at(-1);
      if (previous && previous.blockIndex === step.blockIndex && previous.round === step.round) {
        previous.members.push(member);
        previous.restAfter = step.restAfter;
        continue;
      }
      out.push({ ...step, kind: 'round', members: [member] });
      continue;
    }
    out.push({ ...step, kind: block?.kind === 'superset' ? 'superset' : 'set', members: [member] });
  }
  return { blocks, steps: out };
}
