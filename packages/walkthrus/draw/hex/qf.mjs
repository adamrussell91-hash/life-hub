// Board hexagon figures, Questioning and feedback. 120 × 90, pen 1.9.
import { pen, limb, person, pupil, desk, sitter, table, board, sheet, talk, think, qmark, arrowTo, dotted, disc, stroke, bust, blob, f, INK, PAPER, HEX } from '../people.mjs';
pen(1.9);
export const figures = {
  'w1-cold-calling': HEX([
    person(20, 88, { s: 0.6, arms: [[[-3, 30], [-3, 52]], [[16, 10], [30, -8]]] }),
    talk(30, 4, 24, 18, [36, 28], { text: '?' }),
    dotted('M50 34 Q64 30 76 40', 1.9),
    pupil(60, 46, { s: 0.62 }), pupil(82, 46, { s: 0.62, ink: true }), pupil(104, 46, { s: 0.62 }),
    desk(48, 116, 66)
  ].join('')),
  'w1-think-pair-share': HEX([
    think([20, 40], [26, 18], 9),
    pupil(14, 48, { s: 0.75 }), desk(2, 27, 68),
    arrowTo([29, 58], [37, 58], null, { w: 1.9 }),
    talk(45, 10, 26, 18, [56, 36]),
    pupil(50, 48, { s: 0.75 }), pupil(70, 48, { s: 0.75 }), desk(38, 82, 68),
    arrowTo([84, 58], [92, 58], null, { w: 1.9 }),
    talk(84, 1, 26, 16, [98, 20], { ink: true, text: '…' }),
    person(106, 88, { s: 0.5, turn: -1 })
  ].join('')),
  'w1-show-me-boards': HEX([
    ...[[22, false], [60, true], [98, false]].map(([x, k]) => [
      limb([[x - 9, 56], [x - 12, 44], [x - 10, 30]], 4.5), limb([[x + 9, 56], [x + 12, 44], [x + 10, 30]], 4.5),
      pupil(x, 52, { s: 0.75 }),
      `<rect x="${x - 15}" y="${12}" width="30" height="21" rx="2" fill="${k ? INK : PAPER}" stroke="` +
        `${INK}" stroke-width="1.9"/>`,
      k ? '' : stroke(`M${x - 6} 22 l4 4 l8 -9`, 2.4)
    ].join('')).join(''),
    stroke('M4 78 H116', 1.9)
  ].join('')),
  'w1-check-for-understanding': HEX([
    talk(34, 0, 22, 16, [33, 21], { text: '?' }),
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-3, 30], [-3, 52]], [[18, 8], [36, 4]]] }),
    stroke('M54 30 l4 4 l8 -9', 2.6), qmark(82, 28, 14), stroke('M98 30 l4 4 l8 -9', 2.6),
    pupil(60, 50, { s: 0.62 }), pupil(82, 50, { s: 0.62, ink: true }), pupil(104, 50, { s: 0.62 }),
    desk(48, 116, 70)
  ].join('')),
  'w1-say-it-again-better': HEX([
    pupil(18, 50, { s: 0.75 }), desk(4, 34, 70),
    talk(26, 24, 24, 16, [24, 44]),
    arrowTo([46, 22], [58, 12], [48, 12], { w: 1.9 }),
    `<rect x="60" y="2" width="56" height="38" rx="7" fill="${INK}" stroke="${INK}" stroke-width="1.9"/>` +
      `<path d="M70 39 L68 50 L80 39 Z" fill="${INK}"/>`,
    `<path d="M68 12 H108 M68 21 H108 M68 30 H92" stroke="${PAPER}" stroke-width="2.6" stroke-linecap="round"/>`
  ].join('')),
  'w1-probing-questions': HEX([
    person(18, 88, { s: 0.6, turn: 1, arms: [[[-3, 30], [-3, 52]], [[20, 10], [38, 14]]] }),
    qmark(56, 14, 18), qmark(75, 27, 14), qmark(90, 38, 10),
    pupil(104, 52, { s: 0.68, ink: true }), desk(86, 120, 72)
  ].join('')),
  'w1-process-questions': HEX([
    pupil(18, 50, { s: 0.75 }), desk(4, 34, 70),
    dotted('M28 46 Q34 38 38 34', 1.9),
    ...[[46, false], [76, true], [106, false]].map(([x, k], i) => `<rect x="${x - 9}" y="25" width="18" height="18" rx="4" fill="${k ? INK : PAPER}" stroke="${INK}" stroke-width="1.9"/>` + (i < 2 ? arrowTo([x + 12, 34], [x + 19, 34], null, { w: 1.9 }) : '')).join(''),
    qmark(76, 9, 14)
  ].join('')),
  'w1-whole-class-feedback': HEX([
    person(14, 88, { s: 0.6, turn: 1, arms: [[[-3, 30], [-3, 52]], [[14, -10], [28, -26]]] }),
    `<rect x="32" y="4" width="56" height="34" rx="3" fill="${PAPER}" stroke="${INK}"` +
      ` stroke-width="1.9"/><path d="M32 7 Q32 4 35 4 H85 Q88 4 88 7 V13 H32 Z" fill="${INK}"/>`,
    stroke('M38 21 H66 M38 30 H58', 2.2), stroke('M72 26 l3 3 l7 -8', 2.4),
    pupil(46, 56, { s: 0.6 }), pupil(66, 56, { s: 0.6 }), pupil(86, 56, { s: 0.6 }), pupil(106, 56, { s: 0.6 }),
    desk(34, 118, 72)
  ].join('')),
  'w1-feedback-that-moves-forward': HEX([
    `<rect x="6" y="10" width="32" height="42" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="1.9"/>`, stroke('M12 20 H32 M12 28 H32 M12 36 H24', 2.2), `<circle cx="29" cy="44" r="4.5" fill="${PAPER}" stroke="${INK}" stroke-width="1.9"/>`,
    arrowTo([42, 32], [56, 32], null, { w: 1.9 }),
    stroke('M50 86 H66 V72 H82 V58 H116', 2.4),
    person(98, 58, { s: 0.36, turn: 1, legs: [[-6, -4], [6, 4]], arms: [[[-4, 28], [-6, 50]], [[14, -6], [22, -24]]] }),
    `<path d="M112 8 V30" stroke="${INK}" stroke-width="1.9"/><path d="M112 8 H126 L121 13 L126 18 H112` +
      ` Z" fill="${INK}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
  ].join('')),
  'w1-feedback-as-actions': HEX([
    pupil(18, 54, { s: 0.75 }), desk(4, 34, 74),
    talk(4, 8, 30, 20, [18, 40]),
    arrowTo([40, 30], [54, 30], null, { w: 1.9 }),
    `<rect x="60" y="6" width="54" height="64" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="1.9"/>`,
    `<rect x="66" y="14" width="10" height="10" rx="2" fill="${INK}"/>`, stroke('M82 19 H106', 2.2),
    `<rect x="66" y="33" width="10" height="10" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="1.9"/>`, stroke('M82 38 H106', 2.2),
    `<rect x="66" y="52" width="10" height="10" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="1.9"/>`, stroke('M82 57 H100', 2.2)
  ].join(''))
};
