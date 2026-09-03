import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { parseDue, startOfDay } from '@/domain/queries';

export type OrbitBodyKind = 'task' | 'project';

export type OrbitBody = {
  id: string;
  kind: OrbitBodyKind;
  label: string;
  domain: string | null;
  /** 0 = centre (most urgent) … 1 = outer. */
  urgency: number;
  radius: number;
  angle: number;
  size: number;
  priority: string;
  due_date: string | null;
  estimated_minutes: number | null;
};

const PRIORITY_WEIGHT: Record<Task['priority'], number> = {
  urgent: 1,
  high: 0.75,
  medium: 0.45,
  low: 0.2
};

/** Urgency 0 (hot/close) → 1 (cold/far). */
export function taskUrgency(task: Task, from: Date = new Date()): number {
  const pri = PRIORITY_WEIGHT[task.priority] ?? 0.45;
  const due = parseDue(task.due_date);
  let dueScore = 0.85;
  if (due) {
    const days = Math.round(
      (startOfDay(due).getTime() - startOfDay(from).getTime()) / (24 * 60 * 60 * 1000)
    );
    if (days < 0) dueScore = 0;
    else if (days === 0) dueScore = 0.05;
    else if (days === 1) dueScore = 0.15;
    else if (days <= 3) dueScore = 0.3;
    else if (days <= 7) dueScore = 0.5;
    else if (days <= 21) dueScore = 0.7;
    else dueScore = 0.9;
  }
  // Lower = closer to centre
  return Math.min(1, Math.max(0, 1 - (pri * 0.55 + (1 - dueScore) * 0.45)));
}

export function projectUrgency(project: Project, tasks: Task[], from: Date = new Date()): number {
  const child = tasks.filter(
    (t) => t.parent_project_id === project.id && t.status !== 'done' && t.status !== 'dead'
  );
  if (!child.length) return 0.9;
  return Math.min(...child.map((t) => taskUrgency(t, from)));
}

function bodySize(minutes: number | null, kind: OrbitBodyKind): number {
  const base = kind === 'project' ? 18 : 10;
  if (!minutes) return base;
  return Math.min(kind === 'project' ? 28 : 22, base + Math.round(minutes / 40));
}

/**
 * Static polar layout — closest = most urgent (spec §6.5 Orbit).
 * Animation can rotate angles in the view without recomputing urgency.
 */
export function layoutOrbit(
  tasks: Task[],
  projects: Project[],
  from: Date = new Date(),
  options: { minRadius?: number; maxRadius?: number } = {}
): OrbitBody[] {
  const minR = options.minRadius ?? 56;
  const maxR = options.maxRadius ?? 220;
  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'dead');
  const activeProjects = projects.filter((p) => p.status !== 'archived_dead');

  const bodies: OrbitBody[] = [
    ...activeProjects.map((p) => {
      const urgency = projectUrgency(p, tasks, from);
      return {
        id: p.id,
        kind: 'project' as const,
        label: p.title,
        domain: p.type,
        urgency,
        radius: minR + urgency * (maxR - minR),
        angle: 0,
        size: bodySize(null, 'project'),
        priority: '—',
        due_date: p.current_end_date,
        estimated_minutes: null
      };
    }),
    ...openTasks.map((t) => {
      const urgency = taskUrgency(t, from);
      return {
        id: t.id,
        kind: 'task' as const,
        label: t.title,
        domain: t.domain,
        urgency,
        radius: minR + urgency * (maxR - minR),
        angle: 0,
        size: bodySize(t.estimated_duration, 'task'),
        priority: t.priority,
        due_date: t.due_date,
        estimated_minutes: t.estimated_duration
      };
    })
  ];

  // Golden-angle spread so near-centre bodies do not stack on one ray
  bodies.sort((a, b) => a.urgency - b.urgency || a.label.localeCompare(b.label));
  const golden = Math.PI * (3 - Math.sqrt(5));
  bodies.forEach((body, i) => {
    const hash = [...body.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    body.angle = i * golden + (hash % 17) * 0.01;
  });
  separateCloseAngles(bodies);

  return bodies;
}

/** Push bodies that share a ring apart so planets do not sit on top of each other. */
export function separateCloseAngles(bodies: OrbitBody[]): void {
  for (let pass = 0; pass < 8; pass += 1) {
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        if (Math.abs(a.radius - b.radius) > a.size + b.size + 18) continue;
        let delta = a.angle - b.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const minSep = 0.42;
        if (Math.abs(delta) >= minSep) continue;
        const push = (minSep - Math.abs(delta)) / 2;
        const dir = delta >= 0 ? 1 : -1;
        a.angle += dir * push;
        b.angle -= dir * push;
      }
    }
  }
}

export function domainFill(domain: string | null): string {
  switch (domain) {
    case 'teaching':
      return 'var(--pastel-blue)';
    case 'wedding':
      return 'var(--pastel-peach)';
    case 'life':
      return 'var(--pastel-sage)';
    case 'health':
      return 'var(--pastel-gold)';
    case 'academic_program':
    case 'excursion':
      return 'var(--pastel-lilac)';
    default:
      return 'var(--pastel-blue)';
  }
}
