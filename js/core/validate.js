const COMMON_FIELDS = [
  'schema_version', 'id', 'type', 'date', 'time', 'created_at', 'updated_at', 'source'
];

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MOODS = ['great', 'good', 'neutral', 'low', 'bad'];
const ENERGY_LEVELS = ['high', 'medium', 'low'];
const DAY_TYPES = ['movement', 'workout_30', 'workout_45_60'];
const WORKOUT_STATUSES = ['planned', 'completed', 'skipped'];
const ROUTINES = ['am', 'pm'];
const OMEGA3_LEVELS = ['high', 'medium', 'low', 'none'];

const MEAL_NUMBERS = [
  'calories', 'protein_g', 'fat_g', 'saturated_fat_g', 'unsaturated_fat_g',
  'carbs_g', 'sugar_g', 'fibre_g', 'sodium_mg', 'calcium_mg'
];
const COMPOSITION_NUMBERS = [
  'weight_kg', 'body_fat_pct', 'skeletal_muscle_kg', 'visceral_fat_level', 'body_age'
];
const MEASUREMENT_NUMBERS = [
  'chest', 'waist', 'hips', 'right_arm', 'left_arm', 'right_thigh', 'left_thigh',
  'calves', 'neck', 'shoulders'
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
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
  optionalString(record, 'title', errors);
  stringArray(record, 'focus', errors);
  finiteNumber(record, 'duration_min', errors);
  enumeration(record, 'day_type', DAY_TYPES, errors, true);
  enumeration(record, 'status', WORKOUT_STATUSES, errors, true);
  booleanField(record, 'recovery_flag_next_day', errors);

  if (!Array.isArray(record.exercises)) {
    errors.push('exercises must be an array');
  } else {
    if (record.status === 'completed' && record.exercises.length === 0) {
      errors.push('completed workout exercises must not be empty');
    }
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
      if (!Array.isArray(exercise.sets)) {
        errors.push(`${prefix}.sets must be an array`);
        return;
      }
      if (exercise.sets.length === 0) errors.push(`${prefix}.sets must not be empty`);
      exercise.sets.forEach((set, setIndex) => {
        const setPrefix = `${prefix}.sets[${setIndex}]`;
        if (!isObject(set)) {
          errors.push(`${setPrefix} must be an object`);
          return;
        }
        finiteNumber(set, 'reps', errors, { required: true });
        finiteNumber(set, 'weight_kg', errors, { required: true });
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
  booleanField(record, 'dayone_sent', errors);
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

const VALIDATORS = {
  meal: validateMeal,
  workout: validateWorkout,
  diary: validateDiary,
  weight: validateWeight,
  composition: validateComposition,
  measurements: validateMeasurements,
  sleep: validateSleep,
  heart: validateHeart,
  skincare: validateSkincare,
  fragrance: validateFragrance
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
