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
