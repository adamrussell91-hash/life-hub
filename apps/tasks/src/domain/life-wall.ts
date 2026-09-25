import { addDaysKey, toMs } from '@/domain/school-time';
import type { LifeWall } from '@/schemas/life-wall';

export type WallSource = {
  id: string;
  title: string;
  life_wall?: LifeWall | null;
};

export type MilestoneWallSource = WallSource & { project_id?: string };

export type CollectedWall = {
  id: string;
  starts_on: string;
  ends_on: string;
  label: string;
  source: 'task' | 'project' | 'goal' | 'milestone';
  sourceId: string;
};

function labelOf(wall: LifeWall, title: string): string {
  const text = wall.label?.trim();
  return text ? text : title;
}

function pushWall(out: CollectedWall[], source: 'task' | 'project' | 'goal' | 'milestone', item: WallSource | null | undefined): void {
  const wall = item?.life_wall;
  if (!item || !wall) return;
  out.push({
    id: `${source}:${item.id}`,
    starts_on: wall.starts_on,
    ends_on: wall.ends_on,
    label: labelOf(wall, item.title),
    source,
    sourceId: item.id
  });
}

/** Every life wall on tasks (including Someday dreams), projects, goals, and milestones. */
export function collectLifeWalls(input: {
  tasks?: WallSource[] | null;
  projects?: Array<WallSource & { milestones?: MilestoneWallSource[] | null }> | null;
  goals?: WallSource[] | null;
}): CollectedWall[] {
  const out: CollectedWall[] = [];
  for (const task of input.tasks ?? []) pushWall(out, 'task', task);
  for (const goal of input.goals ?? []) pushWall(out, 'goal', goal);
  for (const project of input.projects ?? []) {
    pushWall(out, 'project', project);
    for (const milestone of project.milestones ?? []) pushWall(out, 'milestone', milestone);
  }
  return out;
}

export function isWeekday(key: string): boolean {
  const day = new Date(toMs(key)).getUTCDay();
  return day !== 0 && day !== 6;
}

/** The earliest date that is still within `count` working days before `start` (start itself excluded). */
export function workingDaysBefore(start: string, count: number): string {
  let left = count;
  let cursor = addDaysKey(start, -1);
  while (left > 0) {
    if (isWeekday(cursor)) left -= 1;
    if (left === 0) return cursor;
    cursor = addDaysKey(cursor, -1);
  }
  return cursor;
}

/** True when `due` sits inside the wall or within 3 working days before it starts. */
export function dueNearWall(due: string, wall: Pick<CollectedWall, 'starts_on' | 'ends_on'>): boolean {
  if (due >= wall.starts_on && due <= wall.ends_on) return true;
  if (due >= wall.starts_on) return false;
  return due >= workingDaysBefore(wall.starts_on, 3);
}

export function wallContaining(due: string, walls: CollectedWall[]): CollectedWall | null {
  return walls.find((wall) => due >= wall.starts_on && due <= wall.ends_on) ?? null;
}

/** Chip for open items due inside a wall or within 3 working days before one. */
export function beforeWallChip(due: string | null | undefined, status: string, walls: CollectedWall[]): string | null {
  if (!due || status === 'done' || status === 'dead') return null;
  const hit = walls.find((wall) => dueNearWall(due, wall));
  return hit ? `before ${hit.label}` : null;
}
