// Board hexagon figures, Behaviour and relationships. 120 × 90, pen 1.9.
import { pen, person, pupil, desk, board, arrowTo, stroke, ink, disc, INK, PAPER, HEX, f } from '../people.mjs';
pen(1.9);
const HANG_L = [[-4, 30], [-3, 52]], HANG_R = [[4, 30], [3, 52]];
const tick = (x, y, r, w = 2.2) => stroke(`M${f(x - r * 0.55)} ${f(y)} L${f(x - r * 0.12)} ${f(y + r * 0.45)} L${f(x + r * 0.6)} ${f(y - r * 0.45)}`, w);
const cross = (x, y, r, w = 2.2) => stroke(`M${f(x - r * 0.45)} ${f(y - r * 0.45)} L${f(x + r * 0.45)} ${f(y + r * 0.45)} M${f(x + r * 0.45)} ` +
  `${f(y - r * 0.45)} L${f(x - r * 0.45)} ${f(y + r * 0.45)}`, w);
const pointR = [HANG_L, [[16, 10], [30, -4]]];
const upR = [HANG_L, [[14, 2], [16, -26]]];

export const figures = {
  'w1-rehearse-routines': HEX([
    person(18, 87, { s: 0.6, turn: 1, arms: pointR }),
    arrowTo([104, 30], [50, 28], [78, 2], { w: 1.9 }),
    person(54, 87, { s: 0.42 }), person(78, 87, { s: 0.42, ink: true }), person(102, 87, { s: 0.42 })
  ].join('')),
  'w1-positive-relationships': HEX([
    person(30, 87, { s: 0.62, turn: 1, arms: [HANG_L, [[14, 12], [28, 8]]] }),
    ink('M60 36 C46 26 50 12 60 20 C70 12 74 26 60 36 Z'),
    person(90, 87, { s: 0.48, turn: -1, arms: [[[-12, 12], [-24, 8]], HANG_R] })
  ].join('')),
  'w1-establish-your-expectations': HEX([
    board(40, 6, 74, 60),
    `<rect x="48" y="15" width="10" height="10" rx="2" fill="${INK}"/>`, stroke('M66 20 H104', 2), tick(53, 37, 10), stroke('M66 37 H104', 2), tick(53, 54, 10), stroke('M66 54 H96', 2),
    person(18, 87, { s: 0.6, turn: 1, arms: [HANG_L, [[16, -2], [30, -22]]] })
  ].join('')),
  'w1-signal-pause-insist': HEX([
    person(18, 87, { s: 0.6, turn: 1, arms: upR }),
    `<path d="M36 8 h7 v22 h-7 Z M49 8 h7 v22 h-7 Z" fill="${INK}"/>`,
    pupil(66, 46, { s: 0.6 }), pupil(88, 46, { s: 0.6 }), pupil(110, 46, { s: 0.6 }),
    desk(54, 120, 65)
  ].join('')),
  'w1-positive-framing': HEX([
    person(18, 87, { s: 0.6, turn: 1, arms: [HANG_L, [[16, 4], [28, -10]]] }),
    board(38, 8, 48, 42), `<rect x="45" y="15" width="34" height="28" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>`,
    `<path d="M59.5 19 h5 v7.5 h7.5 v5 h-7.5 v7.5 h-5 v-7.5 h-7.5 v-5 h7.5 Z" fill="${INK}"/>`,
    pupil(103, 50, { s: 0.62 }), desk(88, 118, 69)
  ].join('')),
  'w1-choices-and-consequences': HEX([
    person(16, 87, { s: 0.6, turn: 1, arms: [HANG_L, [[14, 14], [26, 20]]] }),
    stroke('M34 56 H56', 1.9),
    arrowTo([56, 56], [94, 24], [70, 28], { w: 1.9 }), arrowTo([56, 56], [94, 78], [70, 76], { w: 1.9 }),
    `<circle cx="56" cy="56" r="5" fill="${INK}"/>`,
    tick(108, 22, 14), cross(108, 76, 14)
  ].join(''))
};
