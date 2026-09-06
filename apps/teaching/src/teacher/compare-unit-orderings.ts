import type { TimelineItem } from '@/schemas';

export type SequencePlacement = {
  unit_id: string;
  start_week: number;
  end_week: number;
};

export type SequenceUnit = {
  id: string;
  title: string;
  outcome_ids?: string[];
};

export type SequenceLesson = {
  id: string;
  unit_id: string;
  outcome_ids?: string[];
};

export type SequenceOutcome = {
  id: string;
  code: string;
};

export type SequenceOrderDiff = {
  unit_id: string;
  title: string;
  currentIndex: number;
  proposedIndex: number;
};

export type SequenceCollision = {
  unit_id: string;
  other_unit_id: string;
  start_week: number;
  end_week: number;
};

export type SequenceOutcomeTiming = {
  outcome_id: string;
  code: string;
  currentWeek: number | null;
  proposedWeek: number | null;
};

export type SequenceCompareReport = {
  sameOrder: boolean;
  orderDiffs: SequenceOrderDiff[];
  collisions: { current: SequenceCollision[]; proposed: SequenceCollision[] };
  peakLoad: { current: number; proposed: number };
  outcomeTiming: SequenceOutcomeTiming[];
  missingFromProposed: Array<{ unit_id: string; title: string }>;
  extraInProposed: Array<{ unit_id: string; title: string }>;
};

function durationWeeks(placement: SequencePlacement): number {
  return Math.max(1, placement.end_week - placement.start_week + 1);
}

function titleFor(units: SequenceUnit[], unitId: string): string {
  return units.find((unit) => unit.id === unitId)?.title ?? 'Unknown unit';
}

function idsOf(placements: SequencePlacement[]): string[] {
  return placements.map((placement) => placement.unit_id);
}

function unitOutcomes(
  unitId: string,
  units: SequenceUnit[],
  lessons: SequenceLesson[]
): Set<string> {
  const ids = new Set<string>();
  const unit = units.find((entry) => entry.id === unitId);
  for (const id of unit?.outcome_ids ?? []) ids.add(id);
  for (const lesson of lessons) {
    if (lesson.unit_id !== unitId) continue;
    for (const id of lesson.outcome_ids ?? []) ids.add(id);
  }
  return ids;
}

function firstCoverageWeek(
  placements: SequencePlacement[],
  units: SequenceUnit[],
  lessons: SequenceLesson[],
  outcomeId: string
): number | null {
  let earliest: number | null = null;
  for (const placement of placements) {
    if (!unitOutcomes(placement.unit_id, units, lessons).has(outcomeId)) continue;
    if (earliest === null || placement.start_week < earliest) {
      earliest = placement.start_week;
    }
  }
  return earliest;
}

function collisionsIn(placements: SequencePlacement[]): SequenceCollision[] {
  const collisions: SequenceCollision[] = [];
  for (let i = 0; i < placements.length; i += 1) {
    const left = placements[i]!;
    for (let j = i + 1; j < placements.length; j += 1) {
      const right = placements[j]!;
      const start = Math.max(left.start_week, right.start_week);
      const end = Math.min(left.end_week, right.end_week);
      if (start <= end) {
        collisions.push({
          unit_id: left.unit_id,
          other_unit_id: right.unit_id,
          start_week: start,
          end_week: end
        });
      }
    }
  }
  return collisions;
}

function peakLoad(placements: SequencePlacement[]): number {
  if (placements.length === 0) return 0;
  const start = Math.min(...placements.map((item) => item.start_week));
  const end = Math.max(...placements.map((item) => item.end_week));
  let peak = 0;
  for (let week = start; week <= end; week += 1) {
    const load = placements.filter(
      (item) => item.start_week <= week && week <= item.end_week
    ).length;
    if (load > peak) peak = load;
  }
  return peak;
}

export function unitPlacementsFromTimeline(items: TimelineItem[]): SequencePlacement[] {
  return items
    .filter((item): item is Extract<TimelineItem, { kind: 'unit' }> => item.kind === 'unit')
    .slice()
    .sort((a, b) => a.start_week - b.start_week || a.order - b.order)
    .map((item) => ({
      unit_id: item.unit_id,
      start_week: item.start_week,
      end_week: item.end_week
    }));
}

