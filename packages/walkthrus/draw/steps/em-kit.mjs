// Extra props for the em series (explicit modelling): shared by hex/em.mjs and steps/em.mjs.
// Call epen() instead of pen() so these helpers know the pen weight too.
import { pen, blob, stroke, dotted, disc, sheet, limb, f, INK, PAPER } from '../people.mjs';
let P = 2.6;
export const epen = (o) => { pen(o); P = o; };
export const W = (k = 1) => P * k;

/** Bold text centred on x, baseline y. */
export const txt = (x, y, size, s, { fill = INK, anchor = 'middle', weight = 700 } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-weight="` +
    `${weight}" font-size="${f(size)}" text-anchor="${anchor}" fill="${fill}" stroke="none">${s}</text>`;
/** A numbered (or lettered) node disc. */
export const node = (x, y, r, s = '', { ink = false } = {}) =>
  disc(x, y, r, ink ? INK : PAPER) + (s ? txt(x, y + r * 0.42, r * 1.15, s, { fill: ink ? PAPER : INK }) : '');
/** A rectangle with outline. */
export const box = (x, y, w, h, { ink = false, rx = 2 } = {}) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="` +
    `${ink ? INK : PAPER}" stroke="${INK}" stroke-width="${f(P)}"/>`;
/** A simple tick or cross centred on (x, y), size h. */
export const tick = (x, y, h, c = INK, w = P * 1.1) => `<path d="M${f(x - h * 0.45)} ${f(y)} L${f(x - h * 0.1)} ${f(y + h * 0.35)} L${f(x + h * 0.5)} ` +
  `${f(y - h * 0.4)}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round"` +
  ` stroke-linejoin="round"/>`;
export const cross = (x, y, h, c = INK, w = P * 1.1) => `<path d="M${f(x - h / 2)} ${f(y - h / 2)} L${f(x + h / 2)} ${f(y + h / 2)} M${f(x + h / 2)} ` +
  `${f(y - h / 2)} L${f(x - h / 2)} ${f(y + h / 2)}" fill="none" stroke="${c}" stroke-width="${f(w)}"` +
  ` stroke-linecap="round"/>`;
/** A tick box. */
export const tickbox = (x, y, s, { ink = false } = {}) => box(x, y, s, s, { ink }) + tick(x + s / 2, y + s / 2, s * 0.62, ink ? PAPER : INK);

/** A small mind map: centre node, n branches, twigs. Deterministic. */
export function mmap(cx, cy, R, { n = 5, a0 = -20, ink = false, twigs = 2 } = {}) {
  const out = [], tw = W(0.7);
  for (let i = 0; i < n; i++) {
    const a = (a0 + (360 / n) * i) * Math.PI / 180, L = R * (i % 2 ? 0.55 : 0.68);
    const bx = cx + L * Math.cos(a), by = cy + L * Math.sin(a);
    out.push(stroke(`M${f(cx)} ${f(cy)} L${f(bx)} ${f(by)}`, tw));
    for (let j = 0; j < twigs; j++) {
      const b = a + (j ? 0.55 : -0.55), l = R * 0.3;
      const tx = bx + l * Math.cos(b), ty = by + l * Math.sin(b);
      out.push(stroke(`M${f(bx)} ${f(by)} L${f(tx)} ${f(ty)}`, tw));
      out.push(`<circle cx="${f(tx)}" cy="${f(ty)}" r="${f(R * 0.07 + 0.6)}" fill="${PAPER}" stroke="${INK}" stroke-width="${f(tw)}"/>`);
    }
    out.push(`<circle cx="${f(bx)}" cy="${f(by)}" r="${f(R * 0.09 + 0.6)}" fill="${PAPER}" stroke="${INK}" stroke-width="${f(tw)}"/>`);
  }
  out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.17)}" fill="${ink ? INK : PAPER}" stroke="${INK}"` +
    ` stroke-width="${f(tw)}"/>`);
  return out.join('');
}
/** A word tag: label shape pointing left, with a hole and two lines. */
export function tag(x, y, w, h, { ink = false, rot = 0 } = {}) {
  const fill = ink ? INK : PAPER, c = ink ? PAPER : INK;
  const d = `M${f(x)} ${f(y + h / 2)} L${f(x + h * 0.5)} ${f(y)} H${f(x + w)} V${f(y + h)} H${f(x + h * 0.5)} Z`;
  return `<g transform="rotate(${rot} ${f(x + w / 2)} ${f(y + h / 2)})">${blob(d, fill)}<circle cx="` +
    `${f(x + h * 0.48)}" cy="${f(y + h / 2)}" r="${f(h * 0.12)}" fill="${c}"/>` +
    `${stroke(`M${f(x + h * 0.9)} ${f(y + h * 0.38)} H${f(x + w - 4)} M${f(x + h * 0.9)} ${f(y + h * 0.66)} H${f(x + w * 0.7)}`, W(0.6)).replace(/stroke="currentColor"/g, `stroke="${c}"`)}` +
    `</g>`;
}
/** A small isometric cube (concrete object), top-left at (x, y), edge s. */
export function cube(x, y, s, { ink = false, wire = false } = {}) {
  const k = s * 0.45, fill = ink ? INK : PAPER;
  const front = `M${f(x)} ${f(y + k)} h${f(s)} v${f(s)} h${f(-s)} Z`, top = `M${f(x)} ${f(y + k)} l${f(k)} ${f(-k)} h${f(s)} l${f(-k)} ${f(k)} Z`, side = `M${f(x + s)} ${f(y + k)} l${f(k)} ${f(-k)} v${f(s)} l${f(-k)} ${f(k)} Z`;
  if (wire) return stroke(`${front}${top}${side}`, W(0.8)) + dotted(`M${f(x)} ${f(y + k + s)} l${f(k)} ${f(-k)} v${f(-s)} M${f(x + k)} ${f(y + s)} h${f(s)}`, W(0.7));
  return blob(side, fill) + blob(top, fill) + blob(front, fill);
}
/** The hexagon "conceptual model": an iso cube outline with dotted inner spokes and corner nodes. */
export function hexmodel(cx, cy, r, { ink = false, nodes = true } = {}) {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => [cx + r * Math.cos((i * 60 - 90) * Math.PI / 180), cy + r * Math.sin((i * 60 - 90) * Math.PI / 180)]);
  const c = ink ? PAPER : INK;
  const spokes = [0, 2, 4].map((i) => `<path d="M${f(cx)} ${f(cy)} L${f(pts[i][0])} ${f(pts[i][1])}" stroke="${c}" stroke-width="` +
    `${f(W(0.8))}" stroke-linecap="round" stroke-dasharray="${f(W(0.3))} ${f(W(1.6))}"/>`).join('');
  return blob(`M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`, ink ? INK : PAPER) + spokes
    + (nodes ? pts.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.12 + 0.5)}" fill="${PAPER}" stroke="${INK}" stroke-width="${f(W(0.8))}"/>`).join('') : '');
}
/** A magnifying glass: lens at (x, y) radius r, handle towards angle a (deg), sign '+', '-' or ''. */
export function magnifier(x, y, r, { a = 135, sign = '', ink = false } = {}) {
  const rad = a * Math.PI / 180, hx = x + r * Math.cos(rad), hy = y + r * Math.sin(rad);
  const ex = x + r * 2 * Math.cos(rad), ey = y + r * 2 * Math.sin(rad);
  const c = ink ? PAPER : INK;
  let s = limb([[hx, hy], [ex, ey]], r * 0.32, INK) + disc(x, y, r, ink ? INK : PAPER);
  if (sign === '+') s += `<path d="M${f(x - r * 0.5)} ${f(y)} H${f(x + r * 0.5)} M${f(x)} ${f(y - r * 0.5)} V` +
    `${f(y + r * 0.5)}" stroke="${c}" stroke-width="${f(W(1.2))}" stroke-linecap="round"/>`;
  if (sign === '-') s += `<path d="M${f(x - r * 0.5)} ${f(y)} H${f(x + r * 0.5)}" stroke="${c}" stroke-width="${f(W(1.2))}"` +
    ` stroke-linecap="round"/>`;
  return s;
}
/** A map pin with a hole, tip at (x, y), height h. */
export function mapPin(x, y, h, { ink = false } = {}) {
  const r = h * 0.36, cy = y - h + r;
  return blob(`M${f(x)} ${f(y)} C${f(x - r * 0.4)} ${f(y - h * 0.3)} ${f(x - r)} ${f(cy + r * 0.5)} ${f(x - r)} ` +
    `${f(cy)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(cy)} C${f(x + r)} ${f(cy + r * 0.5)} ` +
    `${f(x + r * 0.4)} ${f(y - h * 0.3)} ${f(x)} ${f(y)} Z`, ink ? INK : PAPER)
    + (`<circle cx="${f(x)}" cy="${f(cy)}" r="${f(r * 0.4)}" fill="${ink ? PAPER : PAPER}" stroke="${INK}"` +
      ` stroke-width="${f(W(0.8))}"/>`);
}
/** A nesting doll, base centre (x, y), height h. */
export function doll(x, y, h, { ink = false } = {}) {
  const w = h * 0.62, hr = h * 0.2, fill = ink ? INK : PAPER, c = ink ? PAPER : INK;
  const body = `M${f(x - w * 0.42)} ${f(y)} C${f(x - w * 0.62)} ${f(y - h * 0.4)} ${f(x - w * 0.5)} ` +
    `${f(y - h * 0.62)} ${f(x - w * 0.3)} ${f(y - h * 0.72)} C${f(x - w * 0.42)} ${f(y - h * 1.02)} ` +
    `${f(x + w * 0.42)} ${f(y - h * 1.02)} ${f(x + w * 0.3)} ${f(y - h * 0.72)} C${f(x + w * 0.5)} ` +
    `${f(y - h * 0.62)} ${f(x + w * 0.62)} ${f(y - h * 0.4)} ${f(x + w * 0.42)} ${f(y)} Z`;
  return blob(body, fill) + (`<circle cx="${f(x)}" cy="${f(y - h * 0.76)}" r="${f(hr * 0.75)}" fill="${PAPER}" stroke="${c}"` +
    ` stroke-width="${f(W(0.7))}"/>`)
    + (`<path d="M${f(x - w * 0.4)} ${f(y - h * 0.5)} Q${f(x)} ${f(y - h * 0.38)} ${f(x + w * 0.4)} ` +
      `${f(y - h * 0.5)} M${f(x - w * 0.3)} ${f(y - h * 0.22)} Q${f(x)} ${f(y - h * 0.14)} ` +
      `${f(x + w * 0.3)} ${f(y - h * 0.22)}" stroke="${c}" stroke-width="${f(W(0.6))}" fill="none"` +
      ` stroke-linecap="round"/>`);
}
/** A calendar page. */
export const calendar = (x, y, s) => box(x, y, s, s * 0.9) + stroke(`M${f(x)} ${f(y + s * 0.26)} H${f(x + s)} M${f(x + s * 0.3)} ${f(y - s * 0.12)} V${f(y + s * 0.1)} M` +
  `${f(x + s * 0.7)} ${f(y - s * 0.12)} V${f(y + s * 0.1)}`, W(0.8))
  + [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => `<rect x="${f(x + s * (0.2 + c * 0.24))}" y="${f(y + s * (0.38 + r * 0.16))}" width="${f(s * 0.12)}"` +
    ` height="${f(s * 0.07)}" fill="${INK}"/>`)).join('');
