/**
 * gate-rings — three concentric 270° rings, one per lean-preservation key.
 * Each ring's scale runs from 0 to 2× its threshold, so every threshold sits on
 * one shared radial "gate" spoke at the half-way angle. A ring that crosses the
 * spoke has met its key. Values above 2× cap the ring and mark the overflow.
 */
import { arcPath, fx, formatNumber, node, polar, text } from './scene.js';

export const GATE_START = -90; // 12 o'clock
const START = GATE_START;
const SWEEP = 270;
const GATE_ANGLE = START + SWEEP / 2;
export const TREND_STEADY_DEG = 5;
const KEY_CLASS = { sessions: 'sessions', upper_sets: 'upper', protein: 'protein' };

export function gateValueAngle(value, threshold) {
  const fraction = Math.max(0.004, Math.min(1, Number(value) / (2 * Number(threshold))));
  return START + SWEEP * fraction;
}

/** Recent pace of 0 stops short of the ring labels at 12 o'clock. */
export function gateTipAngle(value, threshold) {
  return Math.max(START + 8, gateValueAngle(value, threshold));
}

export function gateTrendRadius(ringRadius, stroke = 15, gap = 9) {
  return ringRadius - stroke / 2 - gap / 2;
}

export function gateRingFrame(width, keyCount, { stroke = 15, gap = 9, sideAt = 440 } = {}) {
  const side = width >= sideAt;
  const size = side ? Math.min(232, Math.round(width * 0.46)) : Math.min(232, width);
  const cx = side ? size / 2 : width / 2;
  const cy = size / 2;
  const outer = size / 2 - stroke / 2 - 4;
  const radii = Array.from({ length: keyCount }, (_, index) => outer - index * (stroke + gap));
  return { side, size, cx, cy, outer, radii, stroke, gap };
}

/** Arc from tail to tip so the draw animation travels toward the dot. */
function directedArc(cx, cy, r, fromDeg, toDeg) {
  const [x0, y0] = polar(cx, cy, r, fromDeg);
  const [x1, y1] = polar(cx, cy, r, toDeg);
  const delta = toDeg - fromDeg;
  const large = Math.abs(delta) > 180 ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return `M${fx(x0)} ${fx(y0)} A${fx(r)} ${fx(r)} 0 ${large} ${sweep} ${fx(x1)} ${fx(y1)}`;
}

function statusLine(item) {
  if (item.status === 'unscored') return item.reason ?? 'Not scored yet.';
  const ratio = item.ratio == null ? '' : ` (${formatNumber(item.ratio, 1)}× the gate)`;
  return item.status === 'met' ? `Met${ratio}.` : `Short of the gate${ratio}.`;
}

const STATUS_TEXT = { met: 'Met', short: 'Short', unscored: 'Unscored' };

function recentTip(item) {
  if (!item.recentWindow) return null;
  if (item.recent == null) return `${item.recentWindow}: ${item.recentReason}`;
  const digits = item.key === 'protein' ? 2 : 1;
  const noun = item.key === 'sessions' ? ' sessions' : '';
  const where = item.recentStatus === 'met' ? 'above the gate' : 'below the gate';
  return `${item.recentWindow}: ${formatNumber(item.recent, digits)}${noun} · ${where}`;
}

function trendMark(item) {
  if (item.value == null || item.recent == null || !item.threshold) return null;
  const tail = gateValueAngle(item.value, item.threshold);
  const tip = gateTipAngle(item.recent, item.threshold);
  const steady = Math.abs(tip - tail) < TREND_STEADY_DEG;
  return { tail, tip, steady, met: item.recentStatus === 'met' };
}

