/**
 * Deadline runway → calendar ghost proposals (deterministic).
 * Extends the morning ghost-propose pass — no new cron, no LLM.
 */
import { validateGhost } from '../../../packages/design-kit/js/calendar/ghost-writes.js';
import { computeDeadlineRunway } from './productivity-os.mjs';

const DAY_MS = 86_400_000;

function addDaysKey(key, days) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
}

function endFromStart(startHhmm, minutes) {
  const [h, m] = startHhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + Math.max(25, minutes), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Open tasks due within 48h that need a protected work block.
 * Stable id `clare-runway-{taskId}` so alreadyQueued / semantic taskId de-dupe.
 */
export function proposeDeadlineRunwayGhosts({ tasks, today, nowIso }) {
  if (!Array.isArray(tasks) || !/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) return [];
  const horizon = addDaysKey(today, 2);
  const out = [];

  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    if (task.status === 'done' || task.status === 'dead') continue;
    const due = typeof task.due_date === 'string' ? task.due_date : null;
    if (!due || due < today || due > horizon) continue;

    const remaining = Math.max(0, Math.round(Number(task.estimated_duration) || 60));
    if (remaining <= 0) continue;

    const daysLeft = daysBetween(today, due);
    const available = (daysLeft + 1) * 120;
    const runway = computeDeadlineRunway({
      today,
      deadline: due,
      remaining_minutes: remaining,
      already_scheduled_minutes: 0,
      available_minutes_until_deadline: available
    });

    // No work coverage yet (already_scheduled=0): propose when tight/impossible or due within 1 day.
    if (runway.risk === 'clear' && daysLeft > 1) continue;

    const blockMinutes = Math.min(120, Math.max(25, runway.required_blocks?.[0]?.minutes ?? remaining));
    const start = '09:00';
    const end = endFromStart(start, blockMinutes);
    const date = runway.recommended_start && runway.recommended_start >= today
      ? runway.recommended_start
      : today;

    const ghost = {
      id: `clare-runway-${task.id}`,
      agent: 'clare',
      kind: 'protect_block',
      date,
      start,
      end,
      title: `Work: ${String(task.title ?? 'task').trim() || 'task'}`,
      reason: runway.note,
      taskId: task.id,
      created_at: nowIso,
      status: 'pending',
      via: 'deadline-runway'
    };
    validateGhost(ghost);
    out.push(ghost);
  }

  return out;
}
