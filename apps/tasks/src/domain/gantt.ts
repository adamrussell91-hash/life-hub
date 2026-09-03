import type { Task, DependencyType, DependencyLink } from '@/schemas/task';
import type { Project, Milestone } from '@/schemas/project';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';

const DAY_MS = 24 * 60 * 60 * 1000;
const WORK_DAY_MINUTES = 8 * 60;

export type GanttRowKind = 'task' | 'milestone';
export type GanttZoom = 'week' | 'month' | 'term';
export type GanttScope = 'project' | 'all';

export const GANTT_ZOOM: Record<
  GanttZoom,
  { dayWidth: number; tickEvery: 'day' | 'monday' | 'monthStart' }
> = {
  week: { dayWidth: 42, tickEvery: 'day' },
  month: { dayWidth: 16, tickEvery: 'monday' },
  term: { dayWidth: 6, tickEvery: 'monthStart' }
};

export const GANTT_ROW_HEIGHT = 46;
export const GANTT_BAR_HEIGHT = 30;
export const GANTT_GROUP_HEADER_HEIGHT = 28;
export const GANTT_AXIS_HEIGHT = 28;

export type GanttDependency = {
  fromId: string;
  toId: string;
  type: DependencyType;
  offsetDays: number;
};

export type GanttRow = {
  id: string;
  kind: GanttRowKind;
  label: string;
  start: Date;
  end: Date;
  status: string;
  dependsOn: string[];
  dependencies: GanttDependency[];
  estimatedMinutes: number | null;
  parentProjectId: string | null;
  parentTaskId: string | null;
  domain: string | null;
  priority: string | null;
  depth: number;
};

export type GanttBarLayout = {
  row: GanttRow;
  rowIndex: number;
  x: number;
  width: number;
  y: number;
  sIdx: number;
  fIdx: number;
};

export type GanttEdgeLayout = {
  fromId: string;
  toId: string;
  type: DependencyType;
  offsetDays: number;
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type GanttGroupBound = {
  pid: string;
  title: string;
  y: number;
  height: number;
  groupHeight: number;
  collapsed: boolean;
};

export type GanttLayout = {
  rangeStart: Date;
  rangeEnd: Date;
  dayCount: number;
  dayWidth: number;
  labelWidth: number;
  rowHeight: number;
  axisHeight: number;
  bars: GanttBarLayout[];
  edges: GanttEdgeLayout[];
  groupBounds: GanttGroupBound[];
  totalWidth: number;
  totalHeight: number;
  ticks: Array<{ date: Date; major: boolean }>;
};

export type GanttSchedulable = {
  id: string;
  kind: GanttRowKind;
  due_date: string | null;
  estimated_duration: number | null;
};

export function incomingLinksForTask(task: Task): DependencyLink[] {
  if (task.dependency_links?.length) return task.dependency_links;
  return task.depends_on.map((from_id) => ({ from_id, type: 'FS' as const, offset_days: 0 }));
}

export function collectDependencies(tasks: Task[], projects: Project[] = []): GanttDependency[] {
  const links: GanttDependency[] = [];
  for (const task of tasks) {
    if (task.status === 'dead') continue;
    for (const link of incomingLinksForTask(task)) {
      links.push({
        fromId: link.from_id,
        toId: task.id,
        type: link.type,
        offsetDays: link.offset_days
      });
    }
  }
  for (const project of projects) {
    for (const milestone of project.milestones) {
      for (const fromId of milestone.depends_on ?? []) {
        links.push({ fromId, toId: milestone.id, type: 'FS', offsetDays: 0 });
      }
    }
  }
  return links;
}

export function linksPatchForTask(
  taskId: string,
  incoming: GanttDependency[]
): { depends_on: string[]; dependency_links: DependencyLink[] } {
  const mine = incoming.filter((dep) => dep.toId === taskId);
  return {
    depends_on: mine.map((dep) => dep.fromId),
    dependency_links: mine.map((dep) => ({
      from_id: dep.fromId,
      type: dep.type,
      offset_days: dep.offsetDays
    }))
  };
}

function durationDays(estimatedMinutes: number | null | undefined): number {
  const minutes = estimatedMinutes ?? WORK_DAY_MINUTES;
  return Math.max(1, Math.ceil(minutes / WORK_DAY_MINUTES));
}

export function taskSpan(task: Pick<Task, 'due_date' | 'estimated_duration'>): {
  start: Date;
  end: Date;
} | null {
  const due = parseDue(task.due_date);
  if (!due) return null;
  const end = startOfDay(due);
  const start = addDays(end, -(durationDays(task.estimated_duration) - 1));
  return { start, end };
}

export function milestoneSpan(milestone: Pick<Milestone, 'due_date'>): {
  start: Date;
  end: Date;
} | null {
  const due = parseDue(milestone.due_date);
  if (!due) return null;
  const day = startOfDay(due);
  return { start: day, end: day };
}

export function spanOf(item: GanttSchedulable): { start: Date; end: Date } | null {
  if (item.kind === 'milestone') return milestoneSpan(item);
  return taskSpan(item);
}

function parentDepth(task: Task, byId: Map<string, Task>): number {
  let depth = 0;
  let cursor = task.parent_task_id;
  const seen = new Set<string>();
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    depth += 1;
    cursor = byId.get(cursor)!.parent_task_id;
  }
  return depth;
}

