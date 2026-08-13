import { TYPE_DOMAINS } from '../../../js/core/records.js';
import { validateRecord } from '../../../js/core/validate.js';
import { isCalendarDate } from '../../../js/core/time.js';

const RECORD_TYPES = ['meal', 'workout', 'diary', 'weight', 'composition', 'measurements', 'skincare', 'mind_session'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DOMAIN_PROPERTIES = {
  meal: {
    meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
    calories: { type: 'number' },
    protein_g: { type: 'number' },
    fat_g: { type: 'number' },
    saturated_fat_g: { type: 'number' },
    unsaturated_fat_g: { type: 'number' },
    carbs_g: { type: 'number' },
    sugar_g: { type: 'number' },
    fibre_g: { type: 'number' },
    sodium_mg: { type: 'number' },
    calcium_mg: { type: 'number' },
    polyphenol_score: { type: 'number' },
    omega3: { type: 'string', enum: ['high', 'medium', 'low', 'none'] }
  },
  workout: {
    title: { type: 'string' },
    session_kind: { type: 'string', enum: ['strength', 'walk', 'ep', 'mobility', 'other'] },
    day_type: { type: 'string', enum: ['movement', 'workout_30', 'workout_45_60'] },
    status: { type: 'string', enum: ['planned', 'completed', 'skipped'] },
    duration_min: { type: 'number' },
    avg_hr: { type: 'number' },
    calories_kcal: { type: 'number' },
    distance_km: { type: 'number' },
    focus: { type: 'array', items: { type: 'string' } },
    recovery_flag_next_day: { type: 'boolean' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          bench_angle_deg: { type: 'number' },
          intensification: {
            type: 'string',
            enum: ['drop_set', 'rest_pause', 'eccentric_overload', 'elastic_finisher', 'superset', 'other']
          },
          equipment: { type: 'string' },
          coach_cues: {
            type: 'object',
            description: 'Optional presence during the session (planned exercises only): a short line to show on starting this exercise, during rest between sets, and on the final set. Zero extra API calls -- generated once, up front, alongside the plan.',
            properties: {
              start: { type: 'string', description: 'Shown when Adam opens this exercise.' },
              rest: { type: 'string', description: 'Shown between sets while he rests.' },
              final_set: { type: 'string', description: 'Shown on the last set, e.g. "1-2 reps in the tank, this is the one that counts."' }
            }
          },
          sets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                reps: { type: 'number' },
                weight_kg: { type: 'number' },
                cable_type: {
                  type: 'string',
                  enum: ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none']
                }
              },
              required: ['reps', 'weight_kg', 'cable_type']
            }
          }
        },
        required: ['name']
      }
    },
    pain_flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: { site: { type: 'string' }, note: { type: 'string' } },
        required: ['site']
      }
    }
  },
  diary: {
    mood_score: { type: 'number' },
    mood: { type: 'string', enum: ['great', 'good', 'neutral', 'low', 'bad'] },
    energy: { type: 'string', enum: ['high', 'medium', 'low'] },
    tags: { type: 'array', items: { type: 'string' } },
    highlights: { type: 'string' },
    challenges: { type: 'string' },
    dayone_sent: { type: 'boolean' },
    moods: { type: 'array', items: { type: 'string', enum: ['great', 'good', 'neutral', 'low', 'bad'] } },
    system_note: { type: 'string' },
    cross_agent_note: { type: 'string' }
  },
  weight: { weight_kg: { type: 'number' } },
  composition: {
    weight_kg: { type: 'number' },
    body_fat_pct: { type: 'number' },
    skeletal_muscle_kg: { type: 'number' },
    visceral_fat_level: { type: 'number' },
    body_age: { type: 'number' }
  },
  measurements: {
    chest: { type: 'number' }, waist: { type: 'number' }, hips: { type: 'number' },
    shoulders: { type: 'number' }, neck: { type: 'number' },
    right_arm_flexed: { type: 'number' }, left_arm_flexed: { type: 'number' },
    right_arm_relaxed: { type: 'number' }, left_arm_relaxed: { type: 'number' },
    right_thigh: { type: 'number' }, left_thigh: { type: 'number' },
    calves: { type: 'number' }
  },
  skincare: {
    routine: { type: 'string', enum: ['am', 'pm'] },
    completed: { type: 'boolean' },
    products: { type: 'array', items: { type: 'string' } },
    skin_note: { type: 'string' }
  },
  mind_session: {
    theme: { type: 'string' },
    closing_question: { type: 'string' },
    insight: { type: 'string' },
    mood_at_open: { type: 'string', enum: ['great', 'good', 'neutral', 'low', 'bad'] },
    mood_at_close: { type: 'string', enum: ['great', 'good', 'neutral', 'low', 'bad'] },
    cross_agent_note: { type: 'string' }
  }
};

