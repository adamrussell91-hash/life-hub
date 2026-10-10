import { describe, expect, it } from 'vitest';
import { journalPatternOff, parseRoute, journalRoute } from '@/app/router';

describe('journal routes', () => {
  it('parses #/trip/:tripId/journal', () => {
    expect(parseRoute('#/trip/trp_abc/journal')).toEqual({
      name: 'journal',
      tripId: 'trp_abc'
    });
  });

  it('parses optional moment id', () => {
    expect(parseRoute('#/trip/trp_abc/journal/mom_1')).toEqual({
      name: 'journal',
      tripId: 'trp_abc',
      momentId: 'mom_1'
    });
  });

  it('builds journal hashes', () => {
    expect(journalRoute('trp_1')).toBe('#/trip/trp_1/journal');
    expect(journalRoute('trp_1', 'mom_9')).toBe('#/trip/trp_1/journal/mom_9');
  });

  it('does not break existing city/date trip routes', () => {
    expect(parseRoute('#/trip/trp_abc/lis/2027-03-04')).toEqual({
      name: 'trip',
      tripId: 'trp_abc',
      cityId: 'lis',
      date: '2027-03-04'
    });
  });

  it('reads patternOff from search or hash query', () => {
    expect(
      journalPatternOff({ search: '?patternOff=1', hash: '#/trip/trp_1/journal' }),
    ).toBe(true);
    expect(
      journalPatternOff({ search: '', hash: '#/trip/trp_1/journal?patternOff=1' }),
    ).toBe(true);
    expect(journalPatternOff({ search: '', hash: '#/trip/trp_1/journal' })).toBe(false);
  });
});
