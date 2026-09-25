/**
 * Ghost proposals on the calendar, and exactly what Accept writes.
 *
 * An agent proposes a ghost (dashed chip). Accept must do the real thing, through the
 * paths that already exist, and nothing else. This module turns a ghost into a write
 * plan: an ordered list of steps plus the receipt text the UI shows. It never performs
 * I/O. The server executes the plan (POST /api/calendar-ghosts, see the design spec);
 * the client never builds its own writes.
 *
 * Step targets:
 * - central_node: a Central Node patch ({ section, op, payload }) for applyCentralNodePatch
 * - life_record: create or update a Life record. New blocks use type `calendar_block` (see the
 *   design spec); a block with time + end_time is a busy span for Clare (lifeEventToBusySpan).
 * - tasks: PATCH /api/tasks?id=... with a partial task, or POST /api/tasks with a new task
 * - draft: text shown to Adam to copy. Never sent, never stored as a message.
 *
 * Reference: docs/superpowers/specs/2026-09-24-calendar-design.md ("Ghosts and wiring").
 */

import { formatDisplayDate } from '../../../../packages/design-kit/js/format-display-date.js';
import { formatLogDate } from '../core/central-node-write.js';

export const GHOST_AGENTS = Object.freeze({
  sara: 'Sara',
  hammond: 'Hammond',
  clare: 'Clare',
  chadwick: 'Chadwick',
  brisket: 'Brisket',
  penelope: 'Penelope',
  vera: 'Vera'
});

export const GHOST_KINDS = Object.freeze([
  'skip_workout', 'bedtime', 'protect_block', 'move_task', 'create_task', 'draft_message', 'split_task', 'goal_rest_weeks'
]);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function short(dateKey) {
  // "24/09" for Central Node lines: the year is implied and lines must stay one line.
  return formatDisplayDate(dateKey).slice(0, 5);
}

function weekday(dateKey) {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${dateKey}T00:00:00Z`));
}

function clock12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = ((h + 11) % 12) + 1;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour}:00 ${suffix}`;
}

