/**
 * carved-away — body fat readings with everything below the running high carved
 * out as a solid hatched shape. The shape only grows from highs you actually
 * reached, so earlier rises never count as progress. A pale sliver under the
 * line to the target band is what is left.
 */
import { formatDisplayDate } from '../../core/time.js';
import { dayIndex, formatNumber, fx, linearScale, monthShort, node, points, text } from './scene.js';

const short = date => `${monthShort(date)} ’${date.slice(2, 4)}`;

export function buildCarvedAway(chart, { width = 520, height = 196 } = {}) {
  const label = 'Body fat, with everything shed from your high in this range carved out as a solid shape.';
  if (chart?.status !== 'ready') {
    const readout = chart?.reason ?? 'No body fat readings in this range.';
    return { width, height: 64, label, readout, nodes: [text(0, 30, readout, { size: 12, cls: 'hc-text hc-text--muted' })], hits: {} };
  }
  const { points: rows, band } = chart;
  const pad = { top: 22, right: 16, bottom: 24, left: 32 };
  const plotL = pad.left;
  const plotR = width - pad.right;
  const plotT = pad.top;
  const plotB = height - pad.bottom;
  const hi = Math.ceil(Math.max(...rows.map(r => r.pct)) + 3);
  const lo = Math.max(0, Math.floor(Math.min(band ? band.low : Infinity, ...rows.map(r => r.pct)) - 3));
  const from = rows[0].date;
  const days = Math.max(1, dayIndex(from, rows.at(-1).date));
  const x = linearScale([0, days], [plotL + 6, plotR - 6]);
  const y = linearScale([lo, hi], [plotB, plotT]);
  const px = r => x(dayIndex(from, r.date));
  const nodes = [];
  const hits = {};

  nodes.push(node('defs', {}, {
    children: [node('pattern', { id: 'carve-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, {
      children: [
        node('rect', { width: 6, height: 6 }, { cls: 'bc-carve-fill' }),
        node('line', { x1: 0, y1: 0, x2: 0, y2: 6 }, { cls: 'bc-carve-hatch' })
      ]
    })]
  }));

  const span = hi - lo;
  const tick = span > 30 ? 10 : span > 12 ? 5 : 2;
  for (let v = Math.ceil(lo / tick) * tick; v <= hi; v += tick) {
    nodes.push(node('line', { x1: plotL, x2: fx(plotR), y1: fx(y(v)), y2: fx(y(v)) }, { cls: 'hc-grid' }));
    nodes.push(text(plotL - 6, y(v) + 3.5, v, { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));
  }
  if (band) {
    nodes.push(node('rect', { x: plotL, y: fx(y(band.high)), width: fx(plotR - plotL), height: fx(y(band.low) - y(band.high)), rx: 3 }, { cls: 'hc-band' }));
    nodes.push(text(plotR - 4, y(band.low) - 3, `target ${band.low}–${band.high}%`, { size: 10, weight: 600, anchor: 'end', cls: 'hc-text hc-text--band' }));
  }

  const line = rows.map(r => [px(r), y(r.pct)]);
  const ceiling = rows.map(r => [px(r), y(r.high)]);
  // What is left: under the line from the high on, down to the top of the band.
  const highIndex = rows.findIndex(r => r.date === chart.high.date);
  const fromHigh = line.slice(highIndex);
  if (band && fromHigh.length >= 2) {
    nodes.push(node('polygon', {
      points: points([...fromHigh, [fromHigh.at(-1)[0], y(band.high)], [fromHigh[0][0], y(band.high)]])
    }, { cls: 'bc-to-go', anim: 'fade', delay: 300 }));
  }
  const carveDelay = 1000;
  nodes.push(node('polygon', { points: points([...ceiling, ...[...line].reverse()]), fill: 'url(#carve-hatch)' }, {
    cls: 'bc-carved', anim: 'drop', delay: carveDelay, dur: 900, origin: [0, plotT]
  }));
  nodes.push(node('polyline', { points: points(ceiling) }, { cls: 'bc-ceiling', anim: 'fade', delay: carveDelay }));
  nodes.push(node('polyline', { points: points(line), pathLength: 1 }, { cls: 'bc-fat-line', anim: 'draw', dur: 1000 }));

  // Label the carved mass where it is thickest.
  if (chart.carvedPts > 0.3) {
    const highX = px(rows.find(r => r.date === chart.high.date));
    const lx = Math.max(plotL + 44, Math.min(plotR - 44, (highX + line.at(-1)[0]) / 2));
    const top = y(chart.high.pct);
    const bottom = y(chart.current.pct);
    if (bottom - top > 34) {
      const my = (top + bottom) / 2;
      nodes.push(text(lx, my - 2, `${formatNumber(chart.carvedPts, 1)} pts`, { size: 14, weight: 700, anchor: 'middle', cls: 'hc-text bc-text--carved', anim: 'fade', delay: carveDelay + 700 }));
      nodes.push(text(lx, my + 12, 'carved away', { size: 10, weight: 600, anchor: 'middle', cls: 'hc-text bc-text--carved', anim: 'fade', delay: carveDelay + 700 }));
    } else {
      nodes.push(text(lx, top - 7, `${formatNumber(chart.carvedPts, 1)} pts carved away`, { size: 11, weight: 700, anchor: 'middle', cls: 'hc-text bc-text--carved', anim: 'fade', delay: carveDelay + 700 }));
    }
  }
  if (band && chart.toGoPts > 0) {
    const [ex, ey] = line.at(-1);
    const roomy = y(band.high) - ey > 34;
    nodes.push(text(ex - 8, roomy ? (ey + y(band.high)) / 2 + 3.5 : ey + 16, `${formatNumber(chart.toGoPts, 1)} to go`, { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));
  }

  rows.forEach((r, i) => {
    const id = `fat-${r.date}`;
    const [cx, cy] = line[i];
    nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: 4 }, { cls: 'bc-fat-dot', hit: id, anim: 'fade', delay: Math.round((i / Math.max(1, rows.length - 1)) * 900) }));
    hits[id] = {
      id,
      title: formatDisplayDate(r.date),
      lines: [
        `${formatNumber(r.pct, 1)}% body fat`,
        r.carved > 0 ? `${formatNumber(r.carved, 1)} pts carved from your ${formatNumber(r.high, 1)}% high` : 'Your high in this range so far'
      ],
      detail: `${formatDisplayDate(r.date)}: ${formatNumber(r.pct, 1)}% body fat.`,
      guide: { x: fx(cx), y1: plotT, y2: plotB }
    };
  });

  nodes.push(text(plotL + 6, height - 7, short(rows[0].date), { size: 10, cls: 'hc-text hc-text--muted' }));
  nodes.push(text(plotR - 6, height - 7, short(rows.at(-1).date), { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));

  return {
    width,
    height,
    label,
    readout: `${formatNumber(chart.carvedPts, 1)} points carved from your ${formatNumber(chart.high.pct, 1)}% high (${formatDisplayDate(chart.high.date)}).${band ? ` ${formatNumber(chart.toGoPts, 1)} to the target zone.` : ''}`,
    nodes,
    hits
  };
}
