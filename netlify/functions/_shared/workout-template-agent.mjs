// Chadwick: explicit save/rename of a workout template under data/fitness/templates/.
// Confirm-only — builds an os_propose_action GitHub write (allowlisted data/fitness/**).

import {
  buildTemplateRecord,
  isTemplatePath,
  renderTemplateMarkdown,
  templatePathForTitle
} from './workout-templates.mjs';
import { clean, makeProposal } from './agent-propose-helpers.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeExercises(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(exercise => ({
    name: clean(exercise?.name, 160),
    ...(exercise?.bench_angle_deg != null ? { bench_angle_deg: exercise.bench_angle_deg } : {}),
    ...(exercise?.intensification != null ? { intensification: clean(exercise.intensification, 80) } : {}),
    sets: (Array.isArray(exercise?.sets) ? exercise.sets : []).map(set => ({
      reps: set?.reps,
      weight_kg: set?.weight_kg,
      cable_type: set?.cable_type
    }))
  })).filter(exercise => exercise.name);
}

export function saveWorkoutTemplateSchema() {
  return {
    name: 'save_workout_template',
    description:
      'Propose saving or updating a named workout template under Fitness templates. Nothing is written until Adam taps Confirm. Use when he asks to save / rename / keep a prescription as a reusable template — not for logging a completed session (use log_entry).',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line for the Confirm card.' },
        title: { type: 'string', description: 'Template title (required).' },
        source_session_date: { type: 'string', description: 'YYYY-MM-DD of the session these actuals came from.' },
        session_kind: { type: 'string' },
        day_type: { type: 'string' },
        focus: { type: 'array', items: { type: 'string' } },
        exercises: {
          type: 'array',
          description: 'Full prescription. Prefer this when designing or editing a template in chat.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              bench_angle_deg: { type: 'number' },
              intensification: { type: 'string' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    reps: {},
                    weight_kg: {},
                    cable_type: { type: 'string' }
                  },
                  additionalProperties: false
                }
              }
            },
            required: ['name'],
            additionalProperties: false
          }
        },
        from_session: {
          type: 'object',
          description: 'Resolve exercises from a loaded completed session (date + optional title match).',
          properties: {
            date: { type: 'string' },
            title: { type: 'string' }
          },
          required: ['date'],
          additionalProperties: false
        }
      },
      required: ['summary', 'title'],
      additionalProperties: false
    }
  };
}

function sessionFromRecords(records, fromSession) {
  const date = clean(fromSession?.date, 10);
  if (!DATE_RE.test(date)) return null;
  const titleNeedle = clean(fromSession?.title, 160).toLowerCase();
  const list = Array.isArray(records) ? records : [];
  const matches = list.filter(record =>
    record
    && record.status === 'completed'
    && record.date === date
    && (!titleNeedle || String(record.title ?? '').toLowerCase().includes(titleNeedle))
  );
  return matches[0] ?? null;
}

/**
 * Build a Confirm proposal that writes data/fitness/templates/<slug>.md.
 * Optional `workoutRecords` resolves from_session.
 */
export function buildWorkoutTemplateProposal(input, { workoutRecords = [] } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const title = clean(input.title, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!title) return { ok: false, error: 'title_required' };

  let session = {
    title,
    session_kind: clean(input.session_kind, 40) || undefined,
    day_type: clean(input.day_type, 40) || undefined,
    focus: Array.isArray(input.focus) ? input.focus.map(item => clean(item, 40)).filter(Boolean) : [],
    exercises: normalizeExercises(input.exercises)
  };

  if (input.from_session) {
    const found = sessionFromRecords(workoutRecords, input.from_session);
    if (!found) return { ok: false, error: 'session_not_found', detail: clean(input.from_session.date, 10) };
    session = {
      title,
      session_kind: session.session_kind || found.session_kind,
      day_type: session.day_type || found.day_type,
      focus: session.focus.length ? session.focus : (Array.isArray(found.focus) ? found.focus : []),
      exercises: session.exercises.length ? session.exercises : (found.exercises ?? [])
    };
  }

  if (!session.exercises.length) {
    return { ok: false, error: 'exercises_required', detail: 'Pass exercises[] or from_session with a completed workout.' };
  }

  const sourceDate = DATE_RE.test(clean(input.source_session_date, 10))
    ? clean(input.source_session_date, 10)
    : (DATE_RE.test(clean(input.from_session?.date, 10)) ? clean(input.from_session.date, 10) : null);

  const template = buildTemplateRecord(session, sourceDate);
  template.title = title;
  const path = templatePathForTitle(title);
  if (!isTemplatePath(path)) return { ok: false, error: 'invalid_template_path', detail: path };
  const content = renderTemplateMarkdown(template);

  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path,
      mode: 'overwrite',
      content,
      diff: `Save workout template: ${title} (${session.exercises.length} exercises)`
    }], {
      reads: ['data/fitness/templates'],
      surfaces: ['confirm_card', 'fitness_tab', 'governance_log']
    }),
    path,
    template
  };
}
