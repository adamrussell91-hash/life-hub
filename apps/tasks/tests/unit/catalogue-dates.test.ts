import { describe, expect, it } from 'vitest';
import { extractCatalogueDates } from '@/domain/catalogue-dates';
import { catalogPrograms } from '@/domain/programs-seed';

describe('catalogue date extraction', () => {
  it('uses the held dates when a close date is also written', () => {
    expect(
      extractCatalogueDates({
        registration_window: 'Closes 21 November 2026. Held 5 to 6 December 2026.',
        month: 'December'
      })
    ).toEqual({ starts_on: '2026-12-05', ends_on: '2026-12-06' });
    expect(
      extractCatalogueDates({
        registration_window: 'Closed for 2026 (closed 21 March 2026). Was held 4 to 5 April 2026. Recurs annually.',
        month: 'April'
      })
    ).toEqual({ starts_on: '2026-04-04', ends_on: '2026-04-05' });
  });

  it('prefers when it is sat over the registration close', () => {
    expect(
      extractCatalogueDates({
        registration_window: 'Entries usually close early September; sat mid-September',
        month: 'September'
      })
    ).toEqual({ starts_on: '2026-09-15', ends_on: '2026-09-15' });
  });

  it('spans the stated rounds, including a month named only as the final', () => {
    expect(
      extractCatalogueDates({
        registration_window: 'Rounds run late July to mid-August',
        month: 'July'
      })
    ).toEqual({ starts_on: '2026-07-24', ends_on: '2026-08-15' });
    expect(
      extractCatalogueDates({
        registration_window: 'Heats June–July; state finals August',
        month: 'August'
      })
    ).toEqual({ starts_on: '2026-06-01', ends_on: '2026-08-31' });
    expect(
      extractCatalogueDates({
        registration_window: 'Preliminary rounds run May to July',
        month: 'May'
      })
    ).toEqual({ starts_on: '2026-05-01', ends_on: '2026-07-31' });
  });

  it('keeps an open-and-close window and a deadline pair', () => {
    expect(
      extractCatalogueDates({
        registration_window: 'Entries usually open March, close late June',
        month: 'March'
      })
    ).toEqual({ starts_on: '2026-03-01', ends_on: '2026-06-24' });
    expect(
      extractCatalogueDates({
        registration_window: 'Closes 31 July 2026. Final project submission 31 August 2026.',
        month: 'August'
      })
    ).toEqual({ starts_on: '2026-07-31', ends_on: '2026-08-31' });
    expect(
      extractCatalogueDates({
        registration_window: 'Entries usually due mid-to-late December',
        month: 'December'
      })
    ).toEqual({ starts_on: '2026-12-15', ends_on: '2026-12-24' });
  });

  it('places a New Year window so it covers the entry month in 2026', () => {
    expect(
      extractCatalogueDates({
        registration_window: 'Usually 1 November – 10 February',
        month: 'January'
      })
    ).toEqual({ starts_on: '2025-11-01', ends_on: '2026-02-10' });
  });

  it('leaves a bare month and TBA undated', () => {
    expect(extractCatalogueDates({ registration_window: 'TBA', month: 'TBA' })).toBeNull();
    expect(
      extractCatalogueDates({ registration_window: 'Register before the May sitting', month: 'May' })
    ).toBeNull();
    expect(
      extractCatalogueDates({ registration_window: 'By invitation, based on prior AMT results', month: 'August' })
    ).toBeNull();
  });

  it('uses a held date in the description ahead of the registration spans', () => {
    expect(
      extractCatalogueDates({
        registration_window:
          'Chairs: 1 Apr to 5 Jul 2026. Delegates: 5 Apr to 12 Jul 2026. Observers: 14 Aug 2025 to 11 Jul 2026.',
        description: 'Online innovation forum, held 11 to 12 July 2026 with around 500 delegates.',
        month: 'July'
      })
    ).toEqual({ starts_on: '2026-07-11', ends_on: '2026-07-12' });
  });
});

describe('catalogue fixture dates', () => {
  it('stores a date only when the entry text states one', () => {
    const programs = catalogPrograms();
    let filled = 0;
    for (const program of programs) {
      const dates = extractCatalogueDates(program);
      if (dates) {
        filled += 1;
        expect(program.starts_on).toBe(dates.starts_on);
        expect(program.ends_on).toBe(dates.ends_on);
        expect(program.ends_on! >= program.starts_on!).toBe(true);
      } else {
        expect(program.starts_on).toBeNull();
        expect(program.ends_on).toBeNull();
      }
    }
    expect(filled).toBe(123);
    const econthon = programs.find((item) => item.name.includes('Econthon'));
    expect(econthon).toMatchObject({ starts_on: '2026-11-21', ends_on: '2026-11-22' });
    const abbm = programs.find((item) => item.id.startsWith('prog_abbmun'));
    expect(abbm).toMatchObject({ starts_on: '2026-03-15', ends_on: '2026-03-15' });
  });
});
