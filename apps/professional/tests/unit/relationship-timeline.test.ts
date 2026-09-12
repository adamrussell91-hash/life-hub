import { describe, expect, it } from 'vitest';
import { renderRelationshipTimeline } from '@/components/relationship-timeline';
import type { TimelineEntry } from '@/domain/types';

function entry(overrides: Partial<TimelineEntry>): TimelineEntry {
  return {
    id: 'link_1',
    kind: 'period',
    date: '2023-01-15',
    end_date: null,
    label: 'works_at Example University',
    context_key: null,
    source_ref: 'shared:person:person_x',
    href: null,
    ...overrides
  };
}

describe('renderRelationshipTimeline', () => {
  it('groups entries by year without reordering within a year', () => {
    const container = document.createElement('div');
    const timeline: TimelineEntry[] = [
      entry({ id: 'a', date: '2023-06-01', label: 'B first (server order)' }),
      entry({ id: 'b', date: '2023-01-15', label: 'A second (server order)' }),
      entry({ id: 'c', date: '2018-02-01', label: 'Oldest' })
    ];
    renderRelationshipTimeline(container, timeline);

    const years = [...container.querySelectorAll('.relationship-timeline__year')].map((el) => el.textContent);
    expect(years).toEqual(['2023', '2018']);

    const labels = [...container.querySelectorAll('.relationship-timeline__label')].map((el) => el.textContent);
    expect(labels).toEqual(['B first (server order)', 'A second (server order)', 'Oldest']);
  });

  it('marks an open period distinctly from an ended one, through more than colour alone', () => {
    const container = document.createElement('div');
    renderRelationshipTimeline(container, [
      entry({ id: 'open', kind: 'period', date: '2023-01-01', end_date: null }),
      entry({ id: 'ended', kind: 'period', date: '2018-01-01', end_date: '2020-01-01' })
    ]);

    const entries = [...container.querySelectorAll('.relationship-timeline__entry')];
    const open = entries.find((el) => el.classList.contains('relationship-timeline__entry--open'))!;
    const ended = entries.find((el) => el.classList.contains('relationship-timeline__entry--ended'))!;
    expect(open).toBeTruthy();
    expect(ended).toBeTruthy();
    // Distinct marker glyph (shape), not merely a CSS colour difference.
    const openMarker = open.querySelector('.relationship-timeline__marker')!.textContent;
    const endedMarker = ended.querySelector('.relationship-timeline__marker')!.textContent;
    expect(openMarker).not.toBe(endedMarker);

    expect(open.querySelector('.relationship-timeline__meta')?.textContent).toMatch(/present/);
    expect(ended.querySelector('.relationship-timeline__meta')?.textContent).toMatch(/–/);
  });

  it('formats dates with formatDisplayDate (dd/mm/yy), never a raw ISO string', () => {
    const container = document.createElement('div');
    renderRelationshipTimeline(container, [entry({ date: '2023-01-15', end_date: null, kind: 'point' })]);
    const meta = container.querySelector('.relationship-timeline__meta')!.textContent!;
    expect(meta).toMatch(/15\/01\/23/);
    expect(meta).not.toMatch(/2023-01-15/);
  });

  it('shows a context key when present', () => {
    const container = document.createElement('div');
    renderRelationshipTimeline(container, [entry({ context_key: 'Research Lab' })]);
    expect(container.querySelector('.relationship-timeline__meta')?.textContent).toMatch(/Research Lab/);
  });

  it('renders a link only when the server supplies a safe href', () => {
    const container = document.createElement('div');
    renderRelationshipTimeline(container, [
      entry({ id: 'linked', href: '#/person/person_00000000-0000-4000-8000-000000000001' }),
      entry({ id: 'unlinked', href: null })
    ]);
    const labels = [...container.querySelectorAll('.relationship-timeline__label')];
    expect(labels[0]?.querySelector('a')).not.toBeNull();
    expect(labels[1]?.querySelector('a')).toBeNull();
  });

  it('shows an honest empty state for no history', () => {
    const container = document.createElement('div');
    renderRelationshipTimeline(container, []);
    expect(container.querySelector('.relationship-timeline__empty')?.textContent).toMatch(/No relationship history/);
  });
});
