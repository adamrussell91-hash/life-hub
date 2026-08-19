import { isCalendarDate } from './time.js';

const COMMON_FIELDS = [
  'schema_version', 'id', 'type', 'date', 'time', 'created_at', 'updated_at', 'source'
];

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MOODS = ['great', 'good', 'neutral', 'low', 'bad'];
const ENERGY_LEVELS = ['high', 'medium', 'low'];
const DAY_TYPES = ['movement', 'workout_30', 'workout_45_60'];
const WORKOUT_STATUSES = ['planned', 'completed', 'skipped'];
const SESSION_KINDS = ['strength', 'walk', 'ep', 'mobility', 'other'];
const CABLE_TYPES = ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none'];
const INTENSIFICATIONS = ['drop_set', 'rest_pause', 'eccentric_overload', 'elastic_finisher', 'superset', 'other'];
const ROUTINES = ['am', 'pm'];
const OMEGA3_LEVELS = ['high', 'medium', 'low', 'none'];
const SESSION_TYPES = ['check-in', 'deep-dive', 'pattern-review', 'historical'];
const DIARY_SOURCE_AGENTS = ['penelope', 'import'];
const SESSION_SOURCE_AGENTS = ['vera', 'import'];
const CROSS_AGENT_AGENT_NAMES = ['Vera', 'Penelope', 'Hammond', 'Sara', 'Brisket', 'Chadwick', 'Hyaluronica'];
const CROSS_AGENT_NOTE_RE = new RegExp(
  `^(${CROSS_AGENT_AGENT_NAMES.join('|')})\\u2192(${CROSS_AGENT_AGENT_NAMES.join('|')}):\\s*\\S`
);

const MEAL_NUMBERS = [
  'calories', 'protein_g', 'fat_g', 'saturated_fat_g', 'unsaturated_fat_g',
  'carbs_g', 'sugar_g', 'fibre_g', 'sodium_mg', 'calcium_mg'
];
const COMPOSITION_NUMBERS = [
  'weight_kg', 'body_fat_pct', 'skeletal_muscle_kg', 'visceral_fat_level', 'body_age'
];
const MEASUREMENT_NUMBERS = [
  'chest', 'waist', 'hips', 'shoulders', 'neck',
  'right_arm_flexed', 'left_arm_flexed',
  'right_arm_relaxed', 'left_arm_relaxed',
  'right_thigh', 'left_thigh', 'calves'
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function sydneyParts(instant) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'longOffset'
  }).formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function isSydneyTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3])):([0-5]\d):([0-5]\d)(?:\.\d+)?(\+10:00|\+11:00)$/.exec(value);
  if (!match || !isCalendarDate(`${match[1]}-${match[2]}-${match[3]}`)) return false;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return false;
  const parts = sydneyParts(instant);
  return parts.year === match[1]
    && parts.month === match[2]
    && parts.day === match[3]
    && parts.hour === match[4]
    && parts.minute === match[5]
    && parts.second === match[6]
    && parts.timeZoneName === `GMT${match[7]}`;
}

function requireString(record, field, errors) {
  if (typeof record[field] !== 'string' || record[field].trim() === '') {
    errors.push(`${field} must be a non-empty string`);
  }
}

function optionalString(record, field, errors) {
  if (record[field] != null && typeof record[field] !== 'string') {
    errors.push(`${field} must be a string or null`);
  }
}

