// Tool surface for Sara as record keeper: schemas and execution.
//
// Reads are answered from the already-loaded Medical Overview. Writes follow the confirm policy:
//   safe edits (notes added, status, time, length, who/where, weight, cost, follow-up) are saved at once
//     and reported back, so Adam sees what changed;
//   structural edits (date, type, title, replacing notes, delete, merge) go on a Confirm card showing the
//     exact before/after. A date change is one proposal: create the new file and delete the old one.
// The pure planning is in sara-records.mjs; I/O is injected so this is testable without GitHub.

import { MEDICAL_RECORD_TYPES } from '../../../apps/life/js/app/medical-normalize.js';
import {
  listMedicalVisits, getMedicalVisit, planVisitUpdate, planVisitDelete, planVisitMerge, MEDICAL_STATUS_VALUES
} from './sara-records.mjs';

export const SARA_RECORD_TOOL_NAMES = [
  'create_health_task',
  'list_medical_visits',
  'get_medical_visit',
  'update_medical_visit',
  'delete_medical_visit',
  'merge_medical_visits'
];

export function isSaraRecordTool(name) {
  return SARA_RECORD_TOOL_NAMES.includes(name);
}

const IDS_NOTE = 'Use the id from list_medical_visits / search_medical_records results — never guess one.';

export function saraRecordToolSchemas() {
  return [
    {
      name: 'create_health_task',
      description:
        'Create a Tasks Hub task (domain health) for something Adam has to do about his health: book a visit or test, repeat bloods, collect a script, ask a clinician. One task per action. Pass visit_id to link it to the visit (a to_book visit, say) on the same Confirm card. Always needs Adam\'s Confirm. Give a due_date for retests and bookings so they surface.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short action, e.g. "Book MRCP".' },
          due_date: { type: 'string', description: 'YYYY-MM-DD. Set for bookings and retests.' },
          due_time: { type: 'string', description: 'HH:MM 24-hour (optional).' },
          estimated_duration: { type: 'number', description: 'Minutes (optional).' },
          description: { type: 'string', description: 'What to do and why, one or two lines.' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          visit_id: { type: 'string', description: 'Link this task to a Medical Overview visit.' }
        },
        required: ['title']
      }
    },
    {
      name: 'list_medical_visits',
      description:
        'List Medical Overview visits with their ids. Filter by status (planned, to_book, booked, done, cancelled), type, text, date range, or upcoming only. Returns possible_duplicate flags and duplicate groups. Use before changing anything, and for "what is coming up", "what is not booked", "what did I have in <month>".',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: MEDICAL_STATUS_VALUES },
          record_type: { type: 'string', enum: MEDICAL_RECORD_TYPES },
          query: { type: 'string', description: 'Words matched against title, provider, location and notes.' },
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
          upcoming: { type: 'boolean', description: 'Only visits from today on, soonest first.' },
          limit: { type: 'number', description: 'Max results (default 25, max 60).' }
        }
      }
    },
    {
      name: 'get_medical_visit',
      description: `Read one visit in full (every field and its notes) plus any look-alike visits. ${IDS_NOTE}`,
      input_schema: {
        type: 'object',
        properties: { visit_id: { type: 'string' } },
        required: ['visit_id']
      }
    },
    {
      name: 'update_medical_visit',
      description:
        'Change an existing visit by id. Use this — not log_entry — to add detail ("the GP said…" → notes_append), mark it booked/done/cancelled (status), set or fix time/duration_min/provider/location/weight/cost, or reschedule (date). notes_append, status, time, duration_min, provider, location, weight, cost_aud and follow_up_date save immediately; date, record_type, title and notes_replace need Adam\'s Confirm. A booked status never changes the date. '
        + IDS_NOTE,
      input_schema: {
        type: 'object',
        properties: {
          visit_id: { type: 'string' },
          notes_append: { type: 'string', description: 'New detail to add after the existing notes (date-stamped automatically). Only the new information.' },
          notes_replace: { type: 'string', description: 'Replace all notes (needs Confirm). Prefer notes_append.' },
          status: { type: 'string', enum: MEDICAL_STATUS_VALUES },
          date: { type: 'string', description: 'New date (YYYY-MM-DD or D/M/YYYY). Needs Confirm.' },
          time: { type: 'string', description: 'HH:MM 24-hour.' },
          duration_min: { type: 'number' },
          title: { type: 'string', description: 'Short 2–6 word label. Needs Confirm.' },
          record_type: { type: 'string', enum: MEDICAL_RECORD_TYPES },
          weight: { type: 'string', enum: ['major', 'routine', 'minor'] },
          provider: { type: 'string' },
          location: { type: 'string' },
          follow_up_date: { type: 'string' },
          cost_aud: { type: 'number' },
          insurance_status: { type: 'string' }
        },
        required: ['visit_id']
      }
    },
    {
      name: 'delete_medical_visit',
      description:
        'Delete a visit that should not exist (a mistaken or duplicate entry). Always needs Adam\'s Confirm. For an appointment that was cancelled but really existed, use update_medical_visit with status cancelled instead. '
        + IDS_NOTE,
      input_schema: {
        type: 'object',
        properties: { visit_id: { type: 'string' }, reason: { type: 'string' } },
        required: ['visit_id']
      }
    },
    {
      name: 'merge_medical_visits',
      description:
        'Merge duplicate entries of one appointment: keep one visit, fold in missing details and notes from the others, delete the others. Needs Adam\'s Confirm. Use after list_medical_visits shows a duplicate group. '
        + IDS_NOTE,
      input_schema: {
        type: 'object',
        properties: {
          keep_visit_id: { type: 'string', description: 'The visit to keep (usually the one on the right date).' },
          merge_visit_ids: { type: 'array', items: { type: 'string' }, description: 'The duplicates to fold in and delete.' }
        },
        required: ['keep_visit_id', 'merge_visit_ids']
      }
    }
  ];
}

