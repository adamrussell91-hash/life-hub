// Bodied people for the WalkThrus pictures: outlined white figures with hair, collar, belt,
// trousers, shoes and bendable arms. No faces, no fingers. One pen for everything (pen()).
// The board hexagon icons (120 × 90) and the lesson step pictures (240 × 180) both use these,
// so a technique's hexagon and its five steps read as one set.
//
// Offsets: x grows right; for arms and legs, dy grows DOWN from the joint. A limb is
// [elbow, hand] (or [knee, foot]) as offsets from the shoulder (or hip), in figure units
// before scaling by s. Pass ink: true for the one filled focus figure.
export const INK = 'currentColor', PAPER = 'var(--wt-paper, #fff)';
let O = 2.6;
/** Set the outline weight in frame units (steps 2.6, hexagon icons 1.9). */
export const pen = (o) => { O = o; };
export const f = (n) => Math.round(n * 10) / 10;
const pl = (pts) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

/** An outlined limb or capsule through pts, w wide. */
export const limb = (pts, w, fill = PAPER) =>
  `<polyline points="${pl(pts)}" fill="none" stroke="${INK}" stroke-width="${f(w + 2 * O)}"` +
    ` stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pl(pts)}" fill="none" stroke="` +
    `${fill}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** An outlined closed shape. */
export const blob = (d, fill = PAPER) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${f(O)}" stroke-linejoin="round"/>`;
const line = (d, w = O * 0.8, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A head at (hx, hy), radius r. face: 1 right, -1 left, 0 front, 'back'. */
export function head(hx, hy, r, { face = 0, fill = PAPER, bun = true } = {}) {
  const ring = `<circle cx="${f(hx)}" cy="${f(hy)}" r="${f(r)}" fill="${face === 'back' ? INK : fill}" stroke="` +
    `${INK}" stroke-width="${f(O)}"/>`;
  let hair = '';
  if (face === 0) hair = `<path d="M${f(hx - r)} ${f(hy + 1)} Q${f(hx - r)} ${f(hy - r - 1)} ${f(hx)} ${f(hy - r)} Q` +
    `${f(hx + r)} ${f(hy - r - 1)} ${f(hx + r)} ${f(hy - r * 0.15)} Q${f(hx + r * 0.2)} ` +
    `${f(hy - r * 0.62)} ${f(hx - r)} ${f(hy + 1)} Z" fill="${INK}"/>`;
  else if (face === 1 || face === -1) { const d = face; hair = `<path d="M${f(hx + d * r * 0.35)} ${f(hy - r * 0.95)} Q${f(hx - d * r * 1.05)} ${f(hy - r * 1.05)} ` +
    `${f(hx - d * r)} ${f(hy + r * 0.45)} L${f(hx - d * r * 0.2)} ${f(hy + r * 0.2)} Q` +
    `${f(hx - d * r * 0.1)} ${f(hy - r * 0.45)} ${f(hx + d * r * 0.35)} ${f(hy - r * 0.95)} Z" fill="` +
    `${INK}"/>`; }
  const bx = face === 1 ? hx - r * 0.85 : face === -1 ? hx + r * 0.85 : hx + (face === 0 ? r * 0.25 : 0);
  const by = face === 1 || face === -1 ? hy - r * 0.55 : hy - r - r * 0.25;
  return ring + hair + (bun ? `<circle cx="${f(bx)}" cy="${f(by)}" r="${f(r * 0.45)}" fill="${INK}"/>` : '');
}

/**
 * A standing person, feet on `foot`. Opts:
 *  s scale (1 = 130 units tall), back (seen from behind), ink (filled focus),
 *  arms [[elbow, hand], [elbow, hand]] left then right (defaults hang down),
 *  legs [[dx foot, lean], [dx, lean]], turn (-1/1 = head faces that way), behind (arm indexes drawn behind the body).
 */
export function person(x, foot, { s = 1, arms, back = false, ink = false, legs = [[-7, 0], [7, 0]], turn = 0, behind = [] } = {}) {
  const fill = ink ? INK : PAPER, detailC = ink ? PAPER : INK;
  const X = (dx) => x + dx * s, Y = (dy) => foot - dy * s;
  const sh = 112, waist = 70, hip = 64;
  const ar = arms ?? [[[-4, 30], [-3, 52]], [[4, 30], [3, 52]]];
  const shoulder = (side) => [X(side * 15), Y(sh - 4)];
  const armPts = (a, side) => { const [sx, sy] = shoulder(side); return [[sx, sy], [sx + a[0][0] * s, sy + a[0][1] * s], [sx + a[1][0] * s, sy + a[1][1] * s]]; };
  const legPts = (l) => [[X(l[0] * 0.6), Y(hip)], [X(l[0] + l[1] * 0.5), Y(30)], [X(l[0] + l[1]), Y(4)]];
  const torso = `M${f(X(-9))} ${f(Y(sh + 4))} Q${f(X(-19))} ${f(Y(sh + 2))} ${f(X(-19))} ${f(Y(sh - 8))} L` +
    `${f(X(-14))} ${f(Y(waist))} L${f(X(-15))} ${f(Y(hip - 2))} L${f(X(15))} ${f(Y(hip - 2))} L` +
    `${f(X(14))} ${f(Y(waist))} L${f(X(19))} ${f(Y(sh - 8))} Q${f(X(19))} ${f(Y(sh + 2))} ${f(X(9))} ` +
    `${f(Y(sh + 4))} Z`;
  const collar = back ? '' : line(`M${f(X(-6))} ${f(Y(sh + 3))} L${f(X(0))} ${f(Y(sh - 6))} L${f(X(6))} ${f(Y(sh + 3))}`, O * 0.8, detailC);
  const belt = line(`M${f(X(-14))} ${f(Y(waist))} H${f(X(14))}`, O * 0.8, detailC);
  const arm = (i) => limb(armPts(ar[i], i ? 1 : -1), 8 * s, fill);
  return [
    ...behind.map(arm),
    ...legs.map((l) => limb(legPts(l), 11 * s, fill)),
    ...legs.map((l) => `<ellipse cx="${f(X(l[0] + l[1] + (l[0] < 0 ? -2 : 2)))}" cy="${f(foot - 1 * s)}" rx="${f(7 * s)}"` +
      ` ry="${f(3.2 * s)}" fill="${INK}"/>`),
    blob(torso, fill), collar, belt,
    head(X(0), Y(sh + 16), 11 * s, { face: back ? 'back' : turn, fill }),
    ...[0, 1].filter((i) => !behind.includes(i)).map(arm)
  ].join('');
}

/**
 * A person seated side-on on a chair, hip at (x, seat), facing dir (1 right, -1 left).
 * arms: [[elbow, hand], ...] offsets from the shoulder with dx in the facing direction; first is the far arm (drawn behind).
 * lean: forward lean of the torso in units. chair: draw the chair.
 */
export function sitter(x, seat, { s = 1, dir = 1, arms, ink = false, lean = 4, chair = true, legs = 'down' } = {}) {
  const fill = ink ? INK : PAPER, detailC = ink ? PAPER : INK, d = dir;
  const X = (dx) => x + d * dx * s, Y = (dy) => seat + dy * s;
  const sx = X(lean + 2), sy = Y(-40);
  const ar = arms ?? [[[14, 16], [30, 14]], [[12, 18], [28, 16]]];
  const armPts = (a) => [[sx, sy], [sx + d * a[0][0] * s, sy + a[0][1] * s], [sx + d * a[1][0] * s, sy + a[1][1] * s]];
  const knee = [X(24), Y(-2)], foot = legs === 'crossed' ? [X(30), Y(24)] : [X(26), Y(30)];
  const parts = [];
  if (chair) parts.push(line(`M${f(X(-12))} ${f(Y(-34))} L${f(X(-12))} ${f(Y(6))} M${f(X(-14))} ${f(Y(6))} H${f(X(14))} M` +
    `${f(X(-10))} ${f(Y(6))} V${f(Y(34))} M${f(X(12))} ${f(Y(6))} V${f(Y(34))}`, O));
  parts.push(limb(armPts(ar[0]), 8 * s, fill));
  parts.push(limb([[X(0), Y(0)], knee, foot], 11 * s, fill));
  parts.push(`<ellipse cx="${f(foot[0] + d * 4 * s)}" cy="${f(foot[1] + 1 * s)}" rx="${f(7 * s)}" ry="${f(3.2 * s)}" fill="${INK}"/>`);
  parts.push(limb([[X(-1), Y(-6)], [X(lean), Y(-38)]], 24 * s, fill));
  parts.push(line(`M${f(X(-8))} ${f(Y(-12))} L${f(X(8))} ${f(Y(-12))}`, O * 0.8, detailC));
  parts.push(head(X(lean + 4), Y(-57), 11 * s, { face: d, fill }));
  if (ar[1]) parts.push(limb(armPts(ar[1]), 8 * s, fill));
  return parts.join('');
}

/** A student seated behind a desk, seen front-on (or from behind): head and shoulders. */
export function pupil(x, y, { s = 1, ink = false, back = false, arm = null } = {}) {
  const fill = ink ? INK : PAPER;
  const X = (dx) => x + dx * s, Y = (dy) => y + dy * s;
  const body = blob(`M${f(X(-15))} ${f(Y(34))} L${f(X(-15))} ${f(Y(22))} Q${f(X(-15))} ${f(Y(13))} ${f(X(-6))} ` +
    `${f(Y(13))} L${f(X(6))} ${f(Y(13))} Q${f(X(15))} ${f(Y(13))} ${f(X(15))} ${f(Y(22))} L${f(X(15))} ` +
    `${f(Y(34))} Z`, fill);
  const hand = arm === 'up' ? limb([[X(12), Y(20)], [X(17), Y(0)], [X(16), Y(-16)]], 7 * s, fill) : '';
  return body + head(X(0), Y(0), 9 * s, { face: back ? 'back' : 0, fill }) + hand;
}

/** Head and shoulders, for portraits inside a circle or close-ups. */
export function bust(x, y, { s = 1, ink = false, face = 0 } = {}) {
  const fill = ink ? INK : PAPER;
  const X = (dx) => x + dx * s, Y = (dy) => y + dy * s;
  return blob(`M${f(X(-26))} ${f(Y(48))} Q${f(X(-26))} ${f(Y(18))} ${f(X(-8))} ${f(Y(16))} L${f(X(8))} ${f(Y(16))}` +
    ` Q${f(X(26))} ${f(Y(18))} ${f(X(26))} ${f(Y(48))} Z`, fill)
    + head(X(0), Y(0), 14 * s, { face, fill });
}

/** A front-on desk (covers a pupil's lower half). */
export const desk = (x1, x2, y) => (`<rect x="${f(x1)}" y="${f(y)}" width="${f(x2 - x1)}" height="8" rx="2" fill="${PAPER}" stroke="` +
  `${INK}" stroke-width="${f(O)}"/>`) + line(`M${f(x1 + 6)} ${f(y + 8)}v14M${f(x2 - 6)} ${f(y + 8)}v14`, O);
/** A side-on table top at height y with one leg at each end. */
export const table = (x1, x2, y) => line(`M${f(x1)} ${f(y)} H${f(x2)} M${f(x1 + 6)} ${f(y)} V${f(y + 40)} M${f(x2 - 6)} ${f(y)} V${f(y + 40)}`, O * 1.2);
/** A whiteboard. */
export const board = (x, y, w, h) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="3" fill="${PAPER}" stroke="` +
  `${INK}" stroke-width="${f(O)}"/>`;
/** A sheet of paper or book page with n lines. */
export const sheet = (x, y, w, h, n = 3) => (`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="1.5" fill="${PAPER}" stroke="` +
  `${INK}" stroke-width="${f(O * 0.8)}"/>`) + Array.from({ length: n }, (_, i) => line(`M${f(x + w * 0.18)} ${f(y + (h / (n + 1)) * (i + 1))} h${f(w * (i === n - 1 ? 0.4 : 0.64))}`, O * 0.6)).join('');
/** Speech bubble with "…" (or text). tail = point the tail ends at. */
export function talk(x, y, w, h, tail, { ink = false, text = '…' } = {}) {
  const fill = ink ? INK : PAPER, c = ink ? PAPER : INK;
  const bx = Math.min(Math.max(tail[0], x + 8), x + w - 14), base = tail[1] > y + h ? y + h : y;
  const body = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(Math.min(h / 2, 9))}" fill="` +
    `${fill}" stroke="${INK}" stroke-width="${f(O)}"/><path d="M${f(bx)} ${f(base)} L${f(tail[0])} ` +
    `${f(tail[1])} L${f(bx + 9)} ${f(base)}" fill="${fill}" stroke="${INK}" stroke-width="${f(O)}"` +
    ` stroke-linejoin="round"/><path d="M${f(bx + 1.5)} ${f(base)} H${f(bx + 7.5)}" stroke="${fill}"` +
    ` stroke-width="${f(O * 1.2)}"/>`;
  const inner = text === '…' ? [-6, 0, 6].map((d) => `<circle cx="${f(x + w / 2 + d)}" cy="${f(y + h / 2)}" r="${f(1.7)}" fill="${c}"/>`).join('')
    : `<text x="${f(x + w / 2)}" y="${f(y + h / 2 + h * 0.2)}" font-family="Arial Rounded MT Bold, Arial,` +
      ` sans-serif" font-weight="700" font-size="${f(h * 0.6)}" text-anchor="middle" fill="${c}"` +
      ` stroke="none">${text}</text>`;
  return body + inner;
}
/** A thought bubble: two rising dots from `from`, then a circle of radius r at (cx, cy). */
export function think(from, [cx, cy], r, { ink = false } = {}) {
  const [fx, fy] = from, m = [fx + (cx - fx) * 0.35, fy + (cy - fy) * 0.35];
  return `<circle cx="${f(fx)}" cy="${f(fy)}" r="${f(r * 0.08 + 1)}" fill="${PAPER}" stroke="${INK}"` +
    ` stroke-width="${f(O * 0.8)}"/><circle cx="${f(m[0])}" cy="${f(m[1])}" r="${f(r * 0.13 + 1.5)}"` +
    ` fill="${PAPER}" stroke="${INK}" stroke-width="${f(O * 0.8)}"/><circle cx="${f(cx)}" cy="${f(cy)}"` +
    ` r="${f(r)}" fill="${ink ? INK : PAPER}" stroke="${INK}" stroke-width="${f(O)}"/>`;
}
/** A question mark centred on (x, y), h tall. */
export const qmark = (x, y, h, c = INK) => line(`M${f(x - h * 0.24)} ${f(y - h * 0.22)} C${f(x - h * 0.24)} ${f(y - h * 0.55)} ${f(x + h * 0.28)} ` +
  `${f(y - h * 0.55)} ${f(x + h * 0.26)} ${f(y - h * 0.2)} C${f(x + h * 0.24)} ${f(y)} ${f(x)} ` +
  `${f(y - h * 0.02)} ${f(x)} ${f(y + h * 0.17)}`, h * 0.13, c) + `<circle cx="${f(x)}" cy="${f(y + h * 0.4)}" r="${f(h * 0.08)}" fill="${c}"/>`;
