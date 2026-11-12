// The stream picture, drawn as filled ribbons like a Sankey diagram (failure register C13).
// Each attitude keeps its own width where it starts, then bends and narrows to its share of the
// channel, so the three stack edge to edge and nothing overlaps. The channel's width is the
// geometric mean of the three (our rule: a stream near zero closes it). It tapers into the gate,
// whose opening is the Run it read, and turns blue on its way into the work.
// Shapes are made once; a change tweens the numbers and repaints the same paths every frame.
import { AREA, ATTITUDES, PROFILES, leadArea, profileFor, question, type AreaId, type ProfileId, type Values } from './model';

const NS = 'http://www.w3.org/2000/svg';
const KEYS: AreaId[] = ['value', 'efficacy', 'env', 'reg'];
const CHANNEL = '#4a5466';
const SW = (v: number) => 3 + v * 2.1; // one stream, 0..10 -> 3..24 units
const RIVER = 1.55; // the channel and gate are wider than any one stream
const geo = (a: number, b: number, c: number) => Math.cbrt(Math.max(0, a) * Math.max(0, b) * Math.max(0, c));
let seq = 0;

type Ribbon = { lt: number; lb: number; rt: number; rb: number };
interface Geometry { cy: number; ys: Record<string, number>; x0: number; xj: number; xg: number; xe: number; C: number; O: number; G: number; rib: Partial<Record<AreaId, Ribbon>> }

function geometry(v: Values, labels: boolean): Geometry {
  const cy = 74;
  const ys = { value: cy - 46, efficacy: cy, env: cy + 46 };
  const x0 = labels ? 92 : 8, xj = labels ? 204 : 168, xg = labels ? 262 : 250, xe = labels ? 318 : 322;
  const known = ATTITUDES.filter((k) => v[k] != null);
  const ch = known.length === 3 ? geo(v.value!, v.efficacy!, v.env!) : known.length ? Math.min(...known.map((k) => v[k]!)) : 0;
  const C = SW(ch) * RIVER;
  const O = v.reg == null ? C : Math.min(C, SW(v.reg) * RIVER);
  const G = v.reg == null ? C + 6 : SW(v.reg) * RIVER;
  const total = known.reduce((sum, k) => sum + SW(v[k]!), 0);
  let y = cy - C / 2;
  const rib: Partial<Record<AreaId, Ribbon>> = {};
  for (const k of ATTITUDES) {
    if (v[k] == null) continue;
    const w = SW(v[k]!);
    const share = total ? (C * w) / total : 0;
    rib[k] = { lt: ys[k as 'value'] - w / 2, lb: ys[k as 'value'] + w / 2, rt: y, rb: y + share };
    y += share;
  }
  return { cy, ys, x0, xj, xg, xe, C, O, G, rib };
}

const mid = (g: Geometry) => g.x0 + (g.xj - g.x0) * 0.56;
const ribbonD = (g: Geometry, r: Ribbon) =>
  `M ${g.x0} ${r.lt} C ${mid(g)} ${r.lt} ${mid(g)} ${r.rt} ${g.xj + 0.8} ${r.rt} L ${g.xj + 0.8} ${r.rb} C ${mid(g)} ${r.rb} ${mid(g)} ${r.lb} ${g.x0} ${r.lb} Z`;
const edgesD = (g: Geometry, r: Ribbon) =>
  `M ${g.x0} ${r.lt} C ${mid(g)} ${r.lt} ${mid(g)} ${r.rt} ${g.xj} ${r.rt} M ${g.x0} ${r.lb} C ${mid(g)} ${r.lb} ${mid(g)} ${r.rb} ${g.xj} ${r.rb}`;
const centreD = (g: Geometry, k: AreaId) => `M ${g.x0} ${g.ys[k]} C ${mid(g)} ${g.ys[k]} ${mid(g)} ${g.cy} ${g.xj} ${g.cy}`;
function channelD(g: Geometry): string {
  const { xj, xg, xe, cy, C, O } = g;
  const t1 = cy - C / 2, b1 = cy + C / 2, t2 = cy - O / 2, b2 = cy + O / 2;
  const a = xg - 24, m = xg - 12, ah = O / 2 + 6;
  return `M ${xj} ${t1} L ${a} ${t1} C ${m} ${t1} ${m} ${t2} ${xg} ${t2} L ${xe} ${t2} L ${xe} ${cy - ah} L ${xe + 15} ${cy} L ${xe} ${cy + ah} L ${xe} ${b2} L ${xg} ${b2} C ${m} ${b2} ${m} ${b1} ${a} ${b1} L ${xj} ${b1} Z`;
}

