import { describe, expect, it } from 'vitest';
import {
  currentRoles,
  formatMonthYear,
  formatRange,
  monthYearInput,
  orgMonogram,
  parseMonthYear,
  rolesFromOverview
} from '@/domain/person-roles';
import type { EntityOverview } from '@/domain/types';

function entry(id: string, type: string, org: string, extra: Record<string, unknown> = {}) {
  return {
    link: {
      id, relationship_type: type, status: 'current', temporal_mode: 'period', role: null, context_key: null,
      occurred_at: null, valid_from: null, valid_to: null, source_ref: 'shared:person:p', target_ref: `shared:organisation:${org}`,
      ...extra
    },
    endpoint: { ref: `shared:organisation:${org}`, kind: 'organisation', display_label: org.replace(/_/g, ' ') },
    direction: 'outgoing'
  };
}

describe('person roles dates', () => {
  it('parses year, year-month, m/yyyy and month names; rejects junk', () => {
    expect(parseMonthYear('2016')).toBe('2016-01-01T00:00:00.000Z');
    expect(parseMonthYear('2016-3')).toBe('2016-03-01T00:00:00.000Z');
    expect(parseMonthYear('03/2016')).toBe('2016-03-01T00:00:00.000Z');
    expect(parseMonthYear('March 2016')).toBe('2016-03-01T00:00:00.000Z');
    expect(parseMonthYear(' ')).toBeNull();
    expect(parseMonthYear('2016-13')).toBeUndefined();
    expect(parseMonthYear('soon')).toBeUndefined();
  });

  it('shows 1 January as the year alone and keeps months otherwise', () => {
    expect(formatMonthYear('2016-01-01T00:00:00.000Z')).toBe('2016');
    expect(formatMonthYear('2016-03-01T00:00:00.000Z')).toBe('Mar 2016');
    expect(monthYearInput('2016-03-01T00:00:00.000Z')).toBe('2016-03');
    expect(monthYearInput('2016-01-01T00:00:00.000Z')).toBe('2016');
    expect(monthYearInput(null)).toBe('');
  });

  it('formats ranges, with years only for the timeline', () => {
    const from = '2016-03-01T00:00:00.000Z';
    const to = '2022-07-01T00:00:00.000Z';
    expect(formatRange({ from, to: null, current: true })).toBe('Mar 2016 – now');
    expect(formatRange({ from, to, current: false })).toBe('Mar 2016 – Jul 2022');
    expect(formatRange({ from, to, current: false }, { yearsOnly: true })).toBe('2016 – 2022');
    expect(formatRange({ from: null, to: null, current: true })).toBe('');
    expect(formatRange({ from: '2020-01-01T00:00:00.000Z', to: '2020-01-01T00:00:00.000Z', current: false })).toBe('2020');
  });

  it('makes organisation monograms', () => {
    expect(orgMonogram('Marrow University')).toBe('MU');
    expect(orgMonogram('Tallowwood')).toBe('TAL');
  });
});

describe('rolesFromOverview', () => {
  it('reads roles and education, current first then newest, and marks imports', () => {
    const overview = {
      entity: {},
      current_relationships: [
        entry('a', 'employee_at', 'Tallowwood_College', { role: 'Head of English', valid_from: '2022-02-01T00:00:00.000Z' }),
        entry('b', 'member_of', 'Reading_Board', { role: 'Chair', valid_from: '2024-01-01T00:00:00.000Z', import_source: 'notion' }),
        entry('x', 'professional_relationship', 'ignored')
      ],
      historical_relationships: [
        entry('c', 'employee_at', 'Old_School', { status: 'ended', role: 'Teacher', valid_from: '2015-01-01T00:00:00.000Z', valid_to: '2021-12-01T00:00:00.000Z' }),
        entry('d', 'studied_at', 'Marrow_University', { status: 'ended', role: 'BA', valid_from: '2010-01-01T00:00:00.000Z', valid_to: '2013-01-01T00:00:00.000Z' })
      ],
      timeline: [],
      linked_records: {}
    } as unknown as EntityOverview;
    const roles = rolesFromOverview(overview);
    expect(roles.map((r) => r.linkId)).toEqual(['b', 'a', 'c', 'd']);
    expect(roles.find((r) => r.linkId === 'b')?.imported).toBe(true);
    expect(roles.find((r) => r.linkId === 'd')?.kind).toBe('education');
    expect(currentRoles(roles).map((r) => r.title)).toEqual(['Chair', 'Head of English']);
  });
});
