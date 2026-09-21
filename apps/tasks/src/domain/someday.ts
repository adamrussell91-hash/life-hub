import type { OdysseyNode, Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { inspectProjectHealth } from '@/domain/project-health';

/** Fixed Wheel-of-Life areas — deliberately not user-configurable, unlike domains/priorities. */
export const LIFE_AREAS: Array<{ id: string; label: string }> = [
  { id: 'career', label: 'Career' },
  { id: 'health', label: 'Health' },
  { id: 'love', label: 'Love' },
  { id: 'money', label: 'Money' },
  { id: 'create', label: 'Create' },
  { id: 'explore', label: 'Explore' },
  { id: 'learn', label: 'Learn' },
  { id: 'friends', label: 'Friends' }
];

export const MATURITY_LEVELS: Array<{ id: 'new' | 'developing' | 'set'; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'developing', label: 'Developing' },
  { id: 'set', label: 'Set' }
];

export const HORIZON_TARGETS: Array<{ id: 'area' | 'goal' | 'project'; label: string }> = [
  { id: 'area', label: 'Area' },
  { id: 'goal', label: 'Goal' },
  { id: 'project', label: 'Project' }
];

/** Someday categories. Career does not appear on Life Hub Future Map. */
export const SOMEDAY_KINDS = [
  { id: 'bucket_list', label: 'Bucket list' },
  { id: 'dreams_jar', label: 'Dreams jar' },
  { id: 'career', label: 'Career' }
] as const;

export type SomedayKind = (typeof SOMEDAY_KINDS)[number]['id'];
export type SomedayKindFilter = 'all' | 'uncategorised' | SomedayKind;

export function somedayKindLabel(kind: string | null | undefined): string {
  return SOMEDAY_KINDS.find((entry) => entry.id === kind)?.label ?? 'Uncategorised';
}

/** Bucket list and dreams jar carry an origin date and also appear on Future Map. */
export function showsOriginDate(kind: string | null | undefined): boolean {
  return kind === 'bucket_list' || kind === 'dreams_jar';
}

export function matchesSomedayKind(
  task: Pick<Task, 'someday_kind'>,
  filter: SomedayKindFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'uncategorised') return !task.someday_kind;
  return task.someday_kind === filter;
}

/** Organic constellation seats — spaced so cores and labels do not collide. */
export const LIFE_COVERAGE_VIEWBOX = { width: 1000, height: 560 } as const;

export type LifeCoverageSeat = { x: number; y: number; labelDy: number };

export const LIFE_COVERAGE_SEATS: Record<string, LifeCoverageSeat> = {
  career: { x: 168, y: 118, labelDy: -38 },
  explore: { x: 830, y: 128, labelDy: -38 },
  health: { x: 390, y: 200, labelDy: 42 },
  learn: { x: 155, y: 328, labelDy: 42 },
  create: { x: 508, y: 318, labelDy: 42 },
  money: { x: 848, y: 338, labelDy: 42 },
  love: { x: 278, y: 478, labelDy: 42 },
  friends: { x: 708, y: 488, labelDy: 42 }
};

/** Extra gap between cores so a label cannot sit on a neighbour. */
export const LIFE_COVERAGE_LABEL_CLEARANCE = 36;

/** Core / unlit-ring radius — size from count, capped so neighbours stay clear. */
export function lifeCoverageStarRadius(count: number): number {
  if (count <= 0) return 18;
  return Math.min(28, 8 + count * 1.1);
}

/** Brightness weight for the Life coverage constellation — size still comes from count alone. */
export function maturityWeight(maturity: Task['maturity']): number {
  switch (maturity) {
    case 'set':
      return 1;
    case 'developing':
      return 0.65;
    case 'new':
      return 0.32;
    default:
      return 0.32;
  }
}

export type LifeCoverageArea = {
  id: string;
  label: string;
  count: number;
  avgMaturity: number;
};

