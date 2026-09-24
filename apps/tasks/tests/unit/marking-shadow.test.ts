import { describe, expect, it } from 'vitest';
import {
  bumpScriptsMarked,
  capacityDays,
  markingShadowPaint,
  rateCaption,
  resolveMarkingRate,
  spreadRemaining,
  syncedMarkingFields,
  type Marking
} from '@/domain/marking-shadow';

const marking: Marking = {
  class_label: '10ENG2',
  scripts: 28,
  minutes_per_script: 9,
  collected_on: '2026-10-16',
  return_by: '2026-10-19',
  scripts_marked: 0
};

function windowOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 0 : 120;
}

describe('marking shadows', () => {
  it('prefers an explicit rate, then a learned rate, then the default', () => {
    const sessions = [{ minutes: 90, scriptsMarked: 6 }];
    expect(resolveMarkingRate({ minutesPerScript: 6, sessions, defaultMinutes: 10 })).toMatchObject({
      rate: 6,
      source: 'explicit'
    });
    expect(resolveMarkingRate({ minutesPerScript: null, sessions, defaultMinutes: 10 })).toMatchObject({
      rate: 15,
      source: 'learned',
      sessions: 1
    });
    expect(resolveMarkingRate({ minutesPerScript: null, sessions: [], defaultMinutes: 10 })).toMatchObject({
      rate: 10,
      source: 'default'
    });
    expect(rateCaption({ rate: 10, source: 'default', sessions: 0 })).toBe('starting guess');
    expect(rateCaption({ rate: 10, source: 'learned', sessions: 2 })).toBe('starting guess');
    expect(rateCaption({ rate: 10, source: 'learned', sessions: 3 })).toBe('learned rate');
  });

  it('spreads remaining minutes across capacity days and skips walls', () => {
    const days = capacityDays('2026-10-16', '2026-10-19', (date) => (date === '2026-10-18' ? 0 : windowOf(date)));
    expect(days).toEqual(['2026-10-16', '2026-10-17', '2026-10-19']);
    const spread = spreadRemaining(252, days);
    expect(spread.get('2026-10-16')).toBe(84);
    expect(spread.has('2026-10-18')).toBe(false);
  });

  it('warns when a day needs more than 60 percent of capacity', () => {
    const paint = markingShadowPaint({
      marking,
      rate: 9,
      today: '2026-09-22',
      capacityOf: windowOf
    });
    expect(paint.warn).toBe(true);
    expect(paint.warnText).toBe('needs 84 min a day');
    expect(paint.perDay).toBe(84);

    const quiet = markingShadowPaint({
      marking: {
        class_label: '9B',
        scripts: 28,
        minutes_per_script: 6,
        collected_on: '2026-09-21',
        return_by: '2026-10-02',
        scripts_marked: 18
      },
      rate: 6,
      today: '2026-09-22',
      capacityOf: windowOf
    });
    expect(quiet.label).toBe('9B · 18 of 28 · ~1 h left');
    expect(quiet.warn).toBe(false);
  });

  it('keeps the due date and duration in step with the shadow', () => {
    expect(syncedMarkingFields(marking, 9)).toEqual({ due_date: '2026-10-19', estimated_duration: 252 });
    expect(bumpScriptsMarked(marking, 10).scripts_marked).toBe(10);
  });
});
