/**
 * Timeline rows. Hierarchy is Dream → Goal → Project → Task / Milestone → Step.
 * Spans and visibility follow the reference prototype. Project dates come from
 * `projectSpan` in chronology.ts; the caller passes those keys in.
 */
import { mergeCriticalAcrossGroups, type GanttBarLayout, type GanttRow } from '@/domain/gantt';
import { addDaysKey, toMs } from '@/domain/school-time';
import { TL } from '@/domain/timeline-geometry';
import type { DependencyType } from '@/schemas/task';

export type TlTask = {
  id: string;
  title: string;
  project: string | null;
  parent: string | null;
  domain: string;
  due: string | null;
  est: number | null;
  status: string;
  blocked: boolean;
  blockedSince: string | null;
  deps: string[];
  marking?: {
    class_label: string;
    scripts: number;
    minutes_per_script: number | null;
    collected_on: string;
    return_by: string;
    scripts_marked: number;
  } | null;
  apst_focus?: string[] | null;
};

export type TlProject = {
  id: string;
  title: string;
  goal: string | null;
  domain: string;
  start: string;
  end: string;
  baselineEnd: string | null;
  shade: boolean;
  colour: string;
  ribbon?: boolean;
  submission?: string | null;
};

export type TlGoal = { id: string; title: string; dream: string | null };
export type TlDream = { id: string; title: string; target: string; origin: string | null };
export type TlMilestone = { id: string; project: string; title: string; due: string; deps: string[] };

export type TlModel = {
  tasks: TlTask[];
  projects: TlProject[];
  goals: TlGoal[];
  dreams: TlDream[];
  milestones: TlMilestone[];
};

export type TlRowKind = 'dream' | 'goal' | 'project' | 'task' | 'step' | 'milestone' | 'group' | 'marking';

export type TlRow = {
  id: string;
  kind: TlRowKind;
  depth: number;
  label: string;
  y: number;
  h: number;
  ref: string;
  open?: boolean;
  colour?: string;
};

/** Reference bar length: estimated minutes against a 120-minute school day. */
export function timelineTaskSpan(task: Pick<TlTask, 'due' | 'est'>): { start: string; end: string } | null {
  if (!task.due) return null;
  const days = Math.max(1, Math.ceil((task.est ?? 60) / 120));
  return { start: addDaysKey(task.due, -(days - 1)), end: task.due };
}

export function undatedCount(projectId: string, tasks: TlTask[]): number {
  return tasks.filter((task) => task.project === projectId && !task.due).length;
}

export function goalProjectCount(goalId: string, projects: TlProject[]): number {
  return projects.filter((project) => project.goal === goalId).length;
}

