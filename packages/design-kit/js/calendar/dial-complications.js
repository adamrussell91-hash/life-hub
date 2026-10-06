/**
 * Day dial complications, ported from docs/capacity-forecast-handoff/mockups/dial-complications.html.
 * Every function draws into an SVG group with the dial's own geometry (1 unit = 1px).
 * Colours come from calendar-day-dial.css (`.dd-fx-*`); the Dress face is a fixed look.
 *
 * g = { s, cx, cy, R, rings } where s(tag, attrs, parent, text) makes an SVG node.
 */
import { arcPath, point } from '../dial-geometry.js';
import { duration } from './dial-faces.js';

const f = n => Number(n).toFixed(1);

/** Weather ring: hour-by-hour readiness between the gauge and the day's bands, coloured by condition. */
export function drawWeatherRing(g, parent, { points = [], segments = [], families = {}, nowHour = null }) {
  const { s, cx, cy, R } = g;
  if (points.length < 2) return null;
  const r1 = R * 0.478;
  const r2 = R * 0.552;
  const group = s('g', { class: 'dd-fx-weather', 'data-part': 'weather-ring' }, parent);
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    const seg = segments.find(x => p.h >= x.from - 0.01 && p.h < x.to) ?? segments.at(-1);
    const family = families[seg?.state] ?? 'cloud';
    const thick = (r2 - r1) * Math.max(0.35, Math.min(1, p.score / 100));
    const past = Number.isFinite(nowHour) && p.h < nowHour;
    const piece = s('path', { class: `dd-fx-wx is-${family}${past ? ' is-past' : ''}`, d: arcPath(cx, cy, r1, r1 + thick, p.h, next.h) }, group);
    s('title', {}, piece, `${clock(p.h)} · around ${p.score}`);
  }
  return group;
}

/** Dive bezel: the dose window on a ring just outside the hour ticks, with a lume pip at the dose. */
export function drawBezel(g, parent, doses = []) {
  const { s, cx, cy, R } = g;
  const b1 = R + 1;
  const b2 = R + 9;
  const group = s('g', { class: 'dd-fx-bezel', 'data-part': 'bezel' }, parent);
  s('path', { class: 'dd-fx-bezel-track', d: arcPath(cx, cy, b1, b2, 0, 23.999) }, group);
  for (let h = 0; h < 24; h += 0.5) {
    const major = h % 1 === 0;
    const a = point(cx, cy, b2 - 0.5, h);
    const b = point(cx, cy, b2 - (major ? 4 : 2.5), h);
    s('line', { class: `dd-fx-bezel-tick${major ? ' is-major' : ''}`, x1: f(a.x), y1: f(a.y), x2: f(b.x), y2: f(b.y) }, group);
  }
  for (const dose of doses) {
    const warn = Math.max(dose.from, dose.to - 0.75);
    const window = s('path', { class: 'dd-fx-dose', d: arcPath(cx, cy, b1 + 1.5, b2 - 1.5, dose.from, dose.to) }, group);
    s('title', {}, window, `Dexy ${dose.slot === 'am' ? 'morning' : 'afternoon'} dose at ${clock(dose.time)}${dose.left != null ? ` · ${duration(dose.left)} left` : ''}`);
    if (dose.gone > dose.from) s('path', { class: 'dd-fx-dose is-gone', d: arcPath(cx, cy, b1 + 1.5, b2 - 1.5, dose.from, Math.min(dose.gone, warn)) }, group);
    if (dose.gone > warn) s('path', { class: 'dd-fx-dose is-late', d: arcPath(cx, cy, b1 + 1.5, b2 - 1.5, warn, dose.gone) }, group);
    else s('path', { class: 'dd-fx-dose is-late is-ahead', d: arcPath(cx, cy, b1 + 1.5, b2 - 1.5, warn, dose.to) }, group);
    const tip = point(cx, cy, b2 + 2, dose.time);
    const left = point(cx, cy, b1, dose.time - 0.25);
    const right = point(cx, cy, b1, dose.time + 0.25);
    s('path', { class: 'dd-fx-pip', d: `M${f(tip.x)} ${f(tip.y)}L${f(left.x)} ${f(left.y)}L${f(right.x)} ${f(right.y)}Z` }, group);
  }
  return group;
}