function rowFromTask(task: Task, projectTasks: Task[], byId: Map<string, Task>): GanttRow | null {
  const span = taskSpan(task);
  if (!span) return null;
  const incoming = incomingLinksForTask(task).filter((link) =>
    projectTasks.some((other) => other.id === link.from_id)
  );
  return {
    id: task.id,
    kind: 'task',
    label: task.title,
    start: span.start,
    end: span.end,
    status: task.status,
    dependsOn: incoming.map((link) => link.from_id),
    dependencies: incoming.map((link) => ({
      fromId: link.from_id,
      toId: task.id,
      type: link.type,
      offsetDays: link.offset_days
    })),
    estimatedMinutes: task.estimated_duration,
    parentProjectId: task.parent_project_id,
    parentTaskId: task.parent_task_id,
    domain: task.domain,
    priority: task.priority,
    depth: parentDepth(task, byId)
  };
}

function rowFromMilestone(milestone: Milestone, project: Project, tasks: Task[]): GanttRow | null {
  const span = milestoneSpan(milestone);
  if (!span) return null;
  const incoming = (milestone.depends_on ?? []).filter((id) => tasks.some((task) => task.id === id));
  return {
    id: milestone.id,
    kind: 'milestone',
    label: milestone.title,
    start: span.start,
    end: span.end,
    status: milestone.status,
    dependsOn: incoming,
    dependencies: incoming.map((fromId) => ({
      fromId,
      toId: milestone.id,
      type: 'FS' as const,
      offsetDays: 0
    })),
    estimatedMinutes: null,
    parentProjectId: project.id,
    parentTaskId: null,
    domain: null,
    priority: null,
    depth: 0
  };
}

/** Build Gantt rows for one project — tasks with dates + milestones. */
export function buildProjectGanttRows(project: Project, tasks: Task[]): GanttRow[] {
  const projectTasks = tasks.filter(
    (t) => t.parent_project_id === project.id && t.status !== 'dead' && t.bucket !== 'someday'
  );
  const byId = new Map(projectTasks.map((task) => [task.id, task]));
  const rows: GanttRow[] = [];

  for (const task of projectTasks) {
    const row = rowFromTask(task, projectTasks, byId);
    if (row) rows.push(row);
  }

  for (const milestone of project.milestones) {
    const row = rowFromMilestone(milestone, project, projectTasks);
    if (row) rows.push(row);
  }

  return rows.sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.label.localeCompare(b.label)
  );
}

