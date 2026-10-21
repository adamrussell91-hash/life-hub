import { describe, expect, it } from 'vitest';
import { employmentToTimeline } from '@/views/career-employment';

describe('employmentToTimeline', () => {
  it('lists workplace, role, and duration without collapsing stacked roles', () => {
    const entries = employmentToTimeline(
      [
        {
          display_label: 'Wattle Grove High School',
          role: 'English Teacher',
          valid_from: '2021-01-25',
          valid_to: '2024-08-16'
        },
        {
          display_label: 'Wattle Grove High School',
          role: 'Psychology Teacher',
          valid_from: '2023-01-23',
          valid_to: '2024-08-16'
        },
        {
          display_label: "Tallowwood College",
          role: 'Gifted Education Teacher',
          valid_from: '2025-01-22',
          valid_to: null,
          link_status: 'current'
        }
      ],
      '2026-09-27'
    );

    expect(entries).toHaveLength(3);
    expect(entries[0]!.label).toContain('English Teacher');
    expect(entries[0]!.label).toContain('Wattle Grove');
    expect(entries[0]!.context_key).toMatch(/year/);
    expect(entries[1]!.label).toContain('Psychology Teacher');
    expect(entries[2]!.end_date).toBeNull();
    expect(entries[2]!.label).toContain('Gifted Education Teacher');
    expect(entries[2]!.label).toContain('Tallowwood');
  });

  it('keeps oldest-first career order', () => {
    const entries = employmentToTimeline(
      [
        { display_label: 'B', role: 'Later', valid_from: '2020-01-01', valid_to: '2021-01-01' },
        { display_label: 'A', role: 'Earlier', valid_from: '2015-01-01', valid_to: '2016-01-01' }
      ],
      '2026-09-27'
    );
    expect(entries.map((e) => e.label)).toEqual([
      'Earlier · A',
      'Later · B'
    ]);
  });
});
