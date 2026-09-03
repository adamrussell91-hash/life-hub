import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { parseDue, toDateKey } from '@/domain/queries';
import { projectChildTasks } from '@/domain/cards';
import {
  KEY_DATE_DEFS,
  adminTaskKind,
  type KeyDateKind
} from '@/domain/excursion';

export const TIMELINE_PAD_TOP = 28;
export const TIMELINE_PAD_BOTTOM = 48;
export const TIMELINE_MIN_GAP = 96;
export const TIMELINE_PX_PER_DAY = 14;
export const TIMELINE_NODE_R = 14;

export type TimelineKind = 'task' | 'key_date' | 'event';

export type TimelineStop = {
  id: string;
  date: string;
  kind: TimelineKind;
  label: string;
  task: Task | null;
  adminKind: KeyDateKind | null;
};

export type LaidTimelineStop = TimelineStop & {
  y: number;
  gap: number;
};

export type TimelineLayout = {
  stops: LaidTimelineStop[];
  height: number;
};

function dateKey(value: string | null | undefined): string | null {
  const parsed = parseDue(value ?? null);
  return parsed ? toDateKey(parsed) : null;
}

function kindForAdmin(kind: KeyDateKind | null): TimelineKind {
  if (kind === 'event') return 'event';
  if (kind) return 'key_date';
  return 'task';
}

/** Tasks first, then unmatched key dates / event as placeholders — earliest first. */
export function collectExcursionStops(project: Project, tasks: Task[]): TimelineStop[] {
  const children = projectChildTasks(project, tasks);
  const claimed = new Set<KeyDateKind>();
  const stops: TimelineStop[] = children.map((task) => {
    const adminKind = adminTaskKind(task);
    const keyKind = adminKind && adminKind !== 'checklist' ? adminKind : null;
    if (keyKind) claimed.add(keyKind);
    return {
      id: task.id,
      date: dateKey(task.due_date) ?? dateKey(task.created_at) ?? toDateKey(new Date()),
      kind: kindForAdmin(keyKind),
      label: task.title,
      task,
      adminKind: keyKind
    };
  });

  for (const row of KEY_DATE_DEFS) {
    if (claimed.has(row.kind)) continue;
    const date = dateKey(row.read(project) ?? null);
    if (!date) continue;
    stops.push({
      id: `key:${row.kind}:${date}`,
      date,
      kind: kindForAdmin(row.kind),
      label: row.label,
      task: null,
      adminKind: row.kind
    });
  }

  return stops.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.kind === b.kind) return a.label.localeCompare(b.label);
    if (a.kind === 'event') return 1;
    if (b.kind === 'event') return -1;
    if (a.kind === 'task') return -1;
    if (b.kind === 'task') return 1;
    return 0;
  });
}

/** Map dates onto a vertical rail. Gaps grow with days, then a min gap keeps cards clear. */
export function layoutExcursionTimeline(
  stops: TimelineStop[],
  options: {
    padTop?: number;
    padBottom?: number;
    minGap?: number;
    pxPerDay?: number;
  } = {}
): TimelineLayout {
  const padTop = options.padTop ?? TIMELINE_PAD_TOP;
  const padBottom = options.padBottom ?? TIMELINE_PAD_BOTTOM;
  const minGap = options.minGap ?? TIMELINE_MIN_GAP;
  const pxPerDay = options.pxPerDay ?? TIMELINE_PX_PER_DAY;
  if (!stops.length) {
    return { stops: [], height: padTop + padBottom };
  }

  const first = parseDue(stops[0]!.date)?.getTime() ?? 0;
  let prevY = 0;
  const laid: LaidTimelineStop[] = stops.map((stop, index) => {
    const at = parseDue(stop.date)?.getTime() ?? first;
    const ideal = padTop + Math.max(0, (at - first) / 86_400_000) * pxPerDay;
    const y = index === 0 ? ideal : Math.max(ideal, prevY + minGap);
    const gap = index === 0 ? padTop : y - prevY;
    prevY = y;
    return { ...stop, y, gap };
  });

  return {
    stops: laid,
    height: prevY + padBottom
  };
}