export function buildScopedGanttRows(
  projects: Project[],
  tasks: Task[],
  scope: GanttScope,
  projectId: string | null
): Array<{ project: Project; rows: GanttRow[] }> {
  const active = projects.filter((project) => project.status !== 'archived_dead');
  const selected =
    scope === 'project' && projectId ? active.filter((project) => project.id === projectId) : active;
  const groups: Array<{ project: Project; rows: GanttRow[] }> = [];
  for (const project of selected) {
    const rows = buildProjectGanttRows(project, tasks);
    if (rows.length) groups.push({ project, rows });
  }
  return groups;
}

export function computeGanttRange(rows: GanttRow[], padDays = 2): { start: Date; end: Date } | null {
  if (!rows.length) return null;
  let min = rows[0]!.start.getTime();
  let max = rows[0]!.end.getTime();
  for (const row of rows) {
    min = Math.min(min, row.start.getTime());
    max = Math.max(max, row.end.getTime());
  }
  return {
    start: addDays(startOfDay(new Date(min)), -padDays),
    end: addDays(startOfDay(new Date(max)), padDays)
  };
}

export function dayOffset(rangeStart: Date, date: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(rangeStart).getTime()) / DAY_MS);
}

export type LayoutGanttOptions = {
  dayWidth?: number;
  labelWidth?: number;
  rowHeight?: number;
  padDays?: number;
  zoom?: GanttZoom;
  collapsedGroups?: Iterable<string>;
  axisHeight?: number;
  groupTitles?: Array<{ id: string; title: string }>;
};

function buildTicks(
  rangeStart: Date,
  dayCount: number,
  tickEvery: 'day' | 'monday' | 'monthStart'
): Array<{ date: Date; major: boolean }> {
  const ticks: Array<{ date: Date; major: boolean }> = [];
  for (let i = 0; i < dayCount; i += 1) {
    const date = addDays(rangeStart, i);
    const isFirst = i === 0;
    const isLast = i === dayCount - 1;
    if (tickEvery === 'day' && (isFirst || isLast || date.getDay() === 1)) {
      ticks.push({ date, major: date.getDay() === 1 || isFirst });
    }
    if (tickEvery === 'monday' && (isFirst || isLast || date.getDay() === 1)) {
      ticks.push({ date, major: date.getDate() <= 7 || isFirst });
    }
    if (tickEvery === 'monthStart' && (isFirst || isLast || date.getDate() === 1)) {
      ticks.push({ date, major: true });
    }
  }
  return ticks;
}

function edgeAnchors(
  from: GanttBarLayout,
  to: GanttBarLayout,
  type: DependencyType,
  rowHeight: number
): Pick<GanttEdgeLayout, 'x1' | 'y1' | 'x2' | 'y2'> {
  const fromW = from.row.kind === 'milestone' ? 0 : from.width;
  const toW = to.row.kind === 'milestone' ? 0 : to.width;
  if (type === 'SS') {
    return { x1: from.x, y1: from.y + rowHeight / 2, x2: to.x, y2: to.y + rowHeight / 2 };
  }
  if (type === 'FF') {
    return {
      x1: from.x + (fromW || 6),
      y1: from.y + rowHeight / 2,
      x2: to.x + (toW || 6),
      y2: to.y + rowHeight / 2
    };
  }
  return {
    x1: from.x + (fromW || 6),
    y1: from.y + rowHeight / 2,
    x2: to.x,
    y2: to.y + rowHeight / 2
  };
}