export function applyUnitOrder(
  current: SequencePlacement[],
  proposedIds: string[],
  weekCount: number
): SequencePlacement[] {
  const byId = new Map(current.map((item) => [item.unit_id, item]));
  const limit = Math.max(1, weekCount);
  const proposed: SequencePlacement[] = [];
  let week = 1;
  for (const unitId of proposedIds) {
    const existing = byId.get(unitId);
    if (!existing) continue;
    const span = durationWeeks(existing);
    const start_week = Math.min(week, limit);
    const end_week = Math.min(limit, start_week + span - 1);
    proposed.push({ unit_id: unitId, start_week, end_week });
    week = end_week + 1;
  }
  return proposed;
}

export function moveUnitInOrder(
  ids: string[],
  unitId: string,
  direction: 'up' | 'down'
): string[] {
  const next = [...ids];
  const index = next.indexOf(unitId);
  if (index < 0) return next;
  const swap = direction === 'up' ? index - 1 : index + 1;
  if (swap < 0 || swap >= next.length) return next;
  const current = next[index]!;
  next[index] = next[swap]!;
  next[swap] = current;
  return next;
}

export function applyPlacementsToTimeline(
  items: TimelineItem[],
  placements: SequencePlacement[],
  datesFor: (startWeek: number, endWeek: number) => { start_date: string; end_date: string }
): TimelineItem[] {
  const byUnit = new Map(placements.map((item) => [item.unit_id, item]));
  const next = items.map((item) => {
    if (item.kind !== 'unit') return { ...item };
    const placement = byUnit.get(item.unit_id);
    if (!placement) return { ...item };
    return {
      ...item,
      start_week: placement.start_week,
      end_week: placement.end_week,
      ...datesFor(placement.start_week, placement.end_week)
    };
  });
  return next
    .slice()
    .sort((a, b) => a.start_week - b.start_week || a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

export function compareUnitOrderings(input: {
  current: SequencePlacement[];
  proposed: SequencePlacement[];
  units: SequenceUnit[];
  lessons: SequenceLesson[];
  outcomes: SequenceOutcome[];
}): SequenceCompareReport {
  const currentIds = idsOf(input.current);
  const proposedIds = idsOf(input.proposed);
  const currentIndex = new Map(currentIds.map((id, index) => [id, index]));
  const proposedIndex = new Map(proposedIds.map((id, index) => [id, index]));

  const sameOrder =
    currentIds.length === proposedIds.length &&
    currentIds.every((id, index) => id === proposedIds[index]);

  const orderDiffs: SequenceOrderDiff[] = [];
  for (const unitId of currentIds) {
    const from = currentIndex.get(unitId);
    const to = proposedIndex.get(unitId);
    if (from == null || to == null || from === to) continue;
    orderDiffs.push({
      unit_id: unitId,
      title: titleFor(input.units, unitId),
      currentIndex: from,
      proposedIndex: to
    });
  }

  const currentSet = new Set(currentIds);
  const proposedSet = new Set(proposedIds);
  const missingFromProposed = currentIds
    .filter((id) => !proposedSet.has(id))
    .map((unit_id) => ({ unit_id, title: titleFor(input.units, unit_id) }));
  const extraInProposed = proposedIds
    .filter((id) => !currentSet.has(id))
    .map((unit_id) => ({ unit_id, title: titleFor(input.units, unit_id) }));

  const covered = new Set<string>();
  for (const placement of [...input.current, ...input.proposed]) {
    for (const id of unitOutcomes(placement.unit_id, input.units, input.lessons)) {
      covered.add(id);
    }
  }

  const outcomeTiming = input.outcomes
    .filter((outcome) => covered.has(outcome.id))
    .map((outcome) => ({
      outcome_id: outcome.id,
      code: outcome.code,
      currentWeek: firstCoverageWeek(input.current, input.units, input.lessons, outcome.id),
      proposedWeek: firstCoverageWeek(input.proposed, input.units, input.lessons, outcome.id)
    }));

  return {
    sameOrder,
    orderDiffs,
    collisions: {
      current: collisionsIn(input.current),
      proposed: collisionsIn(input.proposed)
    },
    peakLoad: {
      current: peakLoad(input.current),
      proposed: peakLoad(input.proposed)
    },
    outcomeTiming,
    missingFromProposed,
    extraInProposed
  };
}
