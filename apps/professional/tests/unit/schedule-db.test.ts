import { describe, expect, it } from 'vitest';
import {
  parseScheduleDbQuery,
  serializeScheduleDbQuery,
  defaultScheduleDbQuery,
  activeScheduleFilterCount
} from '@/domain/schedule-db-query';
import { __scheduleDbTest } from '@/components/schedule-db-page';

describe('schedule-db-query', () => {
  it('round-trips non-default query params', () => {
    const state = {
      filter: 'email',
      sort: 'az' as const,
      group: 'channel' as const,
      q: 'seth'
    };
    const qs = serializeScheduleDbQuery(state);
    expect(qs).toBe('?filter=email&sort=az&group=channel&q=seth');
    expect(parseScheduleDbQuery(qs, 'comms')).toEqual(state);
  });

  it('omits defaults from the hash', () => {
    expect(serializeScheduleDbQuery(defaultScheduleDbQuery())).toBe('');
    expect(activeScheduleFilterCount(defaultScheduleDbQuery())).toBe(0);
  });
});

describe('schedule-db row helpers', () => {
  const rows = [
    {
      id: '1',
      title: 'Beta',
      href: '#/a',
      when: '2026-09-02T00:00:00.000Z',
      meta: ['outbound'],
      filterTokens: ['outbound', 'email'],
      facetKey: 'email',
      facetLabel: 'email'
    },
    {
      id: '2',
      title: 'Alpha',
      href: '#/b',
      when: '2026-09-10T00:00:00.000Z',
      meta: ['inbound'],
      filterTokens: ['inbound', 'phone'],
      facetKey: 'phone',
      facetLabel: 'phone'
    }
  ];

  it('filters, sorts and groups without inventing people-row chrome', () => {
    const filtered = rows.filter((r) => __scheduleDbTest.matchesFilter(r, 'email'));
    expect(filtered.map((r) => r.id)).toEqual(['1']);
    const az = __scheduleDbTest.sortRows(rows, 'az');
    expect(az.map((r) => r.title)).toEqual(['Alpha', 'Beta']);
    const grouped = __scheduleDbTest.groupRows(rows, 'channel');
    expect(grouped).toHaveLength(2);
  });
});
