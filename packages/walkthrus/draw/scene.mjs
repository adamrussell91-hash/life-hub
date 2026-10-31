// packages/walkthrus/draw/scene.mjs
// A drawing as data: a list of kit calls, [{ fn: 'person', args: [20, 88, { s: 0.6 }] }, ...].
// Claude draws a fusion's hexagon figure in this form, never as code. renderScene runs only the
// kit parts listed in PARTS, with the hexagon pen (1.9), inside HEX (120 × 90). validateScene
// checks the house rules: known parts, plain arguments, inside the frame, exactly one ink focus.
import { pen, person, sitter, pupil, bust, desk, table, board, sheet, talk, think, qmark, arrowTo, dotted, disc, limb, blob, stroke, ink, f, INK, PAPER, HEX } from './people.mjs';

export const PEN = 1.9;
export const FRAME = Object.freeze({ w: 120, h: 90 });
/** How far a part may poke past the frame edge (the book's own figures do, a little). */
export const FRAME_SLACK = 6;
export const MAX_CALLS = 40;
export const GLYPHS = Object.freeze(['?', '…', '!', '✓']);

// Three plain parts the hexagon figures draw by hand, made kit parts so a scene can use them.
const rect = (x, y, w, h, { rx = 2, ink: k = false } = {}) => (k
  ? `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${INK}"/>`
  : `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${PAPER}"` +
    ` stroke="${INK}" stroke-width="${PEN}"/>`);
const tick = (x, y, r, w = 2.2) => stroke(`M${f(x - r * 0.55)} ${f(y)} L${f(x - r * 0.12)} ${f(y + r * 0.45)} L${f(x + r * 0.6)} ${f(y - r * 0.45)}`, w);
const cross = (x, y, r, w = 2.2) => stroke(`M${f(x - r * 0.45)} ${f(y - r * 0.45)} L${f(x + r * 0.45)} ${f(y + r * 0.45)} M${f(x + r * 0.45)} ` +
  `${f(y - r * 0.45)} L${f(x - r * 0.45)} ${f(y + r * 0.45)}`, w);

