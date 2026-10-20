import { describe, expect, it } from 'vitest';
import { buildPersonTimeline, dayMonth, groupTimelineByYear, TIMELINE_COLLAPSE_AT } from '@/domain/person-timeline';
import { renderPersonTimeline } from '@/components/person-timeline';
import type { PersonRole } from '@/domain/person-roles';

const role = (over: Partial<PersonRole>): PersonRole => ({
  linkId: 'r', type: 'employee_at', kind: 'role', orgRef: 'shared:organisation:o', orgName: 'Tallowwood College',
  title: 'Teacher', from: null, to: null, current: false, imported: false, ...over
});

describe('person timeline', () => {
  it('merges career and touchpoints newest first, undated roles last', () => {
    const rows = buildPersonTimeline(
      [
        role({ linkId: 'a', from: '2016-01-01T00:00:00.000Z', to: '2022-07-01T00:00:00.000Z' }),
        role({ linkId: 'b', kind: 'education', type: 'studied_at', title: 'BA', orgName: 'Marrow University', from: '2010-01-01T00:00:00.000Z', to: '2013-01-01T00:00:00.000Z' }),
        role({ linkId: 'c', title: 'Chair', current: true })
      ],
      [{ id: 'm', at: '2024-03-12T09:00:00.000Z', label: 'Coffee' }, { id: 'bad', at: 'nope', label: 'Skip' }]
    );
    expect(rows.map((r) => [r.kind, r.text, r.when])).toEqual([
      ['touchpoint', 'Coffee', '12 Mar'],
      ['role', 'Teacher, Tallowwood College', '2016 – 2022'],
      ['education', 'BA, Marrow University', '2010 – 2013'],
      ['role', 'Chair, Tallowwood College', '']
    ]);
    expect(groupTimelineByYear(rows).map((g) => [g.year, g.rows.length])).toEqual([['2024', 1], ['2016', 1], ['2010', 1], ['Undated', 1]]);
    expect(dayMonth('2026-10-01T00:00:00.000Z')).toBe('1 Oct');
  });

  it('collapses after 12 rows behind Show all, and has an empty state', () => {
    const host = document.createElement('div');
    renderPersonTimeline(host, [], () => document.createElement('span'));
    expect(host.textContent).toBe('Add their roles and education, or link a meeting or note.');
    const points = Array.from({ length: 15 }, (_, i) => ({ id: String(i), at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, label: `Touch ${i}` }));
    renderPersonTimeline(host, buildPersonTimeline([], points), () => document.createElement('span'));
    expect(host.querySelectorAll('.person-timeline__row').length).toBe(TIMELINE_COLLAPSE_AT);
    host.querySelector<HTMLButtonElement>('.person-timeline__toggle')!.click();
    expect(host.querySelectorAll('.person-timeline__row').length).toBe(15);
  });

  it('marks education with an outlined crest and touchpoints with a dot', () => {
    const host = document.createElement('div');
    const rows = buildPersonTimeline(
      [role({ linkId: 'e', kind: 'education', type: 'studied_at', from: '2010-01-01T00:00:00.000Z' })],
      [{ id: 'm', at: '2024-03-12T09:00:00.000Z', label: 'Coffee' }]
    );
    renderPersonTimeline(host, rows, () => { const s = document.createElement('span'); s.className = 'people-crest'; return s; });
    expect(host.querySelector('.person-timeline__row--education .people-crest--outline')).toBeTruthy();
    expect(host.querySelector('.person-timeline__row--touchpoint .person-timeline__dot')).toBeTruthy();
  });
});
