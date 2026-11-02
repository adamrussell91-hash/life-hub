// Board hexagon figures, Book 2, Curriculum planning. 120 × 90, pen 1.9.
import { pen, person, sitter, talk, arrowTo, dotted, stroke, blob, disc, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const r = (x, y, w, h, fill = PAPER, rx = 1.5) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ` +
    `rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const openBook = (x, y, w) => blob(`M${f(x)} ${f(y)} Q${f(x - w * 0.25)} ${f(y - w * 0.18)} ${f(x - w / 2)} ${f(y - w * 0.06)` +
    `} L${f(x - w / 2)} ${f(y + w * 0.3)} Q${f(x - w * 0.25)} ${f(y + w * 0.2)} ${f(x)}` +
    ` ${f(y + w * 0.36)} Q${f(x + w * 0.25)} ${f(y + w * 0.2)} ${f(x + w / 2)} ${f(y + w * 0.3)} ` +
    `L${f(x + w / 2)} ${f(y - w * 0.06)} Q${f(x + w * 0.25)} ${f(y - w * 0.18)} ${f(x)} ${f(y)} Z`) + stroke(`M${f(x)} ${f(y)} V${f(y + w * 0.36)}`, W * 0.7);
const pin = (x, tip, rad, fill = INK) => {
  const cy = tip - rad * 2.3;
  return `<path d="M${f(x)} ${f(tip)} C${f(x - rad * 0.5)} ${f(tip - rad)} ${f(x - rad)}` +
    ` ${f(cy + rad * 0.7)} ${f(x - rad)} ${f(cy)} A${f(rad)} ${f(rad)} 0 1 1 ${f(x + rad)` +
    `} ${f(cy)} C${f(x + rad)} ${f(cy + rad * 0.7)} ${f(x + rad * 0.5)} ${f(tip - rad)` +
    `} ${f(x)} ${f(tip)} Z" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>` +
    `<circle cx="${f(x)}" cy="${f(cy)}" r="${f(rad * 0.4)}" fill="${fill === INK ? PAPER : 'none'` +
    `}" stroke="${fill === INK ? 'none' : INK}" stroke-width="${W}"/>`;
};
const star = (cx, cy, R, fill = INK) => {
  const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? R * 0.45 : R; return `${f(cx + q * Math.cos(a))} ${f(cy + q * Math.sin(a))}`; });
  return `<path d="M${pts.join(' L')} Z" fill="${fill}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`;
};
const grid = [[3, 0], [1, 1], [4, 2], [0, 3], [2, 4]];