// ---- argument kinds -------------------------------------------------------------------------
const isNum = (v, lo = -60, hi = 180) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isPt = (v) => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isOffset = (v) => Array.isArray(v) && v.length === 2 && isNum(v[0], -80, 80) && isNum(v[1], -80, 80);
const isLimbPair = (v) => Array.isArray(v) && v.length === 2 && isOffset(v[0]) && isOffset(v[1]);
const PATH = /^[Mm][MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/;

const KINDS = {
  n: (v) => isNum(v),
  size: (v) => isNum(v, 0, 140),
  w: (v) => isNum(v, 0.5, 6),
  lines: (v) => Number.isInteger(v) && v >= 0 && v <= 8,
  limbw: (v) => isNum(v, 1, 30),
  pt: isPt,
  ptOrNull: (v) => v === null || isPt(v),
  pts: (v) => Array.isArray(v) && v.length >= 2 && v.length <= 12 && v.every(isPt),
  d: (v) => typeof v === 'string' && v.length <= 800 && PATH.test(v),
  color: (v) => v === 'ink' || v === 'paper'
};

const OPTION = {
  s: (v) => isNum(v, 0.15, 1.6),
  ink: (v) => typeof v === 'boolean',
  back: (v) => typeof v === 'boolean',
  dash: (v) => typeof v === 'boolean',
  chair: (v) => typeof v === 'boolean',
  turn: (v) => v === -1 || v === 0 || v === 1,
  dir: (v) => v === -1 || v === 1,
  face: (v) => v === -1 || v === 0 || v === 1 || v === 'back',
  arms: (v) => Array.isArray(v) && v.length === 2 && v.every(isLimbPair),
  sitarms: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 2 && isLimbPair(v[0]) && (v[1] == null || isLimbPair(v[1])),
  legs: (v) => Array.isArray(v) && v.length === 2 && v.every(isOffset),
  sitlegs: (v) => v === 'down' || v === 'crossed',
  behind: (v) => Array.isArray(v) && v.length <= 2 && v.every((i) => i === 0 || i === 1),
  lean: (v) => isNum(v, -20, 30),
  arm: (v) => v === null || v === 'up',
  text: (v) => GLYPHS.includes(v),
  w: (v) => isNum(v, 0.5, 6),
  rx: (v) => isNum(v, 0, 20)
};
const opts = (...keys) => ({ opts: Object.fromEntries(keys.map((k) => (k.includes(':') ? k.split(':') : [k, k]))) });

/**
 * The kit parts a scene may call: argument kinds in order, how many are required, the options
 * each takes, and a line for Claude's part list.
 */
export const PARTS = Object.freeze({
  person: { fn: person, args: ['n', 'n', opts('s', 'arms', 'back', 'ink', 'legs', 'turn', 'behind')], min: 2,
    doc: 'person(x, foot, {s, turn, arms, legs, back, ink, behind}) standing figure: x centre, feet on y=foot,' +
      ' 130*s tall. turn -1|0|1 head facing. arms [[elbow,hand],[elbow,hand]] left then right, offsets from' +
      ' the shoulder (dy grows down), default hang [[-4,30],[-3,52]],[[4,30],[3,52]]; a pointing right arm' +
      ' is [[16,10],[30,-8]], raised [[14,2],[16,-26]]. legs [[dx,lean],[dx,lean]]. back: seen from behind.' },
  sitter: { fn: sitter, args: ['n', 'n', opts('s', 'dir', 'arms:sitarms', 'ink', 'lean', 'chair', 'legs:sitlegs')], min: 2,
    doc: 'sitter(x, seat, {s, dir, arms, lean, chair, legs}) side-on seated figure, hip at (x, seat), dir 1' +
      ' faces right, -1 left. legs "down"|"crossed".' },
  pupil: { fn: pupil, args: ['n', 'n', opts('s', 'ink', 'back', 'arm')], min: 2,
    doc: 'pupil(x, y, {s, ink, back, arm}) student head and shoulders, head centre at (x, y), body down to' +
      ' y+34*s; pair with desk. arm "up" raises a hand.' },
  bust: { fn: bust, args: ['n', 'n', opts('s', 'ink', 'face')], min: 2,
    doc: 'bust(x, y, {s, ink, face}) large head and shoulders, head centre at (x, y), radius 14*s.' },
  desk: { fn: desk, args: ['n', 'n', 'n'], min: 3, doc: 'desk(x1, x2, y) front-on desk top from x1 to x2 at y (covers pupils below y), legs 22 down.' },
  table: { fn: table, args: ['n', 'n', 'n'], min: 3, doc: 'table(x1, x2, y) side-on table top at y with legs 40 down.' },
  board: { fn: board, args: ['n', 'n', 'size', 'size'], min: 4, doc: 'board(x, y, w, h) whiteboard rectangle.' },
  sheet: { fn: sheet, args: ['n', 'n', 'size', 'size', 'lines'], min: 4, doc: 'sheet(x, y, w, h, lines) paper or page with 0-8 text lines.' },
  rect: { fn: rect, args: ['n', 'n', 'size', 'size', opts('rx', 'ink')], min: 4, doc: 'rect(x, y, w, h, {rx, ink}) outlined box, or a solid ink block.' },
  talk: { fn: talk, args: ['n', 'n', 'size', 'size', 'pt', opts('ink', 'text')], min: 5,
    doc: 'talk(x, y, w, h, [tx, ty], {ink, text}) speech bubble, tail ends at [tx, ty]; text one of ? … ! ✓ (default …).' },
  think: { fn: think, args: ['pt', 'pt', 'size', opts('ink')], min: 3, doc: 'think([fx, fy], [cx, cy], r, {ink}) thought bubble rising from [fx, fy] to a circle at [cx, cy].' },
  qmark: { fn: qmark, args: ['n', 'n', 'size', 'color'], min: 3, doc: 'qmark(x, y, h) question mark centred on (x, y), h tall.' },
  arrowTo: { fn: arrowTo, args: ['pt', 'pt', 'ptOrNull', opts('dash', 'w')], min: 2,
    doc: 'arrowTo([ax, ay], [bx, by], [cx, cy] or null, {dash, w}) line or curve (via control point c) with an open head at b.' },
  dotted: { fn: dotted, args: ['d', 'w'], min: 1, doc: 'dotted("M.. L..", w) dotted line along an SVG path.' },
  stroke: { fn: stroke, args: ['d', 'w'], min: 1, doc: 'stroke("M.. L..", w) plain line along an SVG path (pen 1.9 unless w).' },
  ink: { fn: ink, args: ['d'], min: 1, doc: 'ink("M.. Z") a solid filled shape: counts as the ink focus.' },
  disc: { fn: disc, args: ['n', 'n', 'size', 'color'], min: 3, doc: 'disc(x, y, r, "paper"|"ink") outlined circle; "ink" fills it (the ink focus).' },
  limb: { fn: limb, args: ['pts', 'limbw', 'color'], min: 2, doc: 'limb([[x,y],...], w) outlined capsule through the points.' },
  blob: { fn: blob, args: ['d', 'color'], min: 1, doc: 'blob("M.. Z", "paper"|"ink") outlined closed shape.' },
  tick: { fn: tick, args: ['n', 'n', 'size', 'w'], min: 3, doc: 'tick(x, y, r) a tick mark.' },
  cross: { fn: cross, args: ['n', 'n', 'size', 'w'], min: 3, doc: 'cross(x, y, r) a cross mark.' }
});

/** The kit's part list for a prompt, one line a part. */
export const partList = () => Object.values(PARTS).map((p) => `- ${p.doc}`).join('\n');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** Structural errors in one call (unknown part, wrong arguments). Empty when it is fine. */
function callErrors(call, i) {
  const at = `#${i + 1}`;
  if (!isPlainObject(call)) return [`${at}: each part is an object {fn, args}`];
  const part = typeof call.fn === 'string' && Object.hasOwn(PARTS, call.fn) ? PARTS[call.fn] : null;
  if (!part) return [`${at}: unknown part "${String(call.fn).slice(0, 20)}"`];
  const extra = Object.keys(call).filter((k) => k !== 'fn' && k !== 'args');
  if (extra.length) return [`${at} ${call.fn}: unknown keys ${extra.join(', ')}`];
  const args = call.args ?? [];
  if (!Array.isArray(args)) return [`${at} ${call.fn}: args must be a list`];
  if (args.length < part.min || args.length > part.args.length) return [`${at} ${call.fn}: takes ${part.min}-${part.args.length} arguments, got ${args.length}`];
  const errors = [];
  args.forEach((v, j) => {
    const kind = part.args[j];
    if (typeof kind === 'string') {
      if (!KINDS[kind](v)) errors.push(`${at} ${call.fn}: argument ${j + 1} is not a valid ${kind}`);
      return;
    }
    if (!isPlainObject(v)) { errors.push(`${at} ${call.fn}: argument ${j + 1} must be an options object`); return; }
    for (const [k, val] of Object.entries(v)) {
      const check = kind.opts[k];
      if (!check) errors.push(`${at} ${call.fn}: unknown option "${k.slice(0, 20)}"`);
      else if (!OPTION[check](val)) errors.push(`${at} ${call.fn}: option "${k}" has a bad value`);
    }
  });
  return errors;
}

const resolve = (v) => (v === 'ink' ? INK : v === 'paper' ? PAPER : v);

/**
 * The scene as a 120 × 90 hexagon figure SVG. Throws on anything that is not a known kit part with
 * plain arguments; it never evaluates code.
 */
export function renderScene(scene) {
  if (!Array.isArray(scene) || !scene.length || scene.length > MAX_CALLS) throw new TypeError('A scene is a list of 1 to 40 parts.');
  const errors = scene.flatMap(callErrors);
  if (errors.length) throw new TypeError(errors[0]);
  pen(PEN);
  return HEX(scene.map((c) => PARTS[c.fn].fn(...(c.args ?? []).map((a) => (isPlainObject(a) ? { ...a } : resolve(a))))).join(''));
}

// ---- the frame check: a rough bounding box per part -----------------------------------------
function pathPoints(d) {
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const pts = [];
  let cx = 0, cy = 0, sx = 0, sy = 0, cmd = 'M', i = 0;
  const num = () => Number(tokens[i++]);
  const counts = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const up = cmd.toUpperCase(), rel = cmd !== up, n = counts[up];
    if (n === undefined) break;
    if (up === 'Z') { cx = sx; cy = sy; pts.push([cx, cy]); continue; }
    if (tokens.length - i < n) break;
    const v = Array.from({ length: n }, num);
    if (v.some((x) => !Number.isFinite(x))) break;
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (up === 'H') cx = v[0] + ox;
    else if (up === 'V') cy = v[0] + oy;
    else if (up === 'A') { cx = v[5] + ox; cy = v[6] + oy; }
    else {
      for (let k = 0; k < n - 2; k += 2) pts.push([v[k] + ox, v[k + 1] + oy]);
      cx = v[n - 2] + ox; cy = v[n - 1] + oy;
    }
    pts.push([cx, cy]);
    if (up === 'M') { sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; }
  }
  return pts;
}

