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

import { formatDisplayDate } from '../format-display-date.js';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Central Node recent-action date: "24 Sep" (day + short month). */
function formatLogDate(dateKey) {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${day} ${SHORT_MONTHS[month - 1]}`;
}

export const GHOST_AGENTS = Object.freeze({
  sara: 'Sara',
  hammond: 'Hammond',
  clare: 'Clare',
  chadwick: 'Chadwick',
  brisket: 'Brisket',
  penelope: 'Penelope',
  vera: 'Vera',
  hyaluronica: 'Hyaluronica',
  ann: 'Ann',
  clementine: 'Clementine'
});

export const GHOST_KINDS = Object.freeze([
  'skip_workout', 'bedtime', 'protect_block', 'move_task', 'create_task', 'draft_message', 'split_task', 'goal_rest_weeks', 'book_comm',
  'outing', 'meal_block', 'schedule_workout', 'reschedule_block', 'cancel_block', 'log_comm',
  'pro_meeting', 'pro_event', 'move_block', 'task_block'
]);

const LOG_COMM_DIRECTIONS = new Set(['outbound', 'inbound']);
const LOG_COMM_CHANNELS = new Set(['email', 'phone', 'message', 'in_person', 'video', 'other']);

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
  if (ghost.kind === 'book_comm') {
    if (!HHMM.test(ghost.time ?? '')) throw new TypeError('book_comm needs time HH:MM');
    if (!Number.isInteger(ghost.duration_min) || ghost.duration_min < 5 || ghost.duration_min > 240) throw new TypeError('book_comm needs duration_min 5–240');
    if (!oneLine(ghost.title)) throw new TypeError('book_comm needs a title');
    if (!Array.isArray(ghost.person_refs) || !ghost.person_refs.length) throw new TypeError('book_comm needs at least one person');
  }
  if (ghost.kind === 'protect_block') {
    if (!HHMM.test(ghost.start ?? '') || !HHMM.test(ghost.end ?? '') || ghost.start >= ghost.end) {
      throw new TypeError('protect_block needs start < end (HH:MM)');
    }
    if (!oneLine(ghost.title)) throw new TypeError('protect_block needs a title');
  }
  if (ghost.kind === 'outing' || ghost.kind === 'meal_block' || ghost.kind === 'schedule_workout') {
    if (!HHMM.test(ghost.start ?? '') || !HHMM.test(ghost.end ?? '') || ghost.start >= ghost.end) {
      throw new TypeError(`${ghost.kind} needs start < end (HH:MM)`);
    }
    if (!oneLine(ghost.title)) throw new TypeError(`${ghost.kind} needs a title`);
  }
  if (ghost.follow_up_task != null) {
    if (ghost.kind !== 'outing' && ghost.kind !== 'protect_block') {
      throw new TypeError('follow_up_task is only allowed on outing or protect_block');
    }
    if (!ghost.follow_up_task || typeof ghost.follow_up_task !== 'object' || Array.isArray(ghost.follow_up_task)) {
      throw new TypeError('follow_up_task must be an object');
    }
    if (!oneLine(ghost.follow_up_task.title) && !oneLine(ghost.title)) {
      throw new TypeError('follow_up_task needs a title');
    }
  }
  if (ghost.kind === 'reschedule_block') {
    if (typeof ghost.path !== 'string' || !ghost.path) throw new TypeError('reschedule_block needs path');
    const hasChange = DATE_KEY.test(ghost.date ?? '')
      || HHMM.test(ghost.start ?? '')
      || HHMM.test(ghost.end ?? '')
      || Boolean(oneLine(ghost.title));
    if (!hasChange) throw new TypeError('reschedule_block needs date, start, end, and/or title');
    if (ghost.start != null && ghost.start !== '' && !HHMM.test(ghost.start)) {
      throw new TypeError('reschedule_block start must be HH:MM');
    }
    if (ghost.end != null && ghost.end !== '' && !HHMM.test(ghost.end)) {
      throw new TypeError('reschedule_block end must be HH:MM');
    }
    if (HHMM.test(ghost.start ?? '') && HHMM.test(ghost.end ?? '') && ghost.start >= ghost.end) {
      throw new TypeError('reschedule_block needs start < end (HH:MM)');
    }
  }
  if (ghost.kind === 'cancel_block') {
    if (typeof ghost.path !== 'string' || !ghost.path) throw new TypeError('cancel_block needs path');
  }
  if (ghost.kind === 'log_comm') {
    if (!LOG_COMM_DIRECTIONS.has(ghost.direction)) throw new TypeError('log_comm needs direction outbound|inbound');
    if (!LOG_COMM_CHANNELS.has(ghost.channel)) throw new TypeError('log_comm needs a valid channel');
    if (!oneLine(ghost.title) && !oneLine(ghost.subject)) throw new TypeError('log_comm needs a title or subject');
    if (ghost.time != null && ghost.time !== '' && !HHMM.test(ghost.time)) {
      throw new TypeError('log_comm time must be HH:MM');
    }
    if (ghost.person_refs != null && (!Array.isArray(ghost.person_refs) || ghost.person_refs.some(ref => typeof ref !== 'string' || !ref))) {
      throw new TypeError('log_comm person_refs must be an array of refs');
    }
  }
  if (ghost.kind === 'pro_meeting' || ghost.kind === 'pro_event') {
    if (!HHMM.test(ghost.start ?? '') || !HHMM.test(ghost.end ?? '') || ghost.start >= ghost.end) {
      throw new TypeError(`${ghost.kind} needs start < end (HH:MM)`);
    }
    if (!oneLine(ghost.title)) throw new TypeError(`${ghost.kind} needs a title`);
  }
  if (ghost.kind === 'task_block') {
    if (typeof ghost.taskId !== 'string' || !ghost.taskId) throw new TypeError('task_block needs taskId');
    if (!HHMM.test(ghost.start ?? '') || !HHMM.test(ghost.end ?? '') || ghost.start >= ghost.end) {
      throw new TypeError('task_block needs start < end (HH:MM)');
    }
    if (!oneLine(ghost.title)) throw new TypeError('task_block needs a title');
  }
  if (ghost.kind === 'move_block') {
    if (typeof ghost.blockId !== 'string' || !ghost.blockId) throw new TypeError('move_block needs blockId');
    if (!DATE_KEY.test(ghost.from ?? '')) throw new TypeError('move_block needs from (YYYY-MM-DD)');
    if (!HHMM.test(ghost.start ?? '') || !HHMM.test(ghost.end ?? '') || ghost.start >= ghost.end) {
      throw new TypeError('move_block needs start < end (HH:MM)');
    }
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
      if (ghost.follow_up_task && typeof ghost.follow_up_task === 'object') {
        const task = ghost.follow_up_task;
        const taskTitle = oneLine(task.title) || title;
        steps.push({
          target: 'tasks',
          method: 'POST',
          body: {
            title: taskTitle,
            due_date: DATE_KEY.test(task.due ?? '') ? task.due : ghost.date,
            status: 'open',
            ...(oneLine(task.notes) || oneLine(task.person_ref)
              ? {
                notes: [oneLine(task.notes), oneLine(task.person_ref) ? `Person: ${oneLine(task.person_ref)}` : '']
                  .filter(Boolean)
                  .join('\n')
              }
              : {}),
            ...(task.domain ? { domain: task.domain } : {}),
            ...(HHMM.test(task.due_time ?? '') ? { due_time: task.due_time } : {}),
            source: 'suggested_by_agent'
          }
        });
      }
      steps.push(cn('this_week', 'append_line', { summary: `${title} ${short(ghost.date)}`, text: `- ${span}: ${title}${withCorey ? ' with Corey' : ''} (protected).` }));
      steps.push(cn('cross_agent', 'append_line', { summary: `${who}→Clare: keep ${short(ghost.date)} clear`, text: `- ${who}→Clare: keep ${span} clear${withCorey ? ' (Corey)' : ''}.` }));
      receipt = `${who} → Life: “${title}”${withCorey ? ' with Corey' : ''}, ${span}, tentative and protected. ${who}→Clare: keep it clear. Nothing is booked or paid without you.`;
      break;
    }
    case 'task_block': {
      // Runway time-blocking: a real Tasks work block linked to the task, so Tasks,
      // plan-vs-actual and bookmarks all see it. The ghost id makes the write idempotent.
      const [sh, sm] = ghost.start.split(':').map(Number);
      const [eh, em] = ghost.end.split(':').map(Number);
      const minutes = eh * 60 + em - (sh * 60 + sm);
      const title = oneLine(ghost.title);
      steps.push({
        target: 'tasks',
        method: 'POST',
        collection: 'work_blocks',
        body: { title, date: ghost.date, start_time: ghost.start, duration_minutes: minutes, task_id: ghost.taskId, source: 'runway' }
      });
      const where = `${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.start)}–${clock12(ghost.end)}`;
      steps.push(recentAction(actedOn, who, `blocked out “${title}” ${where}${why}`));
      receipt = `${who} → Tasks: “${title}”, ${where}.`;
      break;
    }
    case 'move_block': {
      const [sh, sm] = ghost.start.split(':').map(Number);
      const [eh, em] = ghost.end.split(':').map(Number);
      const minutes = eh * 60 + em - (sh * 60 + sm);
      const title = oneLine(ghost.title) || 'Work block';
      steps.push({
        target: 'tasks',
        method: 'PATCH',
        collection: 'work_blocks',
        id: ghost.blockId,
        body: { date: ghost.date, start_time: ghost.start, duration_minutes: minutes }
      });
      const where = `${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.start)}`;
      steps.push(recentAction(actedOn, who, `moved “${title}” ${short(ghost.from)} → ${where}${why}`));
      receipt = `${who} → Tasks: “${title}” → ${where}.`;
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
    case 'book_comm': {
      steps.push({
        target: 'professional',
        action: 'create_communication',
        date: ghost.date,
        time: ghost.time,
        duration_min: ghost.duration_min,
        time_zone: ghost.time_zone || 'Australia/Sydney',
        title: oneLine(ghost.title),
        channel: ghost.channel || 'in_person',
        purpose_tag: ghost.purpose_tag ?? null,
        thread_ref: ghost.thread_ref ?? null,
        person_refs: [...ghost.person_refs]
      });
      steps.push(recentAction(actedOn, who, `booked “${oneLine(ghost.title)}” ${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.time)}${why}`));
      receipt = `${who} → Calendar: “${oneLine(ghost.title)}”, ${weekday(ghost.date)} ${formatDisplayDate(ghost.date)} at ${clock12(ghost.time)}.`;
      break;
    }
    case 'outing':
    case 'meal_block':
    case 'schedule_workout': {
      const withCorey = ghost.with === 'corey';
      const title = oneLine(ghost.title);
      const span = `${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.start)}–${clock12(ghost.end)}`;
      // Display kinds: plan (outing/meal) and workout stay visible on Tideline.
      // protect_block keeps kind 'protected' (hidden). protected:true still tells Clare to avoid the slot.
      const blockKind = ghost.kind === 'schedule_workout'
        ? 'workout'
        : (withCorey ? 'corey' : 'plan');
      const notes = oneLine(ghost.notes) || oneLine(ghost.place) || '';
      steps.push({
        target: 'life_record',
        mode: 'create',
        record: {
          type: 'calendar_block',
          date: ghost.date,
          time: ghost.start,
          end_time: ghost.end,
          kind: blockKind,
          status: 'tentative',
          protected: ghost.kind !== 'schedule_workout',
          title,
          source_agent: ghost.agent,
          ...(notes ? { notes } : {})
        }
      });
      if (ghost.follow_up_task && typeof ghost.follow_up_task === 'object') {
        const task = ghost.follow_up_task;
        const taskTitle = oneLine(task.title) || title;
        steps.push({
          target: 'tasks',
          method: 'POST',
          body: {
            title: taskTitle,
            due_date: DATE_KEY.test(task.due ?? '') ? task.due : ghost.date,
            status: 'open',
            ...(oneLine(task.notes) || oneLine(task.person_ref)
              ? {
                notes: [oneLine(task.notes), oneLine(task.person_ref) ? `Person: ${oneLine(task.person_ref)}` : '']
                  .filter(Boolean)
                  .join('\n')
              }
              : {}),
            ...(task.domain ? { domain: task.domain } : {}),
            ...(HHMM.test(task.due_time ?? '') ? { due_time: task.due_time } : {}),
            source: 'suggested_by_agent'
          }
        });
      }
      steps.push(recentAction(actedOn, who, `${ghost.kind === 'outing' ? 'outing' : ghost.kind === 'meal_block' ? 'meal' : 'workout'} “${title}” ${span}${why}`));
      receipt = `${who} → Life: “${title}”, ${span}, tentative${ghost.kind === 'schedule_workout' ? '' : ' and protected'}.`;
      break;
    }
    case 'reschedule_block': {
      const fields = {};
      if (DATE_KEY.test(ghost.date ?? '')) fields.date = ghost.date;
      if (HHMM.test(ghost.start ?? '')) fields.time = ghost.start;
      if (HHMM.test(ghost.end ?? '')) fields.end_time = ghost.end;
      if (oneLine(ghost.title)) fields.title = oneLine(ghost.title);
      steps.push({ target: 'life_record', mode: 'update', path: ghost.path, fields });
      const label = oneLine(ghost.title) || ghost.path;
      const when = DATE_KEY.test(ghost.date ?? '') && HHMM.test(ghost.start ?? '')
        ? ` → ${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.start)}${HHMM.test(ghost.end ?? '') ? `–${clock12(ghost.end)}` : ''}`
        : '';
      steps.push(recentAction(actedOn, who, `rescheduled “${label}”${when}${why}`));
      receipt = `${who} → Life: rescheduled “${label}”${when}.`;
      break;
    }
    case 'cancel_block': {
      steps.push({
        target: 'life_record',
        mode: 'update',
        path: ghost.path,
        fields: { status: 'cancelled' }
      });
      const label = oneLine(ghost.title) || ghost.path;
      steps.push(recentAction(actedOn, who, `cancelled “${label}”${why}`));
      receipt = `${who} → Life: cancelled “${label}”.`;
      break;
    }
    case 'log_comm': {
      const time = HHMM.test(ghost.time ?? '') ? ghost.time : '12:00';
      const subject = oneLine(ghost.title) || oneLine(ghost.subject);
      steps.push({
        target: 'professional',
        action: 'log_communication',
        date: ghost.date,
        time,
        time_zone: ghost.time_zone || 'Australia/Sydney',
        direction: ghost.direction,
        channel: ghost.channel,
        title: subject,
        summary: typeof ghost.summary === 'string' ? ghost.summary.trim() : '',
        person_refs: Array.isArray(ghost.person_refs) ? [...ghost.person_refs] : []
      });
      steps.push(recentAction(actedOn, who, `logged ${ghost.direction} ${ghost.channel} “${subject}” ${weekday(ghost.date)} ${short(ghost.date)}${why}`));
      receipt = `${who} → Comms: logged ${ghost.direction} ${ghost.channel} “${subject}” on ${formatDisplayDate(ghost.date)}.`;
      break;
    }
    case 'pro_meeting': {
      const title = oneLine(ghost.title);
      const tz = ghost.time_zone || 'Australia/Sydney';
      steps.push({
        target: 'professional',
        action: 'create_meeting',
        title,
        date: ghost.date,
        start: ghost.start,
        end: ghost.end,
        time_zone: tz,
        scheduled_start: ghost.scheduled_start || null,
        scheduled_end: ghost.scheduled_end || null,
        location_text: ghost.location_text ?? null,
        agenda: ghost.agenda ?? null,
        notes: ghost.notes ?? null,
        attendee_refs: Array.isArray(ghost.attendee_refs) ? [...ghost.attendee_refs] : []
      });
      steps.push(recentAction(actedOn, who, `booked meeting “${title}” ${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.start)}–${clock12(ghost.end)}${why}`));
      receipt = `${who} → Meetings: “${title}”, ${weekday(ghost.date)} ${formatDisplayDate(ghost.date)} ${clock12(ghost.start)}–${clock12(ghost.end)}.`;
      break;
    }
    case 'pro_event': {
      const title = oneLine(ghost.title);
      const tz = ghost.time_zone || 'Australia/Sydney';
      steps.push({
        target: 'professional',
        action: 'create_event',
        title,
        date: ghost.date,
        start: ghost.start,
        end: ghost.end,
        time_zone: tz,
        start_iso: ghost.start_iso || null,
        end_iso: ghost.end_iso || null,
        event_type: ghost.event_type || 'professional_development',
        all_day: ghost.all_day === true,
        location_text: ghost.location_text ?? null,
        hours: ghost.hours ?? null,
        attendee_refs: Array.isArray(ghost.attendee_refs) ? [...ghost.attendee_refs] : []
      });
      steps.push(recentAction(actedOn, who, `booked event “${title}” ${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.start)}–${clock12(ghost.end)}${why}`));
      receipt = `${who} → Events: “${title}”, ${weekday(ghost.date)} ${formatDisplayDate(ghost.date)} ${clock12(ghost.start)}–${clock12(ghost.end)}.`;
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
