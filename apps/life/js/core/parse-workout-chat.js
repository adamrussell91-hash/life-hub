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
    if (parseLetteredWorkoutChat(list[i])) return list[i];
    const plan = parseWorkoutChat(list[i]) ?? parseSupersetPairing(list[i]);
    if (flattenWorkoutExercises(plan).length >= 2) return list[i];
    if ((plan?.exercises ?? []).length >= 2) return list[i];
  }
  return null;
}

export function buildPlannedWorkoutInput(text, { date } = {}) {
  const lettered = parseLetteredWorkoutChat(text);
  const plan = lettered ?? parseWorkoutChat(text) ?? parseSupersetPairing(text);
  const loaded = lettered
    ? lettered.exercises.filter(exercise => exercise.sets.length > 0)
    : (plan?.exercises ?? [])
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

// ── Lettered coach notation ────────────────────────────────────────────────
//   A  Bar Hip Thrust — 30 kg × 10, 35 kg × 10
//   B1 Bar Press — 30 kg × 10
//   B2 Cable Bar Curl — 10 kg × 12
//      ↳ 3 rounds: B1 → B2, rest 90 s after each round
//   C  Cindy (circuit, 3 rounds for time)
//   C1 Push-ups — 5 reps · C2 Bench dips — 10 reps · C3 Reverse crunch — 15 reps
// Same-letter moves with a number are one superset / circuit, done round by
// round. Returns record-shaped exercises (superset_group, block, sets).

const LETTER_LINE = /^([A-H])([1-9])?(?:[.):]|\s)\s*(.+)$/;
const LETTER_SPLIT = /\s+[·|•]\s+(?=[A-H][1-9][\s.):])/;
const KG_REPS = /(\d+(?:\.\d+)?)\s*kg\s*[x×]\s*(\d+)/gi;
const REPS_AT_KG = /(\d+)\s*(?:reps?\s*)?[x×@]\s*(\d+(?:\.\d+)?)\s*kg/gi;
const SECS = /(\d+)\s*(?:s|secs?|seconds)\b/gi;
const BW_REPS = /(?:[x×]\s*(\d+)\b|(\d+)\s*reps?\b)/gi;

function cleanLine(line) {
  return String(line ?? '')
    .replaceAll('**', '')
    .replace(/^\s*(?:[-•*]\s+)?/, '')
    .trim();
}

function hasLoadSpec(text) {
  return /\d\s*kg\b|[x×]\s*\d|\d+\s*reps?\b|\d+\s*(?:s|secs?|seconds)\b/i.test(text);
}

function splitNameSpec(content) {
  const dash = /\s+[—–-]\s+|:\s+/.exec(content);
  if (dash) return { name: content.slice(0, dash.index).trim(), spec: content.slice(dash.index + dash[0].length) };
  const firstLoad = /\s(?=\d|[x×]\s*\d)/.exec(content);
  if (firstLoad) return { name: content.slice(0, firstLoad.index).trim(), spec: content.slice(firstLoad.index) };
  return { name: content.trim(), spec: '' };
}

function parseSpecSets(spec) {
  const text = String(spec ?? '').replace(/rest\s*\d+\s*(?:s|secs?|seconds|min)\b[^,]*/gi, '');
  const cable = cableFrom(text);
  const weighted = [...text.matchAll(KG_REPS)].map(match => ({ weight_kg: Number(match[1]), reps: Number(match[2]) }));
  const repsAt = weighted.length ? [] : [...text.matchAll(REPS_AT_KG)].map(match => ({ reps: Number(match[1]), weight_kg: Number(match[2]) }));
  const loads = weighted.length ? weighted : repsAt;
  let sets;
  let tracking = null;
  if (loads.length) {
    sets = loads.map(load => ({ ...load, cable_type: normalizeCableType(cable) }));
  } else {
    const secs = [...text.matchAll(SECS)].map(match => Number(match[1]));
    const reps = [...text.matchAll(BW_REPS)].map(match => Number(match[1] ?? match[2]));
    if (secs.length && !reps.length) {
      tracking = 'timed';
      sets = secs.map(duration => ({ reps: 0, weight_kg: 0, cable_type: 'none', duration_sec: duration }));
    } else if (reps.length) {
      tracking = 'bodyweight_reps';
      sets = reps.map(count => ({ reps: count, weight_kg: 0, cable_type: 'none' }));
    } else {
      sets = [];
    }
  }
  const setCount = /(\d+)\s*sets?\b/i.exec(text);
  if (setCount && sets.length === 1) {
    sets = Array.from({ length: Number(setCount[1]) }, () => ({ ...sets[0] }));
  }
  return { sets, tracking };
}