const circle = (x, y, r) => [[x - r, y - r], [x + r, y + r]];
const box = (x, y, w, h) => [[x, y], [x + w, y + h]];

/** Points that bound what a part draws, roughly. */
function extent(call) {
  const a = call.args ?? [];
  const o = a.find(isPlainObject) ?? {};
  const s = o.s ?? 1;
  switch (call.fn) {
    case 'person': {
      const [x, foot] = a;
      const pts = [[x - 20 * s, foot - 141 * s], [x + 20 * s, foot + 3 * s]];
      const arms = o.arms ?? [];
      arms.forEach((arm, i) => { if (!arm) return; const shx = x + (i ? 15 : -15) * s, shy = foot - 108 * s; for (const [dx, dy] of arm) pts.push([shx + dx * s, shy + dy * s]); });
      for (const [dx, lean] of o.legs ?? [[-7, 0], [7, 0]]) pts.push([x + (dx + lean) * s - 9 * s, foot], [x + (dx + lean) * s + 9 * s, foot]);
      return pts;
    }
    case 'sitter': {
      const [x, seat] = a, d = o.dir ?? 1, lean = o.lean ?? 4;
      const X = (dx) => x + d * dx * s;
      const pts = [[X(-14), seat - 70 * s], [X(34), seat + 36 * s], [X(lean + 15), seat - 70 * s]];
      for (const arm of o.arms ?? []) if (arm) for (const [dx, dy] of arm) pts.push([X(lean + 2) + d * dx * s, seat - 40 * s + dy * s]);
      return pts;
    }
    case 'pupil': { const [x, y] = a; return [[x - 16 * s, y - (o.arm === 'up' ? 26 : 16) * s], [x + (o.arm === 'up' ? 21 : 16) * s, y + 35 * s]]; }
    case 'bust': { const [x, y] = a; return [[x - 27 * s, y - 21 * s], [x + 27 * s, y + 49 * s]]; }
    case 'desk': return [[a[0], a[2]], [a[1], a[2] + 22]];
    case 'table': return [[a[0], a[2]], [a[1], a[2] + 40]];
    case 'board': case 'sheet': case 'rect': return box(a[0], a[1], a[2], a[3]);
    case 'talk': return [...box(a[0], a[1], a[2], a[3]), a[4]];
    case 'think': return [a[0], ...circle(a[1][0], a[1][1], a[2])];
    case 'qmark': return [[a[0] - a[2] * 0.3, a[1] - a[2] * 0.5], [a[0] + a[2] * 0.3, a[1] + a[2] * 0.5]];
    case 'arrowTo': {
      const [p, q, c] = a;
      if (!c) return [p, q];
      return Array.from({ length: 11 }, (_, k) => { const t = k / 10, u = 1 - t; return [u * u * p[0] + 2 * u * t * c[0] + t * t * q[0], u * u * p[1] + 2 * u * t * c[1] + t * t * q[1]]; });
    }
    case 'disc': return circle(a[0], a[1], a[2]);
    case 'limb': { const r = a[1] / 2 + PEN; return a[0].flatMap(([x, y]) => circle(x, y, r)); }
    case 'tick': case 'cross': return circle(a[0], a[1], a[2] * 0.6);
    default: return typeof a[0] === 'string' ? pathPoints(a[0]) : [];
  }
}

