/**
 * Calendar-aware schedule composition.
 * Hard constraints first; soft preferences second.
 * Never mutates due_date. Never compresses past capacity.
 */

export type TimedSpan = {
  start: number; // minutes from midnight
  end: number;
  title?: string;
  kind?: 'lesson' | 'event' | 'work_block' | 'protected' | 'locked';
};

export type ScheduleTaskInput = {
  id: string;
  title: string;
  estimated_duration?: number | null;
  depth?: 'deep' | 'shallow' | 'admin' | null;
  cognitive_load?: 'low' | 'medium' | 'high' | null;
  priority?: string | null;
  due_date?: string | null;
  target_date?: string | null;
  depends_on?: string[];
  blocked?: boolean;
};

export type ProposedBlock = {
  temp_id: string;
  task_id: string;
  title: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  depth: 'deep' | 'shallow' | 'admin';
  selected: boolean;
};

export type UnscheduledItem = {
  task_id: string;
  title: string;
  reason: string;
};

export type ScheduleComposeResult = {
  status: 'fully_scheduled' | 'partially_scheduled' | 'impossible' | 'missing_info';
  date: string;
  proposed: ProposedBlock[];
  unscheduled: UnscheduledItem[];
  free_windows: Array<{ start: string; end: string; minutes: number }>;
  workday: { start: string; end: string; source: string };
  collisions: string[];
};