/** Moon phase: `fill` 0 (new) → 1 (full), lit from the right. */
export function drawMoon(g, parent, { cx, cy, r, fill = 0, label = '' }) {
  const { s } = g;
  const group = s('g', { class: 'dd-fx-moon', 'data-part': 'moon', 'data-fill': fill.toFixed(2) }, parent);
  s('circle', { class: 'dd-fx-moon-dark', cx: f(cx), cy: f(cy), r: f(r) }, group);
  if (fill > 0.02) {
    // Terminator: an ellipse whose width runs r → 0 → r as the moon fills; past half it bulges left.
    const k = Math.abs(1 - 2 * fill) * r;
    const sweep = fill < 0.5 ? 0 : 1;
    s('path', { class: 'dd-fx-moon-lit', d: `M${f(cx)} ${f(cy - r)}A${f(r)} ${f(r)} 0 0 1 ${f(cx)} ${f(cy + r)}A${f(k)} ${f(r)} 0 0 ${sweep} ${f(cx)} ${f(cy - r)}Z` }, group);
  }
  s('title', {}, group, `${label ? `${label} · ` : ''}${fill < 0.15 ? 'a quiet week' : fill > 0.8 ? 'a full week' : 'a mixed week'}`);
  if (label) s('text', { class: 'dd-fx-small', x: f(cx), y: f(cy + r + 10) }, group, label);
  return group;
}

/** Retrograde tally: a half-dial that sweeps one step per closed task. */
export function drawRetro(g, parent, { cx, cy, r, closed = 0, total = 0 }) {
  const { s } = g;
  const steps = Math.max(1, total);
  const angle = n => Math.PI * (1 - Math.min(n, steps) / steps);
  const at = (t, rr) => ({ x: cx + rr * Math.cos(t), y: cy - rr * Math.sin(t) });
  const group = s('g', { class: 'dd-fx-retro', 'data-part': 'retro', 'data-closed': closed, 'data-total': total }, parent);
  const a = at(Math.PI, r);
  const b = at(0, r);
  s('path', { class: 'dd-fx-retro-track', d: `M${f(a.x)} ${f(a.y)}A${f(r)} ${f(r)} 0 0 1 ${f(b.x)} ${f(b.y)}` }, group);
  for (let k = 0; k <= steps; k++) {
    const p1 = at(angle(k), r + 3);
    const p2 = at(angle(k), r + 6);
    s('line', { class: 'dd-fx-retro-tick', x1: f(p1.x), y1: f(p1.y), x2: f(p2.x), y2: f(p2.y) }, group);
  }
  const tip = at(angle(closed), r - 2);
  s('line', { class: 'dd-fx-retro-hand', 'data-part': 'retro-hand', x1: f(cx), y1: f(cy), x2: f(tip.x), y2: f(tip.y) }, group);
  s('circle', { class: 'dd-fx-pin', cx: f(cx), cy: f(cy), r: 2.4 }, group);
  s('text', { class: 'dd-fx-small', x: f(cx), y: f(cy + 11) }, group, total ? `${closed} of ${total} closed` : 'no tasks');
  return group;
}

/** Tourbillon: a little cage in its own window; it spins only while an agent is reworking the day. */
export function drawTourbillon(g, parent, { cx, cy, r, spinning = false }) {
  const { s } = g;
  const group = s('g', { class: 'dd-fx-tourbillon', 'data-part': 'tourbillon', 'data-spinning': String(spinning) }, parent);
  s('circle', { class: 'dd-fx-tb-window', cx: f(cx), cy: f(cy), r: f(r) }, group);
  const cage = s('g', { class: `dd-fx-tb-cage${spinning ? ' is-spinning' : ''}`, style: `transform-origin:${f(cx)}px ${f(cy)}px` }, group);
  s('circle', { class: 'dd-fx-tb-line', cx: f(cx), cy: f(cy), r: f(r * 0.62) }, cage);
  for (let k = 0; k < 3; k++) {
    const t = (k * 2 * Math.PI) / 3;
    s('line', { class: 'dd-fx-tb-line', x1: f(cx), y1: f(cy), x2: f(cx + r * 0.62 * Math.cos(t)), y2: f(cy + r * 0.62 * Math.sin(t)) }, cage);
  }
  s('title', {}, group, spinning ? 'Tourbillon: Clare or Hammond has a change to your day waiting' : 'Tourbillon: still, nothing being reworked');
  return group;
}

