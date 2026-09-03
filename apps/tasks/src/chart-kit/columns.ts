/** Life Hub `js/app/chart-kit/columns.js` — categorical bars scaled to the max. */

export type ColumnItem = {
  key: string;
  value?: number;
  label?: string;
};

export type ColumnBar = {
  key: string;
  label: string | undefined;
  value: number;
  heightPct: number;
};

export function buildColumns(items: ColumnItem[], { height = 96 }: { height?: number } = {}): {
  height: number;
  bars: ColumnBar[];
} {
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
  return {
    height,
    bars: items.map((item) => {
      const value = Number(item.value) || 0;
      return {
        key: item.key,
        label: item.label,
        value,
        heightPct: (value / max) * 100
      };
    })
  };
}