export function buildGateRings(chart, { width = 520, stroke = 15, gap = 9 } = {}) {
  const keys = chart?.keys ?? [];
  const frame = gateRingFrame(width, keys.length, {
    stroke,
    gap,
    // The recent-pace line needs a wider row than the two-line key list.
    sideAt: keys.some(item => item.recentWindow) ? 560 : 440
  });
  const { side, size, cx, cy, outer, radii } = frame;
  const nodes = [];
  const hits = {};

  keys.forEach((item, index) => {
    const r = radii[index];
    const cls = KEY_CLASS[item.key] ?? 'sessions';
    const id = `gate-${item.key}`;
    const valueText = item.value == null ? 'No data' : `${formatNumber(item.value, item.key === 'protein' ? 2 : 1)}${item.unit}`;
    const lines = [
      `${valueText} · gate ${formatNumber(item.threshold, item.key === 'protein' ? 2 : 0)}`,
      statusLine(item)
    ];
    const pace = recentTip(item);
    if (pace) lines.push(pace);
    hits[id] = {
      id,
      group: item.key,
      title: item.label,
      lines,
      detail: `${item.label}: ${valueText}. ${statusLine(item)} ${item.note}${pace ? ` ${pace}.` : ''}`,
      action: item.key === 'upper_sets' ? 'open-regions' : null
    };

    if (item.value == null) {
      nodes.push(node('path', { d: arcPath(cx, cy, r, START, START + SWEEP) }, {
        cls: 'hc-gate-track hc-gate-track--unscored',
        hit: id,
        anim: 'fade',
        delay: 120 * index
      }));
    } else {
      nodes.push(node('path', { d: arcPath(cx, cy, r, START, START + SWEEP), 'stroke-width': stroke }, {
        cls: 'hc-gate-track'
      }));
      const fraction = Math.max(0.004, Math.min(1, item.value / (2 * item.threshold)));
      nodes.push(node('path', {
        d: arcPath(cx, cy, r, START, START + SWEEP * fraction),
        'stroke-width': stroke,
        fill: 'none',
        pathLength: 1
      }, {
        cls: `hc-gate-fill hc-gate-fill--${cls}${item.status === 'met' ? ' is-met' : ''}`,
        hit: id,
        anim: 'draw',
        delay: 120 * index
      }));
      if (item.value > 2 * item.threshold) {
        const [ex, ey] = polar(cx, cy, r, START + SWEEP);
        nodes.push(node('circle', { cx: fx(ex), cy: fx(ey), r: 2.6 }, { cls: 'hc-gate-overflow', anim: 'fade', delay: 900 }));
      }
    }
    // Wide transparent stroke: an easy target on touch and small screens.
    nodes.push(node('path', { d: arcPath(cx, cy, r, START, START + SWEEP), 'stroke-width': stroke + gap }, {
      cls: 'hc-hitpad',
      hit: id
    }));
    nodes.push(text(cx - 10, cy - r + 4, item.short, {
      size: 11,
      weight: 500,
      anchor: 'end',
      cls: 'hc-text hc-text--muted'
    }));
  });

  // Recent-pace arcs sit in the gap just inside each ring, and draw after the
  // rings so the stroke travels from the average toward the recent-pace dot.
  keys.forEach((item, index) => {
    const mark = trendMark(item);
    if (!mark) return;
    const lane = gateTrendRadius(radii[index], stroke, gap);
    const delay = 120 * index + 600;
    if (mark.steady) {
      const [x, y] = polar(cx, cy, lane, mark.tail);
      nodes.push(node('circle', { cx: fx(x), cy: fx(y), r: 2.6, fill: 'var(--muted)' }, {
        cls: 'hc-trend-dot hc-trend-dot--steady',
        anim: 'fade',
        delay
      }));
      return;
    }
    const tone = mark.met ? 'met' : 'short';
    const colour = mark.met ? 'var(--success)' : 'var(--danger)';
    const [x0, y0] = polar(cx, cy, lane, mark.tail);
    const [x1, y1] = polar(cx, cy, lane, mark.tip);
    const gradId = `trend-${item.key}`;
    nodes.push(node('defs', {}, {
      children: [
        node('linearGradient', {
          id: gradId,
          gradientUnits: 'userSpaceOnUse',
          x1: fx(x0),
          y1: fx(y0),
          x2: fx(x1),
          y2: fx(y1)
        }, {
          children: [
            node('stop', { offset: '0%', 'stop-color': colour, 'stop-opacity': '0.18' }),
            node('stop', { offset: '100%', 'stop-color': colour, 'stop-opacity': '1' })
          ]
        })
      ]
    }));
    nodes.push(node('path', {
      d: directedArc(cx, cy, lane, mark.tail, mark.tip),
      fill: 'none',
      stroke: `url(#${gradId})`,
      'stroke-width': 3,
      pathLength: 1
    }, {
      cls: `hc-gate-pace hc-gate-pace--${tone}`,
      anim: 'draw',
      delay,
      dur: 700
    }));
    nodes.push(node('circle', { cx: fx(x1), cy: fx(y1), r: 2.4, fill: colour }, {
      cls: `hc-trend-dot hc-trend-dot--${tone}`,
      anim: 'fade',
      delay,
      dur: 280
    }));
  });

  const inner = outer - (keys.length - 1) * (stroke + gap) - stroke / 2;
  const [gx0, gy0] = polar(cx, cy, Math.max(12, inner - 6), GATE_ANGLE);
  const [gx1, gy1] = polar(cx, cy, outer + stroke / 2 + 3, GATE_ANGLE);
  nodes.push(node('line', { x1: fx(gx0), y1: fx(gy0), x2: fx(gx1), y2: fx(gy1) }, {
    cls: 'hc-gate-spoke',
    hit: 'gate-spoke',
    anim: 'fade',
    delay: 500
  }));
  hits['gate-spoke'] = {
    id: 'gate-spoke',
    title: 'The gate',
    lines: ['Each ring reaches this spoke at its threshold.'],
    detail: 'The orange spoke is the pass mark. Rings run from zero to twice the threshold, so all three pass marks line up here.'
  };

  const scored = chart?.scoredCount ?? 0;
  nodes.push(text(cx, cy + 3, `${chart?.metCount ?? 0}/${keys.length}`, {
    size: 24, weight: 700, anchor: 'middle', cls: 'hc-text hc-text--strong', anim: 'fade', delay: 300
  }));
  nodes.push(text(cx, cy + 19, 'keys met', {
    size: 10.5, anchor: 'middle', cls: 'hc-text hc-text--muted', anim: 'fade', delay: 300
  }));
  if (scored < keys.length) {
    nodes.push(text(cx, cy + 32, `${keys.length - scored} unscored`, {
      size: 10, anchor: 'middle', cls: 'hc-text hc-text--accent', anim: 'fade', delay: 300
    }));
  }

  // Key rows: label, rule, value and status. Rows share hit ids with the rings.
  const rowX = side ? size + 22 : 0;
  const rowW = side ? width - rowX : width;
  const rowH = keys.some(item => item.recentWindow) ? 62 : 52;
  const rowTop = side ? Math.max(8, cy - (keys.length * rowH) / 2) : size + 14;
  keys.forEach((item, i) => {
    const y0 = rowTop + i * rowH;
    const id = `gate-${item.key}`;
    const cls = KEY_CLASS[item.key] ?? 'sessions';
    const digits = item.key === 'protein' ? 2 : 1;
    nodes.push(node('rect', { x: rowX - 6, y: y0, width: rowW + 6, height: rowH - 6, rx: 10 }, { cls: 'hc-row', hit: id }));
    nodes.push(node('circle', { cx: rowX + 6, cy: y0 + 17, r: 5 }, { cls: `hc-key-dot hc-key-dot--${cls}` }));
    nodes.push(text(rowX + 20, y0 + 21, item.label, { size: 13, weight: 600, cls: 'hc-text hc-text--strong' }));
    nodes.push(text(rowX + 20, y0 + 38, item.status === 'unscored'
      ? `Gate ${formatNumber(item.threshold, digits)} · no data yet`
      : `Gate ${formatNumber(item.threshold, item.key === 'protein' ? 2 : 0)}`, { size: 11.5, cls: 'hc-text hc-text--muted' }));
    if (item.recentWindow) nodes.push(recentRowLine(rowX + 20, y0 + 54, item, digits));
    const pillW = item.status === 'unscored' ? 70 : 42;
    nodes.push(node('rect', { x: fx(rowX + rowW - pillW), y: y0 + 10, width: pillW, height: 20, rx: 6 }, {
      cls: `hc-pill hc-pill--${item.status}`
    }));
    nodes.push(text(rowX + rowW - pillW / 2, y0 + 24, STATUS_TEXT[item.status], {
      size: 11, weight: 600, anchor: 'middle', cls: `hc-text hc-pill-text hc-pill-text--${item.status}`
    }));
    nodes.push(text(rowX + rowW - pillW - 10, y0 + 25, item.value == null ? '—' : formatNumber(item.value, digits), {
      size: 17, weight: 700, anchor: 'end', cls: 'hc-text hc-text--strong', anim: 'fade', delay: 250 + 80 * i
    }));
    if (i < keys.length - 1) {
      nodes.push(node('line', { x1: rowX, x2: rowX + rowW, y1: y0 + rowH - 3, y2: y0 + rowH - 3 }, { cls: 'hc-grid' }));
    }
  });

  const supported = chart?.supported;
  const baseReadout = supported === true
    ? 'All three keys met, so the forecast assumes lean mass is preserved. Tap Upper sets for the regions.'
    : supported === false
      ? 'Gate not met, so the forecast uses the Forbes partition. Tap a key for what it measures.'
      : 'Tap a key for what it measures. Upper sets opens the region view.';
  return {
    width,
    height: side ? Math.max(size, rowTop + keys.length * rowH) : rowTop + keys.length * rowH,
    label: gateLabel(chart, keys),
    readout: keys.some(item => item.recentWindow) ? recentReadout(keys) : baseReadout,
    nodes,
    hits
  };
}

