export function buildColumns(items, { height = 96 } = {}) {
  const max = Math.max(1, ...items.map(item => Number(item.value) || 0));
  return {
    height,
    bars: items.map(item => {
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
