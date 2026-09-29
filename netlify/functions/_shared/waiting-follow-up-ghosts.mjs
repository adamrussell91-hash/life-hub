/**
 * Waiting-on follow-up drafts → calendar ghost queue (deterministic).
 */
import { daysBetween, getSydneyDateKey } from '../../../apps/life/js/core/time.js';
import { validateGhost } from '../../../packages/design-kit/js/calendar/ghost-writes.js';

export const WAITING_FOLLOW_UP_DAYS = 5;
export const WAITING_FOLLOW_UP_CAP = 10;

/**
 * Age from waiting_since only — never updated_at. Skip if waiting_since missing.
 */
export function selectAgedWaitingTasks(tasks, todayKey, minAgeDays = WAITING_FOLLOW_UP_DAYS) {
  const out = [];
  for (const task of tasks ?? []) {
    if (!task || task.status === 'done' || task.status === 'dead') continue;
    if (!task.waiting_on || !String(task.waiting_on).trim()) continue;
    if (!task.waiting_since || typeof task.waiting_since !== 'string') continue;
    const sinceKey = task.waiting_since.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceKey)) continue;
    const age = daysBetween(sinceKey, todayKey);
    if (age < minAgeDays) continue;
    out.push({ task, age_days: age });
  }
  return out.sort((a, b) => b.age_days - a.age_days);
}

function buildWaitingFollowUpGhosts(aged, nowIso, cap = WAITING_FOLLOW_UP_CAP) {
  return aged.slice(0, cap).map(({ task, age_days }) => {
    const who = String(task.waiting_on).trim();
    const first = who.split(/\s+/)[0] || who;
    const ghost = {
      id: `clare-waiting-${task.id}`,
      agent: 'clare',
      kind: 'draft_message',
      to: who,
      text: `Hi ${first},\n\nJust checking in on this — still waiting on my side for: ${task.title}.\n\n`,
      reason: `Waiting ${age_days} days`,
      taskId: task.id,
      created_at: nowIso,
      status: 'pending',
      via: 'waiting-follow-up'
    };
    validateGhost(ghost);
    return ghost;
  });
}

export function proposeWaitingFollowUpGhosts({ tasks, today, nowIso, cap = WAITING_FOLLOW_UP_CAP }) {
  const todayKey = today ?? getSydneyDateKey(new Date());
  return buildWaitingFollowUpGhosts(selectAgedWaitingTasks(tasks, todayKey), nowIso, cap);
}
