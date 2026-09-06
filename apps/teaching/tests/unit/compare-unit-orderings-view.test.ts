import { describe, expect, it } from 'vitest';
import { renderSequenceComparePanel } from '@/teacher/compare-unit-orderings-view';
import type { SequenceCompareReport } from '@/teacher/compare-unit-orderings';

const emptyReport: SequenceCompareReport = {
  sameOrder: true,
  orderDiffs: [],
  collisions: { current: [], proposed: [] },
  peakLoad: { current: 1, proposed: 1 },
  outcomeTiming: [],
  missingFromProposed: [],
  extraInProposed: []
};

describe('renderSequenceComparePanel', () => {
  it('renders current and proposed unit lists plus confirm/discard when the draft differs', () => {
    const html = renderSequenceComparePanel({
      currentTitles: ['Number', 'Algebra'],
      proposed: [
        { unit_id: 'u1', title: 'Algebra' },
        { unit_id: 'u2', title: 'Number' }
      ],
      report: {
        ...emptyReport,
        sameOrder: false,
        peakLoad: { current: 1, proposed: 2 },
        collisions: {
          current: [],
          proposed: [{ unit_id: 'u1', other_unit_id: 'u2', start_week: 4, end_week: 6 }]
        },
        outcomeTiming: [
          { outcome_id: 'o1', code: 'MA1-N', currentWeek: 1, proposedWeek: 5 }
        ]
      }
    });
    expect(html).toContain('Compare order');
    expect(html).toContain('data-sequence-compare-panel');
    expect(html).toContain('data-move-unit="u1"');
    expect(html).toContain('data-confirm-sequence');
    expect(html).toContain('data-discard-sequence');
    expect(html).toContain('confirm-card');
    expect(html).toContain('Peak concurrent units');
    expect(html).toContain('MA1-N');
  });

  it('hides confirm when the proposed order matches current', () => {
    const html = renderSequenceComparePanel({
      currentTitles: ['Number'],
      proposed: [{ unit_id: 'u1', title: 'Number' }],
      report: emptyReport
    });
    expect(html).not.toContain('data-confirm-sequence');
    expect(html).toContain('Same as the live sequence');
  });
});
