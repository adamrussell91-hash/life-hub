import { TYPE_DOMAINS } from '../../../js/core/records.js';
import { validateRecord } from '../../../js/core/validate.js';
import { isCalendarDate } from '../../../js/core/time.js';

const RECORD_TYPES = ['meal', 'workout', 'diary', 'weight', 'composition', 'measurements', 'skincare'];
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
    day_type: { type: 'string', enum: ['movement', 'workout_30', 'workout_45_60'] },
    status: { type: 'string', enum: ['planned', 'completed', 'skipped'] },
    duration_min: { type: 'number' },
    focus: { type: 'array', items: { type: 'string' } },
    recovery_flag_next_day: { type: 'boolean' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          sets: {
            type: 'array',
            items: {
              type: 'object',
              properties: { reps: { type: 'number' }, weight_kg: { type: 'number' } },
              required: ['reps', 'weight_kg']
            }
          }
        },
        required: ['name', 'sets']
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
    dayone_sent: { type: 'boolean' }
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
    right_arm: { type: 'number' }, left_arm: { type: 'number' },
    right_thigh: { type: 'number' }, left_thigh: { type: 'number' },
    calves: { type: 'number' }, neck: { type: 'number' }, shoulders: { type: 'number' }
  },
  skincare: {
    routine: { type: 'string', enum: ['am', 'pm'] },
    completed: { type: 'boolean' },
    products: { type: 'array', items: { type: 'string' } },
    skin_note: { type: 'string' }
  }
};

export function logEntryToolSchema(allowedTypes = RECORD_TYPES) {
  const fieldsSchema = allowedTypes.length === 1
    ? {
        type: 'object',
        description: `The exact fields for a ${allowedTypes[0]} record. Only these keys are allowed — using any other key name is rejected.`,
        properties: DOMAIN_PROPERTIES[allowedTypes[0]],
        additionalProperties: false
      }
    : {
        type: 'object',
        description: `Domain-specific fields for the chosen type. Only these exact keys are allowed per type — using any other key name is rejected:\n${
          allowedTypes.map(t => `- ${t}: ${Object.keys(DOMAIN_PROPERTIES[t]).join(', ')}`).join('\n')
        }`
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