export const figures = {
  'w2-trivium-in-practice': HEX([
    blob('M60 72 Q40 62 16 68 V84 Q40 78 60 88 Q80 78 104 84 V68 Q80 62 60 72 Z'),
    stroke('M60 72 V88', W * 0.7),
    person(60, 75, { s: 0.38, arms: [[[-22, -2], [-42, -14]], [[22, -2], [42, -14]]] }),
    talk(14, 3, 30, 19, [38, 29]),
    `<path d="M80 28 L84 15 L90 17 L83 30 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    `<circle cx="88" cy="10" r="8" fill="${INK}"/>`,
    `<path d="M82 8 L92 15 M85 4 L95 11" stroke="${PAPER}" stroke-width="1.6" stroke-linecap="round"/>`
  ].join('')),
  'w2-mode-a-mode-b': HEX([
    ...Array.from({ length: 25 }, (_, i) => {
      const c = i % 5, w = Math.floor(i / 5), k = grid.some(([a, b]) => a === c && b === w);
      return r(48 + c * 13.2, 10 + w * 13.2, 11, 11, k ? INK : PAPER, 1.5);
    }),
    person(20, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[10, 20], [-4, -4]]] })
  ].join('')),
  'w2-diversity-ways-into-curriculum-building': HEX([
    disc(84, 50, 30),
    stroke('M84 20 Q60 50 84 80 Q108 50 84 20 M54 50 H114', W * 0.8),
    pin(84, 42, 10),
    sitter(22, 62, { s: 0.54, arms: [[[12, 14], [26, 12]], [[10, 16], [24, 14]]] }),
    openBook(42, 44, 16)
  ].join('')),
  'w2-authentic-connections': HEX([
    ...[[0, 26], [60, 26], [120, 26], [180, 26], [240, 26], [300, 26]].map(([a, R]) => {
      const t = (a * Math.PI) / 180, x = 84 + R * Math.cos(t), y = 30 + R * Math.sin(t) * 0.95;
      return stroke(`M84 30 L${f(x)} ${f(y)}`, W);
    }),
    stroke('M110 30 L97 54.7 L71 54.7 L58 30 L71 5.3 L97 5.3 Z', W * 0.7),
    ...[0, 60, 120, 180, 240, 300].map((a) => { const t = (a * Math.PI) / 180; return disc(84 + 26 * Math.cos(t), 30 + 26 * Math.sin(t) * 0.95, 5); }),
    disc(84, 30, 8, INK),
    sitter(24, 56, { s: 0.6, arms: [[[12, 18], [26, 18]], [[14, -6], [24, -30]]] })
  ].join('')),
  'w2-themes-and-topics': HEX([
    `<path d="M82 8 H112 V48 H82 V36 a8 8 0 0 0 0 -16 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    blob('M52 8 H82 V20 a8 8 0 0 1 0 16 V48 H52 Z'),
    person(24, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[16, 0], [34, -4]]] })
  ].join('')),
  'w2-learning-objectives-vs-tasks': HEX([
    stroke('M18 52 L102 16', W),
    person(60, 88, { s: 0.58, arms: [[[-20, 12], [-44, 22]], [[20, -6], [44, -26]]] }),
    disc(18, 58, 15, INK), `<circle cx="18" cy="58" r="9" fill="none" stroke="${PAPER}" str` +
    `oke-width="2.2"/><circle cx="18" cy="58" r="3" fill="${PAPER}"/>`,
    r(92, 2, 22, 22, PAPER, 2), stroke('M97 13 l4 5 l9 -11', 2.4)
  ].join('')),
  'w2-responsive-lesson-planning': HEX([
    dotted('M42 72 H106', W),
    stroke('M70 67 l9 9 m0 -9 l-9 9', 2.4),
    arrowTo([44, 64], [92, 24], [62, -12], { w: W }),
    pin(104, 72, 12),
    person(18, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 12], [28, 6]]] }),
    r(30, 18, 12, 16)
  ].join('')),
  'w2-teach-to-the-top': HEX([
    stroke('M38 88 L88 16 M54 88 L104 16', W),
    ...[0.16, 0.34, 0.52, 0.7, 0.88].map((t) => stroke(`M${f(38 + 50 * t)} ${f(88 - 72 * t)} h16`, W)),
    person(69, 58, { s: 0.25, arms: [[[6, -10], [10, -34]], [[8, -8], [18, -30]]] }),
    star(100, 11, 10),
    person(18, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, -6], [24, -30]]] })
  ].join('')),
  'w2-send-aim-high-plan-support': HEX([
    blob('M40 86 L58 54 L66 62 L84 22 L116 86 Z'),
    stroke('M75 42 L81 48 L85 42 L90 49 L94 42', W),
    stroke('M56 86 V78 H64 V70 H72 V62 H80', W),
    stroke('M84 22 V4', W),
    `<path d="M84 4 L104 10 L84 16 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 2], [30, -14]]] })
  ].join('')),
  'w2-textbooks-and-workbooks': HEX([
    r(68, 4, 46, 82, PAPER, 2), stroke('M68 45 H114', W),
    r(72, 14, 8, 31), r(82, 10, 8, 35, INK), r(92, 16, 8, 29),
    r(72, 56, 8, 30), r(82, 52, 8, 34), r(92, 58, 8, 28), stroke('M102 86 L108 60', W),
    sitter(20, 60, { s: 0.58, arms: [[[12, 14], [26, 12]], [[10, 16], [24, 14]]] }),
    openBook(42, 42, 16)
  ].join(''))
};
