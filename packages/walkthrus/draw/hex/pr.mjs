// Board hexagon figures, Practice and retrieval (pr). 120 × 90, pen 1.9.
// Shape helpers come from steps/pr.mjs (that module finishes its own 2.6-pen drawings on import first).
import { setW, box, bars, hub, bulb, cube, maze, clock, tickDisc, T, ell } from '../steps/pr.mjs';
import { pen, person, pupil, desk, sitter, table, board, sheet, talk, think, qmark, arrowTo, dotted, disc, stroke, INK, PAPER, HEX } from '../people.mjs';
pen(1.9); setW(1.9);
const POINT_R = [[30, -2], [62, -4]], DOWN_L = [[-4, 30], [-3, 52]];

export const figures = {
  'w1-quizzing': HEX([
    board(30, 2, 60, 38),
    ...[0, 1, 2].map((i) => box(37, 8 + i * 10, 7, 7, { rx: 1.5, fill: i === 1 ? INK : PAPER }) + stroke(`M50 ${11.5 + i * 10} h${30 - i * 5}`, 1.9)),
    pupil(30, 52, { s: 0.6 }), pupil(60, 52, { s: 0.6 }), pupil(90, 52, { s: 0.6 }),
    desk(12, 108, 70)
  ].join('')),
  'w1-weekly-and-monthly-review': HEX([
    pupil(22, 50, { s: 0.62 }), desk(4, 40, 70),
    box(52, 10, 62, 50, { rx: 4 }), box(52, 10, 62, 13, { rx: 4, fill: INK }),
    stroke('M64 5 v9 M102 5 v9', 2.6), stroke('M52 36 H114 M52 48 H114 M72 23 V60 M93 23 V60', 1.4),
    arrowTo([66, 66], [36, 54], [48, 86], { w: 2.2 })
  ].join('')),
  'w1-elaborative-interrogation': HEX([
    talk(24, 6, 24, 20, [22, 36], { text: '?' }),
    pupil(18, 50, { s: 0.6 }), desk(2, 36, 70),
    disc(58, 66, 6), arrowTo([63, 60], [73, 48], null, { w: 2.2 }),
    disc(80, 42, 6), arrowTo([85, 36], [95, 24], null, { w: 2.2 }),
    disc(103, 16, 8, INK)
  ].join('')),
  'w1-using-a-knowledge-organiser': HEX([
    box(52, 4, 64, 72, { rx: 3 }), stroke('M84 4 V76 M52 40 H116', 1.9),
    box(57, 9, 22, 26, { rx: 2, fill: INK }),
    stroke('M90 16 H110 M90 25 H104 M58 52 H78 M58 61 H72 M90 52 H110 M90 61 H102', 1.6),
    person(20, 88, { s: 0.56, turn: 1, arms: [DOWN_L, [[24, -10], [48, -20]]] })
  ].join('')),
  'w1-rehearsal-and-performance': HEX([
    dotted('M104 14 L80 56', 1.9),
    disc(108, 9, 6, INK),
    box(30, 74, 60, 9, { rx: 2 }),
    person(60, 74, { s: 0.48, arms: [[[-12, -14], [-18, -38]], [[12, -14], [18, -38]]] }),
    stroke('M28 40 A12 12 0 1 1 16 28', 2.6), stroke('M21 23 L16 28 L21 33', 2.6)
  ].join('')),
  'w1-peer-supported-retrieval': HEX([
    pupil(24, 50, { s: 0.62 }), pupil(96, 50, { s: 0.62 }), desk(4, 116, 70),
    stroke('M32 62 L44 34', 4),
    box(34, 10, 28, 22, { rx: 3, fill: INK }),
    talk(74, 6, 34, 20, [94, 40], { text: '?' })
  ].join('')),
  'w1-concrete-examples': HEX([
    person(20, 88, { s: 0.58, turn: 1, arms: [DOWN_L, [[24, -6], [46, -12]]] }),
    stroke('M42 74 H116 M48 74 V88 M110 74 V88', 2.4),
    cube(50, 54, 18), disc(84, 62, 10, INK),
    `<path d="M98 72 L107 52 L116 72 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.9" stroke-linejoin="round"/>`
  ].join('')),
  'w1-guided-practice': HEX([
    stroke('M64 16 H92', 2.6), dotted('M98 16 H116', 2.4), disc(64, 16, 5, INK),
    person(30, 88, { s: 0.58, turn: 1, arms: [DOWN_L, [[24, 4], [46, 14]]] }),
    pupil(88, 52, { s: 0.6 }), desk(66, 112, 72)
  ].join('')),
  'w1-independent-practice': HEX([
    ...[20, 60, 100].map((x, i) => (i === 1 ? box(x - 9, 4, 18, 22, { rx: 2, fill: INK }) : box(x - 9, 4, 18, 22, { rx: 2 }) + stroke(`M${x - 4} 11 h8 M${x - 4} 17 h6`, 1.6))
      + pupil(x, 46, { s: 0.56 }) + desk(x - 18, x + 18, 64))
  ].join('')),
  'w1-building-fluency': HEX([
    pupil(22, 50, { s: 0.62 }), desk(4, 40, 70),
    disc(86, 50, 24), stroke('M86 26 v-6 M79 19 h14', 2.6),
    `<path d="M86 50 L86 31 A19 19 0 0 1 102 40 Z" fill="${INK}"/>`,
    stroke('M86 50 L100 38', 2.4),
    stroke('M50 40 H58 M46 50 H58 M50 60 H58', 2)
  ].join(''))
};
