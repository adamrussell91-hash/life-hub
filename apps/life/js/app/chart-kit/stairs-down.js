/**
 * stairs-down — weight as a staircase. One step per reading, week, month or
 * quarter (by range); down steps in wave, up steps in peach, and a dashed step
 * at the end for what is left to the target band. On entrance a ball bounces
 * down the stairs to today.
 */
import { formatDisplayDate } from '../../core/time.js';
import { formatNumber, fx, linearScale, monthShort, node, text } from './scene.js';

const UNIT = { reading: 'weigh-in', week: 'week', month: 'month', quarter: 'quarter' };

function stepTitle(step, mode) {
  if (mode === 'reading') return formatDisplayDate(step.date);
  if (mode === 'week') return `Week of ${formatDisplayDate(step.date)}`;
  if (mode === 'month') return `${monthShort(step.date)} ${step.date.slice(0, 4)}`;
  const q = Math.floor((Number(step.date.slice(5, 7)) - 1) / 3) + 1;
  return `Q${q} ${step.date.slice(0, 4)}`;
}

function firstLabel(step, mode) {
  if (mode === 'reading' || mode === 'week') return `${Number(step.date.slice(8, 10))} ${monthShort(step.date)}`;
  return `${monthShort(step.date)} ’${step.date.slice(2, 4)}`;
}

