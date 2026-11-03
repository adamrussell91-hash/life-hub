// Board hexagon figures, Book 3, Questioning and feedback. 120 × 90, pen 1.9.
import { pen, person, pupil, sitter, talk, disc, blob, board, arrowTo, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const ln = (d, w = W, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const box = (x, y, w, h, fill = PAPER, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const dots = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-dasharray="0.8 4.9"/>`;
const ball = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`;
const tickMark = (x, y, r, c = INK, w = 2.8) => ln(`M${x - r} ${y} l${f(r * 0.7)} ${f(r * 0.7)} l${f(r * 1.3)} ${f(-r * 1.4)}`, w, c);
const crossMark = (x, y, r, c = INK, w = 2.8) => ln(`M${x - r} ${y - r} L${x + r} ${y + r} M${x + r} ${y - r} L${x - r} ${y + r}`, w, c);
const flower = (x, y) => [[0, -9.5], [9, -2.9], [5.6, 7.7], [-5.6, 7.7], [-9, -2.9]]
  .map(([dx, dy]) => disc(x + dx, y + dy, 5.2)).join('') + ball(x, y, 4.6);
const folder = (x, y, fill) => blob(`M${x} ${y + 6} V${y + 34} H${x + 34} V${y + 6} H${x + 16} L${x + 12} ${y} H${x + 3} Z`, fill);

export const figures = {
  'w3-cold-call-variations': HEX([
    talk(8, 6, 24, 15, [20, 28], { ink: true }), talk(36, 16, 24, 15, [46, 38], { ink: true }),
    pupil(20, 42, { s: 0.92 }), pupil(52, 48, { s: 0.8 }), box(4, 72, 70, 10),
    person(96, 88, { s: 0.6, turn: -1, arms: [[[-12, 18], [-26, 8]], [[6, 26], [5, 46]]] })
  ].join('')),
  'w3-strategies-to-check-for-understanding': HEX([
    talk(46, 0, 28, 18, [60, 24], { ink: true, text: '?' }),
    person(60, 88, { s: 0.48, arms: [[[-20, 16], [-40, 2]], [[20, 16], [40, 2]]] }),
    box(12, 18, 24, 24), tickMark(21, 30, 6), ln('M27 42 L29 54', W * 1.6),
    box(84, 18, 24, 24), crossMark(96, 30, 5), ln('M93 42 L91 54', W * 1.6)
  ].join('')),
  'w3-class-discussion': HEX([
    talk(6, 14, 24, 15, [20, 36]), talk(90, 14, 24, 15, [100, 36]),
    arrowTo([32, 12], [88, 12], [60, -6], { w: W }), ln('M38 7 L32 12 L40 15', W),
    pupil(20, 42, { s: 0.86 }), pupil(100, 42, { s: 0.86 }), box(4, 68, 32, 9), box(84, 68, 32, 9),
    person(60, 88, { s: 0.5, ink: true, arms: [[[-14, 14], [-26, 0]], [[14, 14], [26, 0]]] })
  ].join('')),
  'w3-show-call': HEX([
    board(56, 4, 58, 42), box(68, 10, 34, 30, INK, 1), ln('M74 18 H96 M74 25 H96 M74 32 H88', W, PAPER),
    person(22, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[10, 8], [24, -6]]] }),
    box(38, 8, 11, 15, PAPER, 1), dots('M50 16 H62'),
    pupil(68, 56, { s: 0.74, back: true }), pupil(98, 56, { s: 0.74, back: true }), ln('M50 82 H114', W * 1.2)
  ].join('')),
  'w3-scaffold-verbal-responses': HEX([
    box(12, 3, 96, 26, PAPER, 9), blob('M54 29 L60 40 L66 29 Z'), ln('M55.5 29 H64.5', 2.6, PAPER),
    box(20, 9, 40, 14, INK, 7), dots('M67 16 H100'),
    person(38, 88, { s: 0.44, turn: 1, arms: [[[-14, 8], [-22, -10]], [[14, 8], [22, -10]]] }),
    person(82, 88, { s: 0.44, turn: -1, arms: [[[-14, 8], [-22, -10]], [[14, 8], [22, -10]]] })
  ].join('')),
  'w3-short-feedback-loops': HEX([
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 22], [28, 26]]] }),
    sitter(96, 58, { s: 0.7, dir: -1, arms: [[[14, 18], [26, 22]], [[12, 20], [26, 24]]] }),
    ball(58, 26, 6), arrowTo([46, 18], [70, 18], [58, 4], { w: W }), arrowTo([70, 34], [46, 34], [58, 48], { w: W })
  ].join('')),
  'w3-c-r-a-f-t-feedback-time': HEX([
    ln('M24 18 V44 M96 18 V44', W), flower(24, 18), flower(96, 18),
    pupil(24, 53, { s: 0.85 }), pupil(96, 53, { s: 0.85 }),
    box(4, 76, 112, 9),
    box(46, 42, 28, 34, PAPER, 1), ln('M52 51 H68', W), tickMark(58, 62, 4.4, INK, 2.4)
  ].join('')),
  'w3-assessment-for-student-agency': HEX([
    ln('M56 86 L78 6 M74 86 L94 12', W * 1.3),
    ln('M59 74 L77 74 M63 60 L81 60 M67 46 L85 46 M71 32 L89 32 M75 18 L93 18', W * 1.2),
    ln('M88 4 V14', W * 1.2), `<path d="M88 4 L108 10 L88 16 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    person(32, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 8], [30, -2]]] })
  ].join('')),
  'w3-formative-use-of-tests': HEX([
    box(4, 6, 36, 56), tickMark(11, 16, 3.6, INK, 2.2), ln('M20 16 H34', W), box(7, 26, 30, 16, INK, 1),
    crossMark(14, 34, 3, PAPER, 2.2), ln('M22 34 H33', W, PAPER), tickMark(11, 52, 3.6, INK, 2.2), ln('M20 52 H34', W),
    person(60, 88, { s: 0.54, turn: 1, arms: [[[-12, 10], [-20, 0]], [[14, 8], [26, -8]]] }),
    arrowTo([38, 7], [86, 17], [66, -4], { w: W }),
    board(80, 20, 36, 38), ln('M87 31 H109 M87 39 H109 M87 47 H100', W)
  ].join('')),
  'w3-assessment-portfolios': HEX([
    arrowTo([30, 18], [90, 18], [60, -6], { w: W }), ln('M36 12 L30 18 L38 21', W),
    folder(6, 22, INK), folder(80, 22, PAPER),
    person(60, 88, { s: 0.5, arms: [[[-14, 16], [-30, 4]], [[14, 16], [30, 4]]] })
  ].join(''))
};
