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
export const BLOCK_FORMATS = ['rounds', 'for_time', 'amrap', 'emom', 'intervals'];

/**
 * Clock-driven formats: gym mode runs an interval clock that tells Adam when
 * each round (or station) starts. emom = a new round every `interval_sec`
 * (`alternate: true` gives each member its own interval); intervals =
 * `work_sec` on, `rest_sec` off, station by station (Tabata is 20 / 10).
 * A single exercise with one of these formats still runs as a one-move circuit.
 */
export const TIMED_FORMATS = ['emom', 'intervals'];
export const DEFAULT_EMOM_INTERVAL_SEC = 60;
export const DEFAULT_WORK_SEC = 20;
export const DEFAULT_INTERVAL_REST_SEC = 10;
/** Seconds between tapping Start and the first interval, to get to the machine. */
export const INTERVAL_LEAD_IN_SEC = 10;

export function isTimedFormat(format) {
  return TIMED_FORMATS.includes(format);
}

/** Seconds of rest after a straight set / a finished round when nothing says otherwise. */
export const DEFAULT_REST_SEC = 90;

/**
 * How many round-slots an AMRAP should plan for when Chadwick forgets.
 * Gym mode has + Round for overflow and trims unplayed rounds on finish — under-
 * provisioning (1 set) is the bug; over-provisioning is harmless.
 */
export const DEFAULT_AMRAP_ROUNDS = 8;
export const MIN_AMRAP_ROUNDS = 5;
export const MAX_AMRAP_ROUNDS = 12;

/** Plausible round capacity for a time cap (~30s/round ceiling for a 4-move Cindy). */
export function amrapRoundCapacity(timeCapSec, explicitRounds = null) {
  const explicit = Number(explicitRounds);
  if (Number.isFinite(explicit) && explicit >= 1) {
    return Math.min(MAX_AMRAP_ROUNDS, Math.max(1, Math.round(explicit)));
  }
  const cap = Number(timeCapSec);
  if (Number.isFinite(cap) && cap > 0) {
    return Math.min(MAX_AMRAP_ROUNDS, Math.max(MIN_AMRAP_ROUNDS, Math.ceil(cap / 30)));
  }
  return DEFAULT_AMRAP_ROUNDS;
}

function cloneRoundTemplate(set) {
  if (!set || typeof set !== 'object') {
    return { reps: 0, weight_kg: 0, cable_type: 'none' };
  }
  const { done: _done, failed: _failed, note: _note, ...rest } = set;
  return { ...rest };
}

/**
 * Ensure every AMRAP circuit member has enough `sets` (one per possible round).
 * Mutates and returns the same array. Safe to call on planned log_entry, chat
 * parse, and gym-mode draft clone — the logger drops unplayed rounds on finish.
 */
export function provisionAmrapCircuitRounds(exercises = []) {
  if (!Array.isArray(exercises) || !exercises.length) return exercises;
  const groups = new Map();
  for (const exercise of exercises) {
    const group = exercise?.superset_group;
    if (group == null) continue;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(exercise);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // format: amrap is the signal — Chadwick sometimes omits kind: circuit.
    const owner = members.find(exercise => exercise?.block?.format === 'amrap');
    if (!owner) continue;
    if (owner.block.kind == null) owner.block.kind = 'circuit';
    const target = amrapRoundCapacity(owner.block?.time_cap_sec);
    for (const exercise of members) {
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      if (sets.length >= target) continue;
      const template = cloneRoundTemplate(sets[0]);
      exercise.sets = [
        ...sets.map(set => ({ ...set })),
        ...Array.from({ length: target - sets.length }, () => ({ ...template }))
      ];
    }
  }
  return exercises;
}

function exerciseSets(exercise) {
  return Array.isArray(exercise?.sets) ? exercise.sets : [];
}

function blockSettings(members) {
  const owner = members.find(member => member?.block && typeof member.block === 'object');
  return owner ? owner.block : null;
}