function minutesOf(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(a: TimedSpan, b: TimedSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

function freeSlots(
  bounds: { start: number; end: number },
  busy: TimedSpan[],
  minMinutes = 15
): Array<{ start: number; end: number }> {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = bounds.start;
  for (const span of sorted) {
    if (span.end <= bounds.start || span.start >= bounds.end) continue;
    const start = Math.max(span.start, bounds.start);
    const end = Math.min(span.end, bounds.end);
    if (start > cursor && start - cursor >= minMinutes) {
      gaps.push({ start: cursor, end: start });
    }
    cursor = Math.max(cursor, end);
  }
  if (bounds.end - cursor >= minMinutes) gaps.push({ start: cursor, end: bounds.end });
  return gaps;
}

function firstFit(
  gaps: Array<{ start: number; end: number }>,
  minutes: number,
  preferDeep: boolean
): { start: number; end: number } | null {
  const ordered = preferDeep
    ? [...gaps].sort((a, b) => b.end - b.start - (a.end - a.start))
    : gaps;
  for (const gap of ordered) {
    if (gap.end - gap.start >= minutes) {
      return { start: gap.start, end: gap.start + minutes };
    }
  }
  return null;
}

export const FALLBACK_WORKDAY = {
  start: '08:00',
  end: '16:30',
  source: 'fallback'
} as const;

export function composeDaySchedule(input: {
  date: string;
  tasks: ScheduleTaskInput[];
  lessons?: TimedSpan[];
  events?: TimedSpan[];
  confirmed_blocks?: TimedSpan[];
  protected_windows?: TimedSpan[];
  workday?: { start: string; end: string; source?: string } | null;
  energy?: 'low' | 'medium' | 'high' | null;
}): ScheduleComposeResult {
  const workday = input.workday?.start && input.workday?.end
    ? {
        start: input.workday.start,
        end: input.workday.end,
        source: input.workday.source || 'profile'
      }
    : { ...FALLBACK_WORKDAY };

  const bounds = {
    start: minutesOf(workday.start) ?? 8 * 60,
    end: minutesOf(workday.end) ?? 16 * 60 + 30
  };

  const hardBusy: TimedSpan[] = [
    ...(input.lessons ?? []),
    ...(input.events ?? []),
    ...(input.confirmed_blocks ?? []),
    ...(input.protected_windows ?? [])
  ];

  const collisions: string[] = [];
  for (let i = 0; i < hardBusy.length; i++) {
    for (let j = i + 1; j < hardBusy.length; j++) {
      if (overlaps(hardBusy[i]!, hardBusy[j]!)) {
        collisions.push(
          `${hardBusy[i]!.title ?? 'block'} overlaps ${hardBusy[j]!.title ?? 'block'}`
        );
      }
    }
  }

  const proposed: ProposedBlock[] = [];
  const unscheduled: UnscheduledItem[] = [];
  const plannedSpans: TimedSpan[] = [];
  const doneIds = new Set<string>();

  const sorted = [...input.tasks].sort((a, b) => {
    const depthScore = (d: string | null | undefined) =>
      d === 'deep' ? 0 : d === 'shallow' ? 1 : 2;
    if (a.due_date !== b.due_date) {
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
    }
    return depthScore(a.depth) - depthScore(b.depth);
  });

  for (const task of sorted) {
    if (task.blocked) {
      unscheduled.push({ task_id: task.id, title: task.title, reason: 'Blocked' });
      continue;
    }
    const deps = task.depends_on ?? [];
    if (deps.some((id) => !doneIds.has(id) && sorted.some((t) => t.id === id))) {
      // Dependency among this batch not yet placed — still try later pass; for now defer.
      const unmet = deps.filter((id) => sorted.some((t) => t.id === id) && !doneIds.has(id));
      if (unmet.length) {
        unscheduled.push({
          task_id: task.id,
          title: task.title,
          reason: `Depends on ${unmet.join(', ')}`
        });
        continue;
      }
    }

    const known = Number(task.estimated_duration);
    if (!Number.isFinite(known) || known <= 0) {
      unscheduled.push({
        task_id: task.id,
        title: task.title,
        reason: 'Missing required duration estimate'
      });
      continue;
    }
    const minutes = Math.max(15, Math.round(known));
    const depth = task.depth ?? 'shallow';
    const preferDeep = depth === 'deep' && input.energy !== 'low';
    const busy = [...hardBusy, ...plannedSpans];
    const gaps = freeSlots(bounds, busy);
    const slot = firstFit(gaps, minutes, preferDeep);
    if (!slot) {
      unscheduled.push({
        task_id: task.id,
        title: task.title,
        reason: 'No free window under hard constraints'
      });
      continue;
    }
    const block: ProposedBlock = {
      temp_id: `ghost_${task.id}_${formatMinutes(slot.start)}`,
      task_id: task.id,
      title: task.title,
      date: input.date,
      start_time: formatMinutes(slot.start),
      duration_minutes: minutes,
      depth,
      selected: true
    };
    proposed.push(block);
    plannedSpans.push({ start: slot.start, end: slot.end, title: task.title, kind: 'work_block' });
    doneIds.add(task.id);
  }

  // Remove dependency-deferred items that became schedulable — second pass
  const stillUnsched: UnscheduledItem[] = [];
  for (const item of unscheduled) {
    if (!item.reason.startsWith('Depends on')) {
      stillUnsched.push(item);
      continue;
    }
    const task = sorted.find((t) => t.id === item.task_id);
    if (!task) {
      stillUnsched.push(item);
      continue;
    }
    const deps = task.depends_on ?? [];
    if (deps.some((id) => sorted.some((t) => t.id === id) && !doneIds.has(id))) {
      stillUnsched.push(item);
      continue;
    }
    const known = Number(task.estimated_duration);
    const minutes = Math.max(15, Math.round(known));
    const gaps = freeSlots(bounds, [...hardBusy, ...plannedSpans]);
    const slot = firstFit(gaps, minutes, task.depth === 'deep');
    if (!slot) {
      stillUnsched.push({ ...item, reason: 'No free window under hard constraints' });
      continue;
    }
    proposed.push({
      temp_id: `ghost_${task.id}_${formatMinutes(slot.start)}`,
      task_id: task.id,
      title: task.title,
      date: input.date,
      start_time: formatMinutes(slot.start),
      duration_minutes: minutes,
      depth: task.depth ?? 'shallow',
      selected: true
    });
    plannedSpans.push({ start: slot.start, end: slot.end, title: task.title, kind: 'work_block' });
    doneIds.add(task.id);
  }

  const finalGaps = freeSlots(bounds, [...hardBusy, ...plannedSpans]);
  let status: ScheduleComposeResult['status'] = 'fully_scheduled';
  if (!proposed.length && stillUnsched.length) {
    status = stillUnsched.every((u) => u.reason.includes('Missing'))
      ? 'missing_info'
      : 'impossible';
  } else if (stillUnsched.length) {
    status = 'partially_scheduled';
  }

  return {
    status,
    date: input.date,
    proposed,
    unscheduled: stillUnsched,
    free_windows: finalGaps.map((g) => ({
      start: formatMinutes(g.start),
      end: formatMinutes(g.end),
      minutes: g.end - g.start
    })),
    workday,
    collisions
  };
}

/** Validate a proposed ghost set against current hard busy — used before Confirm. */
export function validateProposedBlocks(
  proposed: ProposedBlock[],
  hardBusy: TimedSpan[],
  workday = FALLBACK_WORKDAY
): { ok: boolean; conflicts: Array<{ temp_id: string; reason: string }> } {
  const bounds = {
    start: minutesOf(workday.start) ?? 8 * 60,
    end: minutesOf(workday.end) ?? 16 * 60 + 30
  };
  const conflicts: Array<{ temp_id: string; reason: string }> = [];
  const accepted: TimedSpan[] = [];
  for (const block of proposed) {
    if (!block.selected) continue;
    const start = minutesOf(block.start_time);
    if (start == null) {
      conflicts.push({ temp_id: block.temp_id, reason: 'Invalid start time' });
      continue;
    }
    const span: TimedSpan = {
      start,
      end: start + block.duration_minutes,
      title: block.title,
      kind: 'work_block'
    };
    if (span.start < bounds.start || span.end > bounds.end) {
      conflicts.push({ temp_id: block.temp_id, reason: 'Outside work boundaries' });
      continue;
    }
    const hit = [...hardBusy, ...accepted].find((b) => overlaps(b, span));
    if (hit) {
      conflicts.push({
        temp_id: block.temp_id,
        reason: `Collides with ${hit.title ?? hit.kind ?? 'busy time'}`
      });
      continue;
    }
    accepted.push(span);
  }
  return { ok: conflicts.length === 0, conflicts };
}