/** GMT hand: a second hand at `hour` (24-hour), labelled. */
export function drawGmtHand(g, parent, { hour, label }) {
  const { s, cx, cy, R, rings } = g;
  if (!Number.isFinite(hour)) return null;
  const group = s('g', { class: 'dd-fx-gmt', 'data-part': 'gmt-hand' }, parent);
  const base = point(cx, cy, rings.gauge + 9, hour);
  const tip = point(cx, cy, R * 0.9, hour);
  const l = point(cx, cy, R * 0.83, hour - 0.3);
  const r = point(cx, cy, R * 0.83, hour + 0.3);
  s('line', { class: 'dd-fx-gmt-line', x1: f(base.x), y1: f(base.y), x2: f(tip.x), y2: f(tip.y) }, group);
  s('path', { class: 'dd-fx-gmt-tip', d: `M${f(tip.x)} ${f(tip.y)}L${f(l.x)} ${f(l.y)}L${f(r.x)} ${f(r.y)}Z` }, group);
  const t = point(cx, cy, R * 0.63, hour - 0.9);
  s('text', { class: 'dd-fx-gmt-label', x: f(t.x), y: f(t.y + 3) }, group, label);
  s('title', {}, group, `${label}: ${clock(hour)}`);
  return group;
}

/** Corey: the evening at home shaded on the rim, and a C where Corey is now. */
export function drawCorey(g, parent, { hour, evening = [18, 22.5] }) {
  const { s, cx, cy, R } = g;
  const group = s('g', { class: 'dd-fx-corey', 'data-part': 'corey' }, parent);
  s('path', { class: 'dd-fx-corey-eve', d: arcPath(cx, cy, R * 0.885, R * 0.905, evening[0], evening[1]) }, group);
  if (Number.isFinite(hour)) {
    const p = point(cx, cy, R * 0.8, hour + 0.9);
    s('circle', { class: 'dd-fx-corey-dot', cx: f(p.x), cy: f(p.y), r: 7 }, group);
    s('text', { class: 'dd-fx-corey-c', x: f(p.x), y: f(p.y + 3) }, group, 'C');
    s('title', {}, group, `Corey at home: ${clock(hour)}`);
  }
  return group;
}

/**
 * Dress watch: black lacquer, a rose-engine guilloché, gold. No words.
 * Commitments are small diamonds; readiness is one fine gold arc; a leaf hand points to now.
 */
