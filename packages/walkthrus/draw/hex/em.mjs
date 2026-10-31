// Board hexagon figures, Explicit modelling (em). 120 × 90, pen 1.9.
import { person, pupil, desk, sitter, table, talk, think, qmark, dotted, arrowTo, stroke, disc, board, sheet, bust, INK, PAPER, HEX } from '../people.mjs';
import { epen, node, box, tick, cross, mmap, tag, cube, hexmodel, magnifier, mapPin, doll, stars, plinth, txt } from '../steps/em-kit.mjs';
epen(1.9);
const point = (dx, dy) => [[[-3, 30], [-3, 52]], [[dx * 0.5, dy * 0.5 + 4], [dx, dy]]];
export const figures = {
  'w1-live-modelling': HEX([
    board(36, 4, 80, 40),
    arrowTo([62, 24], [70, 24]), arrowTo([84, 24], [92, 24]),
    node(55, 24, 6), node(77, 24, 6), node(99, 24, 6, '', { ink: true }),
    person(18, 88, { s: 0.6, arms: point(30, -8) }),
    pupil(62, 54, { s: 0.6 }), pupil(84, 54, { s: 0.6 }), pupil(106, 54, { s: 0.6 }), desk(50, 118, 72)
  ].join('')),
  'w1-worked-examples-and-backward-fading': HEX([
    person(14, 88, { s: 0.58, arms: point(22, -18) }),
    ...[[32, 4], [62, 2], [92, 1]].map(([x, solid]) => box(x, 16, 24, 62) + [30, 44, 58, 70].map((y, i) => (i < solid ? stroke : dotted)(`M${x + 5} ${y} h14`, 1.9)).join('')),
    box(32, 16, 24, 8, { ink: true })
  ].join('')),
  'w1-dual-coding': HEX([
    board(36, 4, 80, 46), stroke('M76 4 V50', 1.9), stroke('M43 16 H69 M43 26 H69 M43 36 H63', 1.6),
    `<path d="M80 44 L92 26 L100 36 L106 30 L113 44 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.9"` +
      ` stroke-linejoin="round"/>`, disc(104, 15, 5, INK),
    person(16, 88, { s: 0.6, arms: point(24, -12) }),
    pupil(60, 60, { s: 0.58 }), pupil(82, 60, { s: 0.58 }), pupil(104, 60, { s: 0.58 }), desk(48, 118, 78)
  ].join('')),
  'w1-deliberate-vocabulary-development': HEX([
    box(36, 8, 78, 22, { rx: 4 }), box(60, 8, 30, 22, { ink: true, rx: 0 }), stroke('M42 19 H54 M96 19 H108', 1.6),
    arrowTo([75, 34], [75, 48]),
    box(46, 52, 58, 24, { rx: 4 }), stroke('M52 60 H98 M52 68 H84', 1.6),
    person(16, 88, { s: 0.6, arms: point(24, -16) })
  ].join('')),
  'w1-big-picture-small-picture': HEX([
    disc(62, 36, 28), disc(50, 26, 6), disc(72, 22, 6), disc(64, 48, 8, INK),
    dotted('M72 54 L92 64', 1.9),
    disc(104, 72, 14), stroke('M97 69 H111 M97 76 H107', 1.6),
    person(16, 88, { s: 0.6, arms: point(22, -6) })
  ].join('')),
  'w1-abstract-models-with-concrete-examples': HEX([
    stroke('M61 12 H83 M59 16 L69 28 M85 16 L75 28', 1.9),
    disc(56, 12, 6), disc(88, 12, 6), disc(72, 32, 6, INK),
    dotted('M68 40 L58 54 M76 40 L88 54', 1.9),
    cube(46, 58, 16), disc(94, 70, 9), stroke('M40 80 H114', 1.9),
    person(16, 88, { s: 0.6, arms: point(24, -18) })
  ].join('')),
  'w1-scaffolding': HEX([
    stroke('M36 86 V10 M46 86 V10', 1.9), stroke('M36 24 H46 M36 42 H46 M36 60 H46 M36 78 H46', 1.6),
    box(58, 62, 26, 24), box(58, 38, 26, 24), box(58, 14, 26, 24, { ink: true }),
    dotted('M98 86 V10 M108 86 V10', 1.9), dotted('M98 24 H108 M98 42 H108 M98 60 H108 M98 78 H108', 1.6),
    person(16, 88, { s: 0.6, arms: point(16, -24) })
  ].join('')),
  'w1-metacognitive-talk': HEX([
    talk(38, 4, 60, 38, [40, 50]), `<ellipse cx="68" cy="23" rx="16" ry="9" fill="${INK}"/>`,
    person(20, 88, { s: 0.6, arms: [[[-4, 30], [-3, 52]], [[6, 26], [-9, -4]]] }),
    pupil(64, 60, { s: 0.58 }), pupil(86, 60, { s: 0.58 }), pupil(108, 60, { s: 0.58 }), desk(52, 120, 78)
  ].join('')),
  'w1-set-the-standards': HEX([
    box(40, 10, 30, 40), stroke('M45 30 H65 M45 38 H65 M45 46 H59', 1.6),
    `<path d="M55 12 L57.6 18 L64 18.6 L59.2 22.8 L60.6 29 L55 25.8 L49.4 29 L50.8 22.8 L46 18.6 L52.4 18Z" fill="${INK}"/>`,
    stroke('M84 86 V18 M114 86 V18', 1.9), stroke('M84 22 H114', 3.4),
    person(99, 86, { s: 0.42, arms: [[[-6, -14], [-4, -30]], [[6, -14], [4, -30]]] }),
    person(18, 88, { s: 0.6, arms: point(22, -18) })
  ].join('')),
  'w1-head-on-misconceptions': HEX([
    talk(40, 6, 30, 22, [48, 36]), cross(55, 17, 8),
    arrowTo([74, 17], [84, 17]),
    talk(86, 6, 30, 22, [96, 36], { ink: true }), tick(101, 17, 10, PAPER, 2.2),
    pupil(70, 50, { s: 0.6 }), pupil(98, 50, { s: 0.6 }), desk(56, 114, 68),
    person(18, 88, { s: 0.6, arms: point(22, -18) })
  ].join('')),
  // @@END
};
