/**
 * Projects runway — the default Projects view. Pure: every row, group, sentence and
 * piece of track geometry is built here from real project, task, planning-profile and
 * thinking-tool data, so the view only paints and patches.
 */
import { isProjectArchived, type Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { PlanningProfile } from '@/schemas/planning-profile';
import type { SchoolTerm } from '@/domain/school-time';
import { projectChildTasks, projectProgress } from '@/domain/cards';
import { computeDeadlineRunway, type RunwayResult } from '@/domain/deadline-runway';
import { inspectProjectHealth, type ProjectHealth, type ProjectHealthResult } from '@/domain/project-health';
import { projectMilestones } from '@/domain/project-milestones';
import {
  FORECAST_HORIZON_DAYS,
  SUSTAINABLE_RUNNING_LOAD,
  buildProjectPulseCard,
  projectLifecycleMix,
  runningProjectCount,
  type ProjectEnergy,
  type ProjectLifecycle,
  type ProjectPulseCard
} from '@/domain/projects-pulse';
import { lastProjectActivityAt } from '@/domain/stall';
import { listWaitingItems } from '@/domain/waiting';
import { computeProjectVariance } from '@/domain/closure';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';

/** Days the shared axis covers, from today. */
export const RUNWAY_SPAN_DAYS = 120;
/** Completed projects stay in Landed this long. */
export const LANDED_WINDOW_DAYS = 42;
/** A project quiet this long shows "quiet for N wks". */
export const QUIET_NOTE_DAYS = 21;
/** computeDeadlineRunway plans in two-hour work days; the buffer uses the same unit. */
const WORK_DAY_MINUTES = 120;

export type RunwayTool =
  | 'problem_solver'
  | 'decision_maker'
  | 'gear_shifter'
  | 'communication_book'
  | 'collaboration_book'
  | 'change_book'
  | 'rules_book'
  | 'question_book';

export type RunwayToolInfo = {
  name: string;
  hash: string;
  /** One glyph for the tool's circle. */
  glyph: string;
  /** One line on when to reach for it. */
  when: string;
  /** Session kind `create` takes; null when the tool has no session API (Question Book). */
  kind: 'full' | 'decision' | 'shift' | 'talk' | 'collab' | 'change' | 'rules' | null;
};

export const RUNWAY_TOOL_ORDER: RunwayTool[] = [
  'problem_solver',
  'decision_maker',
  'gear_shifter',
  'communication_book',
  'collaboration_book',
  'change_book',
  'rules_book',
  'question_book'
];

export const RUNWAY_TOOLS: Record<RunwayTool, RunwayToolInfo> = {
  problem_solver: { name: 'Problem Solver', hash: '#/problem-solver', glyph: '?', when: 'It isn’t moving and you’re not sure why', kind: 'full' },
  decision_maker: { name: 'Decision Maker', hash: '#/decision-maker', glyph: '⑂', when: 'There’s a fork to settle first', kind: 'decision' },
  gear_shifter: { name: 'Gear Shifter', hash: '#/gear-shifter', glyph: '⚙', when: 'It feels too big to start', kind: 'shift' },
  communication_book: { name: 'Communication Book', hash: '#/communication-book', glyph: '❝', when: 'It hinges on a conversation', kind: 'talk' },
  collaboration_book: { name: 'Collaboration Book', hash: '#/collaboration-book', glyph: '⧉', when: 'It depends on working with others', kind: 'collab' },
  change_book: { name: 'Change Book', hash: '#/change-book', glyph: '↻', when: 'It changes how things are done', kind: 'change' },
  rules_book: { name: 'Rules Book', hash: '#/rules-book', glyph: '§', when: 'You need a rule of thumb for it', kind: 'rules' },
  question_book: { name: 'Question Book', hash: '#/question-book', glyph: '¿', when: 'You need to think it through privately', kind: null }
};

export type RunwayGroupId = 'needs_you' | 'in_air' | 'on_ground' | 'landed';

export const RUNWAY_GROUPS: Array<{ id: RunwayGroupId; title: string; hint: string }> = [
  { id: 'needs_you', title: 'Needs you', hint: 'blocked or flagged' },
  { id: 'in_air', title: 'In the air', hint: 'soonest first' },
  { id: 'on_ground', title: 'Stuck on the ground', hint: 'no date, no next action, waiting or stalled' },
  { id: 'landed', title: 'Landed', hint: 'last six weeks' }
];

export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  healthy: 'Healthy',
  blocked: 'Blocked',
  waiting_only: 'Waiting',
  missing_next_action: 'No next action',
  stalled: 'Stalled'
};

