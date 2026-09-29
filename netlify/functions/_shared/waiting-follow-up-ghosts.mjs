/**
 * Waiting-on follow-up drafts → calendar ghost queue (deterministic).
 */
import { validateGhost } from '../../../packages/design-kit/js/calendar/ghost-writes.js';

const DAY_MS = 86_400_000;
export const WAITING_FOLLOW_UP_DAYS = 5;
export const WAITING_FOLLOW_UP_CAP = 10;

function daysBetweenKeys(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / DAY_MS);
}

function sydneyDateKey(instant) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(instant);
}

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
    const age = daysBetweenKeys(sinceKey, todayKey);
    if (age < minAgeDays) continue;
    out.push({ task, age_days: age });
  }
  return out.sort((a, b) => b.age_days - a.age_days);
}

export function waitingFollowUpGhosts(aged, nowIso, cap = WAITING_FOLLOW_UP_CAP) {
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
  const todayKey = today ?? sydneyDateKey(new Date());
  return waitingFollowUpGhosts(selectAgedWaitingTasks(tasks, todayKey), nowIso, cap);
}