export function streamWords(v: Values): string {
  return `Your read. ${KEYS.map((k) => `${question(AREA[k])} ${v[k] == null ? 'not asked' : `${v[k]} of 10`}`).join(', ')}.`;
}

export interface StreamOptions {
  labels?: boolean;
  /** Last time, drawn as dashed edges on any stream that moved by a point or more. */
  ghost?: Values | null;
  /** The area that names the read; defaults to the read worked out from the values. */
  pin?: ProfileId;
  /** Grow from a trickle to the read once, then settle. */
  enter?: boolean;
}

export interface Stream { el: SVGSVGElement; set(values: Values, opts?: { pin?: ProfileId; animate?: boolean }): void }

export function createStream(doc: Document, values: Values, opts: StreamOptions = {}): Stream {
  const id = ++seq;
  const labels = opts.labels !== false;
  const win = doc.defaultView;
  const reduce = () => !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const raf = (fn: (t: number) => void) => (win?.requestAnimationFrame ? win.requestAnimationFrame(fn) : (fn(Date.now()), 0));
  const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) => {
    const node = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = svgEl('svg', { class: `achv-stream${labels ? '' : ' achv-stream--mini'}`, viewBox: labels ? '0 0 340 150' : '0 10 340 128', role: 'img' });
  const g0 = geometry({ value: 5, efficacy: 5, env: 5, reg: 5 }, labels);
  const defs = svgEl('defs', {});
  const grad = (gid: string, x1: number, x2: number, stops: Array<[number, string]>) => {
    const lg = svgEl('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1, x2, y1: 0, y2: 0 });
    for (const [offset, colour] of stops) lg.append(svgEl('stop', { offset, 'stop-color': colour }));
    defs.append(lg);
  };
  for (const k of ATTITUDES) grad(`achv${id}${k}`, g0.x0, g0.xj, [[0, AREA[k].colour], [0.62, AREA[k].colour], [1, CHANNEL]]);
  grad(`achv${id}ch`, g0.xj, g0.xe + 15, [[0, CHANNEL], [(g0.xg - g0.xj) / (g0.xe + 15 - g0.xj), CHANNEL], [1, AREA.reg.colour]]);
  svg.append(defs);

  const channel = svgEl('path', { fill: `url(#achv${id}ch)` });
  svg.append(channel);
  const ribbons = {} as Record<AreaId, SVGPathElement>;
  const centres = {} as Record<AreaId, SVGPathElement>;
  for (const k of ATTITUDES) {
    ribbons[k] = svgEl('path', { fill: `url(#achv${id}${k})` });
    centres[k] = svgEl('path', { fill: 'none', stroke: AREA[k].colour, 'stroke-opacity': 0.55, 'stroke-width': 1.5, 'stroke-dasharray': '3 4' });
    svg.append(ribbons[k], centres[k]);
  }
  const postT = svgEl('rect', { width: 6, height: 22, rx: 3, fill: AREA.reg.colour });
  const postB = svgEl('rect', { width: 6, height: 22, rx: 3, fill: AREA.reg.colour });
  svg.append(postT, postB);
  if (opts.ghost) {
    const gg = geometry(opts.ghost, labels);
    for (const k of ATTITUDES) {
      const r = gg.rib[k];
      if (!r || values[k] == null || opts.ghost[k] == null || Math.abs(opts.ghost[k]! - values[k]!) < 1) continue;
      svg.append(svgEl('path', { class: 'achv-stream__ghost', d: edgesD(gg, r), fill: 'none', stroke: '#1b2230', 'stroke-opacity': 0.55, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }));
    }
  }
  const text: Partial<Record<AreaId, { num: SVGTSpanElement; tx: SVGTextElement; pin: SVGTextElement }>> = {};
  let out: SVGTextElement | null = null;
  if (labels) {
    for (const k of ATTITUDES) {
      const tx = svgEl('text', { x: g0.x0 - 10, 'font-size': 11.5, 'font-weight': 650, fill: AREA[k].ink, 'text-anchor': 'end' });
      const num = svgEl('tspan', { 'font-weight': 400, fill: '#6b7380' });
      tx.append(svgEl('tspan', {}, `${question(AREA[k])} `), num);
      const pin = svgEl('text', { x: g0.x0 - 10, 'font-size': 10, 'font-weight': 700, fill: '#1b2230', 'text-anchor': 'end' }, 'narrowest');
      text[k] = { tx, num, pin };
      svg.append(tx, pin);
    }
    const tx = svgEl('text', { x: g0.xg, 'font-size': 11.5, 'font-weight': 650, fill: AREA.reg.ink, 'text-anchor': 'middle' });
    const num = svgEl('tspan', { 'font-weight': 400, fill: '#6b7380' });
    tx.append(svgEl('tspan', {}, 'Run it? '), num);
    const pin = svgEl('text', { x: g0.xg, 'font-size': 10, 'font-weight': 700, fill: '#1b2230', 'text-anchor': 'middle' }, 'narrowest');
    out = svgEl('text', { x: g0.xe + 15, 'font-size': 10.5, fill: '#6b7380', 'text-anchor': 'end' }, 'into the work');
    text.reg = { tx, num, pin };
    svg.append(tx, pin, out);
  }

  let shown: Values | null = null;
  let target: Values = {};
  let pinNow: ProfileId = 'low';
  let frame = 0;

  function paint(v: Values): void {
    const g = geometry(v, labels);
    channel.setAttribute('d', channelD(g));
    for (const k of ATTITUDES) {
      const r = g.rib[k];
      ribbons[k].style.display = r ? '' : 'none';
      centres[k].style.display = r ? 'none' : '';
      if (r) ribbons[k].setAttribute('d', ribbonD(g, r));
      else centres[k].setAttribute('d', centreD(g, k));
    }
    const muted = v.reg == null;
    for (const post of [postT, postB]) {
      post.setAttribute('x', String(g.xg - 3));
      post.setAttribute('fill', muted ? '#9aa3ad' : AREA.reg.colour);
    }
    postT.setAttribute('y', String(g.cy - g.G / 2 - 22));
    postB.setAttribute('y', String(g.cy + g.G / 2));
    if (!labels) return;
    for (const k of ATTITUDES) {
      text[k]!.tx.setAttribute('y', String(g.ys[k]! + 4));
      text[k]!.pin.setAttribute('y', String(g.ys[k]! + 17));
    }
    text.reg!.tx.setAttribute('y', String(g.cy - g.G / 2 - 29));
    text.reg!.pin.setAttribute('y', String(g.cy - g.G / 2 - 42));
    out!.setAttribute('y', String(g.cy - g.O / 2 - 9));
  }

  function words(v: Values): void {
    svg.setAttribute('aria-label', `${streamWords(v)} ${leadArea(pinNow) ? `Narrowest: ${AREA[leadArea(pinNow)!].short}.` : PROFILES[pinNow].name + '.'}`);
    if (!labels) return;
    for (const k of KEYS) {
      text[k]!.num.textContent = v[k] == null ? '·' : String(v[k]);
      text[k]!.pin.style.display = pinNow === k ? '' : 'none';
    }
  }

  function set(next: Values, o: { pin?: ProfileId; animate?: boolean; duration?: number } = {}): void {
    target = { ...next };
    pinNow = o.pin ?? profileFor(target);
    words(target);
    if (win?.cancelAnimationFrame && frame) win.cancelAnimationFrame(frame);
    const from = shown;
    const sameShape = !!from && KEYS.every((k) => (from[k] == null) === (target[k] == null));
    if (!from || !sameShape || o.animate === false || reduce() || !win?.requestAnimationFrame) {
      shown = { ...target };
      paint(shown);
      return;
    }
    const t0 = win.performance?.now() ?? Date.now();
    const duration = o.duration ?? 280;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / duration));
      const ease = 1 - Math.pow(1 - p, 3);
      const cur: Values = {};
      for (const k of KEYS) if (target[k] != null) cur[k] = from[k]! + (target[k]! - from[k]!) * ease;
      shown = cur;
      paint(cur);
      if (p < 1) frame = raf(step);
      else shown = { ...target };
    };
    frame = raf(step);
  }

  if (opts.enter && !reduce() && win?.requestAnimationFrame) {
    const zero: Values = {};
    for (const k of KEYS) if (values[k] != null) zero[k] = 0;
    shown = zero;
    paint(zero);
    target = { ...values };
    pinNow = opts.pin ?? profileFor(values);
    words(values);
    raf(() => set(values, { pin: opts.pin, duration: 750 }));
  } else {
    set(values, { pin: opts.pin, animate: false });
  }
  return { el: svg, set: (v, o) => set(v, o) };
}
