import { describe, expect, it } from 'vitest';
import { buildWeekLoad, learningTermRhythm, termRhythmFactor, type TermWeekSample } from '@/domain/term-rhythm';

const history: TermWeekSample[] = [
  { termKey: '2026-3', weekIndex: 0, minutes: 100 },
  { termKey: '2026-3', weekIndex: 1, minutes: 300 },
  { termKey: '2026-4', weekIndex: 0, minutes: 200 },
  { termKey: '2026-4', weekIndex: 1, minutes: 500 }
];

describe('term rhythm', () => {
  it('stays at 1 until two terms of history exist', () => {
    expect(termRhythmFactor(history.slice(0, 2), 0)).toBe(1);
    expect(learningTermRhythm(history.slice(0, 2))).toBe(true);
    expect(learningTermRhythm(history)).toBe(false);
  });

  it('uses the median of week N over the median of every week', () => {
    expect(termRhythmFactor(history, 0)).toBe(150 / 250);
    expect(termRhythmFactor(history, 1)).toBe(400 / 250);
  });

  it('marks a week over when committed minutes pass capacity', () => {
    const weeks = buildWeekLoad({
      today: '2026-10-19',
      rangeEnd: '2026-10-25',
      tasks: [
        { status: 'open', due: '2026-10-20', est: 240, marking: null },
        { status: 'open', due: '2026-10-22', est: 90, marking: null },
        { status: 'open', due: '2026-10-23', est: 240, marking: null },
        { status: 'open', due: '2026-10-23', est: 240, marking: null }
      ],
      capacityOf: (date) => (new Date(`${date}T00:00:00Z`).getUTCDay() === 0 ? 0 : 120),
      wallOn: () => false,
      factorFor: () => 1
    });
    expect(weeks[0]?.over).toBe(true);
    expect(weeks[0]?.capacity).toBe(720);
  });
});
