// Clare: one Confirm that creates a Tasks row and optionally queues a calendar
// ghost (outing / protect_block). The task rides ON the ghost plan so calendar
// Accept and chat Confirm both create it once via applyTaskStep(ghostTaskId).

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
      'Propose a follow-up as one Confirm card: create a Tasks row and, when a timed slot is given, also queue a dashed calendar ghost (outing or protect_block). The task is part of the ghost Accept plan — Confirm in chat or Accept on the calendar both create it once. Nothing is saved until Adam confirms.',
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

/**
 * @returns {{ ok, proposal?, ghostInput? }}
 * Timed: ghostInput carries follow_up_task; Accept/Confirm create the task via acceptPlan.
 * Untimed: plain Confirm card with a tasks:task write.
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
    return {
      ok: true,
      ghostInput: {
        kind,
        date: calDate,
        start,
        end,
        title,
        ...(withWho ? { with: withWho } : {}),
        ...(notes ? { notes } : {}),
        ...(reason ? { reason } : {}),
        agent,
        follow_up_task: {
          title,
          due: dueDate || calDate,
          ...(dueTime ? { due_time: dueTime } : {}),
          domain,
          ...(notes ? { notes } : {}),
          ...(personRef ? { person_ref: personRef } : {})
        }
      }
    };
  }

  const descriptionBits = [];
  if (notes) descriptionBits.push(notes);
  if (personRef) descriptionBits.push(`Person: ${personRef}`);
  const id = newTaskId();
  const task = {
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
    created_at: stamp,
    updated_at: stamp,
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

  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path: `tasks:task:${task.id}`,
      mode: 'create',
      content: JSON.stringify(task),
      diff: `Follow-up task: ${title}${dueDate ? ` (due ${dueDate})` : ''}`
    }], {
      reads: ['tasks:task:*'],
      surfaces: ['confirm_card', 'governance_log']
    }),
    taskId: task.id
  };
}

/** True when a propose-action write is the display-only calendar ghost marker. */
export function isCalendarGhostConfirmWrite(path) {
  return typeof path === 'string' && path.startsWith('data/os/calendar-ghost-confirm/');
}
