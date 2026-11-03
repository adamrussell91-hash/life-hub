// Board hexagon figures, Book 3, Behaviour and relationships. 120 × 90, pen 1.9.
import { pen, person, pupil, desk, talk, think, bust, dotted, stroke, disc, sheet, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const r = (x, y, w, h, fill = PAPER, rx = 1.5) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ` +
    `rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const paperLine = (d, w = 2.2) => `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${f(w)}" ` +
    'stroke-linecap="round" stroke-linejoin="round"/>';
const dots = (x, y, gap = 6, rad = 1.8, c = PAPER) => [-gap, 0, gap]
  .map((d) => `<circle cx="${f(x + d)}" cy="${f(y)}" r="${rad}" fill="${c}"/>`).join('');
const ring = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" ` +
    `stroke="${INK}" stroke-width="${W}"/>`;
const chopper = (x, y) => [
  stroke(`M${x + 8} ${y} L${x + 26} ${y - 5} M${x + 26} ${y - 10} V${y}`, W * 1.2),
  `<ellipse cx="${x}" cy="${y}" rx="12" ry="7.5" fill="${INK}"/>`,
  stroke(`M${x} ${y - 7} V${y - 12} M${x - 16} ${y - 12} H${x + 16}`, W * 1.2),
  stroke(`M${x - 5} ${y + 7} V${y + 11} M${x + 5} ${y + 7} V${y + 11} M${x - 11} ${y + 11} H${x + 11}`, W)
].join('');

export const figures = {
  'w3-front-loading-behaviour-management': HEX([
    pupil(68, 12, { s: 0.5 }), pupil(88, 12, { s: 0.5 }), pupil(108, 12, { s: 0.5 }),
    desk(58, 116, 28),
    pupil(62, 48, { s: 0.6 }), pupil(85, 48, { s: 0.6 }), pupil(108, 48, { s: 0.6 }),
    desk(50, 118, 62),
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[16, 6], [24, -8]]] }),
    r(30, 3, 20, 24, INK, 2),
    paperLine('M35 11 l2.5 3 l5 -6 M35 21 H45')
  ].join('')),
  'w3-seating-plans': HEX([
    think([48, 22], [84, 22], 19),
    bust(84, 15, { s: 0.42 }),
    person(24, 88, { s: 0.62, turn: 1, arms: [[[10, 24], [26, 30]], [[12, 22], [30, 26]]] }),
    r(48, 44, 44, 34, INK, 2),
    ...[53, 66, 79].flatMap((x) => [49, 63].map((y) => (x === 79 && y === 49 ? ''
      : `<rect x="${x}" y="${y}" width="8" height="9" rx="1" fill="${PAPER}"/>`)))
  ].join('')),
  'w3-build-a-vocal-repertoire': HEX([
    stroke('M30 20 H50', W),
    disc(20, 20, 14, INK),
    paperLine('M11 20 V20 M15.5 15 V25 M20 10.5 V29.5 M24.5 15 V25 M29 20 V20'),
    disc(62, 20, 14),
    `<path d="M53 16 H58 L65 11 V29 L58 24 H53 Z" fill="${INK}"/>`,
    stroke('M69 15 Q72.5 20 69 25', W),
    talk(26, 54, 36, 20, [72, 44], { text: '…' }),
    person(98, 88, { s: 0.6, turn: -1, arms: [[[-14, 16], [-28, 2]], [[4, 30], [3, 52]]] })
  ].join('')),
  'w3-certainty-v-severity': HEX([
    ...[18, 46, 74, 102].map((x) => person(x, 88, {
      s: 0.47, arms: [[[-8, 26], [10, 30]], [[8, 26], [-10, 34]]]
    })),
    ...[18, 46, 74, 102].map((x) => `<path d="M${x - 5} 13 L${x} 23 L${x + 5} 13 Z" fill="${INK}" stroke="${INK}" ` +
      `stroke-width="${W}" stroke-linejoin="round"/>`),
    r(6, 3, 108, 13, INK, 6.5),
    dots(60, 9.5, 9, 2.2)
  ].join('')),
  'w3-modelling-mindsets': HEX([
    stroke('M50 18 V5 H114 V84 H50 V34', W * 1.3),
    stroke('M62 20 V71 H102 V19 H78', W * 1.3),
    `<circle cx="82" cy="39" r="9.5" fill="${INK}"/>`,
    `<path d="M77 46 H87 V54 H77 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    paperLine('M79 50.5 H85', 1.6),
    person(24, 88, { s: 0.6, turn: 1, legs: [[-9, -3], [8, 8]], arms: [[[-14, 20], [-20, 42]], [[16, 8], [32, 2]]] })
  ].join('')),
  'w3-ending-lessons-the-last-10-minutes': HEX([
    chopper(26, 17),
    dotted('M26 32 V62', W),
    ring(26, 78, 22, 7), ring(26, 78, 11, 3.2),
    person(88, 88, { s: 0.6, turn: -1, arms: [[[-14, 8], [-34, 16]], [[4, 30], [3, 52]]] })
  ].join('')),
  'w3-pastoral-conversations-with-visual-records': HEX([
    pupil(30, 13, { s: 0.92 }), pupil(90, 13, { s: 0.92 }),
    sheet(24, 46, 72, 42, 0),
    `<path d="M40 51 L50 68 H30 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    paperLine('M40 57 V62', 1.8),
    stroke('M34 78 H46 M60 56 H86 M60 67 H86 M60 78 H74', W),
    talk(46, 6, 28, 18, [50, 34], { text: '…' })
  ].join('')),
  'w3-repair-and-rebuild': HEX([
    person(32, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 16], [28, 20]]] }),
    person(88, 88, { s: 0.6, turn: -1, arms: [[[-14, 16], [-28, 20]], [[4, 30], [3, 52]]] }),
    talk(44, 3, 32, 19, [60, 30], { ink: true })
  ].join(''))
};
