/**
 * glide-slope — measured weigh-ins against the robust (Theil-Sen) trend, with the
 * split between them drawn as residual stalks, and the trend carried forward
 * into the target band with its 95% slope wedge and entry-date rail.
 */
import { formatDisplayDate } from '../../core/time.js';
import {
  dayIndex,
  formatNumber,
  fx,
  legend,
  linearScale,
  monthShort,
  monthStarts,
  node,
  points,
  signed,
  text
} from './scene.js';

const MAX_FUTURE_DAYS = 180;

export function buildGlideSlope(chart, { width = 520, height = 236 } = {}) {
  const pad = { top: width < 380 ? 56 : 40, right: 12, bottom: 26, left: 32 };
  const nodes = [];
  const hits = {};
  const from = chart.from;
  const date = chart.date;
  const band = chart.band;
  const obs = chart.points ?? [];
  const proj = chart.projection;

  const latestEntry = proj?.entry_range?.latest ?? proj?.entry_date ?? null;
  const futureDays = Math.min(MAX_FUTURE_DAYS, latestEntry ? dayIndex(date, latestEntry) + 21 : 21);
  const dMin = 0;
  const dMax = dayIndex(from, date) + futureDays;
  const x = linearScale([dMin, dMax], [pad.left, width - pad.right]);

  const endTrend = proj ? proj.trend_today_kg + (proj.slope_per_week / 7) * futureDays : null;
  const values = [...obs.map(p => p.weight_kg), ...obs.map(p => p.trend_kg).filter(v => v != null)];
  if (band) values.push(band.low, band.high);
  if (endTrend != null) values.push(endTrend);
  if (!values.length) values.push(80);
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 0.8);
  const y = linearScale([lo, hi], [height - pad.bottom, pad.top]);
  const plotL = pad.left;
  const plotR = width - pad.right;
  const plotT = pad.top;
  const plotB = height - pad.bottom;

  nodes.push(node('clipPath', { id: 'glide-clip' }, {
    children: [node('rect', { x: plotL, y: plotT, width: fx(plotR - plotL), height: fx(plotB - plotT) })]
  }));

  if (band) {
    nodes.push(node('rect', {
      x: plotL, y: fx(y(band.high)), width: fx(plotR - plotL), height: fx(y(band.low) - y(band.high))
    }, { cls: 'hc-band', hit: 'glide-band', anim: 'fade' }));
    nodes.push(text(plotL + 6, y(band.low) - 6, `${band.low}–${band.high} kg`, {
      size: 11, weight: 600, cls: 'hc-text hc-text--band'
    }));
    hits['glide-band'] = {
      id: 'glide-band',
      title: 'Target weight band',
      lines: [`${band.low}–${band.high} kg`],
      detail: `The weight half of the recomp box: ${band.low} to ${band.high} kg.`
    };
  }

  const step = hi - lo > 10 ? 4 : 2;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    nodes.push(node('line', { x1: plotL, x2: plotR, y1: fx(y(v)), y2: fx(y(v)) }, { cls: 'hc-grid' }));
    nodes.push(text(plotL - 6, y(v) + 4, v, { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));
  }
  const lastDay = new Date(Date.parse(`${from}T00:00:00Z`) + dMax * 86400000).toISOString().slice(0, 10);
  for (const month of monthStarts(from, lastDay)) {
    const mx = x(dayIndex(from, month));
    nodes.push(node('line', { x1: fx(mx), x2: fx(mx), y1: plotB, y2: plotB + 4 }, { cls: 'hc-axis-tick' }));
    nodes.push(text(mx, plotB + 17, monthShort(month), { size: 10, anchor: 'middle', cls: 'hc-text hc-text--muted' }));
  }

  const todayX = x(dayIndex(from, date));
  nodes.push(node('line', { x1: fx(todayX), x2: fx(todayX), y1: plotT - 6, y2: plotB }, { cls: 'hc-today' }));
  nodes.push(text(todayX, plotT - 9, 'today', { size: 10, anchor: 'middle', cls: 'hc-text hc-text--muted' }));

  // Projection wedge and dashed trend (behind the history).
  if (proj) {
    const [s1, s2] = (proj.slope_ci_95_per_week ?? [proj.slope_per_week, proj.slope_per_week]).map(v => v / 7);
    const x0 = todayX;
    const x1 = x(dayIndex(from, date) + futureDays);
    nodes.push(node('polygon', {
      points: points([
        [x0, y(proj.trend_today_kg)],
        [x1, y(proj.trend_today_kg + s1 * futureDays)],
        [x1, y(proj.trend_today_kg + s2 * futureDays)]
      ]),
      'clip-path': 'url(#glide-clip)'
    }, { cls: 'hc-wedge', hit: 'glide-wedge', anim: 'fade', delay: 700 }));
    hits['glide-wedge'] = {
      id: 'glide-wedge',
      title: '95% slope range',
      lines: [`${signed(proj.slope_ci_95_per_week?.[0], 2)} to ${signed(proj.slope_ci_95_per_week?.[1], 2)} kg/week`],
      detail: 'The shaded wedge is where the trend could plausibly run, from the Sen 95% slope interval.'
    };
    nodes.push(node('line', {
      x1: fx(x0), y1: fx(y(proj.trend_today_kg)), x2: fx(x1), y2: fx(y(endTrend)),
      'clip-path': 'url(#glide-clip)'
    }, { cls: 'hc-trend hc-trend--projected', anim: 'fade', delay: 700 }));
  }

  // Split fill between measured and trend.
  const withTrend = obs.filter(p => p.trend_kg != null);
  if (withTrend.length >= 2) {
    const measured = withTrend.map(p => [x(dayIndex(from, p.date)), y(p.weight_kg)]);
    const fitted = withTrend.map(p => [x(dayIndex(from, p.date)), y(p.trend_kg)]).reverse();
    nodes.push(node('polygon', { points: points([...measured, ...fitted]) }, { cls: 'hc-split-fill', anim: 'fade', delay: 400 }));
  }

  // Residual stalks.
  withTrend.forEach((p, i) => {
    const px = x(dayIndex(from, p.date));
    nodes.push(node('line', { x1: fx(px), x2: fx(px), y1: fx(y(p.trend_kg)), y2: fx(y(p.weight_kg)) }, {
      cls: `hc-stalk ${p.split_kg > 0 ? 'hc-stalk--above' : 'hc-stalk--below'}`,
      anim: 'fade',
      delay: 450 + 30 * i
    }));
  });

  // Measured line, then trend line.
  if (obs.length >= 2) {
    nodes.push(node('polyline', {
      points: points(obs.map(p => [x(dayIndex(from, p.date)), y(p.weight_kg)])),
      pathLength: 1
    }, { cls: 'hc-measured', anim: 'draw' }));
  }
  if (withTrend.length >= 2) {
    const first = withTrend[0];
    const last = withTrend.at(-1);
    nodes.push(node('line', {
      x1: fx(x(dayIndex(from, first.date))), y1: fx(y(first.trend_kg)),
      x2: fx(todayX), y2: fx(y(proj?.trend_today_kg ?? last.trend_kg)),
      pathLength: 1
    }, { cls: 'hc-trend', anim: 'draw', delay: 250 }));
  }

  // Dots with column hit areas (nearest-date hover).
  const xs = obs.map(p => x(dayIndex(from, p.date)));
  obs.forEach((p, i) => {
    const id = `obs-${p.date}`;
    const left = i === 0 ? plotL : (xs[i - 1] + xs[i]) / 2;
    const right = i === obs.length - 1 ? Math.min(plotR, xs[i] + 14) : (xs[i] + xs[i + 1]) / 2;
    nodes.push(node('rect', { x: fx(left), y: plotT, width: fx(Math.max(4, right - left)), height: fx(plotB - plotT) }, {
      cls: 'hc-hitpad-fill', hit: id
    }));
    nodes.push(node('circle', { cx: fx(xs[i]), cy: fx(y(p.weight_kg)), r: 4 }, {
      cls: 'hc-obs', hit: id, anim: 'fade', delay: 300 + 35 * i
    }));
    const split = p.split_kg == null
      ? 'Trend not ready yet'
      : `${signed(p.split_kg, 2, ' kg')} ${p.split_kg > 0 ? 'above' : p.split_kg < 0 ? 'below' : 'on'} trend`;
    hits[id] = {
      id,
      title: formatDisplayDate(p.date),
      lines: [
        `Measured ${formatNumber(p.weight_kg, 1)} kg`,
        p.trend_kg == null ? null : `Trend ${formatNumber(p.trend_kg, 1)} kg`,
        split
      ].filter(Boolean),
      detail: `${formatDisplayDate(p.date)}: measured ${formatNumber(p.weight_kg, 1)} kg. ${split}. The split is day-to-day noise such as water, food and timing.`,
      guide: { x: fx(xs[i]), y1: plotT, y2: plotB }
    };
  });

  if (proj?.entry_date && band) {
    const edge = proj.trend_today_kg > band.high ? band.high : band.low;
    const ey = y(edge);
    if (proj.entry_range) {
      const ra = x(dayIndex(from, proj.entry_range.earliest));
      const rb = Math.min(plotR, x(dayIndex(from, proj.entry_range.latest)));
      nodes.push(node('line', { x1: fx(ra), x2: fx(rb), y1: fx(ey), y2: fx(ey) }, {
        cls: 'hc-entry-rail', hit: 'glide-entry', anim: 'fade', delay: 950
      }));
    }
    const ex = x(dayIndex(from, proj.entry_date));
    if (ex <= plotR) {
      nodes.push(node('circle', { cx: fx(ex), cy: fx(ey), r: 6 }, {
        cls: 'hc-entry-dot', hit: 'glide-entry', anim: 'fade', delay: 1000
      }));
      nodes.push(text(ex, ey - 12, `enters ${formatDisplayDate(proj.entry_date)}`, {
        size: 11, weight: 700, anchor: 'middle', cls: 'hc-text hc-text--accent', anim: 'fade', delay: 1000
      }));
    }
    hits['glide-entry'] = {
      id: 'glide-entry',
      title: `Band entry ${formatDisplayDate(proj.entry_date)}`,
      lines: [
        proj.entry_range
          ? `Range ${formatDisplayDate(proj.entry_range.earliest)} to ${formatDisplayDate(proj.entry_range.latest)}`
          : null,
        `At ${signed(proj.slope_per_week, 2)} kg/week`
      ].filter(Boolean),
      detail: `If the trend holds at ${signed(proj.slope_per_week, 2)} kg a week, weight enters ${band.low}–${band.high} kg around ${formatDisplayDate(proj.entry_date)}.`
    };
  }

  // Legend.
  nodes.push(...legend([
    ['hc-legend-measured', 'Measured'],
    ['hc-legend-trend', 'Trend'],
    ['hc-legend-above', 'Above trend'],
    ['hc-legend-below', 'Below trend']
  ], { x: plotL, y: 10, width: width - plotL - 4, swatch: [14, 4] }).nodes);

  let readout;
  if (!obs.length) readout = 'No weigh-ins in the last 8 weeks.';
  else if (!chart.trendReady) readout = `Measured line only. The trend appears after ${chart.trendNeeds} more weigh-in${chart.trendNeeds === 1 ? '' : 's'}.`;
  else readout = `Typical split from trend: ±${formatNumber(chart.residualMadKg, 2)} kg. Tap a weigh-in for its split.`;

  return {
    width,
    height,
    label: `Weigh-ins over the last ${chart.historyDays} days against the robust trend.`,
    readout,
    nodes,
    hits
  };
}
