/**
 * Turn Chadwick's chat prescriptions into structured exercises.
 * Handles Set-labelled lines, compact "10x25kg, 10x25kg" lists, flattened
 * one-paragraph dumps, and "*between sets:*" supersets.
 */

const ITEM_START = /(?:^|\n|\s)(\d+)[\.)]\s+(?=\*\*|[A-Z])/g;
const SET_SPLIT = /(?:\s+-\s+|\n\s*-\s+|\n)\s*(?=Set\s*\d+\s*:)/i;
const SET_HEAD = /^Set\s*(\d+)\s*:\s*/i;
const REPS_X_KG = /(\d+)\s*reps?\s*[x×]\s*(\d+(?:\.\d+)?)\s*kg/gi;
const KG_X_REPS = /(\d+(?:\.\d+)?)\s*kg\s*[×x]\s*(\d+)\s*reps?/gi;
const COMPACT_LOAD = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*kg/gi;
const CABLE_PAREN = /\(\s*cable:\s*([^)]+)\)/i;
const CABLE_TRAIL = /(?:[—–·,-]|\()\s*cable:\s*([^)\n]+)/i;
const NAME_CUE = /\s+[—–]\s+/;
const BETWEEN_RE = /\s*[-–—]?\s*\*?\s*between sets:?\*?\s*/i;
const CABLE_ENUM = new Set(['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing']);

export function normalizeCableType(value) {
  const raw = String(value ?? '').toLowerCase().replace(/[()]/g, '').trim();
  if (!raw || raw.startsWith('none')) return 'constant_force';
  const slug = raw.replace(/\s+/g, '_');
  if (CABLE_ENUM.has(slug)) return slug;
  if (slug.includes('constant')) return 'constant_force';
  if (slug.includes('concentric')) return 'concentric';
  if (slug.includes('eccentric')) return 'eccentric';
  if (slug.includes('elastic')) return 'elastic';
  if (slug.includes('rowing') || slug.includes('row')) return 'rowing';
  return 'constant_force';
}

