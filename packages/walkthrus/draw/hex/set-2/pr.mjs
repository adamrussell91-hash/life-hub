// Board hexagon figures, Book 2, Practice and retrieval. 120 × 90, pen 1.9.
import { pen, limb, person, pupil, sitter, desk, table, board, talk, qmark, arrowTo, dotted, disc, stroke, blob, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const rr = (x, y, w, h, rx, fill = PAPER) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const pinD = (x, y, r) => `M${f(x)} ${f(y)} C${f(x - r * 0.4)} ${f(y - r * 0.9)} ${f(x - r)` +
    `} ${f(y - r * 1.4)} ${f(x - r)} ${f(y - r * 2.2)} A${f(r)}` +
    ` ${f(r)} 0 1 1 ${f(x + r)} ${f(y - r * 2.2)} C${f(x + r)}` +
    ` ${f(y - r * 1.4)} ${f(x + r * 0.4)} ${f(y - r * 0.9)} ${f(x)} ${f(y)} Z`;
const pin = (x, y, r, fill = PAPER) => blob(pinD(x, y, r), fill);
const arc = (cx, cy, r, a1, a2) => {
  const p = (a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  const [x1, y1] = p(a1), [x2, y2] = p(a2);
  return stroke(`M${f(x1)} ${f(y1)} A${r} ${r} 0 0 1 ${f(x2)} ${f(y2)}`, 2.2);
};
const ladder = (a, b, gap, n) => {
  const rails = stroke(`M${a[0]} ${a[1]} L${b[0]} ${b[1]} M${a[0] + gap} ${a[1]} L${b[0] + gap} ${b[1]}`, 2.6);
  const rungs = Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / (n + 1), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    return stroke(`M${f(x)} ${f(y)} H${f(x + gap)}`, 2.2);
  }).join('');
  return rails + rungs;
};

export const figures = {
  'w2-make-everyone-think': HEX([
    disc(48, 16, 9, INK), disc(60, 12, 11, INK), disc(73, 17, 8, INK), `<rect x="46" y="16" width="30" height="9" fill="${INK}"/>`,
    dotted('M50 27 Q36 28 31 37', W), dotted('M60 27 V37', W), dotted('M70 27 Q84 28 89 37', W),
    pupil(28, 49, { s: 0.72 }), pupil(60, 49, { s: 0.72 }), pupil(92, 49, { s: 0.72 }),
    desk(10, 110, 70)
  ].join('')),
  'w2-multiple-choice-questions': HEX([
    person(20, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 10], [34, 34]]] }),
    qmark(82, 13, 18),
    ...[[28, false], [45, true], [62, false]].map(([y, k]) => rr(54, y, 56, 13, 3, k ? INK : PAPER) +
      (k ? `<path d="M60 ${y + 7} l3 3 l6 -7" fill="none" stroke="${PAPER}" s` +
    `troke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` : disc(64, y + 6.5, 2.4)) +
      `<path d="M74 ${y + 6.5} H103" stroke="${k ? PAPER : INK}" stroke-width="2.2" stroke-linecap="round"/>`)
  ].join('')),
  'w2-flash-cards': HEX([
    arrowTo([30, 25], [90, 25], [60, -6], { dash: true, w: W }),
    `<g transform="rotate(-6 32 44)">${rr(9, 29, 46, 30, 3)}${qmark(32, 42, 17)}</g>`,
    `<g transform="rotate(6 88 44)">${rr(65, 29, 46, 30, 3, INK)}<path d="M79 44 l6 6 l13 -14" fill=` +
    `"none" stroke="${PAPER}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    limb([[24, 88], [28, 74], [30, 58]], 8), limb([[96, 88], [92, 74], [90, 58]], 8)
  ].join('')),
  'w2-dual-coding-mapping': HEX([
    board(42, 6, 74, 62),
    stroke('M50 37 H98', 2.6),
    stroke('M64 37 L55 18 M64 37 L55 56 M80 37 L71 18 M80 37 L71 56 M96 37 L87 18 M96 37 L87 56', 2.2),
    `<path d="M98 28 L111 37 L98 46 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    person(20, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[12, -2], [28, -8]]] })
  ].join('')),
  'w2-practise-explaining': HEX([
    `<path d="M70 16 L78 10 L112 8 L104 14 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    `<path d="M70 16 L104 14 V84 L70 86 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    `<path d="M104 14 L112 8 V78 L104 84 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    `<path d="M79 49 l6 7 l12 -14" fill="none" stroke="${PAPER}" str` +
    `oke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    person(20, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 12], [28, 10]]] }),
    talk(34, 1, 25, 15, [28, 21]),
    arrowTo([61, 9], [72, 25], [71, 9], { w: W }),
    arrowTo([66, 74], [38, 62], [50, 82], { w: W })
  ].join('')),
  'w2-thresholds-and-pathways': HEX([
    person(20, 88, { s: 0.56, turn: 1, arms: [[[-4, 30], [-3, 52]], [[12, 12], [26, 14]]] }),
    rr(50, 4, 17, 28, 2), rr(50, 64, 17, 24, 2),
    dotted('M38 54 H78', W),
    pin(58.5, 60, 7, INK),
    dotted('M72 54 Q84 48 92 30', W), dotted('M78 54 H98', W), dotted('M72 54 Q82 60 90 76', W),
    pin(95, 28, 5), pin(106, 58, 5), pin(94, 84, 5)
  ].join('')),
  'w2-a-ladder-of-difficulty': HEX([
    ladder([34, 88], [72, 22], 20, 6),
    person(42, 70, { s: 0.38, turn: 1, behind: [0], legs: [[-4, 3], [6, -2]], arms: [[[22, 6], [50, 2]], [[16, 14], [36, 16]]] }),
    disc(90, 15, 11.5, INK), qmark(90, 14, 15, PAPER)
  ].join('')),
  'w2-the-face-it-revision-model': HEX([
    arc(36, 15, 24, -22, 34), arc(36, 15, 35, -20, 44), arc(36, 15, 46, -16, 44), arc(36, 15, 57, -12, 42),
    stroke('M36 15 L22 9 M36 15 L24 25 M36 15 L47 5 M36 15 L49 24', 1.9),
    disc(22, 9, 3), disc(24, 25, 3), disc(47, 5, 3), disc(49, 24, 3),
    disc(36, 15, 6.5, INK),
    dotted('M34 26 V33', W),
    stroke('M50 66 H112 M56 66 V88 M106 66 V88', W * 1.2),
    sitter(30, 66, { s: 0.46, arms: [[[14, 16], [36, 28]], [[12, 20], [40, 28]]] }),
    stroke('M66 62 H86', 3)
  ].join(''))
};
