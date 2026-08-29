/**
 * Turn Chadwick's chat prescriptions into structured exercises.
 * Handles both one-exercise-per-line lists and the flattened one-paragraph
 * dump ("1. Name — cue - Set 1: … 2. Name — …").
 */

const ITEM_START = /(?:^|\n|\s)(\d+)[\.)]\s+(?=\*\*|[A-Z])/g;
const SET_SPLIT = /(?:\s+-\s+|\n\s*-\s+|\n)\s*(?=Set\s*\d+\s*:)/i;
const SET_HEAD = /^Set\s*(\d+)\s*:\s*/i;
const REPS_X_KG = /(\d+)\s*reps?\s*[x×]\s*(\d+(?:\.\d+)?)\s*kg/i;
const KG_X_REPS = /(\d+(?:\.\d+)?)\s*kg\s*[×x]\s*(\d+)\s*reps?/i;
const COMPACT_LOAD = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*kg/i;
const CABLE_PAREN = /\(\s*cable:\s*([^)]+)\)/i;
const CABLE_DOT = /(?:·|,)\s*cable:\s*([^\n]+)/i;
const NAME_CUE = /\s+[—–]\s+/;

export function parseWorkoutSet(raw, fallbackIndex = 0) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const head = SET_HEAD.exec(text);
  const rest = head ? text.slice(head[0].length).trim() : text;
  const index = head ? Number(head[1]) : fallbackIndex + 1;

  const repsXKg = REPS_X_KG.exec(rest);
  const kgXReps = KG_X_REPS.exec(rest);
  const compact = COMPACT_LOAD.exec(rest);
  let reps = null;
  let weightKg = null;
  if (repsXKg) {
    reps = Number(repsXKg[1]);
    weightKg = Number(repsXKg[2]);
  } else if (kgXReps) {
    weightKg = Number(kgXReps[1]);
    reps = Number(kgXReps[2]);
  } else if (compact) {
    reps = Number(compact[1]);
    weightKg = Number(compact[2]);
  }

  const cable = (CABLE_PAREN.exec(rest)?.[1] ?? CABLE_DOT.exec(rest)?.[1] ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  if (reps == null && weightKg == null && !cable) return null;
  return { index, reps, weightKg, cable, raw: rest };
}

function findExerciseStarts(text) {
  const starts = [];
  ITEM_START.lastIndex = 0;
  let match = ITEM_START.exec(text);
  while (match) {
    const digitsAt = match.index + match[0].search(/\d/);
    starts.push({ index: digitsAt, n: Number(match[1]) });
    match = ITEM_START.exec(text);
  }
  return starts;
}

function parseExerciseBlock(block) {
  const stripped = String(block ?? '').replace(/^\d+[\.)]\s+/, '').trim();
  if (!stripped) return null;
  const parts = stripped.split(SET_SPLIT);
  let head = (parts[0] ?? '').replaceAll('**', '').trim();
  const sets = [];

  if (/^Set\s*\d+\s*:/i.test(head)) {
    const parsed = parseWorkoutSet(head, 0);
    if (parsed) sets.push(parsed);
    head = '';
  }

  const cueSplit = NAME_CUE.exec(head);
  let name = head;
  let cue = '';
  if (cueSplit) {
    name = head.slice(0, cueSplit.index).trim();
    cue = head.slice(cueSplit.index + cueSplit[0].length).trim();
  }
  if (/^Set\s*\d+\s*:/i.test(cue)) {
    const parsed = parseWorkoutSet(cue, sets.length);
    if (parsed) sets.push(parsed);
    cue = '';
  }

  for (const part of parts.slice(1)) {
    const parsed = parseWorkoutSet(part, sets.length);
    if (parsed) sets.push(parsed);
  }

  name = name.replace(/\s+/g, ' ').trim();
  cue = cue.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return { name, cue, sets };
}

export function parseWorkoutChat(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const starts = findExerciseStarts(text);
  if (starts.length === 0) return null;

  const intro = text.slice(0, starts[0].index).trim();
  const exercises = [];
  let outro = '';

  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const parsed = parseExerciseBlock(text.slice(starts[i].index, end));
    if (parsed) exercises.push(parsed);
  }

  const withSets = exercises.filter(exercise => exercise.sets.length > 0);
  if (withSets.length === 0) return null;

  return { intro, exercises, outro };
}

export function setsAreIdentical(sets) {
  if (!Array.isArray(sets) || sets.length < 2) return false;
  const keyOf = set => `${set.reps ?? ''}|${set.weightKg ?? ''}|${set.cable ?? ''}|${set.raw ?? ''}`;
  const first = keyOf(sets[0]);
  return sets.every(set => keyOf(set) === first);
}
