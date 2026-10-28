import { isProjectArchived } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { parseDue, startOfDay } from '@/domain/queries';
import { projectMilestones } from '@/domain/project-milestones';
import { inspectProjectHealth } from '@/domain/project-health';
import type { ProjectPulseCard, PulseGroup } from '@/domain/projects-pulse';
import {
  axialToPixel,
  hexCorners,
  spiralCells,
  SQRT3,
  type Pt
} from '../../../../packages/walkthrus/board/hex';

/**
 * Projects hive: the landing view of the Projects page. One hexagon per
 * project, one hex cluster per group (status, goal, energy, deadline), laid
 * out with the WalkThru board's hex geometry. Pure, so the view only draws.
 */

export type HiveHealth = 'on_track' | 'slipping' | 'stalled' | 'parked';

export const HIVE_HEALTH_LABEL: Record<HiveHealth, string> = {
  on_track: 'On track',
  slipping: 'Slipping',
  stalled: 'Stalled',
  parked: 'Parked'
};

/** Past this many, pips stop being countable at a glance and read as "4/12". */
export const MAX_PIPS = 8;

export type HiveTileFacts = {
  health: HiveHealth;
  /** Short time-left label for the tab: "6 days", "4 wk", "Mar", "Overdue", "No date". */
  timeLeft: string;
  scopeDone: number;
  scopeTotal: number;
  /** Milestones when the project has any, otherwise its tasks. */
  scopeKind: 'milestones' | 'tasks';
  /** Title of the first executable next action, if there is one. */
  nextAction: string | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function hiveHealth(card: ProjectPulseCard, now: Date = new Date()): HiveHealth {
  if (card.project.status === 'paused') return 'parked';
  if (card.lifecycle === 'stalled') return 'stalled';
  if (card.lifecycle === 'needs_attention' || card.driftKind === 'warn') return 'slipping';
  // Same signal the forecast uses: an open milestone past its due date.
  const today = startOfDay(now).getTime();
  const overdue = projectMilestones(card.project).some((milestone) => {
    const due = milestone.status === 'open' ? parseDue(milestone.due_date) : null;
    return due !== null && startOfDay(due).getTime() < today;
  });
  return overdue ? 'slipping' : 'on_track';
}

export function hiveTimeLeft(card: ProjectPulseCard, now: Date): string {
  const project = card.project;
  if (project.status === 'paused') return 'Paused';
  const end =
    parseDue(project.current_end_date) ??
    parseDue(project.baseline_end_date) ??
    parseDue(project.submission_date ?? null);
  if (!end) return 'No date';
  const days = Math.round((startOfDay(end).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 14) return `${days} days`;
  if (days <= 84) return `${Math.round(days / 7)} wk`;
  return end.getFullYear() === now.getFullYear()
    ? MONTHS[end.getMonth()]!
    : `${MONTHS[end.getMonth()]} ${String(end.getFullYear()).slice(2)}`;
}

export function hiveTileFacts(card: ProjectPulseCard, tasks: Task[], now: Date): HiveTileFacts {
  const milestones = projectMilestones(card.project);
  const byMilestone = milestones.length > 0;
  const live = !isProjectArchived(card.project.status) && card.project.status !== 'paused';
  const nextId = live ? inspectProjectHealth(card.project, tasks).executable_next_actions[0] : undefined;
  return {
    health: hiveHealth(card, now),
    timeLeft: hiveTimeLeft(card, now),
    scopeDone: byMilestone
      ? milestones.filter((milestone) => milestone.status === 'done').length
      : card.doneTaskCount,
    scopeTotal: byMilestone ? milestones.length : card.doneTaskCount + card.openTaskCount,
    scopeKind: byMilestone ? 'milestones' : 'tasks',
    nextAction: nextId ? (tasks.find((task) => task.id === nextId)?.title ?? null) : null
  };
}

export type HiveTile = {
  id: string;
  group: string;
  groupIndex: number;
  /** Centre of the hexagon, in hive pixels. */
  x: number;
  y: number;
};

export type HiveLabel = {
  id: string;
  title: string;
  count: number;
  groupIndex: number;
  x: number;
  y: number;
};

export type HiveLayout = {
  size: number;
  width: number;
  height: number;
  tiles: HiveTile[];
  labels: HiveLabel[];
};

const LABEL_H = 30;
const GAP_X = 36;
const GAP_Y = 28;
const MIN_CLUSTER_W = 150;

/** Phones get smaller hexagons so a two-ring cluster still fits the width. */
export function hiveSize(width: number): number {
  return width < 520 ? 42 : 52;
}

function soonestFirst(a: ProjectPulseCard, b: ProjectPulseCard): number {
  const end = (card: ProjectPulseCard) =>
    card.project.current_end_date ?? card.project.baseline_end_date ?? card.project.submission_date ?? '9999';
  return end(a) < end(b) ? -1 : end(a) > end(b) ? 1 : a.project.title.localeCompare(b.project.title);
}

/**
 * Each group becomes a spiral cluster (soonest deadline in the middle);
 * clusters flow left to right and wrap at `width`, like words in a line.
 */
export function layoutHive(groups: PulseGroup[], width: number, size = hiveSize(width)): HiveLayout {
  const h = SQRT3 * size;
  const tiles: HiveTile[] = [];
  const labels: HiveLabel[] = [];
  let cursor = 0;
  let rowY = 0;
  let rowH = 0;
  groups.forEach((group, groupIndex) => {
    const cards = [...group.cards].sort(soonestFirst);
    const centres = spiralCells(cards.length).map((cell) => axialToPixel(cell, size));
    const minX = Math.min(...centres.map((p) => p.x)) - size;
    const maxX = Math.max(...centres.map((p) => p.x)) + size;
    const minY = Math.min(...centres.map((p) => p.y)) - h / 2;
    const maxY = Math.max(...centres.map((p) => p.y)) + h / 2;
    const clusterW = Math.max(maxX - minX, MIN_CLUSTER_W);
    if (cursor > 0 && cursor + clusterW > width) {
      cursor = 0;
      rowY += rowH + GAP_Y;
      rowH = 0;
    }
    labels.push({ id: group.id, title: group.title, count: cards.length, groupIndex, x: cursor, y: rowY });
    cards.forEach((card, index) => {
      tiles.push({
        id: card.project.id,
        group: group.id,
        groupIndex,
        x: cursor - minX + centres[index]!.x,
        y: rowY + LABEL_H - minY + centres[index]!.y
      });
    });
    cursor += clusterW + GAP_X;
    rowH = Math.max(rowH, LABEL_H + (maxY - minY));
  });
  return { size, width, height: Math.ceil(rowY + rowH), tiles, labels };
}

/** Corners of a drawn hexagon centred on the origin, a little inside its cell so tiles keep a gap. */
export function hiveTileCorners(size: number): Pt[] {
  return hexCorners({ x: 0, y: 0 }, size - 2.5);
}

/** Split a title into at most `maxLines` lines of about `maxChars`, ellipsing the last. */
export function wrapHiveTitle(title: string, maxChars: number, maxLines = 2): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const used = lines.join(' ').length;
  if (used < title.trim().length) {
    const last = lines[lines.length - 1] ?? '';
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }
  return lines.map((item) => (item.length > maxChars + 1 ? `${item.slice(0, maxChars - 1)}…` : item));
}