/** How many ink focuses a part adds: an ink option, a filled colour, a solid shape or a back-of-head. */
export function inkCount(call) {
  const a = call.args ?? [];
  const o = a.find(isPlainObject) ?? {};
  let n = 0;
  if (o.ink === true) n++;
  if (o.back === true || o.face === 'back') n++;
  if (call.fn === 'ink') n++;
  if (['disc', 'blob', 'limb'].includes(call.fn) && a.includes('ink')) n++;
  return n;
}

/** Checks a scene against the house rules. errors are short and plain, ready to feed back to Claude. */
export function validateScene(scene) {
  if (!Array.isArray(scene)) return { ok: false, errors: ['The scene must be a JSON list of parts.'] };
  if (!scene.length) return { ok: false, errors: ['The scene is empty.'] };
  if (scene.length > MAX_CALLS) return { ok: false, errors: [`At most ${MAX_CALLS} parts.`] };
  const errors = scene.flatMap(callErrors);
  if (errors.length) return { ok: false, errors };
  scene.forEach((call, i) => {
    for (const [x, y] of extent(call)) {
      if (x < -FRAME_SLACK || x > FRAME.w + FRAME_SLACK || y < -FRAME_SLACK || y > FRAME.h + FRAME_SLACK) {
        errors.push(`#${i + 1} ${call.fn}: goes outside the 120 × 90 frame (near ${Math.round(x)}, ${Math.round(y)})`);
        break;
      }
    }
  });
  const inks = scene.reduce((n, c) => n + inkCount(c), 0);
  if (inks !== 1) errors.push(`Exactly one ink focus is allowed; this scene has ${inks}.`);
  if (!scene.some((c) => ['person', 'sitter', 'pupil', 'bust'].includes(c.fn))) errors.push('Show at least one person.');
  return { ok: errors.length === 0, errors };
}
