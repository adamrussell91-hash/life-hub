const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_COLOURS = {
  breakfast: 'color-mix(in srgb, var(--wave) 35%, white)',
  lunch: 'color-mix(in srgb, var(--wave) 55%, white)',
  dinner: 'var(--wave)',
  snack: 'var(--high-sea)'
};
const MEAL_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack'
};

function polar(cx, cy, r, angleRad) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad)
  };
}

function slicePath(cx, cy, r, startAngle, endAngle) {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  // Full circle: SVG arc with identical endpoints collapses — use two semicircles
  if (Math.abs(endAngle - startAngle) >= 2 * Math.PI - 1e-6) {
    const mid = polar(cx, cy, r, startAngle + Math.PI);
    return `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${mid.x} ${mid.y} A ${r} ${r} 0 1 1 ${start.x} ${start.y} Z`;
  }
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

/**
 * @param {Array<{ key?: string, label?: string, value?: number, colour?: string }>} items
 * @param {{ size?: number }} [options]
 */
export function buildDistributionPie(items, { size = 72 } = {}) {
  const entries = (items ?? [])
    .map(item => ({
      ...item,
      key: item.key,
      label: item.label ?? item.key,
      value: Number(item.value) || 0
    }))
    .filter(entry => entry.value > 0);

  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) {
    return { empty: true, total: 0, size, center: size / 2, radius: size / 2 - 4, slices: [] };
  }

  const center = size / 2;
  const radius = size / 2 - 4;
  let angle = -Math.PI / 2;
  const slices = entries.map(entry => {
    const sweep = (entry.value / total) * 2 * Math.PI;
    const startAngle = angle;
    const endAngle = angle + sweep;
    angle = endAngle;
    return {
      ...entry,
      startAngle,
      endAngle,
      path: slicePath(center, center, radius, startAngle, endAngle)
    };
  });

  return { empty: false, total, size, center, radius, slices };
}

/**
 * @param {Record<string, { protein_g?: number }>} meals
 * @param {{ size?: number }} [options]
 */
export function buildMealProteinPie(meals, { size = 72 } = {}) {
  return buildDistributionPie(
    MEAL_ORDER.map(meal => ({
      meal,
      key: meal,
      label: MEAL_LABELS[meal],
      value: Number(meals?.[meal]?.protein_g) || 0,
      colour: MEAL_COLOURS[meal]
    })),
    { size }
  );
}