export function layoutGanttGroups(
  groups: Array<{ project: Project; rows: GanttRow[] }>,
  options: LayoutGanttOptions = {}
): GanttLayout | null {
  const zoom = options.zoom ?? 'week';
  const dayWidth = options.dayWidth ?? GANTT_ZOOM[zoom].dayWidth;
  const labelWidth = options.labelWidth ?? 0;
  const rowHeight = options.rowHeight ?? GANTT_ROW_HEIGHT;
  const axisHeight = options.axisHeight ?? GANTT_AXIS_HEIGHT;
  const collapsed = new Set(options.collapsedGroups ?? []);
  const allRows = groups.flatMap((group) => group.rows);
  const range = computeGanttRange(allRows, options.padDays ?? 2);
  if (!range) return null;

  const dayCount = dayOffset(range.start, range.end) + 1;
  const showHeaders = groups.length > 0;
  const bars: GanttBarLayout[] = [];
  const groupBounds: GanttGroupBound[] = [];
  let y = axisHeight;
  let rowIndex = 0;

  for (const group of groups) {
    const groupStartY = y;
    if (showHeaders) {
      groupBounds.push({
        pid: group.project.id,
        title: group.project.title,
        y,
        height: GANTT_GROUP_HEADER_HEIGHT,
        groupHeight: GANTT_GROUP_HEADER_HEIGHT,
        collapsed: collapsed.has(group.project.id)
      });
      y += GANTT_GROUP_HEADER_HEIGHT;
    }
    if (!collapsed.has(group.project.id)) {
      for (const row of group.rows) {
        const startOff = dayOffset(range.start, row.start);
        const endOff = dayOffset(range.start, row.end);
        const spanDays = Math.max(1, endOff - startOff + 1);
        bars.push({
          row,
          rowIndex,
          x: labelWidth + startOff * dayWidth,
          width: row.kind === 'milestone' ? 0 : Math.max(dayWidth * 0.7, spanDays * dayWidth - 4),
          y,
          sIdx: startOff,
          fIdx: startOff + spanDays
        });
        y += rowHeight;
        rowIndex += 1;
      }
    }
    if (showHeaders && groupBounds.length) {
      groupBounds[groupBounds.length - 1]!.groupHeight = y - groupStartY;
    }
  }

  const byId = new Map(bars.map((bar) => [bar.row.id, bar]));
  const edges: GanttEdgeLayout[] = [];
  for (const bar of bars) {
    for (const dep of bar.row.dependencies) {
      const from = byId.get(dep.fromId);
      if (!from) continue;
      const anchors = edgeAnchors(from, bar, dep.type, rowHeight);
      edges.push({
        fromId: dep.fromId,
        toId: bar.row.id,
        type: dep.type,
        offsetDays: dep.offsetDays,
        key: `${dep.fromId}>${bar.row.id}`,
        ...anchors
      });
    }
  }

  return {
    rangeStart: range.start,
    rangeEnd: range.end,
    dayCount,
    dayWidth,
    labelWidth,
    rowHeight,
    axisHeight,
    bars,
    edges,
    groupBounds,
    totalWidth: labelWidth + dayCount * dayWidth + 24,
    totalHeight: Math.max(rowHeight + axisHeight, y + 24),
    ticks: buildTicks(range.start, dayCount, GANTT_ZOOM[zoom].tickEvery)
  };
}

export function layoutGantt(rows: GanttRow[], options: LayoutGanttOptions = {}): GanttLayout | null {
  if (!rows.length) return null;
  const project: Project = {
    schema_version: 1,
    id: options.groupTitles?.[0]?.id ?? 'gantt',
    title: options.groupTitles?.[0]?.title ?? 'Project',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'standard',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    created_at: '',
    updated_at: '',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null
  };
  return layoutGanttGroups([{ project, rows }], { ...options, collapsedGroups: [] });
}

export function formatTick(date: Date): string {
  return formatDisplayDate(date);
}

