/**
 * twin-clocks — one year dial per forecast scenario (As logged, On plan).
 * Today sits at 12 o'clock; the year runs clockwise. The outer arc is the first
 * stay inside the weight band, the inner arc the first stay inside the body-fat
 * band. The box is only reached where the two arcs overlap. Faint arcs show the
 * same windows across the 95% expenditure range. Independent clocks: nothing
 * here blends the two scenarios.
 */
import { formatDisplayDate } from '../../core/time.js';
import { arcPath, dayIndex, fx, legend, monthShort, monthStarts, node, polar, text } from './scene.js';

const YEAR = 365;

const theta = day => -90 + (Math.max(0, Math.min(YEAR - 0.5, day)) / YEAR) * 360;

function windowSpan(windows) {
  const list = windows.filter(Boolean);
  if (!list.length) return null;
  return { from: Math.min(...list.map(w => w.from_day)), to: Math.max(...list.map(w => w.to_day)) };
}

function lead(scenario) {
  switch (scenario.status) {
    case 'dated': return formatDisplayDate(scenario.date);
    case 'complete': return 'In the box';
    case 'will_not_arrive': return 'Will not arrive';
    default: return 'Locked';
  }
}

function sub(scenario) {
  const trace = scenario.trace;
  if (scenario.status === 'locked') return 'needs more data';
  if (scenario.status === 'dated') return 'box date';
  if (trace?.miss_days != null) return `misses by ${trace.miss_days} day${trace.miss_days === 1 ? '' : 's'}`;
  return 'no overlap this year';
}

function partitionLine(scenario) {
  if (scenario.partition === 'preserve_ffm') return 'lean mass held';
  if (scenario.partition === 'forbes') return 'Forbes partition';
  return '';
}