/** A plain or dashed line / curve with an open arrowhead at b. */
export function arrowTo(a, b, c = null, { dash = false, w = O } = {}) {
  const from = c ?? a, ang = Math.atan2(b[1] - from[1], b[0] - from[0]), L = 4 + w * 2.2;
  const hd = [-0.55, 0.55].map((dd) => [b[0] - L * Math.cos(ang + dd), b[1] - L * Math.sin(ang + dd)]);
  const dpath = c ? `M${f(a[0])} ${f(a[1])} Q${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}` : `M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])}`;
  return `<path d="${dpath}" fill="none" stroke="${INK}" stroke-width="${f(w)}" stroke-linecap="round"${dash ? ` stroke-dasharray="${f(w * 0.4)} ${f(w * 2.6)}"` : ''}/>` + line(`M${f(hd[0][0])} ${f(hd[0][1])} L${f(b[0])} ${f(b[1])} L${f(hd[1][0])} ${f(hd[1][1])}`, w);
}
export const dotted = (d, w = O) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(w)}" stroke-linecap="round"` +
  ` stroke-dasharray="${f(w * 0.4)} ${f(w * 2.6)}"/>`;
export const ink = (d) => `<path d="${d}" fill="${INK}" stroke="none"/>`;
export const stroke = (d, w = O) => line(d, w);
export const disc = (x, y, r, fill = PAPER) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" stroke="${INK}" stroke-width="${f(O)}"/>`;

export const STEP = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180" fill="none" stroke-linecap="round"` +
  ` stroke-linejoin="round" focusable="false">${body}</svg>\n`;
export const HEX = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90" fill="none" stroke-linecap="round"` +
  ` stroke-linejoin="round" focusable="false">${body}</svg>\n`;