/** Wind-down starts 30 minutes before lights out, so the block is a real span Clare's scheduler avoids. */
function windDownStart(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Math.max(0, h * 60 + m - 30);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function cn(section, op, payload) {
  return { target: 'central_node', patch: { section, op, payload } };
}

function recentAction(dateKey, agentName, text) {
  return cn('recent_actions', 'append_line', {
    summary: `${agentName}: ${text}`,
    text: `- ${formatLogDate(dateKey)} — ${agentName}: ${text}`
  });
}

/** Throws a TypeError naming the first problem, so a bad proposal never reaches a write. */
export function validateGhost(ghost) {
  if (!ghost || typeof ghost !== 'object') throw new TypeError('Ghost must be an object');
  if (typeof ghost.id !== 'string' || !ghost.id) throw new TypeError('Ghost needs an id');
  if (!(ghost.agent in GHOST_AGENTS)) throw new TypeError(`Unknown agent: ${ghost.agent}`);
  if (!GHOST_KINDS.includes(ghost.kind)) throw new TypeError(`Unknown ghost kind: ${ghost.kind}`);
  const dated = !['move_task', 'create_task', 'draft_message', 'split_task', 'goal_rest_weeks'].includes(ghost.kind);
  if (dated && !DATE_KEY.test(ghost.date ?? '')) throw new TypeError('Ghost needs a date (YYYY-MM-DD)');
  if (ghost.kind === 'create_task') {
    if (!oneLine(ghost.title)) throw new TypeError('create_task needs a title');
    if (!DATE_KEY.test(ghost.due ?? '')) throw new TypeError('create_task needs due (YYYY-MM-DD)');
  }
  if (ghost.kind === 'draft_message') {
    if (!oneLine(ghost.to) || !String(ghost.text ?? '').trim()) throw new TypeError('draft_message needs to and text');
  }
  if (ghost.kind === 'bedtime' && !HHMM.test(ghost.time ?? '')) throw new TypeError('bedtime needs time HH:MM');
  if (ghost.kind === 'protect_block') {
    if (!HHMM.test(ghost.start ?? '') || !HHMM.test(ghost.end ?? '') || ghost.start >= ghost.end) {
      throw new TypeError('protect_block needs start < end (HH:MM)');
    }
    if (!oneLine(ghost.title)) throw new TypeError('protect_block needs a title');
  }
  if (ghost.kind === 'move_task') {
    if (typeof ghost.taskId !== 'string' || !ghost.taskId) throw new TypeError('move_task needs taskId');
    if (!DATE_KEY.test(ghost.to ?? '') || !DATE_KEY.test(ghost.from ?? '')) throw new TypeError('move_task needs from and to dates');
  }
  if (ghost.kind === 'split_task') {
    if (typeof ghost.taskId !== 'string' || !ghost.taskId) throw new TypeError('split_task needs taskId');
    if (!Array.isArray(ghost.steps) || ghost.steps.length < 1 || ghost.steps.length > 6 || ghost.steps.some(step => !oneLine(step))) {
      throw new TypeError('split_task needs 1–6 step titles');
    }
  }
  if (ghost.kind === 'goal_rest_weeks') {
    if (typeof ghost.goalId !== 'string' || !ghost.goalId) throw new TypeError('goal_rest_weeks needs goalId');
    if (!Array.isArray(ghost.weeks) || !ghost.weeks.length || ghost.weeks.some(week => !DATE_KEY.test(week ?? ''))) {
      throw new TypeError('goal_rest_weeks needs weeks (YYYY-MM-DD)');
    }
    if (!Array.isArray(ghost.rest_weeks) || ghost.weeks.some(week => !ghost.rest_weeks.includes(week))) {
      throw new TypeError('goal_rest_weeks needs rest_weeks containing weeks');
    }
  }
  return ghost;
}

/**
 * The write plan for Accept.
 * `today` (YYYY-MM-DD) dates the Recent Agent Actions line.
 * Returns { ghostId, steps, receipt } where receipt is plain text for the toast / receipt card.
 */
export function acceptPlan(ghost, { today = null } = {}) {
  validateGhost(ghost);
  // Recent Agent Actions are dated the day Adam accepted, not the day the ghost is about.
  const actedOn = today ?? ghost.date ?? ghost.from;
  const who = GHOST_AGENTS[ghost.agent];
  const reason = oneLine(ghost.reason);
  const why = reason ? ` (${reason})` : '';
  const steps = [];
  let receipt;

  switch (ghost.kind) {
    case 'skip_workout': {
      const line = `- ${who}→Chadwick: skip ${weekday(ghost.date)} ${short(ghost.date)} workout${why}.`;
      steps.push(cn('cross_agent', 'append_line', { summary: `${who}→Chadwick: skip workout ${short(ghost.date)}`, text: line }));
      if (ghost.workoutPath) {
        steps.push({ target: 'life_record', mode: 'update', path: ghost.workoutPath, fields: { status: 'skipped' } });
      }
      steps.push(recentAction(actedOn, who, `skip workout accepted${why}`));
      receipt = `${who} → Central Node: “${line.slice(2)}”${ghost.workoutPath ? ' Chadwick’s session is marked skipped.' : ''}`;
      break;
    }
    case 'bedtime': {
      const text = `lights out ${clock12(ghost.time)}${why}`;
      steps.push(cn('todays_status', 'upsert_field', { summary: `${who}: protect sleep ${short(ghost.date)}`, field: 'Sleep', text: `**Sleep:** ${text}` }));
      steps.push({
        target: 'life_record',
        mode: 'create',
        record: { type: 'calendar_block', date: ghost.date, time: windDownStart(ghost.time), end_time: ghost.time, kind: 'rest', status: 'confirmed', protected: true, title: `Wind down · lights out ${clock12(ghost.time)}`, source_agent: ghost.agent }
      });
      steps.push(recentAction(actedOn, who, `bedtime ${clock12(ghost.time)} accepted`));
      receipt = `${who} → Today’s Status: Sleep “${text}”. A protected wind-down is on the calendar.`;
      break;
    }
    case 'protect_block': {
      const withCorey = ghost.with === 'corey';
      const title = oneLine(ghost.title);
      const span = `${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.start)}–${clock12(ghost.end)}`;
      steps.push({
        target: 'life_record',
        mode: 'create',
        record: {
          type: 'calendar_block',
          date: ghost.date,
          time: ghost.start,
          end_time: ghost.end,
          kind: withCorey ? 'corey' : 'protected',
          status: 'tentative',
          protected: true,
          title,
          source_agent: ghost.agent
        }
      });
      steps.push(cn('this_week', 'append_line', { summary: `${title} ${short(ghost.date)}`, text: `- ${span}: ${title}${withCorey ? ' with Corey' : ''} (protected).` }));
      steps.push(cn('cross_agent', 'append_line', { summary: `${who}→Clare: keep ${short(ghost.date)} clear`, text: `- ${who}→Clare: keep ${span} clear${withCorey ? ' (Corey)' : ''}.` }));
      receipt = `${who} → Life: “${title}”${withCorey ? ' with Corey' : ''}, ${span}, tentative and protected. ${who}→Clare: keep it clear. Nothing is booked or paid without you.`;
      break;
    }
    case 'move_task': {
      steps.push({ target: 'tasks', method: 'PATCH', id: ghost.taskId, body: { due_date: ghost.to } });
      steps.push(recentAction(actedOn, who, `moved “${oneLine(ghost.title) || ghost.taskId}” ${short(ghost.from)} → ${short(ghost.to)}`));
      receipt = `${who} → Tasks: “${oneLine(ghost.title) || ghost.taskId}” due ${formatDisplayDate(ghost.from)} → ${formatDisplayDate(ghost.to)}.`;
      break;
    }
    case 'create_task': {
      const title = oneLine(ghost.title);
      const body = {
        title,
        due_date: ghost.due,
        status: 'open',
        ...(ghost.notes ? { notes: oneLine(ghost.notes) } : {}),
        ...(ghost.source ? { source: ghost.source } : {}),
        ...(ghost.goalId ? { parent_goal_id: ghost.goalId } : {}),
        ...(ghost.domain ? { domain: ghost.domain } : {})
      };
      steps.push({ target: 'tasks', method: 'POST', body });
      steps.push(recentAction(actedOn, who, `added “${title}” due ${short(ghost.due)}`));
      receipt = `${who} → Tasks: “${title}”, due ${formatDisplayDate(ghost.due)} (the last safe day).`;
      break;
    }
    case 'draft_message': {
      // A draft is shown to copy. Nothing is sent and nothing is written to Central Node.
      steps.push({ target: 'draft', to: oneLine(ghost.to), text: String(ghost.text).trim() });
      receipt = `Draft ready for ${oneLine(ghost.to)}. Nothing sent.`;
      break;
    }
    case 'split_task': {
      const parent = oneLine(ghost.title) || ghost.taskId;
      ghost.steps.forEach((stepTitle, index) => {
        steps.push({
          target: 'tasks',
          method: 'POST',
          suffix: `s${index + 1}`,
          body: {
            title: oneLine(stepTitle),
            kind: 'step',
            parent_task_id: ghost.taskId,
            step_order: index + 1,
            status: 'open',
            ...(ghost.goalId ? { parent_goal_id: ghost.goalId } : {}),
            ...(ghost.domain ? { domain: ghost.domain } : {})
          }
        });
      });
      steps.push(recentAction(actedOn, who, `split “${parent}” into ${ghost.steps.length} steps`));
      receipt = `${who} → Tasks: “${parent}” now has ${ghost.steps.length} steps.`;
      break;
    }
    case 'goal_rest_weeks': {
      const title = oneLine(ghost.title) || ghost.goalId;
      const list = ghost.weeks.map(short).join(', ');
      steps.push({ target: 'tasks', collection: 'goals', method: 'PATCH', id: ghost.goalId, body: { rest_weeks: [...ghost.rest_weeks] } });
      steps.push(recentAction(actedOn, who, `planned rest for “${title}”: weeks of ${list}`));
      receipt = `${who} → Goals: “${title}” rests the weeks of ${list}. Those weeks won't count as misses.`;
      break;
    }
    default:
      throw new TypeError(`Unhandled ghost kind: ${ghost.kind}`);
  }
  return { ghostId: ghost.id, steps, receipt };
}

/**
 * Dismiss writes nothing to Central Node, Life or Tasks. It records the decision so the
 * agent can learn (fewer proposals of a kind Adam keeps dismissing).
 */
export function dismissPlan(ghost, { reason = null } = {}) {
  validateGhost(ghost);
  return {
    ghostId: ghost.id,
    steps: [],
    decision: { agent: ghost.agent, kind: ghost.kind, outcome: 'dismissed', reason: reason ? oneLine(reason) : null },
    receipt: 'Dismissed. Nothing written.'
  };
}
