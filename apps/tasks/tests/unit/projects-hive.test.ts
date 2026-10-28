import { describe, expect, it } from 'vitest';
import type { ProjectPulseCard, PulseGroup } from '@/domain/projects-pulse';
import { hiveHealth, hiveTimeLeft, layoutHive, wrapHiveTitle } from '@/domain/projects-hive';
import { SQRT3 } from '../../../../packages/walkthrus/board/hex';

const now = new Date('2026-10-28T12:00:00');

function card(id: string, partial: Partial<ProjectPulseCard['project']> = {}, extra: Partial<ProjectPulseCard> = {}): ProjectPulseCard {
  return {
    project: {
      id,
      title: id,
      status: 'active',
      current_end_date: null,
      baseline_end_date: null,
      submission_date: null,
      ...partial
    } as ProjectPulseCard['project'],
    lifecycle: 'on_the_go',
    driftKind: 'neutral',
    openTaskCount: 0,
    doneTaskCount: 0,
    ...extra
  } as ProjectPulseCard;
}

function group(id: string, count: number): PulseGroup {
  return { id, title: id, cards: Array.from({ length: count }, (_, i) => card(`${id}-${i}`)) };
}

describe('projects hive layout', () => {
  it('places every project once, with no two hexagons overlapping', () => {
    const layout = layoutHive([group('a', 9), group('b', 3), group('c', 1), group('d', 5)], 860);
    expect(layout.tiles).toHaveLength(18);
    expect(new Set(layout.tiles.map((tile) => tile.id)).size).toBe(18);
    const min = SQRT3 * layout.size - 0.5;
    for (const a of layout.tiles) {
      for (const b of layout.tiles) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(min);
      }
    }
  });

  it('wraps clusters to the width and keeps hexagons inside it', () => {
    const width = 358;
    const layout = layoutHive([group('a', 7), group('b', 7), group('c', 2)], width);
    expect(layout.size).toBeLessThan(52);
    for (const tile of layout.tiles) {
      expect(tile.x - layout.size).toBeGreaterThanOrEqual(-0.5);
      expect(tile.x + layout.size).toBeLessThanOrEqual(width + 0.5);
      expect(tile.y + (SQRT3 * layout.size) / 2).toBeLessThanOrEqual(layout.height + 0.5);
    }
    expect(new Set(layout.labels.map((label) => label.y)).size).toBeGreaterThan(1);
  });

  it('puts the soonest deadline at the centre of its cluster', () => {
    const g: PulseGroup = {
      id: 'g',
      title: 'g',
      cards: [card('late', { current_end_date: '2026-12-01' }), card('soon', { current_end_date: '2026-11-02' })]
    };
    expect(layoutHive([g], 860).tiles[0]?.id).toBe('soon');
  });
});

describe('projects hive tile facts', () => {
  it('reads time left as days, weeks, then a month', () => {
    expect(hiveTimeLeft(card('a', { current_end_date: '2026-11-04' }), now)).toBe('7 days');
    expect(hiveTimeLeft(card('a', { current_end_date: '2026-11-25' }), now)).toBe('4 wk');
    expect(hiveTimeLeft(card('a', { current_end_date: '2027-03-10' }), now)).toBe('Mar 27');
    expect(hiveTimeLeft(card('a', { current_end_date: '2026-10-20' }), now)).toBe('Overdue');
    expect(hiveTimeLeft(card('a', { submission_date: '2026-10-29' }), now)).toBe('1 day');
    expect(hiveTimeLeft(card('a'), now)).toBe('No date');
    expect(hiveTimeLeft(card('a', { status: 'paused' }), now)).toBe('Paused');
  });

  it('maps lifecycle and drift to four health states', () => {
    expect(hiveHealth(card('a'))).toBe('on_track');
    expect(hiveHealth(card('a', {}, { driftKind: 'warn' }))).toBe('slipping');
    expect(hiveHealth(card('a', {}, { lifecycle: 'needs_attention' }))).toBe('slipping');
    expect(hiveHealth(card('a', {}, { lifecycle: 'stalled' }))).toBe('stalled');
    expect(hiveHealth(card('a', { status: 'paused' }, { lifecycle: 'stalled' }))).toBe('parked');
    const milestone = (due_date: string, status: 'open' | 'done') => ({ id: due_date, project_id: 'a', title: 'm', due_date, status, life_wall: null });
    expect(hiveHealth(card('a', { milestones: [milestone('2026-10-01', 'open')] } as never), now)).toBe('slipping');
    expect(hiveHealth(card('a', { milestones: [milestone('2026-10-01', 'done')] } as never), now)).toBe('on_track');
    expect(hiveHealth(card('a', { milestones: [milestone('2026-11-30', 'open')] } as never), now)).toBe('on_track');
  });

  it('wraps titles to two lines and ellipses the rest', () => {
    expect(wrapHiveTitle('Year 9 Forces unit', 14)).toEqual(['Year 9 Forces', 'unit']);
    const long = wrapHiveTitle('Stage 6 Chemistry program rewrite for next year', 14);
    expect(long).toHaveLength(2);
    expect(long[1]!.endsWith('…')).toBe(true);
  });
});
