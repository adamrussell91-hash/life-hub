// netlify/functions/_shared/goal-read.mjs
/**
 * Hammond's read of one goal. Pure: no I/O. Deterministic, like ghost-proposer.js.
 * Spec: docs/superpowers/specs/2026-09-26-goals-redesign-design.md ("Hammond's goal read").
 */
import { getSydneyDateKey } from '../../../apps/life/js/core/time.js';
import { addDays, daysBetween } from '../../../packages/design-kit/js/lead-lines.js';
import { isClosedTask } from './task-liveness.mjs';

export const SPHERE_DOMAIN = Object.freeze({ life: 'life', work: 'teaching', professional: 'other' });
const MAX_GHOSTS = 3;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const GHOST_ID = /^goal-(.+?)-(?:start|split-.+|rest-.+|move-.+|block-.+|mandala-.+)$/;
const MANDALA_SIZE = 8;
const MANDALA_MAX_ADDITIONS = 8;

export function goalIdFromGhostId(id) {
  const match = typeof id === 'string' ? GHOST_ID.exec(id) : null;
  return match ? match[1] : null;
}

export function mondayOfKey(key) {
  const dow = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
}

/** Hub prefs store terms nested by year; accept flat rows too. */
export function termsFromHubPrefs(prefs) {
  const rows = Array.isArray(prefs?.school_terms) ? prefs.school_terms : [];
  return rows
    .flatMap(row => (Array.isArray(row?.terms) ? row.terms : [row]))
    .filter(t => t && DATE_KEY.test(t.starts_on ?? '') && DATE_KEY.test(t.ends_on ?? '') && t.starts_on <= t.ends_on)
    .map(t => ({ term: Number.isInteger(t.term) ? t.term : null, starts_on: t.starts_on, ends_on: t.ends_on }))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

function sydneyKey(iso) {
  return getSydneyDateKey(new Date(iso));
}

function shortDate(key) {
  return `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Eight pillars of eight actions, blanks kept, so an index is a grid position. */
function padMandala(goal) {
  const stored = Array.isArray(goal?.frame?.mandala?.pillars) ? goal.frame.mandala.pillars : [];
  return Array.from({ length: MANDALA_SIZE }, (_, i) => {
    const p = stored[i] ?? {};
    const id = typeof p.id === 'string' && p.id ? p.id : `p${i + 1}`;
    const actions = Array.isArray(p.actions) ? p.actions : [];
    return {
      id,
      label: typeof p.label === 'string' ? p.label : '',
      project_id: typeof p.project_id === 'string' && p.project_id ? p.project_id : null,
      actions: Array.from({ length: MANDALA_SIZE }, (_, j) => {
        const a = actions[j] ?? {};
        return {
          id: typeof a.id === 'string' && a.id ? a.id : `${id}a${j + 1}`,
          label: typeof a.label === 'string' ? a.label : '',
          promoted: a.promoted && typeof a.promoted === 'object' ? a.promoted : null
        };
      })
    };
  });
}

function shortHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Hosted work that is not on the Mandala yet. Each unlinked project becomes a pillar in an
 * empty slot, linked to it; each open task in a linked project becomes an action under that
 * pillar, marked as that task. Only for goals on the Mandala structure.
 */
export function mandalaAdditions({ goal, hostedProjects, hostedTasks }) {
  if (goal?.structure !== 'mandala') return [];
  const pillars = padMandala(goal);
  const additions = [];
  const linked = new Set(pillars.map(p => p.project_id).filter(Boolean));
  const onGrid = new Set(pillars.flatMap(p => p.actions.map(a => a.promoted?.task_id).filter(Boolean)));
  const freeSlots = pillars.map((p, i) => (p.label.trim() ? null : i)).filter(i => i !== null);
  const pillarOf = new Map(pillars.flatMap((p, i) => (p.project_id && p.label.trim() ? [[p.project_id, i]] : [])));
  const names = pillars.map(p => p.label.trim());
  for (const project of hostedProjects) {
    if (linked.has(project.id) || !freeSlots.length || !String(project.title ?? '').trim()) continue;
    const slot = freeSlots.shift();
    additions.push({ type: 'pillar', slot, label: String(project.title).trim(), project_id: project.id });
    pillarOf.set(project.id, slot);
    names[slot] = String(project.title).trim();
  }
  const freeActions = new Map(pillars.map((p, i) => [i, p.actions.map((a, j) => (a.label.trim() ? null : j)).filter(j => j !== null)]));
  for (const task of hostedTasks) {
    if (additions.length >= MANDALA_MAX_ADDITIONS) break;
    if (isClosedTask(task) || task.kind === 'step' || onGrid.has(task.id)) continue;
    const slot = pillarOf.get(task.parent_project_id);
    const free = slot === undefined ? null : freeActions.get(slot);
    if (!free?.length || !String(task.title ?? '').trim()) continue;
    additions.push({
      type: 'action', pillar: slot, pillar_label: names[slot], project_id: task.parent_project_id,
      slot: free.shift(), label: String(task.title).trim(), task_id: task.id
    });
  }
  return additions.slice(0, MANDALA_MAX_ADDITIONS);
}

/** Apply additions to the goal's Mandala as it is now. Cells filled since the read are skipped. */
export function applyMandalaAdditions(goal, additions = []) {
  const pillars = padMandala(goal);
  let applied = 0;
  for (const add of additions) {
    if (add?.type === 'pillar') {
      const p = pillars[add.slot];
      if (!p || p.label.trim()) continue;
      pillars[add.slot] = { ...p, label: String(add.label).slice(0, 120), project_id: add.project_id ?? null };
      applied += 1;
    } else if (add?.type === 'action') {
      const p = pillars[add.pillar];
      const a = p?.actions[add.slot];
      // The pillar must still be the one linked to this task's project, not one typed over it since.
      if (!a || a.label.trim() || !p.label.trim() || (add.project_id && p.project_id !== add.project_id)) continue;
      p.actions[add.slot] = { ...a, label: String(add.label).slice(0, 160), promoted: add.task_id ? { kind: 'task', task_id: add.task_id } : null };
      applied += 1;
    }
  }
  return { frame: { ...(goal.frame ?? {}), mandala: { pillars } }, applied };
}

function mandalaProposal({ goal, hostedProjects, hostedTasks, prefix }) {
  const additions = mandalaAdditions({ goal, hostedProjects, hostedTasks });
  if (!additions.length) return null;
  const key = additions.map(a => (a.type === 'pillar' ? `p:${a.project_id}` : `a:${a.task_id}`)).join('|');
  return {
    id: `${prefix}mandala-${shortHash(key)}`, agent: 'hammond', kind: 'goal_mandala',
    goalId: goal.id, title: goal.title, additions,
    reason: 'This work already serves the goal but is not on the grid yet'
  };
}

export function hostedOf(goal, projects = [], tasks = []) {
  const hostedProjects = projects.filter(p => p && p.parent_goal_id === goal.id && p.status !== 'archived');
  const projectIds = new Set(hostedProjects.map(p => p.id));
  const hostedTasks = tasks.filter(t =>
    t && t.bucket !== 'someday' &&
    (t.parent_goal_id === goal.id || (typeof t.parent_project_id === 'string' && projectIds.has(t.parent_project_id))));
  return { hostedProjects, hostedTasks };
}

export function basisUpdatedAt(goal, projects = [], tasks = []) {
  const { hostedProjects, hostedTasks } = hostedOf(goal, projects, tasks);
  return [goal.updated_at, ...hostedProjects.map(p => p.updated_at), ...hostedTasks.map(t => t.updated_at)]
    .filter(stamp => typeof stamp === 'string' && stamp)
    .sort()
    .at(-1) ?? '';
}

/** Future weeks of the current (or next) term whose open due-task count is ≥ max(5, 1.5 × median). */
export function crunchWeeks(tasks, terms, today) {
  const term = terms.find(t => today >= t.starts_on && today <= t.ends_on) ?? terms.find(t => t.starts_on > today);
  if (!term) return [];
  const load = new Map();
  for (let monday = mondayOfKey(term.starts_on); monday <= term.ends_on; monday = addDays(monday, 7)) load.set(monday, 0);
  for (const task of tasks) {
    if (!task || task.bucket === 'someday' || isClosedTask(task) || !DATE_KEY.test(task.due_date ?? '')) continue;
    const monday = mondayOfKey(task.due_date);
    if (load.has(monday)) load.set(monday, load.get(monday) + 1);
  }
  const threshold = Math.max(5, 1.5 * median([...load.values()]));
  const nowMonday = mondayOfKey(today);
  return [...load.entries()].filter(([monday, count]) => monday > nowMonday && count >= threshold).map(([monday]) => monday);
}

function nextCalmWeekday(today, crunch) {
  for (let offset = 1; offset <= 21; offset += 1) {
    const day = addDays(today, offset);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || crunch.includes(mondayOfKey(day))) continue;
    return day;
  }
  return addDays(today, 1);
}

function proposals({ goal, hostedTasks, tasks, today, crunch, domain }) {
  const prefix = `goal-${goal.id}-`;
  const out = [];
  const open = hostedTasks.filter(t => !isClosedTask(t) && t.kind !== 'step');
  const byDue = [...open].sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'));

  if (!open.length) {
    out.push({
      id: `${prefix}start`, agent: 'hammond', kind: 'create_task',
      title: goal.next_start || `First step: ${goal.title}`, due: addDays(today, 2),
      goalId: goal.id, domain, reason: 'Nothing is open under this goal'
    });
  }

  const candidate = byDue.find(t => !t.due_date || t.due_date >= today);
  if (candidate && !tasks.some(t => t && t.parent_task_id === candidate.id)) {
    const big = typeof candidate.estimated_duration === 'number' && candidate.estimated_duration >= 45;
    const soon = typeof candidate.due_date === 'string' && daysBetween(today, candidate.due_date) <= 7;
    if (big || soon) {
      out.push({
        id: `${prefix}split-${candidate.id}`, agent: 'hammond', kind: 'split_task',
        taskId: candidate.id, title: candidate.title,
        steps: [
          `Get what you need for ${candidate.title} (10 min)`,
          'Do a rough first pass (20 min)',
          `Finish and tick off ${candidate.title} (10 min)`
        ],
        goalId: goal.id, domain: candidate.domain || domain,
        reason: big ? 'It is one big block, and big blocks are hard to start' : 'It is due within a week'
      });
    }
  }

  if (goal.lead_measure) {
    const weeks = crunch.filter(week => !(goal.rest_weeks ?? []).includes(week));
    if (weeks.length) {
      out.push({
        id: `${prefix}rest-${weeks.join('_')}`, agent: 'hammond', kind: 'goal_rest_weeks',
        goalId: goal.id, title: goal.title, weeks,
        rest_weeks: [...new Set([...(goal.rest_weeks ?? []), ...weeks])].sort(),
        reason: 'Those weeks are already heavy. A planned rest is not a miss'
      });
    }
  }

  const overdue = byDue.find(t => DATE_KEY.test(t.due_date ?? '') && t.due_date < today);
  if (overdue) {
    out.push({
      id: `${prefix}move-${overdue.id}`, agent: 'hammond', kind: 'move_task',
      taskId: overdue.id, title: overdue.title, from: overdue.due_date, to: nextCalmWeekday(today, crunch),
      reason: 'Overdue. Moved to the next weekday outside a crunch week'
    });
  }
  return out;
}

/** G-30: one protect_block when the lead measure is behind and a calendar slot exists. */
export function protectBlockProposal({ goal, hostedTasks, today, slots = [], count, perWeek }) {
  if (!perWeek || count >= perWeek || !Array.isArray(slots) || !slots.length) return null;
  const sunday = addDays(mondayOfKey(today), 6);
  const slot = slots.find(s => s && DATE_KEY.test(s.date ?? '') && s.date >= today && s.date <= sunday)
    ?? slots.find(s => s && DATE_KEY.test(s.date ?? '') && s.date >= today);
  if (!slot) return null;
  const open = hostedTasks.filter(t => !isClosedTask(t) && t.kind !== 'step');
  const move = open.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0];
  const title = move?.title || goal.next_start || `Work on ${goal.title}`;
  const minutes = typeof move?.estimated_duration === 'number' && move.estimated_duration > 0
    ? move.estimated_duration
    : 45;
  const start = slot.start ?? '09:00';
  const end = addMinutesHhMm(start, minutes);
  return {
    id: `goal-${goal.id}-block-${slot.date}`,
    agent: 'hammond',
    kind: 'protect_block',
    date: slot.date,
    start,
    end,
    title,
    goalId: goal.id,
    reason: `Behind on this week's lead measure (${count} of ${perWeek}). Protect a block before the week ends.`
  };
}