function readGroupSettings(text, settings) {
  const rounds = /(\d+)\s*rounds?\b/i.exec(text);
  if (rounds) settings.rounds = Number(rounds[1]);
  if (/\bfor time\b/i.test(text)) settings.format = 'for_time';
  if (/\bamrap\b|as many rounds/i.test(text)) {
    settings.format = 'amrap';
    const cap = /(\d+)\s*min/i.exec(text);
    if (cap) settings.time_cap_sec = Number(cap[1]) * 60;
  }
  if (/\bcircuit\b/i.test(text)) settings.kind = 'circuit';
  const rest = /rest\s*(\d+)\s*(s|secs?|seconds|min)\b/i.exec(text);
  if (rest) settings.rest_sec = Number(rest[1]) * (/^min/i.test(rest[2]) ? 60 : 1);
}

export function parseLetteredWorkoutChat(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lines = text.split('\n');
  const exercises = [];
  const groups = new Map(); // letter → { settings, label, members: [] }
  const introLines = [];
  const outroLines = [];
  let lastLetter = null;
  let seenLettered = false;

  const groupFor = letter => {
    if (!groups.has(letter)) groups.set(letter, { settings: {}, label: '', members: [] });
    return groups.get(letter);
  };

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;
    const parts = line.split(LETTER_SPLIT);
    let matchedAny = false;
    for (const part of parts) {
      const match = LETTER_LINE.exec(part.trim());
      if (!match) continue;
      const [, letter, digit, content] = match;
      if (!digit && !hasLoadSpec(content)) {
        // Block header: "C  Cindy (circuit, 3 rounds for time)".
        if (!/\b(?:circuit|superset|rounds?|amrap|for time)\b/i.test(content)) continue;
        const group = groupFor(letter);
        const label = content.replace(/\(.*\)/, '').replace(/[—–-]\s*$/, '').trim();
        if (label && !/^(?:circuit|superset)$/i.test(label)) group.label = label;
        readGroupSettings(content, group.settings);
        lastLetter = letter;
        matchedAny = true;
        seenLettered = true;
        continue;
      }
      if (!hasLoadSpec(content)) continue;
      const { name, spec } = splitNameSpec(content);
      if (!name || name.length < 3) continue;
      const { sets, tracking } = parseSpecSets(spec);
      const exercise = {
        name,
        ...(tracking ? { tracking } : {}),
        sets
      };
      exercises.push({ letter, grouped: Boolean(digit), exercise });
      if (digit) groupFor(letter).members.push(exercise);
      readGroupSettings(spec, groupFor(letter).settings);
      lastLetter = letter;
      matchedAny = true;
      seenLettered = true;
    }
    if (matchedAny) continue;
    if (seenLettered && lastLetter && (/^↳/.test(line) || /\brounds?\b/i.test(line))) {
      readGroupSettings(line, groupFor(lastLetter).settings);
      continue;
    }
    if (!seenLettered) introLines.push(line);
    else outroLines.push(line);
  }

  if (exercises.length < 2) return null;
  if (!exercises.some(item => item.exercise.sets.length)) return null;

  let groupNumber = 0;
  for (const [letter, group] of groups) {
    if (group.members.length < 2) {
      for (const member of group.members) {
        const entry = exercises.find(item => item.exercise === member);
        if (entry) entry.grouped = false;
      }
      continue;
    }
    groupNumber += 1;
    const { settings } = group;
    const kind = settings.kind ?? (group.members.length >= 3 ? 'circuit' : 'superset');
    group.members.forEach((member, index) => {
      member.superset_group = groupNumber;
      if (settings.rounds && member.sets.length === 1) {
        member.sets = Array.from({ length: settings.rounds }, () => ({ ...member.sets[0] }));
      }
      if (index !== 0) return;
      if (group.label) member.superset_label = group.label;
      const block = {};
      if (kind === 'circuit') block.kind = 'circuit';
      if (settings.format) block.format = settings.format;
      if (settings.rest_sec) block.rest_sec = settings.rest_sec;
      if (settings.time_cap_sec) block.time_cap_sec = settings.time_cap_sec;
      if (Object.keys(block).length) member.block = block;
    });
    void letter;
  }
  if (!groupNumber && exercises.length < 3) return null;

  return {
    intro: introLines.join('\n').trim(),
    exercises: exercises.map(item => item.exercise),
    outro: outroLines.join('\n').trim(),
    lettered: true
  };
}