/** A thinking-tool session summary, as `api.list()` returns it, tagged with its tool. */
export type RunwaySessionSource = {
  tool: RunwayTool;
  id: string;
  title: string;
  phase: string;
  status?: string;
  links: Array<{ kind: string; id: string }>;
  reviewDue?: string | null;
};

export type RunwaySession = {
  tool: RunwayTool;
  id: string;
  title: string;
  phaseLabel: string;
  reviewDue: string | null;
  href: string;
};

export type RunwaySegment = { taskId: string; title: string; done: boolean };

export type RunwayMarker = { day: number; title: string; dateKey: string };
export type RunwayReviewMarker = RunwayMarker & { tool: RunwayTool; href: string };

export type RunwayRecommendation = { tool: RunwayTool; why: string };

export type RunwayRow = {
  project: Project;
  card: ProjectPulseCard;
  lifecycle: ProjectLifecycle;
  live: boolean;
  health: ProjectHealth;
  healthResult: ProjectHealthResult;
  /** Plain-words reason for the health chip, the sheet and the lede. */
  reason: string;
  /** Why it needs you (lifecycle needs_attention or blocked); null otherwise. */
  needsYouReason: string | null;
  group: RunwayGroupId;
  energy: ProjectEnergy;
  endKey: string | null;
  endDay: number | null;
  nextAction: { taskId: string; title: string } | null;
  segments: RunwaySegment[];
  done: number;
  total: number;
  openCount: number;
  /** Open work from estimates; null when no open task carries an estimate. */
  needMinutes: number | null;
  /** Free work-window minutes from today to the end date; null without work windows. */
  freeMinutes: number | null;
  runway: RunwayResult | null;
  tight: boolean;
  startByKey: string | null;
  startByDay: number | null;
  bufferDays: number;
  waiting: { who: string; days: number | null } | null;
  idleDays: number;
  quietWeeks: number | null;
  milestones: Array<RunwayMarker & { done: boolean }>;
  gates: RunwayMarker[];
  sessions: RunwaySession[];
  reviews: RunwayReviewMarker[];
  recommendation: RunwayRecommendation | null;
  /** Every task done: the row offers the complete-project confirm instead of a next action. */
  readyToClose: boolean;
  /** Landed rows: when it finished. */
  landedKey: string | null;
};

export type RunwayGroup = { id: RunwayGroupId; title: string; hint: string; rows: RunwayRow[] };

export type RunwayModel = {
  todayKey: string;
  rows: RunwayRow[];
  groups: RunwayGroup[];
  running: number;
  loadLimit: number;
  linkedSessions: number;
  stuck: RunwayRow[];
};

export type RunwayInput = {
  projects: Project[];
  archivedProjects: Project[];
  tasks: Task[];
  stallIds: ReadonlySet<string>;
  now: Date;
  profile?: Pick<PlanningProfile, 'work_windows' | 'runway_buffer_minutes' | 'active_project_limit'> | null;
  sessions?: RunwaySessionSource[];
  /** Overrides by project id (live preview while a flag is dragged). */
  endOverride?: { projectId: string; endKey: string } | null;
};

// ---------------------------------------------------------------- dates