export function buildStairsDown(chart, { width = 520, height = 196 } = {}) {
  const label = 'Weight as a staircase, one step per period, ending in the steps still to go.';
  if (chart?.status !== 'ready') {
    const readout = chart?.reason ?? 'No weigh-ins in this range.';
    return { width, height: 64, label, readout, nodes: [text(0, 30, readout, { size: 12, cls: 'hc-text hc-text--muted' })], hits: {} };
  }
  const { steps, mode, band } = chart;
  const unit = UNIT[mode];
  const pad = { top: 20, right: 12, bottom: 24, left: 32 };
  const plotL = pad.left;
  const plotR = width - pad.right;
  const plotB = height - pad.bottom;
  const values = steps.map(s => s.kg);
  if (band) values.push(band.low);
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1.5);
  const y = linearScale([lo, hi], [plotB, pad.top]);
  const slot = (plotR - plotL) / (steps.length + 1);
  const centre = i => plotL + slot * i + slot / 2;
  const nodes = [];
  const hits = {};

  const span = hi - lo;
  const tick = span > 30 ? 10 : span > 12 ? 5 : 2;
  for (let v = Math.ceil(lo / tick) * tick; v <= hi; v += tick) {
    nodes.push(node('line', { x1: plotL, x2: fx(plotR), y1: fx(y(v)), y2: fx(y(v)) }, { cls: 'hc-grid' }));
    nodes.push(text(plotL - 6, y(v) + 3.5, v, { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));
  }
  if (band) {
    nodes.push(node('rect', { x: plotL, y: fx(y(band.high)), width: fx(plotR - plotL), height: fx(y(band.low) - y(band.high)), rx: 3 }, { cls: 'hc-band' }));
  }

  // Hop timing drives both the ball and when each step appears.
  const hop = Math.max(70, Math.min(170, 2200 / steps.length));
  nodes.push(node('line', {
    x1: fx(plotL + 1), x2: fx(plotL + slot), y1: fx(y(steps[0].kg)), y2: fx(y(steps[0].kg))
  }, { cls: 'bc-tread' }));

  steps.forEach((step, i) => {
    const id = `step-${step.date}`;
    const guide = { x: fx(centre(i)), y1: pad.top, y2: plotB };
    if (i > 0) {
      const prev = steps[i - 1].kg;
      const x0 = plotL + slot * i + 1;
      const w = Math.max(2, slot - 2);
      const down = step.change <= 0;
      nodes.push(node('rect', {
        x: fx(x0), y: fx(y(Math.max(prev, step.kg))), width: fx(w),
        height: fx(Math.max(1.5, Math.abs(y(prev) - y(step.kg)))), rx: fx(Math.min(3, w / 3))
      }, { cls: down ? 'bc-step bc-step--down' : 'bc-step bc-step--up', hit: id, anim: 'fade', delay: Math.round(hop * (i - 0.5)), dur: 220 }));
      nodes.push(node('line', { x1: fx(x0), x2: fx(x0 + w + 1), y1: fx(y(step.kg)), y2: fx(y(step.kg)) }, {
        cls: 'bc-tread', anim: 'fade', delay: Math.round(hop * (i - 0.5)), dur: 220
      }));
    }
    nodes.push(node('rect', { x: fx(plotL + slot * i), y: pad.top, width: fx(slot), height: fx(plotB - pad.top) }, { cls: 'hc-hitpad-fill', hit: id }));
    hits[id] = {
      id,
      title: stepTitle(step, mode),
      lines: [
        `${formatNumber(step.kg, 1)} kg${step.count > 1 ? `, average of ${step.count}` : ''}`,
        step.change == null ? `Start of this range` : `${step.change <= 0 ? 'Down' : 'Up'} ${formatNumber(Math.abs(step.change), 1)} kg on the ${unit} before`
      ],
      detail: `${stepTitle(step, mode)}: ${formatNumber(step.kg, 1)} kg.`,
      guide
    };
  });

  const last = steps.at(-1);
  if (band && last.kg > band.high) {
    const gx = plotL + slot * steps.length + 1;
    nodes.push(node('rect', {
      x: fx(gx), y: fx(y(last.kg)), width: fx(Math.max(2, slot - 2)), height: fx(y(band.high) - y(last.kg)), rx: 3
    }, { cls: 'bc-step bc-step--todo', hit: 'to-go', anim: 'fade', delay: Math.round(hop * steps.length), dur: 300 }));
    nodes.push(text(plotR, y(last.kg) - 8, 'to go', { size: 10, weight: 600, anchor: 'end', cls: 'hc-text hc-text--muted' }));
    hits['to-go'] = {
      id: 'to-go',
      title: `${formatNumber(chart.toGoKg, 1)} kg to go`,
      lines: [`To the top of the ${band.low}–${band.high} kg band`],
      detail: `${formatNumber(chart.toGoKg, 1)} kg still to step down to reach ${band.high} kg.`
    };
  }
  if (chart.biggestDrop && steps.length > 2) {
    const i = steps.findIndex(s => s.date === chart.biggestDrop.date);
    nodes.push(text(centre(i) + 1, y(steps[i].kg) + 13, `−${formatNumber(chart.biggestDrop.kg, 1)}`, {
      size: 10, weight: 700, anchor: 'middle', anim: 'fade', delay: Math.round(hop * i)
    }));
  }
  nodes.push(text(plotL, height - 7, firstLabel(steps[0], mode), { size: 10, cls: 'hc-text hc-text--muted' }));
  nodes.push(text(plotR, height - 7, 'today', { size: 10, anchor: 'end', cls: 'hc-text hc-text--muted' }));

  // The ball: rests on today's tread; on entrance it hops down every step.
  const ballY = i => y(steps[i].kg) - 5.5;
  let path = `M${fx(centre(0))} ${fx(ballY(0))}`;
  for (let i = 1; i < steps.length; i += 1) {
    const peak = Math.min(ballY(i - 1), ballY(i)) - 14;
    path += ` Q${fx((centre(i - 1) + centre(i)) / 2)} ${fx(peak)} ${fx(centre(i))} ${fx(ballY(i))}`;
  }
  nodes.push(node('circle', { cx: fx(centre(steps.length - 1)), cy: fx(ballY(steps.length - 1)), r: 4.5 }, {
    cls: 'bc-ball', motion: { path, dur: Math.round(hop * (steps.length - 1)) }
  }));

  return {
    width,
    height,
    label,
    readout: `${chart.downSteps} of ${steps.length - 1} ${unit}s stepped down.${chart.biggestDrop ? ` Biggest step −${formatNumber(chart.biggestDrop.kg, 1)} kg.` : ''}`,
    nodes,
    hits
  };
}
