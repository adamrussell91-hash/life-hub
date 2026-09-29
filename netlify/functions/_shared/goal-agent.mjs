// Goals propose tools for Hammond + Clare. Confirm → tasks blobs (goals/, goal_checkins/).

import { GOAL_INPUT_KEYS, normalizeGoalRecord } from './goal-record.mjs';
import { getJSON, setJSON, readIndex, writeIndex, newRecordId } from './tasks-blobs.mjs';
import { clean, makeProposal, parseWriteBody, writeError } from './agent-propose-helpers.mjs';

export const GOAL_AGENT_SLUGS = new Set(['hammond', 'clare']);

const NEW_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SPHERES = new Set(['life', 'work', 'professional']);

export function proposeGoalSchema() {
  return {
    name: 'propose_goal',
    description:
      'Propose creating a Goals Hub goal (optionally grown from a someday). Nothing is saved until Adam taps Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        sphere: { type: 'string', enum: ['life', 'work', 'professional'] },
        structure: { type: 'string' },
        parent_area_id: { type: 'string' },
        parent_someday_id: { type: 'string', description: 'Grow a someday into a goal' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string' },
        life_area: { type: 'string' },
        frame: { type: 'object' },
        lead_measure: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            per_week: { type: 'number' }
          },
          additionalProperties: true
        },
        key: { type: 'string' }
      },
      required: ['summary', 'title'],
      additionalProperties: false
    }
  };
}

export function proposeGoalCheckinSchema() {
  return {
    name: 'propose_goal_checkin',
    description:
      'Propose a weekly Goals check-in (moved / stuck / moves_planned). Nothing is saved until Adam taps Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        moved: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              note: { type: 'string' }
            },
            additionalProperties: true
          }
        },
        stuck: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              reason: { type: 'string' }
            },
            additionalProperties: true
          }
        },
        moves_planned: { type: 'number' }
      },
      required: ['summary', 'date'],
      additionalProperties: false
    }
  };
}

function pickGoalFields(input) {
  const out = {};
  for (const key of GOAL_INPUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      out[key] = input[key];
    }
  }
  return out;
}

export function buildGoalProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const title = clean(input.title, 300);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!title) return { ok: false, error: 'title_required' };

  const key = clean(input.key, 31) || `g${Date.now().toString(36)}`;
  if (!NEW_KEY_RE.test(key)) return { ok: false, error: 'invalid_key' };
  const id = `goal_${key.toLowerCase()}`;
  const path = `tasks:goal:${id}`;

  const body = {
    ...pickGoalFields(input),
    schema_version: 1,
    id,
    title,
    parent_area_id: typeof input.parent_area_id === 'string' ? input.parent_area_id : null,
    parent_someday_id: typeof input.parent_someday_id === 'string' ? input.parent_someday_id : null
  };
  if (input.sphere && !SPHERES.has(input.sphere)) return { ok: false, error: 'invalid_sphere' };
  if (DATE_RE.test(input.due_date ?? '')) body.due_date = input.due_date;

  const normalized = normalizeGoalRecord(body);
  const label = body.parent_someday_id
    ? `Grow someday → goal: ${title}`
    : `Add goal: ${title}`;

  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path,
      mode: 'create',
      content: JSON.stringify(normalized),
      diff: label
    }])
  };
}

export function buildGoalCheckinProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const date = clean(input.date, 10);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!DATE_RE.test(date)) return { ok: false, error: 'invalid_date' };

  const row = {
    date,
    moved: Array.isArray(input.moved) ? input.moved : [],
    stuck: Array.isArray(input.stuck) ? input.stuck : [],
    moves_planned: Number(input.moves_planned) || 0
  };

  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path: `tasks:goal_checkin:${date}`,
      mode: 'overwrite',
      content: JSON.stringify(row),
      diff: `Goal check-in ${date}`
    }])
  };
}

/**
 * Confirm executor for tasks:goal:* / tasks:goal_checkin:*.
 * Handed to executeProposeActionWrites as blobStores.goals (or folded into tasks).
 */
export function createGoalWriteExecutor({ store, nowIso = () => new Date().toISOString() } = {}) {
  if (!store) throw new Error('createGoalWriteExecutor requires a tasks store.');

  async function apply(write, target) {
    const body = parseWriteBody(write);
    if (!body) return writeError('invalid_goal_write', write.path);
    const stamp = nowIso();
    try {
      if (target.kind === 'goal') {
        if (write.mode === 'create') {
          const existing = await getJSON(store, target.key);
          if (existing) return writeError('already_exists', write.path);
          const record = normalizeGoalRecord({
            ...body,
            id: target.id,
            created_at: body.created_at || stamp,
            updated_at: stamp
          });
          await setJSON(store, target.key, record);
          const ids = await readIndex(store, 'goals/_index');
          if (!ids.includes(target.id)) await writeIndex(store, 'goals/_index', [...ids, target.id]);
          return { ok: true, result: { path: write.path, mode: 'create', id: target.id, updated_at: stamp } };
        }
        const existing = await getJSON(store, target.key);
        if (!existing) return writeError('goal_not_found', write.path);
        const record = normalizeGoalRecord({
          ...existing,
          ...body,
          id: existing.id,
          created_at: existing.created_at,
          updated_at: stamp
        });
        await setJSON(store, target.key, record);
        return { ok: true, result: { path: write.path, mode: write.mode, id: target.id, updated_at: stamp } };
      }
      if (target.kind === 'goal_checkin') {
        const row = {
          date: target.id,
          moved: Array.isArray(body.moved) ? body.moved : [],
          stuck: Array.isArray(body.stuck) ? body.stuck : [],
          moves_planned: Number(body.moves_planned) || 0,
          saved_at: stamp
        };
        await setJSON(store, target.key, row);
        await setJSON(store, 'goal_checkins/latest', row);
        for (const item of row.stuck) {
          if (!item?.id || !item?.reason) continue;
          const cached = (await getJSON(store, `goal_reads/${item.id}`)) ?? {};
          await setJSON(store, `goal_reads/${item.id}`, { ...cached, stuck_reason: item.reason });
        }
        return { ok: true, result: { path: write.path, mode: write.mode, id: target.id, updated_at: stamp } };
      }
      return writeError('unknown_write_target', write.path);
    } catch (error) {
      return writeError(typeof error?.code === 'string' ? error.code : 'goal_write_failed', error?.message);
    }
  }

  return { apply };
}

/** Used only by tests that need a stable id generator stub. */
export function newGoalIdForTests() {
  return newRecordId('goal');
}