const MEAL_REQUIRED_FIELDS = ['meal', 'calories', 'protein_g', 'fat_g', 'sodium_mg', 'calcium_mg', 'polyphenol_score', 'omega3'];

export function logEntryToolSchema(allowedTypes = RECORD_TYPES) {
  const fieldsSchema = allowedTypes.length === 1
    ? {
        type: 'object',
        description: `The exact fields for a ${allowedTypes[0]} record. Only these keys are allowed — using any other key name is rejected.`,
        properties: DOMAIN_PROPERTIES[allowedTypes[0]],
        additionalProperties: false,
        ...(allowedTypes[0] === 'meal' ? { required: MEAL_REQUIRED_FIELDS } : {})
      }
    : {
        type: 'object',
        description: `Domain-specific fields for the chosen type. Only these exact keys are allowed per type — using any other key name is rejected:\n${
          allowedTypes.map(t => `- ${t}: ${Object.keys(DOMAIN_PROPERTIES[t]).join(', ')}`).join('\n')
        }\nFor meals, always include: ${MEAL_REQUIRED_FIELDS.join(', ')}.`
      };

  return {
    name: 'log_entry',
    description: 'Propose one Life Hub record for Adam to review and confirm before it is saved. Never call this unless Adam has clearly described a specific record.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: allowedTypes },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM, optional' },
        notes: { type: 'string', description: 'Optional free-text note saved as the record body, e.g. what food was eaten or how a workout felt. Not a domain field — do not put this in fields.' },
        fields: fieldsSchema
      },
      required: ['type', 'date', 'fields']
    }
  };
}

export function buildCanonicalPath({ type, date, slug }) {
  const domain = TYPE_DOMAINS[type];
  if (!domain) throw new TypeError(`Unknown record type: ${type}`);
  if (!isCalendarDate(date)) throw new TypeError(`Invalid date: ${date}`);
  if (!SLUG.test(slug)) throw new TypeError(`Invalid slug: ${slug}`);
  const [year, month] = date.split('-');
  return `data/${domain}/${year}/${month}/${date}-${slug}.md`;
}

/**
 * Stable path slug for a validated record.
 * Meals use slot-only slugs so same-day corrections overwrite the same file.
 */
export function buildRecordSlug(record) {
  if (!record || typeof record !== 'object') throw new TypeError('record is required');
  if (record.type === 'meal') {
    if (typeof record.meal !== 'string' || !SLUG.test(record.meal)) {
      throw new TypeError(`Invalid meal slot: ${record.meal}`);
    }
    return record.meal;
  }
  if (record.type === 'mind_session') return 'session';
  const label = record.type === 'skincare' ? record.routine : record.type;
  if (typeof label !== 'string' || !SLUG.test(label)) {
    throw new TypeError(`Invalid slug label: ${label}`);
  }
  const time = typeof record.time === 'string' ? record.time.replace(':', '') : '0000';
  return `${label}-${time}`;
}

export function validateLogEntry(candidate, { id, now, source = 'chat' } = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errors: ['log_entry payload must be an object'] };
  }
  const { type, date, time, fields, notes } = candidate;
  if (!RECORD_TYPES.includes(type)) return { valid: false, errors: [`Unknown record type: ${type}`] };
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return { valid: false, errors: ['fields must be an object'] };
  }
  if (notes != null && typeof notes !== 'string') {
    return { valid: false, errors: ['notes must be a string'] };
  }
  if (typeof now !== 'string' || !now) {
    return { valid: false, errors: ['now must be a non-empty string'] };
  }
  const allowedFields = Object.keys(DOMAIN_PROPERTIES[type]);
  const unknownFields = Object.keys(fields).filter(key => !allowedFields.includes(key));
  if (unknownFields.length) {
    return { valid: false, errors: unknownFields.map(key => `Unknown field for ${type}: ${key}`) };
  }

  if (type === 'meal') {
    const missingMealFields = MEAL_REQUIRED_FIELDS.filter(field => fields[field] == null);
    if (missingMealFields.length) {
      return {
        valid: false,
        errors: missingMealFields.map(field => `${field} is required`)
      };
    }
  }

  const record = {
    ...fields,
    schema_version: 1,
    id,
    type,
    date,
    time: time ?? now.slice(11, 16),
    created_at: now,
    updated_at: now,
    source
  };
  const errors = validateRecord(record);
  return errors.length ? { valid: false, errors } : { valid: true, record, notes: notes ?? null };
}

export { DOMAIN_PROPERTIES };
