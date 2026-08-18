export const THEME_ARMS = [
  { key: 'lifting', label: 'Lifting', colour: 'var(--wave)', angle: -90, sweep: 34, period: '150s', staticRotate: 0 },
  { key: 'mixed', label: 'Mixed', colour: 'var(--orca)', angle: 30, sweep: 34, period: '115s', staticRotate: -8 },
  { key: 'weighing', label: 'Weighing', colour: 'var(--mood-low)', angle: 150, sweep: 34, period: '135s', staticRotate: 12 }
];

const SIZE = 640;
const CX = 320;
const CY = 320;
const ARM_LEN = 240;
const T_MIN = 0.24;
const T_MAX = 0.94;
const RING_RADII = [90, 165, 240];

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function armPathD(arm) {
  const samples = 26;
  const parts = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const r = ARM_LEN * t ** 0.85;
    const point = polar(CX, CY, r, arm.angle + arm.sweep * t);
    parts.push(`${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  return parts.join(' ');
}

function nodePoint(arm, t) {
  const r = ARM_LEN * t ** 0.85;
  return polar(CX, CY, r, arm.angle + arm.sweep * t);
}

export function armForMeanMood(meanMood) {
  if (!Number.isFinite(Number(meanMood))) return 'mixed';
  const value = Number(meanMood);
  if (value >= 6.5) return 'lifting';
  if (value <= 5) return 'weighing';
  return 'mixed';
}

/**
 * Spiral-arm constellation: closer to centre and larger = mentioned more,
 * arm/colour = mean mood of the theme, rising/falling vs the previous window.
 */
export function buildThemeOrbit(themes) {
  const arms = THEME_ARMS.map(arm => ({ ...arm, d: armPathD(arm) }));
  const byArm = Object.fromEntries(THEME_ARMS.map(arm => [arm.key, []]));
  const items = (themes ?? [])
    .filter(theme => theme?.key && Number(theme.value) > 0)
    .map(theme => ({
      key: theme.key,
      label: theme.label ?? theme.key,
      value: Number(theme.value) || 0,
      prevValue: Number(theme.prevValue) || 0,
      meanMood: Number.isFinite(Number(theme.meanMood)) ? Number(theme.meanMood) : null,
      arm: armForMeanMood(theme.meanMood)
    }));

  for (const item of items) byArm[item.arm].push(item);

  const values = items.map(item => item.value);
  const globalMin = values.length ? Math.min(...values) : 0;
  const globalMax = values.length ? Math.max(...values) : 0;

  const stars = [];
  for (const arm of arms) {
    const members = byArm[arm.key];
    const armCounts = members.map(item => item.value);
    const armMin = armCounts.length ? Math.min(...armCounts) : 0;
    const armMax = armCounts.length ? Math.max(...armCounts) : 0;
    for (const item of members) {
      const armNorm = armMax === armMin ? 0.5 : (item.value - armMin) / (armMax - armMin);
      const t = T_MAX - armNorm * (T_MAX - T_MIN);
      const pos = nodePoint(arm, t);
      const sizeNorm = globalMax === globalMin ? 0.5 : (item.value - globalMin) / (globalMax - globalMin);
      const r = 5 + sizeNorm * 10;
      stars.push({
        ...item,
        colour: arm.colour,
        armLabel: arm.label,
        t,
        x: pos.x,
        y: pos.y,
        r,
        radiusFromCentre: Math.hypot(pos.x - CX, pos.y - CY),
        rising: item.value > item.prevValue,
        falling: item.value < item.prevValue,
        delta: item.value - item.prevValue
      });
    }
  }

  const top = stars.slice().sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))[0] ?? null;
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return {
    empty: stars.length === 0,
    width: SIZE,
    height: SIZE,
    cx: CX,
    cy: CY,
    rings: RING_RADII,
    arms,
    stars,
    total,
    top
  };
}