function cableFrom(text) {
  return (CABLE_PAREN.exec(text)?.[1] ?? CABLE_TRAIL.exec(text)?.[1] ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function extractCompactSets(text) {
  const source = String(text ?? '');
  if (!source.trim()) return [];
  const cable = cableFrom(source);
  const repsStyle = [...source.matchAll(REPS_X_KG)];
  if (repsStyle.length) {
    return repsStyle.map((match, index) => ({
      index: index + 1,
      reps: Number(match[1]),
      weightKg: Number(match[2]),
      cable,
      raw: match[0]
    }));
  }
  const kgStyle = [...source.matchAll(KG_X_REPS)];
  if (kgStyle.length) {
    return kgStyle.map((match, index) => ({
      index: index + 1,
      reps: Number(match[2]),
      weightKg: Number(match[1]),
      cable,
      raw: match[0]
    }));
  }
  return [...source.matchAll(COMPACT_LOAD)].map((match, index) => ({
    index: index + 1,
    reps: Number(match[1]),
    weightKg: Number(match[2]),
    cable,
    raw: match[0]
  }));
}

function stripLoadCopy(text) {
  return String(text ?? '')
    .replace(REPS_X_KG, '')
    .replace(KG_X_REPS, '')
    .replace(COMPACT_LOAD, '')
    .replace(/\(\s*cable:\s*[^)]+\)/gi, '')
    .replace(/[—–·,-]\s*cable:\s*[^\n]+/gi, '')
    .replace(/finisher set/gi, 'finisher')
    .replace(/[,:;]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWorkoutSet(raw, fallbackIndex = 0) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const head = SET_HEAD.exec(text);
  const rest = head ? text.slice(head[0].length).trim() : text;
  const compact = extractCompactSets(rest);
  if (compact.length === 1) {
    return { ...compact[0], index: head ? Number(head[1]) : fallbackIndex + 1 };
  }
  if (compact.length > 1) return null;
  const cable = cableFrom(rest);
  if (head && !cable) return null;
  if (!head && !cable) return null;
  return {
    index: head ? Number(head[1]) : fallbackIndex + 1,
    reps: null,
    weightKg: null,
    cable,
    raw: rest
  };
}

function parseSupersetPairingLine(line) {
  const match = /^\s*(\d+(?:&\d+)?)\s+(superset|straight after[^:]*):\s*(.+)$/i.exec(String(line ?? '').trim());
  if (!match) return null;
  const label = match[1].trim();
  const straight = /straight after/i.test(match[2]);
  const chunk = match[3].replace(/\s*→\s*/g, ' / ');
  const names = chunk
    .split('/')
    .map(part => part.replace(/\bburnout\b/gi, '').replace(/\s+/g, ' ').trim())
    .filter(name => name.length >= 3);
  if (names.length === 0) return null;
  return { label, straight, names };
}

export function parseSupersetPairing(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const exercises = [];
  let group = 0;
  for (const line of text.split('\n')) {
    const parsedLine = parseSupersetPairingLine(line);
    if (!parsedLine) continue;
    group += 1;
    const supersetLabel = parsedLine.straight
      ? `${parsedLine.label} straight`
      : `${parsedLine.label} superset`;
    parsedLine.names.forEach((name, index) => {
      exercises.push({
        name,
        cue: '',
        sets: [],
        between: null,
        superset_group: group,
        ...(index === 0 ? { superset_label: supersetLabel } : {})
      });
    });
  }
  if (exercises.length < 2) return null;
  const intro = text.split('\n').find(entry => /pairing|superset|burnout/i.test(entry)) ?? '';
  return { intro: intro.trim(), exercises, outro: '' };
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

function parseNamedLoads(text) {
  const cleaned = String(text ?? '').replaceAll('**', '').trim();
  if (!cleaned) return null;
  const cueSplit = NAME_CUE.exec(cleaned);
  let name = cleaned;
  let rest = '';
  if (cueSplit) {
    name = cleaned.slice(0, cueSplit.index).trim();
    rest = cleaned.slice(cueSplit.index + cueSplit[0].length).trim();
  }
  const sets = [];
  const labelled = rest.split(SET_SPLIT);
  let leftover = labelled[0] ?? rest;
  if (/^Set\s*\d+\s*:/i.test(leftover)) {
    const parsed = parseWorkoutSet(leftover, 0);
    if (parsed) sets.push(parsed);
    leftover = '';
  }
  for (const part of labelled.slice(1)) {
    const parsed = parseWorkoutSet(part, sets.length);
    if (parsed) sets.push(parsed);
  }
  if (!sets.length) {
    sets.push(...extractCompactSets(rest || leftover));
    leftover = stripLoadCopy(rest || leftover);
  } else {
    leftover = stripLoadCopy(leftover);
  }
  name = name.replace(/\s+/g, ' ').trim();
  const cue = leftover.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return { name, cue, sets, between: null };
}

function parseExerciseBlock(block) {
  const stripped = String(block ?? '').replace(/^\d+[\.)]\s+/, '').trim();
  if (!stripped) return null;
  const [main, ...betweenChunks] = stripped.split(BETWEEN_RE);
  const parsed = parseNamedLoads(main);
  if (!parsed) return null;
  if (betweenChunks.length) {
    parsed.between = parseNamedLoads(betweenChunks.join(' ').trim());
  }
  return parsed;
}

export function parseWorkoutChat(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const starts = findExerciseStarts(text);
  if (starts.length === 0) return null;

  const intro = text.slice(0, starts[0].index).trim();
  const exercises = [];
  const outro = '';

  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const parsed = parseExerciseBlock(text.slice(starts[i].index, end));
    if (parsed) exercises.push(parsed);
  }

  const withSets = exercises.filter(exercise => exercise.sets.length > 0);
  if (withSets.length === 0) return null;

  return { intro, exercises, outro };
}

export function flattenWorkoutExercises(plan) {
  const exercises = [];
  for (const exercise of plan?.exercises ?? []) {
    if (exercise.sets.length) {
      const row = { ...exercise };
      if (exercise.between?.sets?.length) {
        row.between_sets = mapBetweenSetsExercise(exercise.between);
        delete row.between;
      }
      exercises.push(row);
      continue;
    }
    if (exercise.between?.sets?.length) {
      exercises.push({
        ...exercise.between,
        cue: exercise.between.cue || 'between sets'
      });
    }
  }
  return exercises;
}

function mapBetweenSetsExercise(between) {
  return {
    name: between.name,
    sets: (between.sets ?? [])
      .filter(set => set.reps != null && set.weightKg != null)
      .map(set => ({
        reps: set.reps,
        weight_kg: set.weightKg,
        cable_type: normalizeCableType(set.cable)
      }))
  };
}

function mapRecordExercise(exercise) {
  const mapped = {
    name: exercise.name,
    ...(exercise.superset_group != null ? { superset_group: exercise.superset_group } : {}),
    ...(typeof exercise.superset_label === 'string' && exercise.superset_label.trim()
      ? { superset_label: exercise.superset_label.trim() }
      : {}),
    sets: (exercise.sets ?? [])
      .filter(set => set.reps != null && set.weightKg != null)
      .map(set => ({
        reps: set.reps,
        weight_kg: set.weightKg,
        cable_type: normalizeCableType(set.cable)
      }))
  };
  if (exercise.between?.sets?.length) {
    mapped.between_sets = mapBetweenSetsExercise(exercise.between);
  }
  return mapped;
}

function mapNameOnlyExercise(exercise) {
  return {
    name: exercise.name,
    ...(exercise.superset_group != null ? { superset_group: exercise.superset_group } : {}),
    ...(typeof exercise.superset_label === 'string' && exercise.superset_label.trim()
      ? { superset_label: exercise.superset_label.trim() }
      : {})
  };
}

export function extractWorkoutTitle(text) {
  const quoted = /(?:Updated:\s*|Tonight:\s*)?["“]([^"”]{3,80})["”]/.exec(text ?? '');
  if (quoted) return quoted[1].trim();
  return '';
}

function titleFromExercises(exercises) {
  const names = (exercises ?? [])
    .map(exercise => (typeof exercise?.name === 'string' ? exercise.name.trim() : ''))
    .filter(Boolean)
    .slice(0, 2);
  if (names.length === 0) return '';
  return names.join(' + ');
}

export function extractWorkoutDuration(text) {
  const range = /(\d+)\s*-\s*(\d+)\s*min/i.exec(text ?? '');
  if (range) return Number(range[2]);
  const single = /(\d+)\s*min/i.exec(text ?? '');
  return single ? Number(single[1]) : null;
}

export function findLatestWorkoutPlanText(texts) {
  const list = Array.isArray(texts) ? texts : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const plan = parseWorkoutChat(list[i]) ?? parseSupersetPairing(list[i]);
    if (flattenWorkoutExercises(plan).length >= 2) return list[i];
    if ((plan?.exercises ?? []).length >= 2) return list[i];
  }
  return null;
}

