import { describe, expect, it } from 'vitest';
import { buildColumns } from '@/chart-kit/columns';

describe('buildColumns', () => {
  it('scales heights to max and preserves labels', () => {
    const chart = buildColumns(
      [
        { key: 'breakfast', value: 10, label: 'B' },
        { key: 'lunch', value: 40, label: 'L' }
      ],
      { height: 100 }
    );
    expect(chart.bars[0]?.heightPct).toBe(25);
    expect(chart.bars[1]?.heightPct).toBe(100);
    expect(chart.bars[0]?.key).toBe('breakfast');
  });

  it('all-zero values yield zero heights without NaN', () => {
    const chart = buildColumns([{ key: 'a', value: 0, label: 'A' }], { height: 80 });
    expect(chart.bars[0]?.heightPct).toBe(0);
  });
});
