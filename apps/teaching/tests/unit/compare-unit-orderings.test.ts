import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '@/schemas';
import {
  applyPlacementsToTimeline,
  applyUnitOrder,
  compareUnitOrderings,
  type SequenceLesson,
  type SequencePlacement,
  type SequenceUnit
} from '@/teacher/compare-unit-orderings';

const units: SequenceUnit[] = [
  { id: 'u1', title: 'Number', outcome_ids: ['o1'] },
  { id: 'u2', title: 'Algebra', outcome_ids: ['o2'] },
  { id: 'u3', title: 'Geometry', outcome_ids: ['o3'] }
];

const lessons: SequenceLesson[] = [
  { id: 'l1', unit_id: 'u1', outcome_ids: ['o1'] },
  { id: 'l2', unit_id: 'u2', outcome_ids: ['o2'] },
  { id: 'l3', unit_id: 'u3', outcome_ids: ['o3'] }
];

function placement(unit_id: string, start_week: number, end_week: number): SequencePlacement {
  return { unit_id, start_week, end_week };
}

describe('applyUnitOrder', () => {
  it('packs proposed unit order sequentially from week 1 and keeps durations', () => {
    const current = [
      placement('u1', 1, 4),
      placement('u2', 5, 8),
      placement('u3', 9, 12)
    ];
    const proposed = applyUnitOrder(current, ['u3', 'u1', 'u2'], 40);
    expect(proposed).toEqual([
      placement('u3', 1, 4),
      placement('u1', 5, 8),
      placement('u2', 9, 12)
    ]);
  });

  it('clamps the last unit to the year week count', () => {
    const current = [placement('u1', 1, 20), placement('u2', 21, 40)];
    const proposed = applyUnitOrder(current, ['u1', 'u2'], 30);
    expect(proposed).toEqual([placement('u1', 1, 20), placement('u2', 21, 30)]);
  });

  it('ignores unknown unit ids and units missing from the current list', () => {
    const current = [placement('u1', 1, 3)];
    expect(applyUnitOrder(current, ['missing', 'u1'], 10)).toEqual([placement('u1', 1, 3)]);
  });
});

describe('compareUnitOrderings', () => {
  const current = [
    placement('u1', 1, 4),
    placement('u2', 5, 8),
    placement('u3', 9, 12)
  ];

  it('reports order diffs and first-coverage week changes after a reorder', () => {
    const proposed = applyUnitOrder(current, ['u3', 'u1', 'u2'], 40);
    const report = compareUnitOrderings({
      current,
      proposed,
      units,
      lessons,
      outcomes: [
        { id: 'o1', code: 'MA1-N' },
        { id: 'o2', code: 'MA1-A' },
        { id: 'o3', code: 'MA1-G' }
      ]
    });

    expect(report.sameOrder).toBe(false);
    expect(report.orderDiffs).toEqual([
      { unit_id: 'u1', title: 'Number', currentIndex: 0, proposedIndex: 1 },
      { unit_id: 'u2', title: 'Algebra', currentIndex: 1, proposedIndex: 2 },
      { unit_id: 'u3', title: 'Geometry', currentIndex: 2, proposedIndex: 0 }
    ]);
    expect(report.outcomeTiming.find((row) => row.outcome_id === 'o3')).toMatchObject({
      code: 'MA1-G',
      currentWeek: 9,
      proposedWeek: 1
    });
    expect(report.collisions.current).toEqual([]);
    expect(report.collisions.proposed).toEqual([]);
    expect(report.peakLoad.current).toBe(1);
    expect(report.peakLoad.proposed).toBe(1);
    expect(report.missingFromProposed).toEqual([]);
    expect(report.extraInProposed).toEqual([]);
  });

  it('flags week overlaps and higher peak load on the proposed draft', () => {
    const proposed = [placement('u1', 1, 6), placement('u2', 4, 8), placement('u3', 9, 12)];
    const report = compareUnitOrderings({
      current,
      proposed,
      units,
      lessons,
      outcomes: []
    });
    expect(report.collisions.proposed).toEqual([
      { unit_id: 'u1', other_unit_id: 'u2', start_week: 4, end_week: 6 }
    ]);
    expect(report.peakLoad.proposed).toBe(2);
    expect(report.peakLoad.current).toBe(1);
  });

  it('lists units dropped from or added to the proposed draft', () => {
    const report = compareUnitOrderings({
      current,
      proposed: [placement('u1', 1, 4), placement('u3', 5, 8)],
      units,
      lessons,
      outcomes: []
    });
    expect(report.missingFromProposed).toEqual([{ unit_id: 'u2', title: 'Algebra' }]);
    expect(report.extraInProposed).toEqual([]);
  });

  it('treats an identical order as sameOrder with no diffs', () => {
    const report = compareUnitOrderings({
      current,
      proposed: current,
      units,
      lessons,
      outcomes: [{ id: 'o1', code: 'MA1-N' }]
    });
    expect(report.sameOrder).toBe(true);
    expect(report.orderDiffs).toEqual([]);
    expect(report.outcomeTiming.every((row) => row.currentWeek === row.proposedWeek)).toBe(true);
  });
});

describe('applyPlacementsToTimeline', () => {
  it('rewrites unit weeks, keeps notes, and reorders by start week', () => {
    const items: TimelineItem[] = [
      {
        id: 'ti_u1',
        kind: 'unit',
        unit_id: 'u1',
        start_week: 1,
        end_week: 4,
        order: 1
      },
      {
        id: 'ti_note',
        kind: 'note',
        title: 'Assessment week',
        start_week: 9,
        end_week: 9,
        order: 2
      },
      {
        id: 'ti_u2',
        kind: 'unit',
        unit_id: 'u2',
        start_week: 5,
        end_week: 8,
        order: 3
      }
    ];
    const next = applyPlacementsToTimeline(
      items,
      [placement('u2', 1, 4), placement('u1', 5, 8)],
      (start, end) => ({
        start_date: `2026-01-${String(start).padStart(2, '0')}`,
        end_date: `2026-01-${String(end).padStart(2, '0')}`
      })
    );
    expect(next.map((item) => item.id)).toEqual(['ti_u2', 'ti_u1', 'ti_note']);
    expect(next[0]).toMatchObject({
      kind: 'unit',
      unit_id: 'u2',
      start_week: 1,
      end_week: 4,
      order: 1,
      start_date: '2026-01-01',
      end_date: '2026-01-04'
    });
    expect(next[2]).toMatchObject({
      kind: 'note',
      title: 'Assessment week',
      start_week: 9,
      order: 3
    });
  });
});
