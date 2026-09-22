/**
 * recomp-scissors — body fat % and skeletal muscle on one shared axis, both as
 * percentage change since the first reading that has both. The blades open as
 * fat falls and muscle rises; the gap between them is shaded.
 * One axis, indexed to a common base: never two y-scales.
 */
import { formatDisplayDate } from '../../core/time.js';
import { dayIndex, formatNumber, fx, linearScale, monthShort, node, points, signed, text } from './scene.js';

const short = date => `${monthShort(date)} ’${date.slice(2, 4)}`;

export function buildRecompScissors(chart, { width = 520, height = 180 } = {}) {
  const label = 'Change in body fat percentage and skeletal muscle since the first reading with both.';
  if (chart?.status !== 'ready') {
    const readout = chart?.reason ?? 'No composition readings in this range.';
    return { width, height: 64, label, readout, nodes: [text(0, 30, readout, { size: 12, cls: 'hc-text hc-text--muted' })], hits: {} };
  }
  const rows = chart.points;
  const pad = { top: 16, right: 96, bottom: 24, left: 40 };
  const plotL = pad.left;
  const plotR = width - pad.right;
  const plotB = height - pad.bottom;
  const ext = Math.max(5, ...rows.map(r => Math.abs(r.fatChange)), ...rows.map(r => Math.abs(r.muscleChange))) * 1.12;
  const from = rows[0].date;
  const x = linearScale([0, Math.max(1, dayIndex(from, rows.at(-1).date))], [plotL, plotR]);
  const y = linearScale([-ext, ext], [plotB, pad.top]);
  const nodes = [];
  const hits = {};

  const tick = ext > 30 ? 20 : ext > 12 ? 10 : 5;
  for (let v = -Math.floor(ext / tick) * tick; v <= ext; v += tick) {
    nodes.push(node('line', { x1: plotL, x2: fx(plotR), y1: fx(y(v)), y2: fx(y(v)) }, { cls: v === 0 ? 'hc-grid bc-zero' : 'hc-grid' }));
    nodes.push(text(plotL - 6, y(v) + 3.5, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`, { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));
  }
  const px = r => x(dayIndex(from, r.date));
  const muscle = rows.map(r => [px(r), y(r.muscleChange)]);
  const fat = rows.map(r => [px(r), y(r.fatChange)]);
  nodes.push(node('polygon', { points: points([...muscle, ...[...fat].reverse()]) }, { cls: 'bc-blade-gap', anim: 'fade', delay: 1000, dur: 600 }));
  nodes.push(node('polyline', { points: points(fat), pathLength: 1 }, { cls: 'bc-fat-line', anim: 'draw', dur: 1100 }));
  nodes.push(node('polyline', { points: points(muscle), pathLength: 1 }, { cls: 'bc-muscle-line', anim: 'draw', dur: 1100 }));

  rows.forEach((r, i) => {
    const id = `rec-${r.date}`;
    const delay = Math.round((i / Math.max(1, rows.length - 1)) * 1000);
    nodes.push(node('circle', { cx: fx(muscle[i][0]), cy: fx(muscle[i][1]), r: 3.8 }, { cls: 'bc-muscle-dot', hit: id, anim: 'fade', delay }));
    nodes.push(node('circle', { cx: fx(fat[i][0]), cy: fx(fat[i][1]), r: 3.8 }, { cls: 'bc-fat-dot', hit: id, anim: 'fade', delay }));
    const left = i === 0 ? plotL - 6 : (muscle[i - 1][0] + muscle[i][0]) / 2;
    const right = i === rows.length - 1 ? plotR + 6 : (muscle[i][0] + muscle[i + 1][0]) / 2;
    nodes.push(node('rect', { x: fx(left), y: pad.top, width: fx(Math.max(4, right - left)), height: fx(plotB - pad.top) }, { cls: 'hc-hitpad-fill', hit: id }));
    hits[id] = {
      id,
      title: formatDisplayDate(r.date),
      lines: [
        `Muscle ${formatNumber(r.muscleKg, 1)} kg (${signed(r.muscleChange, 1, '%')})`,
        `Body fat ${formatNumber(r.fatPct, 1)}% (${signed(r.fatChange, 1, '%')})`
      ],
      detail: `${formatDisplayDate(r.date)}: muscle ${formatNumber(r.muscleKg, 1)} kg, body fat ${formatNumber(r.fatPct, 1)}%.`,
      guide: { x: fx(muscle[i][0]), y1: pad.top, y2: plotB }
    };
  });

  const last = rows.at(-1);
  const ex = plotR + 8;
  let my = muscle.at(-1)[1];
  let fy = fat.at(-1)[1];
  if (Math.abs(my - fy) < 26) {
    const mid = (my + fy) / 2;
    my = mid - 13;
    fy = mid + 13;
  }
  nodes.push(text(ex, my - 1, `Muscle ${signed(last.muscleChange, 0, '%')}`, { size: 11, weight: 700, cls: 'hc-text bc-text--muscle', anim: 'fade', delay: 1100 }));
  nodes.push(text(ex, my + 11, `${formatNumber(chart.base.muscleKg, 1)} → ${formatNumber(last.muscleKg, 1)} kg`, { size: 9.5, cls: 'hc-text hc-text--muted', anim: 'fade', delay: 1100 }));
  nodes.push(text(ex, fy - 1, `Body fat ${signed(last.fatChange, 0, '%')}`, { size: 11, weight: 700, cls: 'hc-text bc-text--fat', anim: 'fade', delay: 1100 }));
  nodes.push(text(ex, fy + 11, `${formatNumber(chart.base.fatPct, 1)} → ${formatNumber(last.fatPct, 1)}%`, { size: 9.5, cls: 'hc-text hc-text--muted', anim: 'fade', delay: 1100 }));
  nodes.push(text(plotL, height - 7, short(rows[0].date), { size: 10, cls: 'hc-text hc-text--muted' }));
  nodes.push(text(plotR, height - 7, short(last.date), { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));

  return {
    width,
    height,
    label,
    readout: `Both indexed to ${formatDisplayDate(chart.base.date)}. The wider the blades, the better the recomp.`,
    nodes,
    hits
  };
}