/**
 * G-36: check-in stuck_reason drives the preferred ghost on the next Hammond read.
 * Uses existing confirmable kinds only (create_task / split_task / protect_block).
 */
export function stuckReasonGhost({
  goal, stuck_reason, hostedTasks = [], tasks = [], today, domain, slots = [], count = 0, perWeek = null
}) {
  if (!stuck_reason || typeof stuck_reason !== 'string') return null;
  const prefix = `goal-${goal.id}-`;
  const open = hostedTasks.filter(t => !isClosedTask(t) && t.kind !== 'step');
  const byDue = [...open].sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'));
  const candidate = byDue.find(t => !t.due_date || t.due_date >= today) ?? byDue[0];

  if (stuck_reason === 'too_big') {
    if (candidate && !tasks.some(t => t && t.parent_task_id === candidate.id)) {
      return {
        id: `${prefix}split-${candidate.id}`, agent: 'hammond', kind: 'split_task',
        taskId: candidate.id, title: candidate.title,
        steps: [
          `Get what you need for ${candidate.title} (10 min)`,
          'Do a rough first pass (20 min)',
          `Finish and tick off ${candidate.title} (10 min)`
        ],
        goalId: goal.id, domain: candidate.domain || domain,
        reason: 'Stuck: too big — split it so the first step fits in a short block'
      };
    }
    return {
      id: `${prefix}start`, agent: 'hammond', kind: 'create_task',
      title: `First step: ${goal.title}`, due: addDays(today, 2),
      goalId: goal.id, domain,
      reason: 'Stuck: too big — start with one small, finishable step'
    };
  }
  if (stuck_reason === 'unclear') {
    return {
      id: `${prefix}start`, agent: 'hammond', kind: 'create_task',
      title: `SMARTER check: what does done look like for ${goal.title}?`,
      due: addDays(today, 2), goalId: goal.id, domain,
      reason: 'Stuck: unclear — tighten Specific / Measurable / Achievable / Relevant / Time-bound / Exciting / Recorded'
    };
  }
  if (stuck_reason === 'boring') {
    return {
      id: `${prefix}start`, agent: 'hammond', kind: 'create_task',
      title: `If it's after coffee tomorrow, then 10 min on ${goal.title}`,
      due: addDays(today, 1), goalId: goal.id, domain,
      reason: 'Stuck: boring — an if-then cue beats waiting for motivation'
    };
  }
  if (stuck_reason === 'no_time') {
    const block = protectBlockProposal({ goal, hostedTasks, today, slots, count: count || 0, perWeek: perWeek || 1 });
    if (block) {
      return { ...block, reason: 'Stuck: no time — protect a block before the week ends' };
    }
    return {
      id: `${prefix}start`, agent: 'hammond', kind: 'create_task',
      title: `15-min protect for ${goal.title}`, due: addDays(today, 1),
      goalId: goal.id, domain,
      reason: 'Stuck: no time — book a short protect even without a free calendar slot'
    };
  }
  if (stuck_reason === 'waiting') {
    return {
      id: `${prefix}start`, agent: 'hammond', kind: 'create_task',
      title: `Chase the wait on ${goal.title}`, due: addDays(today, 1),
      goalId: goal.id, domain,
      reason: 'Stuck: waiting on someone — one chase keeps it warm'
    };
  }
  return null;
}

