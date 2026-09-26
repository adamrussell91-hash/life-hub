import { describe, expect, it } from 'vitest';
import {
  buildOrganisationModel,
  buildPeopleSteps,
  buildWarmthSpread,
  chipMatchesFilter,
  formatMonthYear,
  orgMonogram
} from '@/domain/organisation-model';
import {
  defaultOrgsQuery,
  parseOrgsQuery,
  serializeOrgsQuery
} from '@/domain/organisations-query';
import { layoutOrganisationTimeline } from '@/domain/organisation-timeline';

describe('organisations-query', () => {
  it('parses and serializes omitting defaults (V2)', () => {
    expect(parseOrgsQuery('')).toEqual(defaultOrgsQuery());
    expect(serializeOrgsQuery(defaultOrgsQuery())).toBe('');
    const q = parseOrgsQuery('?filter=work&sort=az&group=relationship&q=aloysius');
    expect(q).toEqual({
      filter: 'work',
      sort: 'az',
      group: 'relationship',
      q: 'aloysius'
    });
    expect(serializeOrgsQuery(q)).toBe('?filter=work&sort=az&group=relationship&q=aloysius');
  });
});

describe('buildOrganisationModel', () => {
  it('de-duplicates people and agrees tile/header counts (V4)', () => {
    const model = buildOrganisationModel({
      id: 'organisation_00000000-0000-4000-8000-000000000002',
      ref: 'shared:organisation:organisation_00000000-0000-4000-8000-000000000002',
      displayName: 'St. Aloysius College',
      chips: [
        { kind: 'workplace', label: 'Workplace', detail: '2025–now', filterBucket: 'work' },
        { kind: 'event_venue', label: 'Event venue', detail: '4 events', filterBucket: 'events' }
      ],
      people: [
        { id: 'adam', warmthBand: 'warm', firstLinkAt: '2021-01-01T00:00:00.000Z' },
        { id: 'adam', warmthBand: 'cooling', firstLinkAt: '2022-06-01T00:00:00.000Z' },
        { id: 'henry', warmthBand: 'cold', firstLinkAt: '2020-03-01T00:00:00.000Z' }
      ]
    });
    expect(model.peopleCount).toBe(2);
    expect(model.peopleIds).toEqual(['adam', 'henry']);
    expect(model.warmthSpread).toEqual({ warm: 1, cooling: 0, cold: 1, total: 2 });
    expect(model.isCurrentWorkplace).toBe(true);
    expect(chipMatchesFilter(model.chips, 'work')).toBe(true);
    expect(chipMatchesFilter(model.chips, 'study')).toBe(false);
    expect(orgMonogram('St. Aloysius College')).toBe('SAC');
  });

  it('builds people steps from first-link dates', () => {
    const steps = buildPeopleSteps([
      { id: 'b', firstLinkAt: '2022-01-01T00:00:00.000Z' },
      { id: 'a', firstLinkAt: '2021-01-01T00:00:00.000Z' },
      { id: 'a', firstLinkAt: '2020-01-01T00:00:00.000Z' }
    ]);
    expect(steps.map((s) => s.personId)).toEqual(['a', 'b']);
    expect(steps.map((s) => s.count)).toEqual([1, 2]);
  });

  it('formats month-only dates as Oct 2026 (D1)', () => {
    expect(formatMonthYear('2026-10-01T00:00:00.000Z')).toBe('Oct 2026');
  });

  it('builds warmth spread', () => {
    expect(
      buildWarmthSpread([
        { warmthBand: 'warm' },
        { warmthBand: 'warm' },
        { warmthBand: 'cold' }
      ])
    ).toEqual({ warm: 2, cooling: 0, cold: 1, total: 3 });
  });
});

describe('organisation-timeline', () => {
  it('uses rows × 32 + 24 axis height (C3)', () => {
    const layout = layoutOrganisationTimeline({
      lanes: [
        {
          id: '1',
          kind: 'work_study',
          label: 'English',
          start: '2021-01-01T00:00:00.000Z',
          end: null
        }
      ],
      peopleSteps: [{ at: '2021-01-01T00:00:00.000Z', count: 1, personId: 'a' }],
      domainStart: '2019-01-01T00:00:00.000Z',
      domainEnd: '2026-09-26T00:00:00.000Z'
    });
    expect(layout.height).toBe(3 * 32 + 24);
    expect(layout.peoplePath.startsWith('M')).toBe(true);
  });
});