const newId = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function buildHealthTask(args, nowIso) {
  const record = {
    schema_version: 1,
    id: newId('task'),
    kind: 'task',
    bucket: 'active',
    status: 'open',
    priority: ['low', 'medium', 'high'].includes(args.priority) ? args.priority : 'medium',
    domain: 'health',
    title: String(args.title).trim(),
    description: typeof args.description === 'string' ? args.description : '',
    tags: ['health', 'sara'],
    created_at: nowIso,
    completed_at: null,
    source: 'sara_chat'
  };
  if (typeof args.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date.trim())) record.due_date = args.due_date.trim();
  if (typeof args.due_time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(args.due_time.trim())) record.due_time = args.due_time.trim();
  if (Number.isFinite(Number(args.estimated_duration)) && Number(args.estimated_duration) > 0) record.estimated_duration = Number(args.estimated_duration);
  return record;
}

const eventById = (events, id) => (events ?? []).find(event => event?.record?.type === 'medical' && event.record.id === id);

const diffText = diff => diff.map(d => `${d.field}: ${d.from ?? '—'} → ${d.to ?? '—'}`).join('; ');

function replaceInMemory(events, id, plan) {
  const index = events.findIndex(event => event?.record?.id === id);
  if (index >= 0) events[index] = { ...events[index], record: plan.record, body: plan.notes, path: plan.newPath ?? events[index].path };
}

/**
 * Execute a record tool.
 * ctx: { medicalEvents (mutable), today, nowIso, nowDateKey,
 *        save({path, record, notes}) -> Promise   (writes one file, used for safe edits),
 *        propose(proposal) -> Promise<pendingId?> (queues a Confirm card),
 *        validateProposal(input) -> {ok, proposal, error} }
 */