/** A small helicopter, body centre (x, y), size s (body width). Carries a sheet if `load`. */
export function heli(x, y, s, { ink = false } = {}) {
  const fill = ink ? INK : PAPER;
  return stroke(`M${f(x - s * 0.7)} ${f(y - s * 0.42)} H${f(x + s * 0.7)} M${f(x)} ${f(y - s * 0.42)} V${f(y - s * 0.28)}`, W(0.9))
    + stroke(`M${f(x - s * 0.2)} ${f(y)} L${f(x - s)} ${f(y - s * 0.05)} M${f(x - s)} ${f(y - s * 0.18)} V${f(y + s * 0.08)}`, W(0.9))
    + (`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(s * 0.36)}" ry="${f(s * 0.27)}" fill="${fill}" stroke="` +
      `${INK}" stroke-width="${f(P)}"/>`)
    + stroke(`M${f(x - s * 0.3)} ${f(y + s * 0.4)} H${f(x + s * 0.32)} M${f(x - s * 0.15)} ${f(y + s * 0.25)} V` +
      `${f(y + s * 0.4)} M${f(x + s * 0.15)} ${f(y + s * 0.25)} V${f(y + s * 0.4)}`, W(0.8));
}
/** A row of n star glyphs centred on (x, y). */
export const stars = (x, y, n, size, fill = INK) => txt(x, y + size * 0.36, size, '★'.repeat(n), { fill });
/** A plinth (raised base) with optional ink fill. */
export const plinth = (x, y, w, h, { ink = false } = {}) => box(x, y, w, h, { ink, rx: 1.5 });
/** A lightbulb centred on (x, y), r. */
export const bulb = (x, y, r) => disc(x, y, r) + box(x - r * 0.45, y + r * 0.85, r * 0.9, r * 0.6, { rx: 1 }) + stroke(`M${f(x - r * 0.3)} ${f(y + r * 0.2)} L${f(x)} ${f(y - r * 0.3)} L${f(x + r * 0.3)} ${f(y + r * 0.2)}`, W(0.6));
export { sheet };
