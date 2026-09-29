// Clare: one Confirm that creates a Tasks row and optionally queues a calendar
// ghost (outing / protect_block) for the dashed chip. Dual surface — Confirm
// and calendar Accept share the ghost id; task write lands with Confirm.

import { newTaskId } from './tasks-blobs.mjs';
import { clean, makeProposal } from './agent-propose-helpers.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);
const GHOST_KINDS = new Set(['protect_block', 'outing']);

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function proposeFollowUpSchema() {
  return {
    name: 'propose_follow_up',
    description:
      'Propose a follow-up as one Confirm card: create a Tasks row and, when a timed slot is given, also queue a dashed calendar ghost (outing or protect_block). Nothing is saved until Adam taps Confirm (or Accept on the calendar for the ghost). Prefer this over separate create_task + propose_calendar_ghost when both surfaces matter.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        title: { type: 'string', description: 'Task title (and calendar title when timed).' },
        due_date: { type: 'string', description: 'YYYY-MM-DD task due date.' },
        due_time: { type: 'string', description: 'Optional HH:MM.' },
        duration_min: { type: 'number', description: 'With due_time, builds a protect_block end time.' },
        date: { type: 'string', description: 'Calendar date YYYY-MM-DD (defaults to due_date).' },
        start: { type: 'string', description: 'Calendar start HH:MM.' },
        end: { type: 'string', description: 'Calendar end HH:MM.' },
        calendar_kind: {
          type: 'string',
          enum: ['protect_block', 'outing'],
          description: 'Ghost kind when a timed slot is present (default protect_block).'
        },
        domain: { type: 'string', enum: ['teaching', 'life', 'wedding', 'health', 'other'] },
        person_ref: { type: 'string' },
        notes: { type: 'string' },
        with: { type: 'string', description: 'Companion for outing/protect (e.g. corey).' }
      },
      required: ['summary', 'title'],
      additionalProperties: false
    }
  };
}

function buildTaskRecord({ title, dueDate, dueTime, domain, notes, personRef, nowIso }) {
  const id = newTaskId();
  const descriptionBits = [];
  if (notes) descriptionBits.push(notes);
  if (personRef) descriptionBits.push(`Person: ${personRef}`);
  return {
    schema_version: 1,
    id,
    title,
    description: descriptionBits.join('\n'),
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain,
    framework_used: null,
    estimated_duration: null,
    actual_duration: null,
    due_date: dueDate || null,
    created_at: nowIso,
    updated_at: nowIso,
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: null,
    parent_task_id: null,
    depends_on: [],
    tags: ['clare', 'follow_up'],
    recurrence_rule: null,
    due_time: dueTime || null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'suggested_by_agent',
    page_blocks: [],
    ...(personRef ? { follow_up_at: dueDate || null } : {})
  };
}

/**
 * @returns {{ ok, proposal, ghostInput? }}
 * ghostInput is set when a timed calendar slot is present — chat queues the
 * ghost and binds calendarGhostId; Confirm applies task write + ghost accept.
 */
export function buildFollowUpProposal(input, { nowIso = () => new Date().toISOString(), agent = 'clare' } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const title = clean(input.title, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!title) return { ok: false, error: 'title_required' };

  const dueDate = clean(input.due_date, 10);
  if (dueDate && !DATE_RE.test(dueDate)) return { ok: false, error: 'invalid_due_date' };
  const dueTime = clean(input.due_time, 5);
  if (dueTime && !HHMM_RE.test(dueTime)) return { ok: false, error: 'invalid_due_time' };
  const domain = DOMAINS.has(input.domain) ? input.domain : 'life';
  const notes = clean(input.notes, 2000);
  const personRef = clean(input.person_ref, 120);

  const stamp = typeof nowIso === 'function' ? nowIso() : String(nowIso);
  const task = buildTaskRecord({
    title,
    dueDate: dueDate || null,
    dueTime: dueTime || null,
    domain,
    notes,
    personRef,
    nowIso: stamp
  });

  const writes = [{
    path: `tasks:task:${task.id}`,
    mode: 'create',
    content: JSON.stringify(task),
    diff: `Follow-up task: ${title}${dueDate ? ` (due ${dueDate})` : ''}`
  }];

  let ghostInput = null;
  const calDate = clean(input.date, 10) || dueDate;
  let start = clean(input.start, 5) || dueTime;
  let end = clean(input.end, 5);
  const duration = Number(input.duration_min);
  if (start && !end && Number.isFinite(duration) && duration > 0 && duration <= 12 * 60) {
    end = addMinutes(start, Math.round(duration));
  }
  if (calDate && start && end) {
    if (!DATE_RE.test(calDate)) return { ok: false, error: 'invalid_calendar_date' };
    if (!HHMM_RE.test(start) || !HHMM_RE.test(end) || end <= start) {
      return { ok: false, error: 'invalid_calendar_span' };
    }
    const kind = GHOST_KINDS.has(input.calendar_kind) ? input.calendar_kind : 'protect_block';
    const withWho = clean(input.with, 40);
    const reason = clean(input.summary, 200);
    ghostInput = {
      kind,
      date: calDate,
      start,
      end,
      title,
      ...(withWho ? { with: withWho } : {}),
      ...(notes ? { notes } : {}),
      ...(reason ? { reason } : {}),
      agent
    };
  }

  return {
    ok: true,
    proposal: makeProposal(summary, writes, {
      reads: ['tasks:task:*'],
      surfaces: ghostInput
        ? ['confirm_card', 'calendar', 'governance_log']
        : ['confirm_card', 'governance_log']
    }),
    taskId: task.id,
    ...(ghostInput ? { ghostInput } : {})
  };
}

/** True when a propose-action write is the display-only calendar ghost marker. */
export function isCalendarGhostConfirmWrite(path) {
  return typeof path === 'string' && path.startsWith('data/os/calendar-ghost-confirm/');
}