function dial(scenario, { cx, cy, radius, date, lockText }) {
  const nodes = [];
  const hits = {};
  const key = scenario.key;
  const stroke = Math.max(9, Math.round(radius * 0.11));
  const rW = radius - stroke / 2;
  const rF = rW - stroke - 5;
  const rGap = (rW + rF) / 2;
  const locked = scenario.status === 'locked' || !scenario.trace;
  const end = new Date(Date.parse(`${date}T00:00:00Z`) + (YEAR - 1) * 86400000).toISOString().slice(0, 10);

  nodes.push(node('circle', { cx, cy, r: fx(radius + 5) }, { cls: 'hc-dial-rim' }));
  for (const month of monthStarts(date, end)) {
    const d = dayIndex(date, month);
    const [ax, ay] = polar(cx, cy, radius + 1, theta(d));
    const [bx, by] = polar(cx, cy, radius + 8, theta(d));
    nodes.push(node('line', { x1: fx(ax), y1: fx(ay), x2: fx(bx), y2: fx(by) }, { cls: 'hc-axis-tick' }));
    const [lx, ly] = polar(cx, cy, radius + 18, theta(d + 15));
    nodes.push(text(lx, ly + 3.5, monthShort(month).slice(0, 1), { size: 10, anchor: 'middle', cls: 'hc-text hc-text--muted' }));
  }
  for (const r of [rW, rF]) {
    nodes.push(node('circle', { cx, cy, r: fx(r), 'stroke-width': stroke }, {
      cls: `hc-dial-track${locked ? ' hc-dial-track--locked' : ''}`
    }));
  }
  const [tx, ty] = polar(cx, cy, radius + 5, -90);
  nodes.push(node('path', { d: `M${fx(tx)} ${fx(ty - 1)} l-5 -8 h10 z` }, { cls: 'hc-dial-today' }));

  const centreId = `clock-${key}`;
  hits[centreId] = {
    id: centreId,
    group: key,
    title: scenario.label,
    lines: locked
      ? [lockText || 'Locked until the inputs are in.']
      : [
          `${lead(scenario)} · ${sub(scenario)}`,
          scenario.intakeKcal != null ? `${Math.round(scenario.intakeKcal).toLocaleString('en-AU')} kcal in · ${Math.round(scenario.expenditureKcal).toLocaleString('en-AU')} kcal out` : null,
          partitionLine(scenario) || null
        ].filter(Boolean),
    detail: locked
      ? `${scenario.label} is locked. ${lockText ?? ''}`.trim()
      : scenario.status === 'dated'
        ? `${scenario.label}: weight and body fat are both in band from ${formatDisplayDate(scenario.date)}.`
        : `${scenario.label}: ${scenario.reason ?? 'weight and body fat never sit in band together'}.`,
    select: key
  };
  nodes.push(node('circle', { cx, cy, r: fx(rF - stroke / 2 - 3) }, { cls: 'hc-dial-face', hit: centreId }));

  if (!locked) {
    const trace = scenario.trace;
    const low = scenario.range?.low_expenditure;
    const high = scenario.range?.high_expenditure;
    const wSpan = windowSpan([trace.weight_band, low?.weight_band, high?.weight_band]);
    const fSpan = windowSpan([trace.body_fat_band, low?.body_fat_band, high?.body_fat_band]);
    if (wSpan) nodes.push(node('path', { d: arcPath(cx, cy, rW, theta(wSpan.from), theta(wSpan.to)), 'stroke-width': stroke }, { cls: 'hc-arc-range hc-arc-range--weight', anim: 'fade', delay: 500 }));
    if (fSpan) nodes.push(node('path', { d: arcPath(cx, cy, rF, theta(fSpan.from), theta(fSpan.to)), 'stroke-width': stroke }, { cls: 'hc-arc-range hc-arc-range--fat', anim: 'fade', delay: 600 }));

    const w = trace.weight_band;
    const f = trace.body_fat_band;
    if (w) {
      const id = `${key}-weight`;
      nodes.push(node('path', { d: arcPath(cx, cy, rW, theta(w.from_day), theta(w.to_day)), 'stroke-width': stroke, pathLength: 1 }, {
        cls: 'hc-arc hc-arc--weight', hit: id, anim: 'draw', delay: 150
      }));
      hits[id] = {
        id, group: key, select: key,
        title: `${scenario.label} · weight in band`,
        lines: [`${formatDisplayDate(w.from)} to ${formatDisplayDate(w.to)}${w.open_ended ? ' and beyond' : ''}`],
        detail: `${scenario.label}: weight sits inside the band from ${formatDisplayDate(w.from)} to ${formatDisplayDate(w.to)}.`
      };
    }
    if (f) {
      const id = `${key}-fat`;
      nodes.push(node('path', { d: arcPath(cx, cy, rF, theta(f.from_day), theta(f.to_day)), 'stroke-width': stroke, pathLength: 1 }, {
        cls: 'hc-arc hc-arc--fat', hit: id, anim: 'draw', delay: 300
      }));
      hits[id] = {
        id, group: key, select: key,
        title: `${scenario.label} · body fat in band`,
        lines: [`${formatDisplayDate(f.from)} to ${formatDisplayDate(f.to)}${f.open_ended ? ' and beyond' : ''}`],
        detail: `${scenario.label}: body fat sits inside the band from ${formatDisplayDate(f.from)} to ${formatDisplayDate(f.to)}.`
      };
    }
    if (trace.overlap) {
      const o = trace.overlap;
      const id = `${key}-box`;
      nodes.push(node('path', { d: arcPath(cx, cy, rGap, theta(o.from_day), theta(Math.max(o.to_day, o.from_day + 2))), 'stroke-width': stroke * 2 + 5 }, {
        cls: 'hc-arc hc-arc--box', hit: id, anim: 'fade', delay: 700
      }));
      hits[id] = {
        id, group: key, select: key,
        title: `${scenario.label} · in the box`,
        lines: [`${formatDisplayDate(o.from)} to ${formatDisplayDate(o.to)}`],
        detail: `${scenario.label}: both bands hold from ${formatDisplayDate(o.from)} to ${formatDisplayDate(o.to)}.`
      };
    } else if (w && f && trace.miss_days != null) {
      const a = Math.min(w.to_day, f.to_day);
      const b = Math.max(w.from_day, f.from_day);
      const id = `${key}-gap`;
      nodes.push(node('path', { d: arcPath(cx, cy, rGap, theta(a), theta(Math.max(b, a + 1))) }, {
        cls: 'hc-arc-gap', hit: id, anim: 'fade', delay: 700
      }));
      const [mx, my] = polar(cx, cy, rGap, theta((a + b) / 2));
      nodes.push(node('circle', { cx: fx(mx), cy: fx(my), r: 4 }, { cls: 'hc-gap-dot', hit: id, anim: 'fade', delay: 750 }));
      hits[id] = {
        id, group: key, select: key,
        title: `${scenario.label} · the miss`,
        lines: [`${trace.miss_days} day${trace.miss_days === 1 ? '' : 's'} between the two windows`],
        detail: w.to_day < f.from_day
          ? `${scenario.label}: weight leaves its band on ${formatDisplayDate(w.to)}, ${trace.miss_days} days before body fat reaches its band on ${formatDisplayDate(f.from)}. The box is never reached.`
          : `${scenario.label}: body fat leaves its band on ${formatDisplayDate(f.to)}, ${trace.miss_days} days before weight reaches its band on ${formatDisplayDate(w.from)}. The box is never reached.`
      };
    }
  }

  nodes.push(text(cx, cy - radius * 0.2, scenario.label.toUpperCase(), { size: 10, weight: 700, anchor: 'middle', cls: 'hc-text hc-text--caps' }));
  nodes.push(text(cx, cy + 4, lead(scenario), { size: Math.max(13, Math.round(radius / 8)), weight: 700, anchor: 'middle', cls: 'hc-text hc-text--strong', anim: 'fade', delay: 200 }));
  nodes.push(text(cx, cy + radius * 0.2, sub(scenario), { size: 11, weight: 700, anchor: 'middle', cls: `hc-text ${scenario.status === 'dated' ? 'hc-text--good' : 'hc-text--accent'}`, anim: 'fade', delay: 250 }));
  const part = partitionLine(scenario);
  if (part) nodes.push(text(cx, cy + radius * 0.2 + 15, part, { size: 10, anchor: 'middle', cls: 'hc-text hc-text--muted' }));
  return { nodes, hits };
}

