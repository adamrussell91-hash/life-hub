export function buildHorizonBands(metrics, { width = 320, height = 24 } = {}) {
  return (metrics ?? []).map(metric => {
    const points = metric.points ?? [];
    const max = Math.max(1, ...points.map(point => Math.abs(Number(point.value) || 0)));
    const step = points.length ? width / points.length : width;
    return {
      key: metric.key,
      height,
      rects: points.map((point, index) => ({
        x: index * step,
        y: 0,
        width: step,
        height,
        opacity: Math.min(1, Math.abs(Number(point.value) || 0) / max),
        date: point.date,
        value: point.value
      }))
    };
  });
}