/** One row per fixed life area, in LIFE_AREAS order, including zero-count (unlit) areas. */
export function computeLifeCoverage(somedayItems: Task[]): LifeCoverageArea[] {
  return LIFE_AREAS.map((area) => {
    const items = somedayItems.filter((task) => task.life_area === area.id);
    const avgMaturity = items.length
      ? items.reduce((sum, task) => sum + maturityWeight(task.maturity), 0) / items.length
      : 0;
    return { id: area.id, label: area.label, count: items.length, avgMaturity };
  });
}

/** Deterministic, no-API-call starting point for a project promoted from a Someday idea. */
export function suggestFirstMilestone(task: Task): string {
  const title = task.title.trim() || 'this idea';
  return `Find out what "${title}" would actually take`;
}

/** A tiny implementation-intention nudge for an idea the Sweep just surfaced — an open loop, not a reminder. */
export function suggestIfThen(task: Task): string {
  const title = task.title.trim() || 'this';
  return `If it's a free evening → spend 10 min on "${title}"`;
}

/** One-line insight for the Life coverage preview card — stacked area vs. the gap, or a settled state. */
export function lifeCoverageHeadline(coverage: LifeCoverageArea[]): string {
  const withDreams = coverage.filter((row) => row.count > 0);
  const empty = coverage.filter((row) => row.count === 0);
  if (withDreams.length === 0) return 'No dreams tagged with a life area yet.';
  const top = [...withDreams].sort((a, b) => b.count - a.count)[0];
  if (empty.length === 0) return `${top.label} is stacked. Every area has something.`;
  const gap = empty[0].label;
  return `${top.label} is stacked. ${gap} has nothing.`;
}

/** Blob creates historically omitted this array — never assume it exists. */
export function somedayLinkedProjectIds(task: Pick<Task, 'linked_project_ids'>): string[] {
  return Array.isArray(task.linked_project_ids) ? task.linked_project_ids : [];
}

/** Blob creates historically omitted this array — never assume it exists. */
export function somedayLinkedGoalIds(task: Pick<Task, 'linked_goal_ids'>): string[] {
  return Array.isArray(task.linked_goal_ids) ? task.linked_goal_ids : [];
}

/** Blob creates historically omitted this array — never assume it exists. */
export function somedayOdysseyPaths(task: Pick<Task, 'odyssey_paths'>): OdysseyNode[] {
  return Array.isArray(task.odyssey_paths) ? task.odyssey_paths : [];
}

/** Projects this Someday idea has spawned that have stalled — candidates for reroute. */
export function stalledLinkedProjects(task: Task, projects: Project[], allTasks: Task[]): Project[] {
  const linked = new Set(somedayLinkedProjectIds(task));
  return projects.filter((project) => {
    if (!linked.has(project.id)) return false;
    if (project.status === 'archived_dead' || project.status === 'completed') return false;
    if (project.status === 'stalled' || project.stall_flagged_at) return true;
    return inspectProjectHealth(project, allTasks).health === 'stalled';
  });
}

// ---- Odyssey tree helpers -------------------------------------------------

export function newOdysseyNode(overrides: Partial<OdysseyNode> = {}): OdysseyNode {
  return {
    id: crypto.randomUUID(),
    title: '',
    question: '',
    resources: 50,
    confidence: 50,
    coherence: 50,
    children: [],
    ...overrides
  };
}

/** Path from a root-level node down to the node with `id`, or null if not found. */
export function findOdysseyPath(nodes: OdysseyNode[], id: string): OdysseyNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const inChildren = findOdysseyPath(node.children, id);
    if (inChildren) return [node, ...inChildren];
  }
  return null;
}

/** Returns a new tree with `child` appended under `parentId` (or as a new root when null). */
export function addOdysseyChild(
  nodes: OdysseyNode[],
  parentId: string | null,
  child: OdysseyNode
): OdysseyNode[] {
  if (parentId === null) return [...nodes, child];
  return nodes.map((node) =>
    node.id === parentId
      ? { ...node, children: [...node.children, child] }
      : { ...node, children: addOdysseyChild(node.children, parentId, child) }
  );
}

export function removeOdysseyNode(nodes: OdysseyNode[], id: string): OdysseyNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: removeOdysseyNode(node.children, id) }));
}

export function countOdysseyNodes(nodes: OdysseyNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countOdysseyNodes(node.children), 0);
}