export function dayOffset(key: string | null, now: Date): number | null {
  const parsed = parseDue(key);
  if (!parsed) return null;
  return Math.round((startOfDay(parsed).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

export function keyAtOffset(now: Date, days: number): string {
  return toDateKey(addDays(startOfDay(now), days));
}

/** Percent along the axis for a day offset, clamped to the span. */
export function spanPct(day: number, span = RUNWAY_SPAN_DAYS): number {
  return Math.min(100, Math.max(0, (day / span) * 100));
}

/** Day offset under a pointer x, given the track's left edge and width. */
export function dayAtX(x: number, left: number, width: number, min = 0, span = RUNWAY_SPAN_DAYS): number {
  if (!(width > 0)) return min;
  return Math.max(min, Math.min(span, Math.round(((x - left) / width) * span)));
}

export function weeksLabel(days: number): string {
  if (days < 0) return `${Math.ceil(-days / 7)} wk${-days > 7 ? 's' : ''} ago`;
  if (days < 7) return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
  const weeks = Math.round(days / 7);
  return `${weeks} wk${weeks === 1 ? '' : 's'}`;
}

/** Month ticks: the first of each month inside the span. Labels are month-only. */
export function monthTicks(now: Date, span = RUNWAY_SPAN_DAYS): Array<{ day: number; label: string }> {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const out: Array<{ day: number; label: string }> = [];
  for (let m = 0; m < 6; m += 1) {
    const first = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const day = Math.round((first.getTime() - startOfDay(now).getTime()) / 86_400_000);
    if (day < 0 || day > span - 8) continue;
    out.push({ day, label: MONTHS[first.getMonth()]! });
  }
  return out;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function windowMinutes(window: { start: string; end: string }): number {
  const toMin = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h! * 60 + m! : NaN;
  };
  const span = toMin(window.end) - toMin(window.start);
  return Number.isFinite(span) && span > 0 ? span : 0;
}

/**
 * Free work-window minutes from today up to (not including) the end day.
 * Null when the planning profile has no work windows — then "free" is unknown, not zero.
 */
export function workWindowMinutes(
  windows: PlanningProfile['work_windows'] | null | undefined,
  now: Date,
  endKey: string
): number | null {
  if (!windows) return null;
  const perDay = WEEKDAY_KEYS.map((key) => (windows[key] ?? []).reduce((sum, w) => sum + windowMinutes(w), 0));
  if (perDay.every((value) => value === 0)) return null;
  const days = dayOffset(endKey, now);
  if (days == null || days <= 0) return 0;
  const start = startOfDay(now);
  let total = 0;
  for (let i = 0; i < days; i += 1) total += perDay[addDays(start, i).getDay()]!;
  return total;
}

// ---------------------------------------------------------------- sessions

function phaseLabel(phase: string): string {
  const text = phase.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

export function sessionHref(tool: RunwayTool, id: string): string {
  return `${RUNWAY_TOOLS[tool].hash}?id=${encodeURIComponent(id)}`;
}

/** Live sessions whose links include this project, in tool order. */
export function sessionsForProject(sources: RunwaySessionSource[], projectId: string): RunwaySession[] {
  return sources
    .filter((s) => s.status !== 'archived' && s.links.some((link) => link.kind === 'project' && link.id === projectId))
    .sort((a, b) => RUNWAY_TOOL_ORDER.indexOf(a.tool) - RUNWAY_TOOL_ORDER.indexOf(b.tool))
    .map((s) => ({
      tool: s.tool,
      id: s.id,
      title: s.title,
      phaseLabel: phaseLabel(s.phase),
      reviewDue: s.reviewDue ?? null,
      href: sessionHref(s.tool, s.id)
    }));
}

// ---------------------------------------------------------------- words

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

export function horizonPhrase(days: number): string {
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? 'week' : `${countWord(weeks).toLowerCase()} weeks`;
  }
  return `${days} days`;
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

// ---------------------------------------------------------------- one row

const DONE = new Set(['done', 'dead', 'archived_dead']);

function healthReason(
  health: ProjectHealth,
  result: ProjectHealthResult,
  ctx: { idleDays: number; waiting: RunwayRow['waiting']; openCount: number; endKey: string | null; project: Project; tasks: Task[] }
): string {
  switch (health) {
    case 'stalled': {
      const weeks = Math.floor(ctx.idleDays / 7);
      return weeks >= 1 ? `No movement for ${weeks} week${weeks === 1 ? '' : 's'}.` : 'Flagged as stalled.';
    }
    case 'blocked': {
      const gate = gateTitles(ctx.project, result, ctx.tasks)[0];
      return gate ? `Gated on “${gate}”, which isn’t done yet.` : 'Its open work waits on tasks that aren’t done yet.';
    }
    case 'waiting_only':
      if (ctx.waiting?.who) {
        const age = ctx.waiting.days != null ? ` (${ctx.waiting.days} day${ctx.waiting.days === 1 ? '' : 's'})` : '';
        return `Everything left is waiting on ${ctx.waiting.who}${age}.`;
      }
      return 'Everything left is waiting on someone else.';
    case 'missing_next_action':
      return ctx.openCount > 0 ? 'Open tasks, but none is a clear next action.' : 'No open tasks, so there’s no next action.';
    case 'healthy':
      return ctx.endKey ? 'Has a next action and nothing in the way.' : 'Has a next action but no finish date.';
  }
}

function gateTitles(project: Project, result: ProjectHealthResult, tasks: Task[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return result.unmet_dependencies.map((id) => byId.get(id)?.title ?? 'an unfinished task');
}

export function recommendTool(
  row: Pick<RunwayRow, 'health' | 'waiting' | 'idleDays' | 'live'> & { readyToClose?: boolean }
): RunwayRecommendation | null {
  if (!row.live || row.readyToClose) return null;
  switch (row.health) {
    case 'stalled': {
      const weeks = Math.floor(row.idleDays / 7);
      const lead = weeks >= 1 ? `${countWord(weeks)} week${weeks === 1 ? '' : 's'} with no movement.` : 'It has stopped moving.';
      return { tool: 'problem_solver', why: `${lead} Problem Solver helps you find the real cause before you plan again.` };
    }
    case 'waiting_only':
    case 'blocked':
      return {
        tool: 'communication_book',
        why: `It’s held up by ${row.waiting?.who || 'someone else'}. Plan the conversation that frees it.`
      };
    case 'missing_next_action':
      return { tool: 'gear_shifter', why: 'There’s no obvious first move. Gear Shifter breaks it down to one next action.' };
    default:
      return null;
  }
}

/** Group membership — the mockup's rules over real health and lifecycle. */
export function runwayGroup(
  row: Pick<RunwayRow, 'live' | 'endKey' | 'health' | 'lifecycle'> & { readyToClose?: boolean }
): RunwayGroupId {
  if (!row.live) return 'landed';
  // Every task done beats any other state: closing it is the one thing left.
  if (row.readyToClose) return 'needs_you';
  if (!row.endKey) return 'on_ground';
  // Flagged (slipped, past its end, ready to close) or blocked: it needs you before anything else.
  if (row.lifecycle === 'needs_attention' || row.health === 'blocked') return 'needs_you';
  if (row.health !== 'healthy') return 'on_ground';
  return 'in_air';
}

function sortTasks(a: Task, b: Task): number {
  return (a.step_order ?? 0) - (b.step_order ?? 0) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

function needsYouReason(row: Pick<RunwayRow, 'health' | 'reason' | 'lifecycle'>, project: Project, tasks: Task[], now: Date): string | null {
  if (row.health === 'blocked') return row.reason;
  if (row.lifecycle !== 'needs_attention') return null;
  const variance = computeProjectVariance(project, tasks, now);
  if (variance.ready_to_close) return 'Every task is done. It’s ready to close.';
  if (variance.end_passed) return 'Its finish date has passed.';
  if (variance.slip_days != null && variance.slip_days > 0) return `It has slipped ${variance.slip_days} day${variance.slip_days === 1 ? '' : 's'} past its plan.`;
  return row.reason;
}

export function buildRunwayRow(
  project: Project,
  input: Omit<RunwayInput, 'projects' | 'archivedProjects'>
): RunwayRow {
  const { tasks, stallIds, now } = input;
  const todayKey = toDateKey(now);
  const live = !isProjectArchived(project.status);
  const card = buildProjectPulseCard(project, tasks, stallIds, now);
  const healthResult = inspectProjectHealth(project, tasks, now.toISOString());
  const health: ProjectHealth = card.lifecycle === 'stalled' ? 'stalled' : healthResult.health;
  const children = projectChildTasks(project, tasks).sort(sortTasks);
  const progress = projectProgress(project, tasks, now);
  const open = children.filter((t) => !DONE.has(String(t.status)));
  const override = input.endOverride?.projectId === project.id ? input.endOverride.endKey : null;
  const endKey = override ?? project.current_end_date ?? project.baseline_end_date ?? null;
  const endDay = dayOffset(endKey, now);
  const waitingItem = listWaitingItems(open, todayKey)[0];
  const waiting = waitingItem ? { who: waitingItem.waiting_on || 'someone else', days: waitingItem.age_days } : null;
  const idleDays = Math.max(
    0,
    Math.round((startOfDay(now).getTime() - startOfDay(lastProjectActivityAt(project, tasks)).getTime()) / 86_400_000)
  );
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const nextId = healthResult.executable_next_actions
    .map((id) => byId.get(id))
    .filter((t): t is Task => Boolean(t))
    .sort(sortTasks)[0];

  const estimated = open.filter((t) => (t.estimated_duration ?? 0) > 0);
  const needMinutes = estimated.length ? estimated.reduce((sum, t) => sum + (t.estimated_duration ?? 0), 0) : null;
  const freeMinutes = live && endKey ? workWindowMinutes(input.profile?.work_windows, now, endKey) : null;

  const milestoneList = projectMilestones(project);
  let runway: RunwayResult | null = null;
  if (live && endKey && needMinutes != null && endDay != null && endDay >= 0) {
    runway = computeDeadlineRunway({
      deadline: endKey,
      remaining_minutes: needMinutes,
      buffer_minutes: input.profile?.runway_buffer_minutes ?? null,
      available_minutes_until_deadline: freeMinutes,
      milestones: milestoneList.map((m) => ({ id: m.id, title: m.title, due_date: m.due_date })),
      today: todayKey
    });
  }
  const bufferDays = runway ? Math.max(1, Math.ceil(runway.buffer_minutes / WORK_DAY_MINUTES)) : 0;
  const startByKey = runway?.latest_safe_start ?? null;

  const milestones = milestoneList
    .map((m) => ({ m, day: dayOffset(m.due_date, now) }))
    .filter((x): x is { m: (typeof milestoneList)[number]; day: number } => x.day != null && x.day >= 0 && x.day <= RUNWAY_SPAN_DAYS)
    .map(({ m, day }) => ({ day, title: m.title, dateKey: m.due_date!, done: m.status === 'done' }));

  // A gate sits at the unmet dependency's own due date, else at the milestone it holds up.
  const gates: RunwayMarker[] = [];
  for (const m of milestoneList.filter((item) => item.status === 'open')) {
    for (const dep of m.depends_on ?? []) {
      if (!healthResult.unmet_dependencies.includes(dep)) continue;
      const task = byId.get(dep);
      const dateKey = task?.due_date?.slice(0, 10) ?? m.due_date;
      const day = dayOffset(dateKey, now);
      if (dateKey == null || day == null || day < 0 || day > RUNWAY_SPAN_DAYS) continue;
      gates.push({ day, dateKey, title: task?.title ?? m.title });
    }
  }

  const sessions = live ? sessionsForProject(input.sessions ?? [], project.id) : [];
  const reviews: RunwayReviewMarker[] = sessions
    .map((s) => ({ s, day: dayOffset(s.reviewDue, now) }))
    .filter((x): x is { s: RunwaySession; day: number } => x.day != null && x.day >= 0 && x.day <= RUNWAY_SPAN_DAYS)
    .map(({ s, day }) => ({ day, dateKey: s.reviewDue!.slice(0, 10), title: s.title, tool: s.tool, href: s.href }));

  const readyToClose = live && card.readyToClose;
  const reason = readyToClose
    ? 'Every task is done. It’s ready to close.'
    : healthReason(health, healthResult, { idleDays, waiting, openCount: open.length, endKey, project, tasks });
  const lifecycle = card.lifecycle;
  const group = runwayGroup({ live, endKey, health, lifecycle, readyToClose });
  const recommendation = recommendTool({ health, waiting, idleDays, live, readyToClose });
  const tight = Boolean(runway && runway.risk !== 'clear');

  return {
    project,
    card,
    lifecycle,
    live,
    health,
    healthResult,
    reason,
    needsYouReason: !live ? null : readyToClose ? reason : needsYouReason({ health, reason, lifecycle }, project, tasks, now),
    group,
    energy: card.energy,
    endKey,
    endDay,
    nextAction: nextId ? { taskId: nextId.id, title: nextId.title } : null,
    segments: children.map((t) => ({ taskId: t.id, title: t.title, done: t.status === 'done' })),
    done: progress.done,
    total: progress.total,
    openCount: open.length,
    needMinutes,
    freeMinutes,
    runway,
    tight,
    startByKey,
    startByDay: dayOffset(startByKey, now),
    bufferDays,
    waiting,
    idleDays,
    quietWeeks: live && idleDays >= QUIET_NOTE_DAYS ? Math.floor(idleDays / 7) : null,
    milestones,
    gates,
    sessions,
    reviews,
    recommendation,
    readyToClose,
    landedKey: live ? null : project.updated_at.slice(0, 10)
  };
}

// ---------------------------------------------------------------- the model

const GROUND_ORDER: Record<ProjectHealth, number> = {
  stalled: 0,
  waiting_only: 1,
  blocked: 2,
  missing_next_action: 3,
  healthy: 4
};

function byEnd(a: RunwayRow, b: RunwayRow): number {
  return (a.endDay ?? Infinity) - (b.endDay ?? Infinity) || a.project.title.localeCompare(b.project.title);
}

export function buildRunway(input: RunwayInput): RunwayModel {
  const { now } = input;
  const landedFloor = addDays(startOfDay(now), -LANDED_WINDOW_DAYS).getTime();
  const landed = input.archivedProjects.filter((p) => {
    if (p.status !== 'completed') return false;
    const stamp = parseDue(p.updated_at);
    return Boolean(stamp && stamp.getTime() >= landedFloor);
  });
  const rows = [...input.projects.filter((p) => !isProjectArchived(p.status)), ...landed].map((p) => buildRunwayRow(p, input));

  const groups: RunwayGroup[] = RUNWAY_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.id) }));
  for (const group of groups) {
    if (group.id === 'on_ground') {
      group.rows.sort((a, b) => GROUND_ORDER[a.health] - GROUND_ORDER[b.health] || byEnd(a, b));
    } else if (group.id === 'landed') {
      group.rows.sort((a, b) => (b.landedKey ?? '').localeCompare(a.landedKey ?? ''));
    } else {
      group.rows.sort(byEnd);
    }
  }

  const mix = projectLifecycleMix([...input.projects, ...input.archivedProjects], input.tasks, input.stallIds, now);
  const liveRows = rows.filter((r) => r.live);
  return {
    todayKey: toDateKey(now),
    rows,
    groups,
    running: runningProjectCount(mix),
    loadLimit: input.profile?.active_project_limit ?? SUSTAINABLE_RUNNING_LOAD,
    linkedSessions: liveRows.reduce((sum, r) => sum + r.sessions.length, 0),
    stuck: groups.find((g) => g.id === 'on_ground')!.rows
  };
}

/** Row order the view should show: group by group, landed last. */
export function runwayOrder(model: RunwayModel): Array<{ id: string; group: RunwayGroupId }> {
  return model.groups.flatMap((g) => g.rows.map((r) => ({ id: r.project.id, group: g.id })));
}

// ---------------------------------------------------------------- scrubbing

export type ScrubState = { late: boolean; shouldStart: boolean };

/** At a scrubbed day: past its end (late) or past its start-by with nothing done (should start). */
export function scrubState(row: Pick<RunwayRow, 'live' | 'endDay' | 'startByDay' | 'done'>, viewDay: number): ScrubState {
  if (!row.live || row.endDay == null) return { late: false, shouldStart: false };
  const late = row.endDay < 0 || (viewDay > 0 && row.endDay <= viewDay);
  const shouldStart =
    !late && viewDay > 0 && row.endDay > viewDay && row.startByDay != null && row.startByDay <= viewDay && row.done === 0;
  return { late, shouldStart };
}

// ---------------------------------------------------------------- lede

export type LedeSegment = { text: string; kind: 'plain' | 'name' | 'warn' | 'bad' | 'date'; projectId?: string };

function nameList(rows: RunwayRow[], kind: 'name' | 'bad' = 'name'): LedeSegment[] {
  const out: LedeSegment[] = [];
  rows.forEach((row, i) => {
    if (i > 0) out.push({ text: i === rows.length - 1 ? ' and ' : ', ', kind: 'plain' });
    out.push({ text: row.project.title, kind, projectId: row.project.id });
  });
  return out;
}

function dated(model: RunwayModel): RunwayRow[] {
  return model.rows.filter((r) => r.live && r.endDay != null && (r.group === 'needs_you' || r.group === 'in_air'));
}

/** The plain sentence block over the runway. viewDay 0 is today; above 0 the lede looks ahead. */
export function runwayLede(model: RunwayModel, viewDay = 0, now: Date = new Date(), formatDay: (key: string) => string = (k) => k): LedeSegment[] {
  const out: LedeSegment[] = [];
  const space = () => out.push({ text: ' ', kind: 'plain' });
  const live = model.rows.filter((r) => r.live);
  const ground = model.stuck;
  if (!live.length) return [{ text: 'No live projects yet. Add one to put it on the runway.', kind: 'plain' }];

  if (viewDay <= 0) {
    const soon = dated(model).filter((r) => r.endDay! >= 0 && r.endDay! <= FORECAST_HORIZON_DAYS);
    const horizon = horizonPhrase(FORECAST_HORIZON_DAYS);
    if (soon.length) {
      out.push(...nameList(soon), { text: ` land${soon.length > 1 ? '' : 's'} in the next ${horizon}.`, kind: 'plain' });
    } else {
      out.push({ text: `Nothing lands in the next ${horizon}.`, kind: 'plain' });
    }
    // Everything-done projects read as one sentence, not one each.
    const closing = live.filter((r) => r.group === 'needs_you' && r.readyToClose);
    if (closing.length) {
      space();
      out.push(...nameList(closing), { text: ` ${closing.length > 1 ? 'are' : 'is'} ready to close.`, kind: 'plain' });
    }
    for (const row of live.filter((r) => r.group === 'needs_you' && !r.readyToClose && r.needsYouReason)) {
      space();
      out.push({ text: row.project.title, kind: 'name', projectId: row.project.id }, { text: ` needs you: ${lowerFirst(row.needsYouReason!)}`, kind: 'plain' });
    }
    const tight = live.filter((r) => r.tight);
    if (tight.length) {
      space();
      out.push(...nameList(tight), { text: ` ${tight.length > 1 ? 'are' : 'is'} tight on free time.`, kind: 'plain' });
    }
    space();
    out.push(
      ground.length
        ? { text: `${countWord(ground.length)} ${ground.length > 1 ? 'are' : 'is'} stuck on the ground.`, kind: 'warn' }
        : { text: 'Nothing is stuck.', kind: 'plain' }
    );
    return out;
  }

  const rows = dated(model);
  const late = rows.filter((r) => scrubState(r, viewDay).late);
  const mustStart = rows.filter((r) => scrubState(r, viewDay).shouldStart);
  out.push({ text: 'Looking ahead to ', kind: 'plain' }, { text: formatDay(keyAtOffset(now, viewDay)), kind: 'date' }, { text: '.', kind: 'plain' });
  space();
  if (late.length) {
    const open = late.reduce((sum, r) => sum + r.openCount, 0);
    out.push(
      { text: 'By then ', kind: 'plain' },
      ...nameList(late, 'bad'),
      { text: ` should have landed, with ${open} task${open === 1 ? '' : 's'} still open.`, kind: 'plain' }
    );
  } else {
    out.push({ text: 'Every dated project is still in the air.', kind: 'plain' });
  }
  if (mustStart.length) {
    space();
    out.push(...nameList(mustStart), { text: ' should have started by then.', kind: 'plain' });
  }
  if (ground.length) {
    space();
    out.push({ text: `${countWord(ground.length)} still ${ground.length > 1 ? 'haven’t' : 'hasn’t'} left the ground.`, kind: 'warn' });
  }
  return out;
}

export function ledeText(segments: LedeSegment[]): string {
  return segments.map((s) => s.text).join('');
}

// ---------------------------------------------------------------- geometry

export type RunwayGeometry = {
  barPct: number;
  flagPct: number;
  /** Flag label sits left of the flag near the right edge. */
  flip: boolean;
  /** End beyond the axis: the flag pins to the edge. */
  beyond: boolean;
  buffer: { leftPct: number; widthPct: number } | null;
  startByPct: number | null;
};

export function runwayGeometry(row: Pick<RunwayRow, 'endDay' | 'bufferDays' | 'startByDay' | 'runway'>, span = RUNWAY_SPAN_DAYS): RunwayGeometry | null {
  if (row.endDay == null) return null;
  const end = row.endDay;
  const flagPct = spanPct(end, span);
  const buffer =
    row.runway && row.bufferDays > 0 && end > 0
      ? { leftPct: spanPct(Math.max(0, end - row.bufferDays), span), widthPct: flagPct - spanPct(Math.max(0, end - row.bufferDays), span) }
      : null;
  return {
    barPct: flagPct,
    flagPct,
    flip: flagPct > 70,
    beyond: end > span,
    buffer: buffer && buffer.widthPct > 0 ? buffer : null,
    startByPct: row.runway && row.startByDay != null && row.startByDay < end ? spanPct(row.startByDay, span) : null
  };
}

// ---------------------------------------------------------------- unstick quick fixes

export type FinishChoice = { label: string; key: string };

/**
 * Finish-date chips for the unstick sheet: end of this term and end of next term when term
 * dates exist, else two and six weeks out.
 */
export function finishDateChoices(terms: SchoolTerm[], now: Date): FinishChoice[] {
  const today = toDateKey(now);
  const ahead = [...terms].sort((a, b) => a.ends_on.localeCompare(b.ends_on)).filter((t) => t.ends_on > today);
  if (ahead.length >= 1) {
    const out: FinishChoice[] = [{ label: 'End of this term', key: ahead[0]!.ends_on }];
    if (ahead[1]) out.push({ label: 'End of next term', key: ahead[1].ends_on });
    return out;
  }
  return [
    { label: 'In two weeks', key: keyAtOffset(now, 14) },
    { label: 'In six weeks', key: keyAtOffset(now, 42) }
  ];
}

export function minutesLabel(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 1) return `${Math.max(5, Math.round(minutes / 5) * 5)}m`;
  return `${Math.round(hours * 2) / 2}h`;
}