function addMinutesHhMm(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function verdictFor({ days, temperature, count, perWeek, crunch }) {
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const parts = [
    temperature === 'warm'
      ? `Moving: last touched ${when}.`
      : temperature === 'cooling'
        ? `Cooling: nothing for ${days} days.`
        : `Gone quiet: nothing for ${days} days.`
  ];
  if (perWeek) parts.push(count >= perWeek ? `${count} of ${perWeek} this week, done.` : `${count} of ${perWeek} this week.`);
  if (perWeek && crunch.length) parts.push(`The weeks of ${crunch.map(shortDate).join(' and ')} look heavy, so plan around them.`);
  return parts.join(' ');
}

export function buildGoalRead({
  goal,
  projects = [],
  tasks = [],
  terms = [],
  today,
  dismissed = [],
  slots = [],
  binding = null,
  calendarLooked = false,
  lifeHubLooked = false,
  cooledKinds = new Set(),
  model = null,
  stuck_reason = null
}) {
  const { hostedProjects, hostedTasks } = hostedOf(goal, projects, tasks);
  const stamps = [goal.updated_at, ...hostedTasks.flatMap(t => [t.completed_at, t.updated_at])]
    .filter(stamp => typeof stamp === 'string' && stamp)
    .sort();
  const last = stamps.at(-1) ?? goal.created_at ?? `${today}T00:00:00Z`;
  const days = Math.max(0, daysBetween(sydneyKey(last), today));
  const temperature = days <= 3 ? 'warm' : days <= 8 ? 'cooling' : 'cold';
  const monday = mondayOfKey(today);
  const sunday = addDays(monday, 6);
  const count = hostedTasks.filter(t => {
    if (typeof t.completed_at !== 'string') return false;
    const key = sydneyKey(t.completed_at);
    return key >= monday && key <= sunday;
  }).length + (goal.week_log?.[monday]?.manual ?? 0);
  const perWeek = goal.lead_measure?.per_week ?? null;
  const crunch = crunchWeeks(tasks, terms, today);
  const skip = new Set(dismissed);
  const domain = SPHERE_DOMAIN[goal.sphere] ?? 'life';

  let ghosts = proposals({ goal, hostedTasks, tasks, today, crunch, domain })
    .filter(ghost => !skip.has(ghost.id) && !cooledKinds.has(ghost.kind));

  const block = protectBlockProposal({ goal, hostedTasks, today, slots, count, perWeek });
  if (block && !skip.has(block.id) && !cooledKinds.has('protect_block')) {
    ghosts = [block, ...ghosts];
  }

  const stuck = stuckReasonGhost({
    goal, stuck_reason, hostedTasks, tasks, today, domain, slots, count, perWeek
  });
  if (stuck && !skip.has(stuck.id) && !cooledKinds.has(stuck.kind)) {
    ghosts = [stuck, ...ghosts.filter(g => g.id !== stuck.id)];
  }
  // On the Mandala structure, filling the grid from existing work comes first.
  const mandala = mandalaProposal({ goal, hostedProjects, hostedTasks, prefix: `goal-${goal.id}-` });
  if (mandala && !skip.has(mandala.id) && !cooledKinds.has(mandala.kind)) ghosts = [mandala, ...ghosts];
  ghosts = ghosts.slice(0, MAX_GHOSTS);

  let verdict = verdictFor({ days, temperature, count, perWeek, crunch });
  let bindingFlag = false;
  if (binding && goal.signal?.source === 'binding_goal') {
    const row = binding.rows?.find?.(r => r.id === goal.signal.row) ?? null;
    if (row?.detail) verdict = `${verdict} ${row.detail}`;
    if (binding.bindingId && goal.id === binding.bindingId) bindingFlag = true;
  }

  const modelWritten = model && typeof model.verdict === 'string' && model.verdict.trim();
  if (modelWritten) verdict = model.verdict.trim().slice(0, 240);

  // Content-aware splits from the model replace template steps on split_task ghosts.
  if (model?.split_steps?.length >= 3) {
    ghosts = ghosts.map(g =>
      g.kind === 'split_task' ? { ...g, steps: model.split_steps.slice(0, 5) } : g
    );
  }

  return {
    goal_id: goal.id,
    computed_on: today,
    basis_updated_at: basisUpdatedAt(goal, projects, tasks),
    temperature,
    days_since_movement: days,
    week: { count, per_week: perWeek },
    crunch_weeks: crunch,
    verdict,
    verdict_source: modelWritten ? 'model' : 'deterministic',
    model_fallback: model?.fallback === true,
    binding: bindingFlag,
    signal_detail: binding?.rows?.find?.(r => r.id === goal.signal?.row)?.detail ?? null,
    looked_at: [
      'Progress',
      ...(perWeek ? ['Lead measure'] : []),
      'Due dates',
      ...(terms.length ? ['Due-date load'] : []),
      ...(calendarLooked ? ['Calendar'] : []),
      ...(lifeHubLooked ? ['Life Hub'] : []),
      'Stall check',
      ...(hostedProjects.length ? ['Linked projects'] : [])
    ],
    ghosts
  };
}
