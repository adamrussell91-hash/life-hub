import { describe, expect, it } from 'vitest';
import { catalogPrograms } from '@/domain/programs-seed';
import {
  UNCLASSIFIED,
  cataloguePlatforms,
  catalogueTimetable,
  monthEdges,
  nextServices,
  yearPercent
} from '@/domain/catalogue-network';
import { catalogueItem } from '@/personal-line/model';
import type { Program } from '@/schemas/program';

const programs = catalogPrograms();
const byName = (name: string) => programs.find((program) => program.name === name)!;

describe('catalogue platforms', () => {
  it('puts an entry on every line its subjects reach, and counts the format mix from the same items', () => {
    const platforms = cataloguePlatforms(programs, 'line', '2026-01-01');
    for (const platform of platforms) {
      const mixTotal = platform.mix.reduce((sum, m) => sum + m.count, 0);
      expect(mixTotal, platform.title).toBe(platform.items.length);
      if (platform.line) for (const item of platform.items) expect(item.on).toContain(platform.line);
    }
    const justice = platforms.find((platform) => platform.line === 'J')!;
    const expected = programs.filter((program) => catalogueItem(program).on.includes('J')).length;
    expect(justice.items.length).toBe(expected);
  });

  it('groups by format, with unclassified entries in their own platform', () => {
    const classified: Program[] = [
      { ...byName('Mock Trial'), format: 'Simulation' },
      { ...byName('National Latin Exam (NLE)'), format: 'Exam' },
      byName('The Simpson Prize')
    ];
    const platforms = cataloguePlatforms(classified, 'format', '2026-01-01');
    expect(platforms.map((platform) => [platform.title, platform.items.length])).toEqual([
      ['Exam', 1],
      ['Simulation', 1],
      [UNCLASSIFIED, 1]
    ]);
  });

  it('lists next services that are still running or still to come, soonest first', () => {
    const items = programs.map((program) => catalogueItem(program));
    const next = nextServices(items, '2026-10-16', 50);
    for (const item of next) expect((item.run?.end ?? item.due?.on)! >= '2026-10-16', item.name).toBe(true);
    const starts = next.map((item) => item.run?.start ?? item.due?.on ?? '');
    expect([...starts].sort()).toEqual(starts);
  });
});

describe('catalogue timetable', () => {
  it('places marks on the calendar by date', () => {
    expect(yearPercent('2026-01-01', 2026)).toBe(0);
    expect(yearPercent('2026-12-31', 2026, true)).toBe(100);
    const edges = monthEdges(2026);
    expect(edges).toHaveLength(13);
    expect(edges[0]).toBe(0);
    expect(edges[12]).toBe(100);

    const day: Program = { ...byName('Mock Trial'), starts_on: '2026-07-01', ends_on: '2026-07-01', dates_precision: 'day' };
    const run: Program = { ...byName('Mock Trial'), id: 'run', starts_on: '2026-03-01', ends_on: '2026-03-31', dates_precision: 'month' };
    const undated: Program = { ...byName('Mock Trial'), id: 'tbc', starts_on: null, ends_on: null, dates_precision: null, due_on: null, due_precision: null, month: 'June' };
    const [group] = catalogueTimetable([day, run, undated], 'none', 2026);
    const marks = Object.fromEntries(group!.rows.map((row) => [row.item.id, row.mark]));
    expect(marks[day.id]).toMatchObject({ kind: 'day' });
    expect(marks.run).toMatchObject({ kind: 'run', approx: true });
    expect(marks.tbc).toMatchObject({ kind: 'month', left: edges[5], width: edges[6]! - edges[5]! });
    // Sorted by where they sit in the year.
    expect(group!.rows.map((row) => row.item.id)).toEqual(['run', 'tbc', day.id]);
  });

  it('keeps every visible entry exactly once whichever way the rows are grouped', () => {
    for (const rowsBy of ['format', 'line', 'none'] as const) {
      const count = catalogueTimetable(programs, rowsBy, 2026).reduce((sum, group) => sum + group.rows.length, 0);
      expect(count, rowsBy).toBe(programs.length);
    }
  });
});
