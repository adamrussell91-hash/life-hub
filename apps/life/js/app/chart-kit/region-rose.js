/**
 * region-rose — Nightingale rose of weekly loaded sets per body region, plus a
 * ranked bar list. Petal AREA is proportional to sets, so the eye reads volume
 * honestly. A dashed ring marks the per-region reference (10 sets/week).
 * Upper-body regions feed the preservation gate; legs and abs are drawn quiet.
 */
import { formatNumber, fx, node, polar, text, wedgePath } from './scene.js';

const ORDER = ['chest', 'shoulders', 'arms', 'back', 'full_body', 'legs', 'abs'];

export function buildRegionRose(chart, { width = 520 } = {}) {
  const regions = ORDER
    .map(key => (chart?.regions ?? []).find(region => region.key === key))
    .filter(Boolean);
  const reference = Number(chart?.regionReference ?? 10);
  const side = width >= 440;
  const size = side ? Math.min(250, Math.round(width * 0.48)) : Math.min(width, 260);
  const cx = side ? size / 2 : width / 2;
  const cy = size / 2;
  const r0 = 15;
  const rMax = size / 2 - 26;
  const maxSets = Math.max(reference * 1.25, ...regions.map(r => r.setsPerWeek || 0));
  const c = (rMax * rMax - r0 * r0) / maxSets;
  const radius = sets => Math.sqrt(r0 * r0 + c * Math.max(0, sets));
  const span = 360 / Math.max(1, regions.length);
  const nodes = [];
  const hits = {};

  regions.forEach((region, index) => {
    const id = `region-${region.key}`;
    const vs = region.setsPerWeek - reference;
    hits[id] = {
      id,
      group: region.key,
      title: region.label,
      lines: [
        `${formatNumber(region.setsPerWeek, 1)} loaded sets / week`,
        region.inGate
          ? (vs >= 0 ? `${formatNumber(vs, 1)} above the 10-set reference` : `${formatNumber(-vs, 1)} below the 10-set reference`)
          : 'Outside the upper-body gate'
      ],
      detail: `${region.label}: ${formatNumber(region.setsPerWeek, 1)} sets a week over the last ${chart?.windowDays ?? 28} days. ${region.inGate ? 'Counts toward the upper-body gate.' : 'Does not count toward the upper-body gate.'}`
    };
    const a0 = -90 + index * span + 1.6;
    const a1 = -90 + (index + 1) * span - 1.6;
    const r = radius(region.setsPerWeek);
    if (region.setsPerWeek > 0) {
      nodes.push(node('path', { d: wedgePath(cx, cy, r0, r, a0, a1) }, {
        cls: `hc-petal ${region.inGate ? `hc-petal--${index % 4}` : 'hc-petal--quiet'}`,
        hit: id,
        anim: 'grow',
        origin: [cx, cy],
        delay: 60 * index
      }));
    }
    // Full-sector hit pad so thin petals and empty regions are still reachable.
    nodes.push(node('path', { d: wedgePath(cx, cy, r0, rMax + 6, a0, a1) }, { cls: 'hc-hitpad-fill', hit: id }));
    if (!(region.setsPerWeek > 0)) return;
    const mid = (a0 + a1) / 2;
    const [lx, ly] = polar(cx, cy, Math.max(r, r0) + 12, mid);
    const cos = Math.cos((mid * Math.PI) / 180);
    const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
    nodes.push(text(lx, ly + 4, region.label, {
      size: 11,
      weight: region.inGate ? 600 : 500,
      anchor,
      cls: `hc-text ${region.inGate ? 'hc-text--strong' : 'hc-text--muted'}`,
      anim: 'fade',
      delay: 350 + 40 * index
    }));
  });

  const rr = radius(reference);
  nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: fx(rr) }, {
    cls: 'hc-rose-reference', hit: 'rose-reference', anim: 'fade', delay: 500
  }));
  hits['rose-reference'] = {
    id: 'rose-reference',
    title: 'Reference ring',
    lines: [`${reference} loaded sets per region per week`],
    detail: `The dashed ring marks ${reference} sets per region per week, a common hypertrophy guide. The forecast gate itself uses ${reference} upper-body sets in total.`
  };
  nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: r0 - 2 }, { cls: 'hc-rose-hub' }));

  // Ranked list
  const listX = side ? size + 20 : 0;
  const listW = side ? width - listX : width;
  const listY = side ? 26 : size + 16;
  const rowH = 26;
  const labelW = 74;
  const valueW = 36;
  const barX = listX + labelW;
  const barW = Math.max(40, listW - labelW - valueW - 8);
  const barMax = Math.max(maxSets, reference * 1.5);
  nodes.push(text(listX, listY - 10, 'Loaded sets / week', { size: 11, cls: 'hc-text hc-text--muted' }));
  const ranked = [...regions].sort((a, b) => b.setsPerWeek - a.setsPerWeek || a.label.localeCompare(b.label));
  ranked.forEach((region, i) => {
    const y = listY + i * rowH;
    const id = `region-${region.key}`;
    nodes.push(node('rect', { x: listX - 4, y: y - 2, width: listW + 4, height: rowH, rx: 6 }, { cls: 'hc-row', hit: id }));
    nodes.push(text(listX, y + 14, region.label, {
      size: 12, weight: region.inGate ? 600 : 500, cls: `hc-text ${region.inGate ? 'hc-text--strong' : 'hc-text--muted'}`
    }));
    nodes.push(node('rect', { x: fx(barX), y: y + 8, width: fx(barW), height: 7, rx: 3.5 }, { cls: 'hc-bar-track' }));
    const w = Math.max(0, Math.min(1, region.setsPerWeek / barMax)) * barW;
    if (w > 0) {
      nodes.push(node('rect', { x: fx(barX), y: y + 8, width: fx(w), height: 7, rx: 3.5 }, {
        cls: `hc-bar ${region.inGate ? 'hc-bar--gate' : 'hc-bar--quiet'}`,
        anim: 'grow',
        origin: [barX, y + 11],
        delay: 200 + 50 * i
      }));
    }
    const tick = barX + (reference / barMax) * barW;
    nodes.push(node('line', { x1: fx(tick), x2: fx(tick), y1: y + 4, y2: y + 19 }, { cls: 'hc-bar-reference' }));
    nodes.push(text(listX + listW, y + 14, formatNumber(region.setsPerWeek, 1), {
      size: 12, weight: 600, anchor: 'end', cls: 'hc-text hc-text--strong'
    }));
  });

  const listBottom = listY + ranked.length * rowH;
  const height = side ? Math.max(size, listBottom + 4) : listBottom + 4;
  return {
    width,
    height,
    label: 'Weekly loaded sets by body region.',
    readout: 'Tap a petal or a row. Legs and abs sit outside the upper-body gate.',
    nodes,
    hits
  };
}