function resolveBlockKind(members, settings) {
  // The interval clock lives on circuits, so a timed block is always one.
  if (isTimedFormat(settings?.format)) return 'circuit';
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
      intervalSec: positiveNumber(settings?.interval_sec),
      workSec: positiveNumber(settings?.work_sec),
      alternate: settings?.alternate === true,
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
  const rounds = block.rounds || 1;
  const roundsText = `${rounds} round${rounds === 1 ? '' : 's'}`;
  if (block.format === 'amrap') {
    parts.push(block.timeCapSec ? `AMRAP ${formatSeconds(block.timeCapSec)}` : 'As many rounds as possible');
  } else if (block.format === 'emom') {
    const every = formatSeconds(block.intervalSec ?? DEFAULT_EMOM_INTERVAL_SEC);
    parts.push(`Every ${every}${block.alternate && block.exercises.length > 1 ? ', alternating' : ''} · ${roundsText}`);
  } else if (block.format === 'intervals') {
    const work = formatSeconds(block.workSec ?? DEFAULT_WORK_SEC);
    const rest = formatSeconds(block.restSec ?? DEFAULT_INTERVAL_REST_SEC);
    parts.push(`${roundsText} · ${work} on / ${rest} off`);
  } else {
    parts.push(`${roundsText}${block.format === 'for_time' ? ' for time' : ''}`);
  }
  if (block.exercises.length > 1) parts.push(order);
  if (block.restSec && !isTimedFormat(block.format)) parts.push(`rest ${formatSeconds(block.restSec)} after each round`);
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
  if (positiveNumber(block.interval_sec)) out.interval_sec = Number(block.interval_sec);
  if (positiveNumber(block.work_sec)) out.work_sec = Number(block.work_sec);
  if (block.alternate === true) out.alternate = true;
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
  if (exercise?.benchmark === true) out.benchmark = true;
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

/**
 * The interval clock's timeline for an emom / intervals block (after the
 * lead-in): one `work` segment per round (EMOM), per member per round
 * (alternating EMOM, intervals), with `rest` segments between intervals work.
 * `memberIndex` is who works in that segment (null = the whole round).
 */
export function intervalSchedule(block) {
  if (!isTimedFormat(block?.format)) return [];
  const rounds = Math.max(1, block.rounds || 1);
  const members = Math.max(1, block.exercises?.length ?? 1);
  const segments = [];
  if (block.format === 'emom') {
    const sec = block.intervalSec ?? DEFAULT_EMOM_INTERVAL_SEC;
    for (let round = 1; round <= rounds; round += 1) {
      if (block.alternate && members > 1) {
        for (let memberIndex = 0; memberIndex < members; memberIndex += 1) {
          segments.push({ phase: 'work', round, memberIndex, sec });
        }
      } else {
        segments.push({ phase: 'work', round, memberIndex: null, sec });
      }
    }
    return segments;
  }
  const work = block.workSec ?? DEFAULT_WORK_SEC;
  const rest = block.restSec ?? DEFAULT_INTERVAL_REST_SEC;
  for (let round = 1; round <= rounds; round += 1) {
    for (let memberIndex = 0; memberIndex < members; memberIndex += 1) {
      segments.push({ phase: 'work', round, memberIndex, sec: work });
      const last = round === rounds && memberIndex === members - 1;
      if (!last && rest > 0) {
        const next = memberIndex + 1 < members ? memberIndex + 1 : 0;
        segments.push({ phase: 'rest', round: memberIndex + 1 < members ? round : round + 1, memberIndex: next, sec: rest });
      }
    }
  }
  return segments;
}

/** Where the interval clock is: lead_in, work, rest, or done, with ms left in that phase. */
export function intervalPosition(block, elapsedMs) {
  const segments = intervalSchedule(block);
  const total = segments.length;
  const lead = INTERVAL_LEAD_IN_SEC * 1000;
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < lead) return { phase: 'lead_in', index: -1, total, segment: segments[0] ?? null, remainingMs: lead - elapsed };
  let t = elapsed - lead;
  for (let index = 0; index < total; index += 1) {
    const ms = segments[index].sec * 1000;
    if (t < ms) return { phase: segments[index].phase, index, total, segment: segments[index], remainingMs: ms - t };
    t -= ms;
  }
  return { phase: 'done', index: total, total, segment: null, remainingMs: 0 };
}