/** Union of child project spans. Null when the goal has no dated projects. */
export function goalSpan(goalId: string, projects: TlProject[]): { start: string; end: string } | null {
  const kids = projects.filter((project) => project.goal === goalId && project.start && project.end);
  if (!kids.length) return null;
  return {
    start: kids.map((project) => project.start).sort()[0]!,
    end: kids.map((project) => project.end).sort().at(-1)!
  };
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function isTimelineExpanded(
  id: string,
  kind: 'goal' | 'project' | 'group' | 'task',
  zoom: number,
  expanded: ReadonlyMap<string, boolean>,
  tasks: TlTask[],
  today: string
): boolean {
  const user = expanded.get(id);
  if (user !== undefined) return user;
  if (kind === 'goal') return true;
  if (kind === 'task') return zoom >= 3;
  if (kind === 'group') return id === 'grp-marking';
  if (zoom < 2) return false;
  const next = tasks
    .filter((task) => task.project === id && !task.parent && task.status !== 'done' && task.due)
    .map((task) => task.due!)
    .sort()[0];
  return Boolean(next && daysBetween(today, next) <= 14);
}

export function buildTimelineRows(
  model: TlModel,
  options: { zoom: number; expanded: ReadonlyMap<string, boolean>; today: string }
): TlRow[] {
  const rows: TlRow[] = [];
  let y = 0;
  const push = (row: Omit<TlRow, 'y'>) => {
    rows.push({ ...row, y });
    y += row.h;
  };
  const projectRows = (project: TlProject, depth: number) => {
    const open = isTimelineExpanded(project.id, 'project', options.zoom, options.expanded, model.tasks, options.today);
    push({
      id: `row:${project.id}`,
      kind: 'project',
      depth,
      label: project.title,
      h: (open ? TL.row.projectOpen : TL.row.project) + (project.ribbon ? TL.row.ribbon : 0),
      ref: project.id,
      open,
      colour: project.colour
    });
    if (!open) return;
    const items: Array<{ due: string; row: Omit<TlRow, 'y'> }> = [];
    for (const task of model.tasks.filter((item) => item.project === project.id && !item.parent && item.due && !item.marking)) {
      items.push({
        due: task.due!,
        row: { id: `row:${task.id}`, kind: 'task', depth: depth + 1, label: task.title, h: TL.row.task, ref: task.id }
      });
    }
    for (const milestone of model.milestones.filter((item) => item.project === project.id && item.due)) {
      items.push({
        due: milestone.due,
        row: {
          id: `row:${milestone.id}`,
          kind: 'milestone',
          depth: depth + 1,
          label: milestone.title,
          h: TL.row.milestone,
          ref: milestone.id
        }
      });
    }
    items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    for (const item of items) {
      push(item.row);
      if (item.row.kind === 'task' && isTimelineExpanded(item.row.ref, 'task', options.zoom, options.expanded, model.tasks, options.today)) {
        for (const step of model.tasks.filter((child) => child.parent === item.row.ref && child.due)) {
          push({
            id: `row:${step.id}`,
            kind: 'step',
            depth: depth + 2,
            label: step.title,
            h: TL.row.step,
            ref: step.id
          });
        }
      }
    }
  };

  for (const goal of model.goals) {
    const dream = goal.dream ? model.dreams.find((item) => item.id === goal.dream) : null;
    let depth = 0;
    if (dream) {
      push({ id: `row:${dream.id}`, kind: 'dream', depth: 0, label: dream.title, h: TL.row.dream, ref: dream.id });
      depth = 1;
    }
    const open = isTimelineExpanded(goal.id, 'goal', options.zoom, options.expanded, model.tasks, options.today);
    push({ id: `row:${goal.id}`, kind: 'goal', depth, label: goal.title, h: TL.row.goal, ref: goal.id, open });
    if (open) {
      for (const project of model.projects.filter((item) => item.goal === goal.id)) projectRows(project, depth + 1);
    }
    y += TL.groupGap;
  }

  const looseProjects = model.projects.filter((project) => !project.goal);
  if (looseProjects.length) {
    const open = isTimelineExpanded('grp-nogoal', 'goal', options.zoom, options.expanded, model.tasks, options.today);
    push({ id: 'row:grp-nogoal', kind: 'group', depth: 0, label: 'No goal', h: TL.row.group, ref: 'grp-nogoal', open });
    if (open) for (const project of looseProjects) projectRows(project, 1);
    y += TL.groupGap;
  }

  const markingOpen = isTimelineExpanded('grp-marking', 'group', options.zoom, options.expanded, model.tasks, options.today);
  push({
    id: 'row:grp-marking',
    kind: 'group',
    depth: 0,
    label: 'Marking shadows',
    h: TL.row.group,
    ref: 'grp-marking',
    open: markingOpen
  });
  if (markingOpen) {
    for (const task of model.tasks.filter((item) => item.marking)) {
      push({
        id: `row:${task.id}`,
        kind: 'marking',
        depth: 1,
        label: task.title,
        h: TL.row.marking,
        ref: task.id
      });
    }
  }
  y += TL.groupGap;

  const loose = model.tasks.filter((task) => !task.project && task.due && !task.marking);
  push({
    id: 'row:grp-loose',
    kind: 'group',
    depth: 0,
    label: 'Tasks without a project',
    h: TL.row.group,
    ref: 'grp-loose',
    open: isTimelineExpanded('grp-loose', 'group', options.zoom, options.expanded, model.tasks, options.today)
  });
  if (isTimelineExpanded('grp-loose', 'group', options.zoom, options.expanded, model.tasks, options.today)) {
    for (const task of loose) {
      push({ id: `row:${task.id}`, kind: 'task', depth: 1, label: task.title, h: TL.row.task, ref: task.id });
    }
  }
  return rows;
}

/** Longest dependency chain in each project. Edge keys are `from>to`. */
export function criticalChains(groups: Array<Array<[string, string]>>): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  for (const links of groups) {
    const incoming = new Map<string, string[]>();
    const ids = new Set<string>();
    for (const [from, to] of links) {
      ids.add(from);
      ids.add(to);
      const list = incoming.get(to) ?? [];
      list.push(from);
      incoming.set(to, list);
    }
    const memo = new Map<string, { len: number; via: string | null }>();
    const visiting = new Set<string>();
    const lenOf = (id: string): { len: number; via: string | null } => {
      const hit = memo.get(id);
      if (hit) return hit;
      if (visiting.has(id)) return { len: 1, via: null };
      visiting.add(id);
      let best = { len: 1, via: null as string | null };
      for (const prev of incoming.get(id) ?? []) {
        const parent = lenOf(prev);
        if (parent.len + 1 > best.len) best = { len: parent.len + 1, via: prev };
      }
      visiting.delete(id);
      memo.set(id, best);
      return best;
    };
    let end = '';
    let bestLen = 0;
    for (const id of ids) {
      const len = lenOf(id).len;
      if (len > bestLen) {
        bestLen = len;
        end = id;
      }
    }
    let cursor = end;
    if (cursor) nodes.add(cursor);
    while (cursor) {
      const via = memo.get(cursor)?.via;
      if (!via) break;
      nodes.add(via);
      edges.add(`${via}>${cursor}`);
      cursor = via;
    }
  }
  return { nodes, edges };
}

