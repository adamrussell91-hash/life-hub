import type { AgentMutation } from '@/domain/agent-mutations';
import { backlogTasks, addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

/** A backlog task is stale once it has not been touched for this long. */
export const STALE_MS = 30 * 24 * 60 * 60 * 1000;
export const SUPER_STALE_MS = 60 * 24 * 60 * 60 * 1000;
export const SETTLING_MS = 7 * 24 * 60 * 60 * 1000;
export const CLUSTER_WINDOW_MS = 15 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type Effort = 'quick' | 'hour' | 'big';
export type AgeTier = 'fresh' | 'settling' | 'old';
export type BacklogSort = 'oldest' | 'newest' | 'effort' | 'title' | 'manual';
export type BacklogGroupBy = 'hub' | 'project' | 'none';

export type BacklogRow = {
  task: Task;
  effort: Effort | null;
  ageTier: AgeTier;
  ageLabel: string;
};

export type BacklogGroup = {
  id: string;
  domain: string;
  projectId: string | null;
  projectTitle: string;
  rows: BacklogRow[];
};

export type BacklogView = {
  fresh: BacklogGroup[];
  stale: BacklogRow[];
  snoozed: BacklogRow[];
  snoozedCount: number;
  total: number;
};

export type BacklogViewOpts = {
  sort?: BacklogSort;
  groupBy?: BacklogGroupBy;
  domain?: string | 'all';
  priority?: string | 'all';
  tag?: string;
};

export type ScheduleTargetId = 'today' | 'tomorrow' | 'this_week' | 'next_week';

export type ScheduleTarget = {
  id: ScheduleTargetId;
  label: string;
  dateKey: string;
  count: number;
};

export type SuggestionKind = 'vague_date' | 'likely_cluster' | 'stale';

export type BacklogSuggestion = {
  id: string;
  kind: SuggestionKind;
  taskIds: string[];
  message: string;
  proposedMutations: AgentMutation[];
  proposedProjectTitle?: string;
  proposedDueDate?: string;
};

export type QuickAddParse = {
  title: string;
  domain?: string;
  due_date?: string;
  effort?: Effort;
  estimated_duration?: number;
  tags: string[];
};

export type TriageOutcome = 'scheduled' | 'snoozed' | 'archived' | 'kept' | 'deleted' | 'skipped';

export type TriageUndoEntry = {
  taskId: string;
  before: Partial<Task>;
  outcome?: TriageOutcome;
};

export type TriageState = {
  queue: string[];
  index: number;
  undo: TriageUndoEntry[];
  counts: Record<TriageOutcome, number>;
};

export type TriageAction =
  | { type: 'init'; queue: string[] }
  | { type: 'skip' }
  | {
      type: 'record';
      taskId: string;
      before: Partial<Task>;
      outcome: Exclude<TriageOutcome, 'skipped'>;
    }
  | { type: 'undo' };

export const KNOWN_HUBS = ['teaching', 'life', 'wedding', 'health', 'other'] as const;

const HUB_ORDER = [...KNOWN_HUBS];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'about',
  'your',
  'have',
  'been',
  'will',
  'just',
  'then',
  'than',
  'them',
  'they',
  're',
  'email',
  'send',
  'make',
  'next',
  'week',
  'today',
  'tomorrow'
]);

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const WEEKDAY_SHORT: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6
};

const VAGUE_PHRASES: RegExp[] = [
  /\bthis day\b/i,
  /\bthat day\b/i,
  /\bon the day\b/i,
  /\btomorrow\b/i,
  /\bnext week\b/i,
  /\bmonday\b/i,
  /\btuesday\b/i,
  /\bwednesday\b/i,
  /\bthursday\b/i,
  /\bfriday\b/i,
  /\bsaturday\b/i,
  /\bsunday\b/i
];

function updatedMs(task: Task): number {
  const value = Date.parse(task.updated_at);
  return Number.isFinite(value) ? value : 0;
}

function createdMs(task: Task): number {
  const value = Date.parse(task.created_at);
  return Number.isFinite(value) ? value : 0;
}

function ageMs(task: Task, now: Date): number {
  return Math.max(0, now.getTime() - updatedMs(task));
}

/** `estimated_duration` is stored in minutes. */
export function effortOf(task: Pick<Task, 'estimated_duration'>): Effort | null {
  const minutes = task.estimated_duration;
  if (minutes == null || !Number.isFinite(minutes)) return null;
  if (minutes <= 15) return 'quick';
  if (minutes <= 60) return 'hour';
  return 'big';
}

