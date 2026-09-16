export const FITNESS_COACHING_PROFILE_PATH = 'data/fitness-coaching-profile.json';

const LIST_FIELDS = [
  'physique_references',
  'priority_areas',
  'enjoys',
  'dislikes',
  'programming_preferences',
  'health_constraints'
];

function clean(value, max = 300) {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/\s+/g, ' ').slice(0, max)
    : '';
}

function cleanList(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map(item => clean(item)).filter(Boolean))].slice(0, 40);
}

export function parseFitnessCoachingProfile(content) {
  if (typeof content !== 'string') return {};
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function validateFitnessCoachingProfilePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const patch = {};
  for (const field of LIST_FIELDS) {
    const value = cleanList(input[field]);
    if (value) patch[field] = value;
  }
  for (const field of ['goal_notes', 'open_question', 'last_answer']) {
    const value = clean(input[field], 800);
    if (value) patch[field] = value;
  }
  return Object.keys(patch).length ? patch : null;
}

export function mergeFitnessCoachingProfile(profile, patch, updatedAt) {
  const next = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? { ...profile }
    : {};
  for (const field of LIST_FIELDS) {
    if (!Array.isArray(patch?.[field])) continue;
    next[field] = [...new Set([...(Array.isArray(next[field]) ? next[field] : []), ...patch[field]])];
  }
  for (const field of ['goal_notes', 'open_question', 'last_answer']) {
    if (patch?.[field]) next[field] = patch[field];
  }
  next.updated_at = updatedAt;
  return next;
}

export function formatFitnessCoachingProfileForPrompt(profile) {
  if (!profile || typeof profile !== 'object' || Object.keys(profile).length === 0) {
    return 'No durable coaching profile is stored yet. Ask one focused question when an answer would materially improve programming, then save the answer.';
  }
  const lines = [];
  const labels = {
    physique_references: 'Physique references',
    priority_areas: 'Priority areas',
    enjoys: 'Enjoys',
    dislikes: 'Dislikes',
    programming_preferences: 'Programming preferences',
    health_constraints: 'Health constraints'
  };
  for (const field of LIST_FIELDS) {
    if (Array.isArray(profile[field]) && profile[field].length) {
      lines.push(`${labels[field]}: ${profile[field].join('; ')}`);
    }
  }
  if (profile.goal_notes) lines.push(`Goal notes: ${profile.goal_notes}`);
  if (profile.last_answer) lines.push(`Latest coaching answer: ${profile.last_answer}`);
  if (profile.open_question) lines.push(`Open coaching question: ${profile.open_question}`);
  return lines.join('\n');
}

export function saveFitnessCoachingProfileSchema() {
  return {
    name: 'save_fitness_coaching_profile',
    description: 'Save durable answers about Adam\'s physique goals, priorities, exercise enjoyment, dislikes, programming preferences, and relevant constraints. Call in the same turn he answers a coaching question or states a durable preference. Merge new facts with the existing profile.',
    input_schema: {
      type: 'object',
      properties: {
        physique_references: { type: 'array', items: { type: 'string' } },
        priority_areas: { type: 'array', items: { type: 'string' } },
        enjoys: { type: 'array', items: { type: 'string' } },
        dislikes: { type: 'array', items: { type: 'string' } },
        programming_preferences: { type: 'array', items: { type: 'string' } },
        health_constraints: { type: 'array', items: { type: 'string' } },
        goal_notes: { type: 'string' },
        open_question: { type: 'string' },
        last_answer: { type: 'string' }
      }
    }
  };
}