function dayIndex(key: string, origin: string): number {
  return Math.round((toMs(key) - toMs(origin)) / 86_400_000);
}

function rowFor(id: string, project: string, label: string, start: string, end: string, deps: GanttRow['dependencies']): GanttRow {
  return {
    id,
    kind: 'task',
    label,
    start: new Date(toMs(start)),
    end: new Date(toMs(end)),
    status: 'open',
    dependsOn: deps.map((dep) => dep.fromId),
    dependencies: deps,
    estimatedMinutes: null,
    parentProjectId: project,
    parentTaskId: null,
    domain: null,
    priority: null,
    depth: 0
  };
}

/** Longest chain in each project, plus the Gantt critical path, so both survive. */
export function timelineCritical(input: {
  rangeStart: string;
  spans: Array<{ id: string; project: string; label: string; start: string; end: string }>;
  links: Array<{ from: string; to: string; project: string; type?: DependencyType; offset?: number }>;
}): { nodes: Set<string>; edges: Set<string> } {
  const byProject = new Map<string, Array<[string, string]>>();
  for (const link of input.links) {
    const list = byProject.get(link.project) ?? [];
    list.push([link.from, link.to]);
    byProject.set(link.project, list);
  }
  const chain = criticalChains([...byProject.values()]);
  const incoming = new Map<string, GanttRow['dependencies']>();
  for (const link of input.links) {
    const list = incoming.get(link.to) ?? [];
    list.push({
      fromId: link.from,
      toId: link.to,
      type: link.type ?? 'FS',
      offsetDays: link.offset ?? 0
    });
    incoming.set(link.to, list);
  }
  const bars: GanttBarLayout[] = input.spans.map((span, index) => {
    const sIdx = dayIndex(span.start, input.rangeStart);
    const fIdx = dayIndex(addDaysKey(span.end, 1), input.rangeStart);
    return {
      row: rowFor(span.id, span.project, span.label, span.start, span.end, incoming.get(span.id) ?? []),
      rowIndex: index,
      x: sIdx,
      width: Math.max(1, fIdx - sIdx),
      y: index,
      sIdx,
      fIdx
    };
  });
  const cpm = bars.length ? mergeCriticalAcrossGroups(bars, [...byProject.keys()]) : { nodes: new Set<string>(), edges: new Set<string>() };
  return {
    nodes: new Set([...chain.nodes, ...cpm.nodes]),
    edges: new Set([...chain.edges, ...cpm.edges])
  };
}

/** Planning window. The reference fixture sits inside July 2026 – January 2027. */
export function timelineRange(today: string): { start: string; end: string } {
  if (today >= '2026-07-20' && today <= '2027-01-31') return { start: '2026-07-20', end: '2027-01-31' };
  return { start: addDaysKey(today, -60), end: addDaysKey(today, 140) };
}
