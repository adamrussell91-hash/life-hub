/**
 * recomp-plane — weight (y) against body fat (x, leaner to the right).
 * Dashed curves are lean-mass isolines: every point on one carries the same
 * fat-free mass, so moving along a line is pure fat change. The target box is
 * the weight band crossed with the body-fat band; only isolines between
 * leanBand.low and leanBand.high pass through it (shaded corridor). Each
 * scenario's weekly trace is drawn as its road toward, or past, the box.
 */
import { formatDisplayDate } from '../../core/time.js';
import { formatNumber, fx, linearScale, node, points, text } from './scene.js';

const weightAt = (lean, bf) => lean / (1 - bf / 100);

export function buildRecompPlane(chart, { width = 640, height = width < 480 ? 320 : 340 } = {}) {
  const nodes = [];
  const hits = {};
  const t = chart.targets;
  const cur = chart.current;
  if (!t) {
    return { width, height: 60, label: 'Body-composition targets unavailable.', readout: 'Add body-composition targets to draw the box.', nodes, hits };
  }
  const pad = { top: 30, right: 14, bottom: 34, left: 36 };
  const plotL = pad.left;
  const plotR = width - pad.right;
  const plotT = pad.top;
  const plotB = height - pad.bottom;

  const xHi = Math.ceil(Math.max((cur?.body_fat_pct ?? t.body_fat_pct_max + 8) + 1.5, 20) / 2) * 2;
  const xLo = Math.floor(Math.min(t.body_fat_pct_min - 2, 6) / 2) * 2;
  const scenarios = (chart.scenarios ?? []).filter(s => s.trace?.points?.length);
  const visible = scenarios.flatMap(s => s.trace.points.filter(p => p.body_fat_pct >= xLo - 0.5));
  const weights = [t.weight_kg_min - 4, t.weight_kg_max, ...(cur ? [cur.weight_kg] : []), ...visible.map(p => p.weight_kg)];
  const yHi = Math.ceil((Math.max(...weights) + 3) / 2) * 2;
  const yLo = Math.floor(Math.min(...weights) / 2) * 2;
  const x = linearScale([xHi, xLo], [plotL, plotR]);
  const y = linearScale([yLo, yHi], [plotB, plotT]);

  nodes.push(node('clipPath', { id: 'plane-clip' }, {
    children: [node('rect', { x: plotL, y: plotT, width: fx(plotR - plotL), height: fx(plotB - plotT) })]
  }));
  const clipped = children => node('g', { 'clip-path': 'url(#plane-clip)' }, { children });

  // Grid and axes.
  for (let w = yLo; w <= yHi; w += yHi - yLo > 20 ? 4 : 2) {
    nodes.push(node('line', { x1: plotL, x2: plotR, y1: fx(y(w)), y2: fx(y(w)) }, { cls: 'hc-grid' }));
    nodes.push(text(plotL - 6, y(w) + 4, w, { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));
  }
  const xStep = width < 480 ? 4 : 2;
  for (let b = xHi; b >= xLo; b -= xStep) {
    nodes.push(text(x(b), plotB + 16, `${b}%`, { size: 10, anchor: 'middle', cls: 'hc-text hc-text--muted' }));
  }
  nodes.push(text(plotR, plotB + 30, 'body fat, leaner →', { size: 10.5, weight: 600, anchor: 'end', cls: 'hc-text hc-text--muted' }));
  nodes.push(text(plotL - 6, plotT - 14, 'kg', { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));

  const curve = lean => {
    const pts = [];
    for (let b = xHi; b >= xLo - 0.001; b -= 0.5) pts.push([x(b), y(weightAt(lean, b))]);
    return pts;
  };

  // Lean corridor: the only roads that pass through the box.
  const band = chart.leanBand;
  const layer = [];
  if (band) {
    const upper = curve(band.high);
    const lower = curve(band.low).reverse();
    layer.push(node('polygon', { points: points([...upper, ...lower]) }, {
      cls: 'hc-corridor', hit: 'plane-corridor', anim: 'fade', delay: 200
    }));
    hits['plane-corridor'] = {
      id: 'plane-corridor',
      title: 'Roads through the box',
      lines: [`Lean mass ${formatNumber(band.low, 1)} to ${formatNumber(band.high, 1)} kg`],
      detail: `Only lean masses from ${formatNumber(band.low, 1)} to ${formatNumber(band.high, 1)} kg can land inside the box. Below that, you reach the fat target lighter than the weight floor.`
    };
  }

  // Isolines every 2 kg of lean mass.
  const leanMin = Math.floor((yLo * (1 - xHi / 100)) / 2) * 2;
  const leanMax = Math.ceil((yHi * (1 - xLo / 100)) / 2) * 2;
  for (let lean = leanMin; lean <= leanMax; lean += 2) {
    const id = `lean-${lean}`;
    layer.push(node('polyline', { points: points(curve(lean)) }, { cls: 'hc-isoline' }));
    layer.push(node('polyline', { points: points(curve(lean)) }, { cls: 'hc-hitpad', hit: id }));
    hits[id] = {
      id,
      title: `Lean ${lean} kg`,
      lines: ['Same lean mass all along this line', 'Moving along it is fat change only'],
      detail: `Every point on this line carries ${lean} kg of lean mass. Sliding down it to the right means losing fat and nothing else.`
    };
  }
  nodes.push(clipped(layer));
  for (let lean = leanMin; lean <= leanMax; lean += 4) {
    const ly = y(weightAt(lean, xHi - 0.3));
    if (ly > plotT + 10 && ly < plotB - 6) {
      nodes.push(text(plotL + 4, ly - 4, `lean ${lean}`, { size: 9.5, cls: 'hc-text hc-text--faint' }));
    }
  }

  // Your current lean line.
  if (cur) {
    nodes.push(clipped([node('polyline', { points: points(curve(cur.fat_free_mass_kg)) }, { cls: 'hc-isoline hc-isoline--you', anim: 'fade', delay: 300 })]));
  }

  // The box.
  nodes.push(node('rect', {
    x: fx(x(t.body_fat_pct_max)),
    y: fx(y(t.weight_kg_max)),
    width: fx(x(t.body_fat_pct_min) - x(t.body_fat_pct_max)),
    height: fx(y(t.weight_kg_min) - y(t.weight_kg_max)),
    rx: 3
  }, { cls: 'hc-box', hit: 'plane-box', anim: 'fade', delay: 150 }));
  nodes.push(text((x(t.body_fat_pct_max) + x(t.body_fat_pct_min)) / 2, y(t.weight_kg_max) - 7, 'the box', {
    size: 11, weight: 700, anchor: 'middle', cls: 'hc-text hc-text--band'
  }));
  hits['plane-box'] = {
    id: 'plane-box',
    title: 'The recomp box',
    lines: [`${t.weight_kg_min}–${t.weight_kg_max} kg and ${t.body_fat_pct_min}–${t.body_fat_pct_max}% fat`, 'Both at the same time'],
    detail: `The box is your goal: weight ${t.weight_kg_min}–${t.weight_kg_max} kg and body fat ${t.body_fat_pct_min}–${t.body_fat_pct_max}% at the same time.`
  };

  // Scenario roads.
  scenarios.forEach((scenario, si) => {
    const pts = scenario.trace.points.filter(p => p.body_fat_pct >= xLo - 1);
    const key = scenario.key;
    const group = [];
    group.push(node('polyline', { points: points(pts.map(p => [x(p.body_fat_pct), y(p.weight_kg)])), pathLength: 1 }, {
      cls: `hc-road hc-road--${key}`, anim: 'draw', delay: 350 + si * 250, group: key
    }));
    pts.forEach((p, i) => {
      const id = `${key}-wk-${p.day}`;
      if (p.day > 0 && p.day % 28 === 0) {
        group.push(node('circle', { cx: fx(x(p.body_fat_pct)), cy: fx(y(p.weight_kg)), r: 3.2 }, {
          cls: `hc-road-dot hc-road-dot--${key}`, anim: 'fade', delay: 900 + si * 250 + i * 8, group: key
        }));
      }
      group.push(node('circle', { cx: fx(x(p.body_fat_pct)), cy: fx(y(p.weight_kg)), r: 8 }, { cls: 'hc-hitpad-fill', hit: id, group: key }));
      hits[id] = {
        id,
        group: key,
        select: key,
        title: `${scenario.label} · ${formatDisplayDate(p.date)}`,
        lines: [
          `${formatNumber(p.weight_kg, 1)} kg at ${formatNumber(p.body_fat_pct, 1)}% fat`,
          `Lean ${formatNumber(p.fat_free_mass_kg, 1)} kg · fat ${formatNumber(p.fat_mass_kg, 1)} kg`,
          cur ? `Lean change ${p.fat_free_mass_kg - cur.fat_free_mass_kg >= 0 ? '+' : '−'}${formatNumber(Math.abs(p.fat_free_mass_kg - cur.fat_free_mass_kg), 1)} kg` : null
        ].filter(Boolean),
        detail: `${scenario.label} on ${formatDisplayDate(p.date)}: ${formatNumber(p.weight_kg, 1)} kg at ${formatNumber(p.body_fat_pct, 1)}% fat, carrying ${formatNumber(p.fat_free_mass_kg, 1)} kg of lean mass.`
      };
    });
    const labelPoint = pts[Math.min(pts.length - 1, Math.round(pts.length * 0.3))];
    if (labelPoint) {
      const above = key === 'on_plan';
      group.push(text(x(labelPoint.body_fat_pct) + (above ? 6 : -6), y(labelPoint.weight_kg) + (above ? -9 : 17), scenario.label, {
        size: 11, weight: 700, anchor: above ? 'start' : 'end', cls: `hc-text hc-road-label hc-road-label--${key}`, anim: 'fade', delay: 800
      }));
    }
    nodes.push(node('g', { 'clip-path': 'url(#plane-clip)' }, { cls: `hc-road-group`, group: key, children: group }));
  });

  // Near miss at the box corner.
  if (chart.leanGapKg > 0 && cur) {
    const cx = x(t.body_fat_pct_max);
    const cy = y(t.weight_kg_min);
    nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: 13 }, { cls: 'hc-lens', hit: 'plane-miss', anim: 'fade', delay: 1300 }));
    const flip = cx + 140 > plotR;
    const dir = flip ? -1 : 1;
    nodes.push(node('line', { x1: fx(cx + 8 * dir), y1: fx(cy + 11), x2: fx(cx + 20 * dir), y2: fx(cy + 40) }, { cls: 'hc-lens-leader', anim: 'fade', delay: 1300 }));
    nodes.push(text(cx + 24 * dir, cy + 46, `${formatNumber(chart.leanGapKg, 1)} kg lean short`, {
      size: 11, weight: 700, anchor: flip ? 'end' : 'start', cls: 'hc-text hc-text--accent', anim: 'fade', delay: 1350
    }));
    hits['plane-miss'] = {
      id: 'plane-miss',
      title: 'The corner',
      lines: [`Box needs ≥ ${formatNumber(chart.leanBand.low, 1)} kg lean`, `You carry ${formatNumber(cur.fat_free_mass_kg, 1)} kg`],
      detail: `Holding ${formatNumber(cur.fat_free_mass_kg, 1)} kg of lean mass, you reach ${t.body_fat_pct_max}% fat at ${formatNumber(weightAt(cur.fat_free_mass_kg, t.body_fat_pct_max), 1)} kg, just under the ${t.weight_kg_min} kg floor. ${formatNumber(chart.leanGapKg, 1)} kg more lean mass, or a lower body-fat reading, opens the box.`
    };
  }

  // You are here.
  if (cur) {
    const cx = x(cur.body_fat_pct);
    const cy = y(cur.weight_kg);
    nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: 11 }, { cls: 'hc-you-halo', anim: 'grow', origin: [cx, cy] }));
    nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: 5.5 }, { cls: 'hc-you', hit: 'plane-you', anim: 'grow', origin: [cx, cy] }));
    nodes.push(text(cx + 12, cy + 4, `now · ${formatNumber(cur.weight_kg, 1)} kg · ${formatNumber(cur.body_fat_pct, 1)}%`, {
      size: 11, weight: 700, cls: 'hc-text hc-text--you', anim: 'fade', delay: 200
    }));
    hits['plane-you'] = {
      id: 'plane-you',
      title: 'You now',
      lines: [
        `${formatNumber(cur.weight_kg, 1)} kg at ${formatNumber(cur.body_fat_pct, 1)}% fat`,
        `Lean ${formatNumber(cur.fat_free_mass_kg, 1)} kg · fat ${formatNumber(cur.fat_mass_kg, 1)} kg`,
        cur.seedDate ? `Body-fat reading ${formatDisplayDate(cur.seedDate)}` : null
      ].filter(Boolean),
      detail: `You are on the lean ${formatNumber(cur.fat_free_mass_kg, 1)} kg line. The body-fat reading from ${formatDisplayDate(cur.seedDate)} sets where that line sits.`
    };
  }

  const any = scenarios.length > 0;
  return {
    width,
    height,
    label: 'Weight against body fat with lean-mass lines, the target box and projected roads.',
    readout: any
      ? 'Each dashed line holds lean mass steady. Tap a road, the box or a line.'
      : 'Roads appear when the forecast unlocks. The box and your lean line are live now.',
    nodes,
    hits
  };
}