export function buildPlannedWorkoutInput(text, { date } = {}) {
  const plan = parseWorkoutChat(text) ?? parseSupersetPairing(text);
  const loaded = (plan?.exercises ?? [])
    .map(mapRecordExercise)
    .filter(exercise => exercise.sets.length > 0);
  if (loaded.length >= 2 && typeof date === 'string' && date) {
    const duration = extractWorkoutDuration(text);
    return {
      type: 'workout',
      date,
      // Never park design chatter as the post-session verdict — notes stay empty on planned.
      notes: '',
      fields: {
        title: extractWorkoutTitle(text) || titleFromExercises(loaded) || 'Strength session',
        session_kind: 'strength',
        day_type: (duration ?? 45) >= 45 ? 'workout_45_60' : 'workout_30',
        status: 'planned',
        ...(duration != null ? { duration_min: duration } : {}),
        exercises: loaded
      }
    };
  }

  const namesOnly = (plan?.exercises ?? [])
    .map(mapNameOnlyExercise)
    .filter(exercise => typeof exercise.name === 'string' && exercise.name.trim());
  if (namesOnly.length >= 2 && typeof date === 'string' && date) {
    const duration = extractWorkoutDuration(text);
    return {
      type: 'workout',
      date,
      notes: '',
      fields: {
        title: extractWorkoutTitle(text) || titleFromExercises(namesOnly) || 'Strength session',
        session_kind: 'strength',
        day_type: (duration ?? 45) >= 45 ? 'workout_45_60' : 'workout_30',
        status: 'planned',
        ...(duration != null ? { duration_min: duration } : {}),
        exercises: namesOnly
      }
    };
  }

  return null;
}

export function setsAreIdentical(sets) {
  if (!Array.isArray(sets) || sets.length < 2) return false;
  const keyOf = set => `${set.reps ?? ''}|${set.weightKg ?? ''}|${set.cable ?? ''}|${set.raw ?? ''}`;
  const first = keyOf(sets[0]);
  return sets.every(set => keyOf(set) === first);
}