export function effortFromMinutes(minutes: number): Effort {
  if (minutes <= 15) return 'quick';
  if (minutes <= 60) return 'hour';
  return 'big';
}

export function minutesForEffort(effort: Effort): number {
  if (effort === 'quick') return 15;
  if (effort === 'hour') return 60;
  return 90;
}

export function ageTier(task: Pick<Task, 'updated_at'>, now: Date): AgeTier {
  const age = ageMs(task as Task, now);
  if (age < SETTLING_MS) return 'fresh';
  if (age < STALE_MS) return 'settling';
  return 'old';
}

export function ageLabel(task: Pick<Task, 'updated_at'>, now: Date): string {
  const days = Math.floor(ageMs(task as Task, now) / DAY_MS);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function isSnoozed(task: Pick<Task, 'review_at'>, now: Date): boolean {
  if (!task.review_at) return false;
  const review = parseDue(task.review_at);
  if (!review) return false;
  return review.getTime() > now.getTime();
}

export function isStale(task: Pick<Task, 'updated_at'>, now: Date): boolean {
  return ageMs(task as Task, now) >= STALE_MS;
}

function toRow(task: Task, now: Date): BacklogRow {
  return {
    task,
    effort: effortOf(task),
    ageTier: ageTier(task, now),
    ageLabel: ageLabel(task, now)
  };
}

function effortRank(effort: Effort | null): number {
  if (effort === 'quick') return 0;
  if (effort === 'hour') return 1;
  if (effort === 'big') return 2;
  return 3;
}

function sortRows(rows: BacklogRow[], sort: BacklogSort): BacklogRow[] {
  const next = [...rows];
  if (sort === 'newest') {
    next.sort((a, b) => updatedMs(b.task) - updatedMs(a.task) || a.task.title.localeCompare(b.task.title));
    return next;
  }
  if (sort === 'effort') {
    next.sort(
      (a, b) => effortRank(a.effort) - effortRank(b.effort) || a.task.title.localeCompare(b.task.title)
    );
    return next;
  }
  if (sort === 'title') {
    next.sort((a, b) => a.task.title.localeCompare(b.task.title));
    return next;
  }
  next.sort((a, b) => updatedMs(a.task) - updatedMs(b.task) || a.task.title.localeCompare(b.task.title));
  return next;
}

function hubIndex(domain: string): number {
  const index = HUB_ORDER.indexOf(domain as (typeof HUB_ORDER)[number]);
  return index === -1 ? HUB_ORDER.length : index;
}

function groupKey(task: Task, groupBy: BacklogGroupBy): string {
  if (groupBy === 'none') return 'all::none';
  if (groupBy === 'project') return `all::${task.parent_project_id ?? 'none'}`;
  return `${task.domain}::${task.parent_project_id ?? 'none'}`;
}

function matchesFilters(task: Task, opts: BacklogViewOpts): boolean {
  if (opts.domain && opts.domain !== 'all' && task.domain !== opts.domain) return false;
  if (opts.priority && opts.priority !== 'all' && task.priority !== opts.priority) return false;
  if (opts.tag && !task.tags.includes(opts.tag)) return false;
  return true;
}

export function backlogView(
  tasks: Task[],
  projects: Project[],
  now: Date,
  opts: BacklogViewOpts = {}
): BacklogView {
  const sort = opts.sort ?? 'oldest';
  const groupBy = opts.groupBy ?? 'hub';
  const open = backlogTasks(tasks).filter((task) => matchesFilters(task, opts));
  const snoozedTasks = open.filter((task) => isSnoozed(task, now));
  const visible = open.filter((task) => !isSnoozed(task, now));
  const staleTasks = visible.filter((task) => isStale(task, now));
  const freshTasks = visible.filter((task) => !isStale(task, now));
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  const buckets = new Map<string, BacklogRow[]>();
  for (const task of freshTasks) {
    const key = groupKey(task, groupBy);
    const list = buckets.get(key) ?? [];
    list.push(toRow(task, now));
    buckets.set(key, list);
  }

  const fresh: BacklogGroup[] = [...buckets.entries()].map(([id, rows]) => {
    const [domain, projectKey] = id.split('::');
    const projectId = projectKey && projectKey !== 'none' ? projectKey : null;
    return {
      id,
      domain: groupBy === 'hub' ? (domain ?? 'other') : rows[0]?.task.domain ?? 'other',
      projectId,
      projectTitle: projectId ? (projectsById.get(projectId)?.title ?? 'Project') : 'No project',
      rows: sortRows(rows, sort)
    };
  });

  fresh.sort((a, b) => {
    if (groupBy === 'hub') {
      const hub = hubIndex(a.domain) - hubIndex(b.domain);
      if (hub !== 0) return hub;
      if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    }
    if (!a.projectId && b.projectId) return 1;
    if (a.projectId && !b.projectId) return -1;
    return a.projectTitle.localeCompare(b.projectTitle);
  });

  return {
    fresh,
    stale: sortRows(staleTasks.map((task) => toRow(task, now)), sort),
    snoozed: sortRows(snoozedTasks.map((task) => toRow(task, now)), 'oldest'),
    snoozedCount: snoozedTasks.length,
    total: visible.length
  };
}

function mondayOf(date: Date): Date {
  const start = startOfDay(date);
  return addDays(start, -((start.getDay() + 6) % 7));
}

function isWeekend(date: Date): boolean {
  const day = startOfDay(date).getDay();
  return day === 0 || day === 6;
}

/**
 * This week lands on Friday. On Saturday or Sunday that Friday has already
 * passed, so the zone uses the following Monday. Next week is the Monday of
 * the upcoming week — on a weekend that would collide with This week, so it
 * steps forward another week.
 */
export function thisWeekDate(now: Date): Date {
  if (isWeekend(now)) return addDays(mondayOf(now), 7);
  return addDays(mondayOf(now), 4);
}

export function nextWeekDate(now: Date): Date {
  if (isWeekend(now)) return addDays(mondayOf(now), 14);
  return addDays(mondayOf(now), 7);
}

export function scheduleTargets(now: Date, tasks: Task[] = []): ScheduleTarget[] {
  const today = startOfDay(now);
  const keys = {
    today: toDateKey(today),
    tomorrow: toDateKey(addDays(today, 1)),
    this_week: toDateKey(thisWeekDate(now)),
    next_week: toDateKey(nextWeekDate(now))
  };
  const counts = { today: 0, tomorrow: 0, this_week: 0, next_week: 0 };
  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'dead') continue;
    const due = parseDue(task.due_date);
    if (!due) continue;
    const key = toDateKey(due);
    if (key === keys.today) counts.today += 1;
    if (key === keys.tomorrow) counts.tomorrow += 1;
    if (key === keys.this_week) counts.this_week += 1;
    if (key === keys.next_week) counts.next_week += 1;
  }
  return [
    { id: 'today', label: 'Today', dateKey: keys.today, count: counts.today },
    { id: 'tomorrow', label: 'Tomorrow', dateKey: keys.tomorrow, count: counts.tomorrow },
    { id: 'this_week', label: 'This week', dateKey: keys.this_week, count: counts.this_week },
    { id: 'next_week', label: 'Next week', dateKey: keys.next_week, count: counts.next_week }
  ];
}