export function formatGanttTick(date: Date, zoom: GanttZoom): string {
  if (zoom === 'term') {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return `${months[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
  }
  return formatDisplayDate(date);
}

export function requiredStartIdx(
  pred: Pick<GanttBarLayout, 'sIdx' | 'fIdx'>,
  dep: Pick<GanttDependency, 'type' | 'offsetDays'>,
  succDurationDays: number
): number {
  if (dep.type === 'SS') return pred.sIdx + dep.offsetDays;
  if (dep.type === 'FF') return pred.fIdx + dep.offsetDays - succDurationDays;
  return dep.offsetDays !== 0 ? pred.fIdx - 1 + dep.offsetDays : pred.fIdx;
}

export function criticalPath(
  bars: GanttBarLayout[],
  dependencies: GanttDependency[] = bars.flatMap((bar) => bar.row.dependencies)
): { nodes: Set<string>; edges: Set<string> } {
  const byId = new Map(bars.map((bar) => [bar.row.id, bar]));
  const incomingByTarget = new Map<string, GanttDependency[]>();
  for (const dep of dependencies) {
    if (!byId.has(dep.fromId) || !byId.has(dep.toId)) continue;
    const list = incomingByTarget.get(dep.toId) ?? [];
    list.push(dep);
    incomingByTarget.set(dep.toId, list);
  }

  const criticalIncoming = new Map<string, GanttDependency>();
  for (const [toId, incoming] of incomingByTarget) {
    const succ = byId.get(toId)!;
    let best: GanttDependency | null = null;
    let bestSlack = Infinity;
    for (const dep of incoming) {
      const pred = byId.get(dep.fromId)!;
      const succDuration = succ.fIdx - succ.sIdx;
      const slack = succ.sIdx - requiredStartIdx(pred, dep, succDuration);
      if (slack < bestSlack) {
        bestSlack = slack;
        best = dep;
      }
    }
    if (best && bestSlack <= 0) criticalIncoming.set(toId, best);
  }

  const chainLen = new Map<string, number>();
  const lenOf = (id: string): number => {
    const cached = chainLen.get(id);
    if (cached !== undefined) return cached;
    chainLen.set(id, 1);
    const dep = criticalIncoming.get(id);
    const val = dep ? 1 + lenOf(dep.fromId) : 1;
    chainLen.set(id, val);
    return val;
  };

  let bestEnd: string | null = null;
  let bestLen = 1;
  for (const bar of bars) {
    const len = lenOf(bar.row.id);
    if (len > bestLen) {
      bestLen = len;
      bestEnd = bar.row.id;
    }
  }

  const nodes = new Set<string>();
  const edges = new Set<string>();
  let cursor = bestEnd;
  while (cursor) {
    nodes.add(cursor);
    const dep = criticalIncoming.get(cursor);
    if (!dep) break;
    edges.add(`${dep.fromId}>${dep.toId}`);
    cursor = dep.fromId;
  }
  return { nodes, edges };
}

export function mergeCriticalAcrossGroups(
  bars: GanttBarLayout[],
  projectIds: string[]
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  for (const pid of projectIds) {
    const subset = bars.filter((bar) => bar.row.parentProjectId === pid);
    if (!subset.length) continue;
    const path = criticalPath(subset);
    for (const id of path.nodes) nodes.add(id);
    for (const key of path.edges) edges.add(key);
  }
  return { nodes, edges };
}

export function shiftDueDate(due: string | null, days: number): string | null {
  const parsed = parseDue(due);
  if (!parsed) return due;
  return toDateKey(addDays(parsed, days));
}

export function resizeEstimatedMinutes(
  item: GanttSchedulable,
  deltaDays: number
): number | null {
  if (item.kind === 'milestone') return null;
  const span = spanOf(item);
  if (!span) return item.estimated_duration;
  const currentDays = dayOffset(span.start, span.end) + 1;
  return Math.max(1, currentDays + deltaDays) * WORK_DAY_MINUTES;
}

export function cascadeForward(
  items: GanttSchedulable[],
  dependencies: GanttDependency[],
  changedId: string
): Map<string, string> {
  const byId = new Map(items.map((item) => [item.id, { ...item }]));
  const outgoing = new Map<string, GanttDependency[]>();
  for (const dep of dependencies) {
    const list = outgoing.get(dep.fromId) ?? [];
    list.push(dep);
    outgoing.set(dep.fromId, list);
  }

  const queue = [changedId];
  const seen = new Set<string>();
  const shifted = new Map<string, string>();

  while (queue.length) {
    const id = queue.shift()!;
    for (const dep of outgoing.get(id) ?? []) {
      const pred = byId.get(dep.fromId);
      const succ = byId.get(dep.toId);
      if (!pred || !succ) continue;
      const predSpan = spanOf(pred);
      const succSpan = spanOf(succ);
      if (!predSpan || !succSpan || !succ.due_date) continue;
      const succDurationDays = dayOffset(succSpan.start, succSpan.end);
      let requiredStart: Date;
      if (dep.type === 'SS') requiredStart = addDays(predSpan.start, dep.offsetDays);
      else if (dep.type === 'FF') {
        requiredStart = addDays(predSpan.end, dep.offsetDays - succDurationDays);
      } else {
        requiredStart = addDays(predSpan.end, dep.offsetDays !== 0 ? dep.offsetDays : 1);
      }
      if (requiredStart.getTime() > succSpan.start.getTime()) {
        const delta = dayOffset(succSpan.start, requiredStart);
        const nextDue = shiftDueDate(succ.due_date, delta);
        if (nextDue) {
          succ.due_date = nextDue;
          byId.set(succ.id, succ);
          shifted.set(succ.id, nextDue);
          if (!seen.has(succ.id)) {
            seen.add(succ.id);
            queue.push(succ.id);
          }
        }
      }
    }
  }

  return shifted;
}

export function dateKeyAtX(layout: GanttLayout, x: number): string | null {
  const day = Math.floor((x - layout.labelWidth) / layout.dayWidth);
  if (day < 0 || day >= layout.dayCount) return null;
  return toDateKey(addDays(layout.rangeStart, day));
}

export function barAtPoint(layout: GanttLayout, x: number, y: number): GanttBarLayout | null {
  return (
    layout.bars.find((bar) => {
      const width = bar.row.kind === 'milestone' ? 16 : bar.width;
      const left = bar.row.kind === 'milestone' ? bar.x - 8 : bar.x;
      return x >= left - 6 && x <= left + width + 6 && y >= bar.y && y <= bar.y + layout.rowHeight;
    }) ?? null
  );
}

export function groupAtY(layout: GanttLayout, y: number): GanttGroupBound | null {
  return (
    layout.groupBounds.find((group) => y >= group.y && y <= group.y + group.groupHeight) ?? null
  );
}

export type GanttDropTarget =
  | { kind: 'bar'; bar: GanttBarLayout; dateKey: string }
  | { kind: 'group'; projectId: string; dateKey: string }
  | { kind: 'day'; dateKey: string; projectId: string | null };

export function dropTargetAt(
  layout: GanttLayout,
  x: number,
  y: number,
  fallbackProjectId: string | null
): GanttDropTarget | null {
  const dateKey = dateKeyAtX(layout, x);
  if (!dateKey) return null;
  const bar = barAtPoint(layout, x, y);
  if (bar) return { kind: 'bar', bar, dateKey };
  const group = groupAtY(layout, y);
  if (group) return { kind: 'group', projectId: group.pid, dateKey };
  return { kind: 'day', dateKey, projectId: fallbackProjectId };
}

export function wouldCreateCycle(
  dependencies: GanttDependency[],
  fromId: string,
  toId: string
): boolean {
  if (fromId === toId) return true;
  const outgoing = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = outgoing.get(dep.fromId) ?? [];
    list.push(dep.toId);
    outgoing.set(dep.fromId, list);
  }
  const stack = [toId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === fromId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of outgoing.get(id) ?? []) stack.push(next);
  }
  return false;
}

export function placeholderGanttLayout(
  zoom: GanttZoom = 'week',
  padBefore = 7,
  padAfter = 21
): GanttLayout {
  const today = startOfDay(new Date());
  const rangeStart = addDays(today, -padBefore);
  const rangeEnd = addDays(today, padAfter);
  const dayWidth = GANTT_ZOOM[zoom].dayWidth;
  const dayCount = dayOffset(rangeStart, rangeEnd) + 1;
  return {
    rangeStart,
    rangeEnd,
    dayCount,
    dayWidth,
    labelWidth: 0,
    rowHeight: GANTT_ROW_HEIGHT,
    axisHeight: GANTT_AXIS_HEIGHT,
    bars: [],
    edges: [],
    groupBounds: [],
    totalWidth: dayCount * dayWidth + 24,
    totalHeight: GANTT_AXIS_HEIGHT + GANTT_ROW_HEIGHT * 4,
    ticks: buildTicks(rangeStart, dayCount, GANTT_ZOOM[zoom].tickEvery)
  };
}

export { toDateKey };