function recentRowLine(x, y, item, digits) {
  const line = node('text', {
    x: fx(x),
    y: fx(y),
    'font-size': 11.5,
    'font-weight': 400,
    'text-anchor': 'start'
  }, { cls: 'hc-text hc-text--muted' });
  if (item.recent == null) {
    line.text = `${item.recentWindow}: ${item.recentReason}`;
    return line;
  }
  const mark = trendMark(item);
  const arrow = !mark || mark.steady ? '•' : mark.tip > mark.tail ? '↑' : '↓';
  const tone = arrow === '•' ? 'steady' : mark.met ? 'met' : 'short';
  const fill = tone === 'met' ? 'var(--success)' : tone === 'short' ? 'var(--danger)' : 'var(--muted)';
  line.children = [
    node('tspan', { fill, 'font-weight': 700 }, { cls: `hc-trend-arrow hc-trend-arrow--${tone}`, text: `${arrow} ` }),
    node('tspan', {}, { text: `${item.recentWindow}: ${formatNumber(item.recent, digits)}` })
  ];
  return line;
}

function recentReadout(keys) {
  const flip = keys.find(item => (
    (item.status === 'met' || item.status === 'short') && item.recentStatus && item.recentStatus !== item.status
  ));
  if (flip?.recentStatus === 'met') {
    return `${flip.short} is above the gate recently. Keep it up and the key will flip to Met.`;
  }
  if (flip?.recentStatus === 'short') {
    return `${flip.short} has dropped below the gate recently. If it stays there, the key will flip to Short.`;
  }
  const protein = keys.find(item => item.key === 'protein');
  if (protein && protein.recent == null) return 'Log food for a few complete days to see recent protein.';
  return 'Recent behaviour matches the averages.';
}

function gateLabel(chart, keys) {
  const head = `Lean-preservation gate: ${chart?.metCount ?? 0} of ${keys.length} keys met.`;
  if (!keys.some(item => item.recentWindow)) return head;
  const bits = keys.map(item => {
    const digits = item.key === 'protein' ? 2 : 1;
    const avg = item.value == null ? 'no average' : formatNumber(item.value, digits);
    if (item.recent == null) return `${item.short}: average ${avg}, not enough recent logs.`;
    const where = item.recentStatus === 'met' ? 'above' : 'below';
    return `${item.short}: average ${avg}, ${item.recentWindow.toLowerCase()} ${formatNumber(item.recent, digits)}, ${where} the gate.`;
  });
  return `${head} ${bits.join(' ')}`;
}
