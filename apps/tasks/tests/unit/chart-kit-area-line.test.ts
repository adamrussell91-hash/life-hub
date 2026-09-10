import { describe, expect, it } from 'vitest';
import { buildAreaLine, straightLinePath } from '@/chart-kit/area-line';

describe('buildAreaLine', () => {
  it('places a rising series on a zero domain and returns line + area paths', () => {
    const chart = buildAreaLine(
      [
        { date: '2026-08-01', value: 0 },
        { date: '2026-08-02', value: 2 },
        { date: '2026-08-03', value: 4 }
      ],
      { width: 100, height: 40, padding: 10 }
    );
    expect(chart.points).toHaveLength(3);
    expect(chart.points[0]?.y).toBeGreaterThan(chart.points[2]!.y);
    expect(chart.linePath.startsWith('M ')).toBe(true);
    expect(chart.areaPath.endsWith('Z')).toBe(true);
    expect(chart.dayLabels[0]?.date).toBe('2026-08-01');
  });

  it('straightLinePath joins points without inventing a curve', () => {
    expect(straightLinePath([{ x: 0, y: 10 }, { x: 8, y: 4 }])).toBe('M 0.0 10.0 L 8.0 4.0');
  });
});