function weekdayIndex(token: string): number | null {
  const lower = token.toLowerCase();
  const full = WEEKDAYS.indexOf(lower as (typeof WEEKDAYS)[number]);
  if (full >= 0) return full;
  return WEEKDAY_SHORT[lower] ?? null;
}

export function nextWeekdayOnOrAfter(now: Date, weekday: number): Date {
  const today = startOfDay(now);
  const delta = (weekday - today.getDay() + 7) % 7;
  return addDays(today, delta);
}

function titleLooksLikeProjectName(title: string, projects: Project[]): boolean {
  const needle = title.trim().toLowerCase();
  if (!needle) return false;
  return projects.some((project) => project.title.trim().toLowerCase() === needle);
}

export function hasVagueDatePhrase(title: string): boolean {
  return VAGUE_PHRASES.some((pattern) => pattern.test(title));
}

function proposeDateFromTitle(title: string, now: Date): string {
  const lower = title.toLowerCase();
  if (/\btomorrow\b/.test(lower)) return toDateKey(addDays(startOfDay(now), 1));
  if (/\bnext week\b/.test(lower)) return toDateKey(nextWeekDate(now));
  for (const [index, name] of WEEKDAYS.entries()) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(title)) {
      return toDateKey(nextWeekdayOnOrAfter(now, index));
    }
  }
  return toDateKey(startOfDay(now));
}

function distinctiveNouns(title: string): string[] {
  return title
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word.toLowerCase()))
    .map((word) => word.toLowerCase());
}