export function buildTwinClocks(chart, { width = 560, lockText = '' } = {}) {
  const date = chart.date;
  const gap = 24;
  const stacked = (width - gap) / 2 < 200;
  const radius = stacked
    ? Math.max(70, Math.min(118, width / 2 - 26))
    : Math.max(70, Math.min(118, (width - gap) / 4 - 26));
  const dialBox = (radius + 26) * 2;
  const top = 6;
  const nodes = [];
  const hits = {};
  chart.scenarios.forEach((scenario, i) => {
    const cx = stacked ? width / 2 : (width - (dialBox * 2 + gap)) / 2 + dialBox / 2 + i * (dialBox + gap);
    const cy = stacked ? top + dialBox / 2 + i * (dialBox + gap) : top + dialBox / 2;
    const built = dial(scenario, { cx: fx(cx), cy: fx(cy), radius, date, lockText });
    nodes.push(node('g', {}, { cls: 'hc-dial', group: scenario.key, children: built.nodes }));
    Object.assign(hits, built.hits);
  });

  const rows = stacked ? chart.scenarios.length : 1;
  const legendY = top + rows * dialBox + (rows - 1) * gap + 14;
  const key = legend([
    ['hc-legend-weight', 'Weight in band'],
    ['hc-legend-fat', 'Body fat in band'],
    ['hc-legend-box', 'Both: the box'],
    ['hc-legend-gap', 'Miss']
  ], { x: 8, y: legendY, width: width - 16, center: true, swatch: [16, 7], size: 11 });
  nodes.push(...key.nodes);

  const dated = chart.scenarios.filter(s => s.status === 'dated' || s.status === 'complete').length;
  return {
    width,
    height: legendY + key.height - 4,
    label: `Two independent year clocks. ${dated} of ${chart.scenarios.length} dated.`,
    readout: 'Faint arcs show the 95% expenditure range. Tap a clock to follow it on the road below.',
    nodes,
    hits
  };
}