export function drawDress(g, parent, { items = [], pct = 0, nowHour = null, evening = [17.5, 22.5], sleep = [22.5, 6.5], idPrefix = 'dd-dress' }) {
  const { s, cx, cy, R } = g;
  const group = s('g', { class: 'dd-fx-dress', 'data-part': 'dress' }, parent);
  const defs = s('defs', {}, group);
  const grad = s('radialGradient', { id: `${idPrefix}-lacquer`, cx: '50%', cy: '42%', r: '60%' }, defs);
  s('stop', { offset: '0%', 'stop-color': '#22334f' }, grad);
  s('stop', { offset: '100%', 'stop-color': '#070d1b' }, grad);
  const clip = s('clipPath', { id: `${idPrefix}-clip` }, defs);
  s('circle', { cx: f(cx), cy: f(cy), r: f(R + 7) }, clip);
  s('circle', { cx: f(cx), cy: f(cy), r: f(R + 10), fill: '#c9a55a' }, group);
  s('circle', { cx: f(cx), cy: f(cy), r: f(R + 7), fill: `url(#${idPrefix}-lacquer)` }, group);
  const guilloche = s('g', { 'clip-path': `url(#${idPrefix}-clip)`, fill: 'none', stroke: '#e3c47d', 'stroke-width': 0.6, 'aria-hidden': 'true' }, group);
  const turns = 64;
  for (let k = 0; k < turns; k++) {
    const t = (k / turns) * 2 * Math.PI;
    s('circle', { cx: f(cx + R * 0.17 * Math.cos(t)), cy: f(cy + R * 0.17 * Math.sin(t)), r: f(R * 0.72), 'stroke-opacity': 0.07 }, guilloche);
  }
  for (let k = 0; k < turns; k++) {
    const t = (k / turns) * 2 * Math.PI + Math.PI / turns;
    s('circle', { cx: f(cx + R * 0.07 * Math.cos(t)), cy: f(cy + R * 0.07 * Math.sin(t)), r: f(R * 0.3), 'stroke-opacity': 0.08 }, guilloche);
  }
  const diamond = (h, r, size, attrs, title) => {
    const p = point(cx, cy, r, h);
    const out = point(cx, cy, r + size, h);
    const ux = (out.x - p.x) / size;
    const uy = (out.y - p.y) / size;
    const vx = -uy;
    const vy = ux;
    const d = `M${f(p.x + ux * size)} ${f(p.y + uy * size)}L${f(p.x + vx * size * 0.6)} ${f(p.y + vy * size * 0.6)}L${f(p.x - ux * size)} ${f(p.y - uy * size)}L${f(p.x - vx * size * 0.6)} ${f(p.y - vy * size * 0.6)}Z`;
    const node = s('path', { d, ...attrs, 'data-part': 'dress-diamond' }, group);
    if (title) s('title', {}, node, title);
  };
  for (const item of items) {
    const mid = (item.start + item.end) / 2;
    const title = `${item.title ?? ''} · ${clock(item.start)}`;
    if (item.kind === 'corey') diamond(mid, R * 0.76, 4.5, { fill: '#e8cf9a', 'fill-opacity': 0.55 }, title);
    else if (item.isClass) diamond(mid, R * 0.76, 3.6, { fill: '#e3c47d', 'fill-opacity': 0.5 }, title);
    else diamond(mid, R * 0.76, 3.6, { fill: 'none', stroke: '#e3c47d', 'stroke-opacity': 0.6, 'stroke-width': 0.9 }, title);
  }
  s('path', { d: arcPath(cx, cy, R * 0.9, R * 0.96, evening[0], evening[1]), fill: '#e8cf9a', 'fill-opacity': 0.22 }, group);
  s('path', { d: arcPath(cx, cy, R * 0.9, R * 0.96, sleep[0], sleep[1]), fill: '#000000', 'fill-opacity': 0.35 }, group);
  for (let h = 0; h < 24; h++) {
    const major = h % 6 === 0;
    const a = point(cx, cy, R * 0.98, h);
    const b = point(cx, cy, R * (major ? 0.82 : 0.9), h);
    s('line', { x1: f(a.x), y1: f(a.y), x2: f(b.x), y2: f(b.y), stroke: '#e3c47d', 'stroke-width': major ? 3.2 : 1.4, 'stroke-linecap': 'round' }, group);
  }
  const gr = R * 0.36;
  const circ = 2 * Math.PI * gr;
  s('circle', { cx: f(cx), cy: f(cy), r: f(gr), fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.08, 'stroke-width': 2 }, group);
  s('circle', { 'data-part': 'dress-readiness', cx: f(cx), cy: f(cy), r: f(gr), fill: 'none', stroke: '#e3c47d', 'stroke-width': 2, 'stroke-dasharray': `${f((circ * pct) / 100)} ${f(circ)}`, transform: `rotate(-90 ${f(cx)} ${f(cy)})` }, group);
  if (Number.isFinite(nowHour)) {
    const tip = point(cx, cy, R * 0.8, nowHour);
    const l = point(cx, cy, R * 0.11, nowHour - 1.2);
    const r = point(cx, cy, R * 0.11, nowHour + 1.2);
    const tail = point(cx, cy, R * 0.14, nowHour + 12);
    s('path', { 'data-part': 'dress-hand', d: `M${f(tail.x)} ${f(tail.y)}Q${f(l.x)} ${f(l.y)} ${f(tip.x)} ${f(tip.y)}Q${f(r.x)} ${f(r.y)} ${f(tail.x)} ${f(tail.y)}Z`, fill: '#e3c47d' }, group);
  }
  s('circle', { cx: f(cx), cy: f(cy), r: 4.5, fill: '#e3c47d' }, group);
  s('circle', { cx: f(cx), cy: f(cy), r: 1.6, fill: '#070d1b' }, group);
  return group;
}

function clock(hour) {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60) % 60;
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}`;
}