export async function executeSaraRecordTool(name, input = {}, ctx = {}) {
  const args = input && typeof input === 'object' ? input : {};
  const { medicalEvents = [], today, nowIso } = ctx;

  if (name === 'list_medical_visits') {
    return listMedicalVisits(medicalEvents, {
      today,
      status: args.status ?? null,
      record_type: args.record_type ?? null,
      query: args.query ?? null,
      from: args.from ?? null,
      to: args.to ?? null,
      upcoming: args.upcoming === true,
      limit: args.limit
    });
  }
  if (name === 'get_medical_visit') {
    return getMedicalVisit(medicalEvents, { id: String(args.visit_id ?? '').trim(), today });
  }

  const proposeStructural = async ({ intent, writes, reads }) => {
    const validated = ctx.validateProposal({ intent, reads, writes, surfaces: ['confirm_card'] });
    if (!validated.ok) return { ok: false, error: validated.error, ...(validated.detail ? { detail: validated.detail } : {}) };
    const pendingId = await ctx.propose(validated.proposal);
    return {
      ok: true,
      status: 'awaiting_confirm',
      intent,
      writes: validated.proposal.writes.map(w => ({ path: w.path, mode: w.mode, diff: w.diff })),
      note: 'Nothing is changed until Adam confirms the card. Say so plainly.',
      ...(pendingId ? { pendingId } : {})
    };
  };

  if (name === 'create_health_task') {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    if (!title) return { ok: false, error: 'missing_title' };
    const record = buildHealthTask(args, nowIso);
    const writes = [{ path: `tasks:task:${record.id}`, mode: 'create', content: JSON.stringify(record, null, 2), diff: `new task "${title}"${record.due_date ? ` due ${record.due_date}` : ''}` }];
    const reads = [];
    const visitId = typeof args.visit_id === 'string' ? args.visit_id.trim() : '';
    if (visitId) {
      const existing = eventById(medicalEvents, visitId);
      if (!existing) return { ok: false, error: 'unknown_visit_id' };
      const link = planVisitUpdate(existing, { task_id: record.id }, { nowIso, today });
      if (link.ok && !link.noop) {
        writes.push({ path: link.newPath, mode: 'overwrite', content: link.content, diff: `link visit to task ${record.id}` });
        reads.push(link.oldPath);
      }
    }
    const result = await proposeStructural({ intent: `Create task: ${title}`, reads, writes });
    return result.ok ? { ...result, task_id: record.id } : result;
  }

  if (name === 'update_medical_visit') {
    const existing = eventById(medicalEvents, String(args.visit_id ?? '').trim());
    if (!existing) return { ok: false, error: 'unknown_visit_id', hint: 'List visits first and use an id from the result.' };
    const { visit_id: _ignored, ...changes } = args;
    const plan = planVisitUpdate(existing, changes, { nowIso, today });
    if (!plan.ok) return { ok: false, error: plan.error, ...(plan.errors ? { errors: plan.errors } : {}) };
    if (plan.noop) return { ok: true, status: 'no_change', id: plan.id, note: 'Those values are already on the visit.' };

    if (plan.risk === 'safe') {
      await ctx.save({ path: plan.newPath, record: plan.record, notes: plan.notes });
      replaceInMemory(medicalEvents, plan.id, plan);
      return {
        ok: true,
        status: 'written',
        id: plan.id,
        title: plan.title,
        changed: plan.diff,
        summary: `Updated "${plan.title}" — ${diffText(plan.diff)}`
      };
    }
    const writes = plan.moved
      ? [
          { path: plan.newPath, mode: 'create', content: plan.content, diff: `new file for ${plan.title} on ${plan.record.date}` },
          { path: plan.oldPath, mode: 'delete', content: '', diff: `remove old file (${existing.record.date})` }
        ]
      : [{ path: plan.newPath, mode: 'overwrite', content: plan.content, diff: diffText(plan.diff) }];
    return proposeStructural({
      intent: `Change "${plan.title}": ${diffText(plan.diff)}`,
      reads: [plan.oldPath],
      writes
    });
  }

  if (name === 'delete_medical_visit') {
    const existing = eventById(medicalEvents, String(args.visit_id ?? '').trim());
    if (!existing) return { ok: false, error: 'unknown_visit_id' };
    const plan = planVisitDelete(existing);
    if (!plan.ok) return { ok: false, error: plan.error };
    return proposeStructural({
      intent: `Delete "${plan.title}" (${existing.record.date})${args.reason ? ` — ${String(args.reason).slice(0, 120)}` : ''}`,
      reads: [plan.path],
      writes: [{ path: plan.path, mode: 'delete', content: '', diff: `delete ${existing.record.date} ${plan.title}` }]
    });
  }

  if (name === 'merge_medical_visits') {
    const keep = eventById(medicalEvents, String(args.keep_visit_id ?? '').trim());
    if (!keep) return { ok: false, error: 'unknown_keep_visit_id' };
    const ids = Array.isArray(args.merge_visit_ids) ? args.merge_visit_ids.map(id => String(id).trim()) : [];
    const others = ids.map(id => eventById(medicalEvents, id));
    if (!ids.length || others.some(o => !o)) return { ok: false, error: 'unknown_merge_visit_id' };
    const plan = planVisitMerge(keep, others, { nowIso, today });
    if (!plan.ok) return { ok: false, error: plan.error, ...(plan.errors ? { errors: plan.errors } : {}) };
    return proposeStructural({
      intent: `Merge ${plan.deleted.length} duplicate(s) of "${plan.title}" into the ${keep.record.date} visit`,
      reads: [plan.keepPath, ...plan.deletePaths],
      writes: [
        { path: plan.keepPath, mode: 'overwrite', content: plan.content, diff: plan.diff.length ? diffText(plan.diff) : 'keep as is' },
        ...plan.deletePaths.map((path, i) => ({ path, mode: 'delete', content: '', diff: `delete duplicate ${plan.deleted[i].date}` }))
      ]
    });
  }

  return { ok: false, error: 'unknown_tool' };
}