function clusterName(tasks: Task[]): string {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const noun of distinctiveNouns(task.title)) {
      counts.set(noun, (counts.get(noun) ?? 0) + 1);
    }
  }
  const shared = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (shared[0]) {
    const word = shared[0][0];
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  const first = distinctiveNouns(tasks[0]?.title ?? '')[0];
  if (first) return first.charAt(0).toUpperCase() + first.slice(1);
  return `${tasks[0]?.domain ?? 'Shared'} cluster`;
}

function createdClose(a: Task, b: Task): boolean {
  return Math.abs(createdMs(a) - createdMs(b)) <= CLUSTER_WINDOW_MS;
}

function shareNoun(a: Task, b: Task): boolean {
  const left = new Set(distinctiveNouns(a.title));
  return distinctiveNouns(b.title).some((word) => left.has(word));
}

export function detectSuggestions(tasks: Task[], projects: Project[], now: Date = new Date()): BacklogSuggestion[] {
  const open = backlogTasks(tasks).filter((task) => !isSnoozed(task, now));
  const out: BacklogSuggestion[] = [];

  for (const task of open) {
    if (task.due_date || !hasVagueDatePhrase(task.title)) continue;
    if (titleLooksLikeProjectName(task.title, projects)) continue;
    const due = proposeDateFromTitle(task.title, now);
    out.push({
      id: `vague:${task.id}`,
      kind: 'vague_date',
      taskIds: [task.id],
      message: `“${task.title}” names a day but has no date.`,
      proposedDueDate: due,
      proposedMutations: [
        {
          kind: 'task_update',
          task_id: task.id,
          summary: `Set due date to ${due}`,
          patch: { due_date: due }
        }
      ]
    });
  }

  const orphans = open.filter((task) => !task.parent_project_id);
  const used = new Set<string>();
  for (let i = 0; i < orphans.length; i += 1) {
    const seed = orphans[i]!;
    if (used.has(seed.id)) continue;
    const cluster = orphans.filter(
      (other) =>
        other.domain === seed.domain &&
        (other.id === seed.id || createdClose(seed, other) || shareNoun(seed, other))
    );
    if (cluster.length < 2) continue;
    for (const item of cluster) used.add(item.id);
    const title = clusterName(cluster);
    out.push({
      id: `cluster:${seed.domain}:${cluster.map((task) => task.id).sort().join(',')}`,
      kind: 'likely_cluster',
      taskIds: cluster.map((task) => task.id),
      message: `Group ${cluster.length} ${seed.domain} tasks under “${title}”.`,
      proposedProjectTitle: title,
      proposedMutations: cluster.map((task) => ({
        kind: 'task_update' as const,
        task_id: task.id,
        summary: `Move under ${title}`,
        patch: { parent_project_id: title }
      }))
    });
  }

  for (const task of open) {
    if (ageMs(task, now) <= SUPER_STALE_MS) continue;
    out.push({
      id: `stale:${task.id}`,
      kind: 'stale',
      taskIds: [task.id],
      message: `“${task.title}” has sat for more than 60 days.`,
      proposedMutations: [
        {
          kind: 'task_update',
          task_id: task.id,
          summary: 'Archive this task',
          patch: { status: 'dead' }
        }
      ]
    });
  }

  return out;
}

const DATE_TOKEN = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
const DURATION_TOKEN = /^(\d+(?:\.\d+)?)(m|h)$/i;
const HUB_SET = new Set<string>(KNOWN_HUBS);

function parseDateToken(token: string, now: Date): string | null {
  const match = DATE_TOKEN.exec(token);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = match[3] ? Number(match[3]) : now.getFullYear();
  if (year < 100) year += 2000;
  let date = new Date(year, month - 1, day);
  if (!match[3] && date.getTime() < startOfDay(now).getTime()) {
    date = new Date(year + 1, month - 1, day);
  }
  return toDateKey(date);
}

