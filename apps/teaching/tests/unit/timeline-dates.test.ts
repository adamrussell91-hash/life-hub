import { describe, it, expect } from 'vitest';
import {
  academicYearBounds,
  addDays,
  defaultScopeTerms,
  formatDateRange,
  pxPerDay,
  resolveItemSpan,
  resolveTermSpan,
  weekToDate
} from '@/scope/timeline-dates';

describe('timeline dates', () => {
  it('computes a non-leap academic year as 365 days from 1 Jan', () => {
    expect(academicYearBounds(2026)).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
      days: 365
    });
  });

  it('computes a leap academic year as 366 days', () => {
    expect(academicYearBounds(2024).days).toBe(366);
  });

  it('migrates week indices from term start dates', () => {
    const terms = [
      {
        term_number: 2,
        start_week: 11,
        end_week: 20,
        start_date: '2026-04-27',
        end_date: '2026-07-03'
      }
    ];
    expect(weekToDate(12, terms, 2026)).toBe('2026-05-04');
  });

  it('falls back to 1 Jan + week offset when a term has no dates', () => {
    expect(weekToDate(2, [{ term_number: 1, start_week: 1, end_week: 10 }], 2026)).toBe(
      '2026-01-08'
    );
  });

  it('prefers stored item dates over week migration', () => {
    expect(
      resolveItemSpan(
        { start_week: 1, end_week: 4, start_date: '2026-02-01', end_date: '2026-02-20' },
        [],
        2026
      )
    ).toEqual({ start: '2026-02-01', end: '2026-02-20' });
  });

  it('prefers unit dates when the timeline item has none', () => {
    expect(
      resolveItemSpan({ start_week: 1, end_week: 4 }, [], 2026, {
        start_date: '2026-03-01',
        end_date: '2026-03-20'
      })
    ).toEqual({ start: '2026-03-01', end: '2026-03-20' });
  });

  it('uses stored term dates when present', () => {
    expect(
      resolveTermSpan(
        {
          term_number: 1,
          start_week: 1,
          end_week: 10,
          start_date: '2026-01-28',
          end_date: '2026-04-10'
        },
        2026
      )
    ).toEqual({ start: '2026-01-28', end: '2026-04-10' });
  });

  it('formats a date range as dd/mm/yy', () => {
    expect(formatDateRange('2026-01-28', '2026-04-10')).toBe('28/01/26 – 10/04/26');
    expect(formatDateRange('2026-05-18', '2026-05-18')).toBe('18/05/26');
  });

  it('uses a wider day width at month zoom than year zoom', () => {
    expect(pxPerDay('month')).toBeGreaterThan(pxPerDay('year'));
  });

  it('stamps default terms with calendar dates for an academic year', () => {
    const terms = defaultScopeTerms(40, 2026);
    expect(terms[0]).toMatchObject({
      term_number: 1,
      start_week: 1,
      end_week: 10,
      start_date: '2026-01-28',
      end_date: '2026-04-10'
    });
    expect(terms[3]).toMatchObject({
      start_date: '2026-10-12',
      end_date: '2026-12-18'
    });
  });

  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-01-28', 7)).toBe('2026-02-04');
  });
});
