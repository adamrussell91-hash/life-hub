/**
 * gate-rings — three concentric 270° rings, one per lean-preservation key.
 * Each ring's scale runs from 0 to 2× its threshold, so every threshold sits on
 * one shared radial "gate" spoke at the half-way angle. A ring that crosses the
 * spoke has met its key. Values above 2× cap the ring and mark the overflow.
 */
import { arcPath, fx, formatNumber, node, polar, text } from './scene.js';

const START = -90; // 12 o'clock
const SWEEP = 270;
const GATE_ANGLE = START + SWEEP / 2;
const KEY_CLASS = { sessions: 'sessions', upper_sets: 'upper', protein: 'protein' };

function statusLine(item) {
  if (item.status === 'unscored') return item.reason ?? 'Not scored yet.';
  const ratio = item.ratio == null ? '' : ` (${formatNumber(item.ratio, 1)}× the gate)`;
  return item.status === 'met' ? `Met${ratio}.` : `Short of the gate${ratio}.`;
}

const STATUS_TEXT = { met: 'Met', short: 'Short', unscored: 'Unscored' };

export function buildGateRings(chart, { width = 520, stroke = 15, gap = 9 } = {}) {
  const keys = chart?.keys ?? [];
  const side = width >= 440;
  const size = side ? Math.min(232, Math.round(width * 0.46)) : Math.min(232, width);
  const cx = side ? size / 2 : width / 2;
  const cy = size / 2;
  const outer = size / 2 - stroke / 2 - 4;
  const nodes = [];
  const hits = {};

  keys.forEach((item, index) => {
    const r = outer - index * (stroke + gap);
    const cls = KEY_CLASS[item.key] ?? 'sessions';
    const id = `gate-${item.key}`;
    const valueText = item.value == null ? 'No data' : `${formatNumber(item.value, item.key === 'protein' ? 2 : 1)}${item.unit}`;
    hits[id] = {
      id,
      group: item.key,
      title: item.label,
      lines: [
        `${valueText} · gate ${formatNumber(item.threshold, item.key === 'protein' ? 2 : 0)}`,
        statusLine(item)
      ],
      detail: `${item.label}: ${valueText}. ${statusLine(item)} ${item.note}`,
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
        'stroke-width': stroke
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
  const rowH = 52;
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
  return {
    width,
    height: side ? Math.max(size, rowTop + keys.length * rowH) : rowTop + keys.length * rowH,
    label: `Lean-preservation gate: ${chart?.metCount ?? 0} of ${keys.length} keys met.`,
    readout: supported === true
      ? 'All three keys met, so the forecast assumes lean mass is preserved. Tap Upper sets for the regions.'
      : supported === false
        ? 'Gate not met, so the forecast uses the Forbes partition. Tap a key for what it measures.'
        : 'Tap a key for what it measures. Upper sets opens the region view.',
    nodes,
    hits
  };
}