export function parseQuickAdd(
  text: string,
  now: Date,
  knownHubs: readonly string[] = KNOWN_HUBS
): QuickAddParse {
  const hubs = new Set(knownHubs.map((hub) => hub.toLowerCase()));
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const tags: string[] = [];
  let domain: string | undefined;
  let due_date: string | undefined;
  let estimated_duration: number | undefined;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const lower = token.toLowerCase();

    if (lower.startsWith('#')) {
      const value = token.slice(1).toLowerCase();
      if (!value) {
        kept.push(token);
        continue;
      }
      if (hubs.has(value) || HUB_SET.has(value)) domain = value;
      else tags.push(value);
      continue;
    }

    if (lower === 'today') {
      due_date = toDateKey(startOfDay(now));
      continue;
    }
    if (lower === 'tomorrow') {
      due_date = toDateKey(addDays(startOfDay(now), 1));
      continue;
    }
    if (lower === 'next' && tokens[i + 1]?.toLowerCase() === 'week') {
      due_date = toDateKey(nextWeekDate(now));
      i += 1;
      continue;
    }

    const weekday = weekdayIndex(lower.replace(/,$/, ''));
    if (weekday != null) {
      due_date = toDateKey(nextWeekdayOnOrAfter(now, weekday));
      continue;
    }

    const dated = parseDateToken(token, now);
    if (dated) {
      due_date = dated;
      continue;
    }

    const duration = DURATION_TOKEN.exec(token);
    if (duration) {
      const amount = Number(duration[1]);
      const unit = duration[2].toLowerCase();
      estimated_duration = unit === 'h' ? Math.round(amount * 60) : Math.round(amount);
      continue;
    }

    kept.push(token);
  }

  const effort = estimated_duration != null ? effortFromMinutes(estimated_duration) : undefined;
  return {
    title: kept.join(' ').trim() || text.trim(),
    domain,
    due_date,
    effort,
    estimated_duration,
    tags
  };
}

export function emptyTriageCounts(): Record<TriageOutcome, number> {
  return {
    scheduled: 0,
    snoozed: 0,
    archived: 0,
    kept: 0,
    deleted: 0,
    skipped: 0
  };
}

export function initialTriageState(queue: string[] = []): TriageState {
  return { queue, index: 0, undo: [], counts: emptyTriageCounts() };
}

export function triageReducer(state: TriageState, action: TriageAction): TriageState {
  if (action.type === 'init') return initialTriageState(action.queue);

  if (action.type === 'skip') {
    const taskId = state.queue[state.index];
    if (!taskId || state.index >= state.queue.length) return state;
    return {
      ...state,
      index: state.index + 1,
      undo: [...state.undo, { taskId, before: {} }],
      counts: { ...state.counts, skipped: state.counts.skipped + 1 }
    };
  }

  if (action.type === 'record') {
    return {
      ...state,
      index: state.index + 1,
      undo: [...state.undo, { taskId: action.taskId, before: { ...action.before }, outcome: action.outcome }],
      counts: { ...state.counts, [action.outcome]: state.counts[action.outcome] + 1 }
    };
  }

  const last = state.undo[state.undo.length - 1];
  if (!last) return state;
  const outcome = last.outcome ?? 'skipped';
  return {
    ...state,
    index: Math.max(0, state.index - 1),
    undo: state.undo.slice(0, -1),
    counts: { ...state.counts, [outcome]: Math.max(0, state.counts[outcome] - 1) }
  };
}

export function lastTriageUndo(state: TriageState): TriageUndoEntry | null {
  return state.undo[state.undo.length - 1] ?? null;
}

export function triageQueue(view: BacklogView, suggestions: BacklogSuggestion[]): string[] {
  const suggested = new Set(suggestions.flatMap((item) => item.taskIds));
  const stale = new Set(view.stale.map((row) => row.task.id));
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const suggestion of suggestions) {
    for (const id of suggestion.taskIds) push(id);
  }
  for (const row of view.stale) {
    if (!suggested.has(row.task.id)) push(row.task.id);
  }
  const fresh = view.fresh.flatMap((group) => group.rows);
  fresh.sort((a, b) => updatedMs(a.task) - updatedMs(b.task));
  for (const row of fresh) {
    if (!suggested.has(row.task.id) && !stale.has(row.task.id)) push(row.task.id);
  }
  return out;
}

export function suggestionsForTask(
  suggestions: BacklogSuggestion[],
  taskId: string
): BacklogSuggestion[] {
  return suggestions.filter((item) => item.taskIds.includes(taskId));
}

export function formatShortWeekday(dateKey: string): string {
  const date = parseDue(dateKey);
  if (!date) return dateKey;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  const day = date.getDate();
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    date.getMonth()
  ];
  return `${weekday} ${day} ${month}`;
}

export function snapshotFields(task: Task, patch: Partial<Task>): Partial<Task> {
  const before: Partial<Task> = {};
  for (const key of Object.keys(patch) as Array<keyof Task>) {
    (before as Record<string, unknown>)[key] = task[key];
  }
  return before;
}