function crossAgentNote(record, field, errors, { senderName } = {}) {
  const value = record[field];
  if (value == null) return;
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string or null`);
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) return;
  const match = CROSS_AGENT_NOTE_RE.exec(trimmed);
  if (!match) {
    errors.push(
      `${field} must be "Sender→Recipient: ..." using implemented agent names (${CROSS_AGENT_AGENT_NAMES.join(', ')})`
    );
    return;
  }
  const [, sender, recipient] = match;
  if (senderName && sender !== senderName) {
    errors.push(`${field} sender must be ${senderName} on a ${senderName === 'Vera' ? 'mind_session' : 'diary'} record`);
  }
  if (sender === recipient) {
    errors.push(`${field} sender and recipient must differ`);
  }
}

function booleanField(record, field, errors, required = false) {
  if (record[field] == null) {
    if (required) errors.push(`${field} is required`);
  } else if (typeof record[field] !== 'boolean') {
    errors.push(`${field} must be a boolean`);
  }
}

function finiteNumber(record, field, errors, options = {}) {
  const { required = false, minimum = 0, maximum = Number.POSITIVE_INFINITY } = options;
  const value = record[field];
  if (value == null) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
  } else if (value < minimum || value > maximum) {
    errors.push(`${field} must be between ${minimum} and ${maximum}`);
  }
}

function enumeration(record, field, values, errors, required = false) {
  const value = record[field];
  if (value == null) {
    if (required) errors.push(`${field} is required`);
  } else if (!values.includes(value)) {
    errors.push(`${field} must be one of: ${values.join(', ')}`);
  }
}

function stringArray(record, field, errors, required = false) {
  const value = record[field];
  if (value == null) {
    if (required) errors.push(`${field} is required`);
  } else if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    errors.push(`${field} must be an array of strings`);
  }
}

function validateMeal(record, errors) {
  enumeration(record, 'meal', MEALS, errors, true);
  for (const field of MEAL_NUMBERS) {
    finiteNumber(record, field, errors, { required: ['calories', 'protein_g', 'fat_g'].includes(field) });
  }
  finiteNumber(record, 'polyphenol_score', errors, { minimum: 0, maximum: 10 });
  enumeration(record, 'omega3', OMEGA3_LEVELS, errors);
}

function validateWorkout(record, errors) {
  requireString(record, 'title', errors);
  stringArray(record, 'focus', errors);
  finiteNumber(record, 'duration_min', errors);
  finiteNumber(record, 'avg_hr', errors);
  finiteNumber(record, 'calories_kcal', errors);
  finiteNumber(record, 'distance_km', errors);
  enumeration(record, 'day_type', DAY_TYPES, errors, true);
  enumeration(record, 'status', WORKOUT_STATUSES, errors, true);
  enumeration(record, 'session_kind', SESSION_KINDS, errors, true);
  booleanField(record, 'recovery_flag_next_day', errors);

  const kind = record.session_kind;
  const strengthLike = kind === 'strength' || kind == null;

  if (!Array.isArray(record.exercises)) {
    errors.push('exercises must be an array');
  } else if (record.status === 'completed' && strengthLike && record.exercises.length === 0) {
    errors.push('completed strength workout exercises must not be empty');
  } else if (record.status === 'completed' && kind === 'walk' && record.exercises.length === 0) {
    if (record.duration_min == null && record.distance_km == null) {
      errors.push('completed walk workouts need duration_min or distance_km when exercises are empty');
    }
  } else {
    record.exercises.forEach((exercise, exerciseIndex) => {
      const prefix = `exercises[${exerciseIndex}]`;
      if (!isObject(exercise)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (typeof exercise.name !== 'string' || exercise.name.trim() === '') {
        errors.push(`${prefix}.name must be a non-empty string`);
      }
      optionalString(exercise, 'equipment', errors);
      finiteNumber(exercise, 'bench_angle_deg', errors, { minimum: 0, maximum: 90 });
      if (exercise.intensification != null) {
        enumeration(exercise, 'intensification', INTENSIFICATIONS, errors);
      }
      if (exercise.coach_cues != null) {
        if (!isObject(exercise.coach_cues)) {
          errors.push(`${prefix}.coach_cues must be an object`);
        } else {
          for (const field of ['start', 'rest', 'final_set']) {
            optionalString(exercise.coach_cues, field, errors);
          }
        }
      }
      if (exercise.sets == null) {
        if (strengthLike && record.status === 'completed') {
          errors.push(`${prefix}.sets must be an array`);
        }
        return;
      }
      if (!Array.isArray(exercise.sets)) {
        errors.push(`${prefix}.sets must be an array`);
        return;
      }
      if (exercise.sets.length === 0 && strengthLike && record.status === 'completed') {
        errors.push(`${prefix}.sets must not be empty`);
      }
      exercise.sets.forEach((set, setIndex) => {
        const setPrefix = `${prefix}.sets[${setIndex}]`;
        if (!isObject(set)) {
          errors.push(`${setPrefix} must be an object`);
          return;
        }
        finiteNumber(set, 'reps', errors, { required: true });
        finiteNumber(set, 'weight_kg', errors, { required: true, minimum: 0 });
        enumeration(set, 'cable_type', CABLE_TYPES, errors, true);
      });
    });
  }

  if (record.pain_flags != null) {
    if (!Array.isArray(record.pain_flags)) {
      errors.push('pain_flags must be an array');
    } else {
      record.pain_flags.forEach((flag, index) => {
        if (!isObject(flag)) {
          errors.push(`pain_flags[${index}] must be an object`);
          return;
        }
        requireString(flag, 'site', errors);
        optionalString(flag, 'note', errors);
      });
    }
  }
}

function validateDiary(record, errors) {
  finiteNumber(record, 'mood_score', errors, { minimum: 1, maximum: 10 });
  enumeration(record, 'mood', MOODS, errors);
  enumeration(record, 'energy', ENERGY_LEVELS, errors);
  stringArray(record, 'tags', errors);
  optionalString(record, 'highlights', errors);
  optionalString(record, 'challenges', errors);
  optionalString(record, 'system_note', errors);
  crossAgentNote(record, 'cross_agent_note', errors, { senderName: 'Penelope' });
  booleanField(record, 'dayone_sent', errors);
  if (record.moods != null) {
    if (!Array.isArray(record.moods) || record.moods.length < 1 || record.moods.length > 3) {
      errors.push('moods must be an array of 1–3 items');
    } else {
      for (const item of record.moods) {
        if (!MOODS.includes(item)) errors.push(`moods items must be one of: ${MOODS.join(', ')}`);
      }
      if (record.mood != null && !record.moods.includes(record.mood)) {
        errors.push('mood must be one of moods when moods is present');
      }
    }
  }
  enumeration(record, 'source_agent', DIARY_SOURCE_AGENTS, errors);
}

function validateMindSession(record, errors) {
  optionalString(record, 'title', errors);
  optionalString(record, 'theme', errors);
  optionalString(record, 'closing_question', errors);
  optionalString(record, 'insight', errors);
  optionalString(record, 'framework', errors);
  optionalString(record, 'observation', errors);
  crossAgentNote(record, 'cross_agent_note', errors, { senderName: 'Vera' });
  stringArray(record, 'themes', errors);
  stringArray(record, 'pattern_tags', errors);
  enumeration(record, 'session_type', SESSION_TYPES, errors);
  enumeration(record, 'source_agent', SESSION_SOURCE_AGENTS, errors);
  enumeration(record, 'mood_at_open', MOODS, errors);
  enumeration(record, 'mood_at_close', MOODS, errors);
  const hasCore = [record.title, record.theme, record.closing_question, record.insight]
    .some(v => typeof v === 'string' && v.trim() !== '')
    || (Array.isArray(record.themes) && record.themes.some(t => String(t).trim()));
  if (!hasCore) errors.push('mind_session requires title, theme, themes, insight, or closing_question');
}

function validateWeight(record, errors) {
  finiteNumber(record, 'weight_kg', errors);
}

function validateComposition(record, errors) {
  for (const field of COMPOSITION_NUMBERS) finiteNumber(record, field, errors);
}

function validateMeasurements(record, errors) {
  for (const field of MEASUREMENT_NUMBERS) finiteNumber(record, field, errors);
}

function validateSleep(record, errors) {
  for (const field of ['bed_time', 'wake_time']) {
    if (record[field] != null && !isTime(record[field])) errors.push(`${field} must be HH:MM or null`);
  }
  finiteNumber(record, 'duration_h', errors);
  finiteNumber(record, 'quality', errors, { minimum: 1, maximum: 10 });
}

function validateHeart(record, errors) {
  finiteNumber(record, 'resting_hr', errors);
  finiteNumber(record, 'avg_hr', errors);
}

function validateSkincare(record, errors) {
  enumeration(record, 'routine', ROUTINES, errors, true);
  booleanField(record, 'completed', errors, true);
  stringArray(record, 'products', errors, true);
  optionalString(record, 'skin_note', errors);
}

function validateFragrance(record, errors) {
  requireString(record, 'fragrance', errors);
  optionalString(record, 'occasion', errors);
}

function validateBloods(record, errors) {
  const markers = record.markers;
  if (!Array.isArray(markers)) {
    errors.push('markers must be an array');
    return;
  }
  for (const marker of markers) {
    if (!isObject(marker)) {
      errors.push('markers entries must be objects');
      continue;
    }
    if (typeof marker.key !== 'string' || marker.key.trim() === '') {
      errors.push('marker key must be a non-empty string');
    }
    if (marker.value != null && (typeof marker.value !== 'number' || !Number.isFinite(marker.value))) {
      errors.push('marker value must be a finite number or null');
    }
    for (const bound of ['ref_low', 'ref_high']) {
      if (marker[bound] != null && (typeof marker[bound] !== 'number' || !Number.isFinite(marker[bound]))) {
        errors.push(`marker ${bound} must be a finite number or null`);
      }
    }
  }
}

const VALIDATORS = {
  meal: validateMeal,
  workout: validateWorkout,
  diary: validateDiary,
  mind_session: validateMindSession,
  weight: validateWeight,
  composition: validateComposition,
  measurements: validateMeasurements,
  sleep: validateSleep,
  heart: validateHeart,
  skincare: validateSkincare,
  fragrance: validateFragrance,
  bloods: validateBloods
};

export function validateUniqueIds(eventsOrRecords) {
  if (!Array.isArray(eventsOrRecords)) return ['eventsOrRecords must be an array'];
  const counts = new Map();
  for (const item of eventsOrRecords) {
    const record = isObject(item?.record) ? item.record : item;
    const id = record?.id;
    if (typeof id === 'string' && id.trim() !== '') {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([id, count]) => `duplicate id "${id}" appears ${count} times`);
}

export function validateRecord(record, { allowLegacy = false } = {}) {
  const errors = [];
  if (!isObject(record)) return ['record must be an object'];

  if (!allowLegacy) {
    for (const field of COMMON_FIELDS) {
      if (record[field] == null) errors.push(`${field} is required`);
    }
  }

  if (record.schema_version != null && record.schema_version !== 1) {
    errors.push('schema_version must be 1');
  }
  if (record.id != null) requireString(record, 'id', errors);
  if (record.date == null) {
    if (allowLegacy) errors.push('date is required');
  } else if (!isCalendarDate(record.date)) {
    errors.push('date must be a valid calendar date in YYYY-MM-DD form');
  }
  if (record.time != null && !isTime(record.time)) errors.push('time must be HH:MM');
  for (const field of ['created_at', 'updated_at']) {
    if (record[field] != null && !isSydneyTimestamp(record[field])) {
      errors.push(`${field} must be a Sydney-offset ISO timestamp`);
    }
  }
  if (record.source != null) requireString(record, 'source', errors);

  if (typeof record.type !== 'string' || record.type.trim() === '') {
    if (!errors.includes('type is required')) errors.push('type is required');
    return errors;
  }
  const validator = VALIDATORS[record.type];
  if (!validator) {
    errors.push(`Unknown record type: ${record.type}`);
    return errors;
  }
  validator(record, errors);
  return errors;
}
