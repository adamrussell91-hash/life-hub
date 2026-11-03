// Board hexagon figures, Book 3, Explaining and modelling. 120 × 90, pen 1.9.
import { pen, person, pupil, sitter, bust, talk, think, board, blob, disc, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const ln = (d, w = W, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const solid = (d) => `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`;
const box = (x, y, w, h, fill = PAPER, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const dots = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-dasharray="0.8 4.9"/>`;
const ball = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`;

const RING = 'M60 2 C80 2 96 20 96 44 C96 68 80 86 60 86 C40 86 24 68 24 44 C24 20 40 2 60 2 Z ' +
  'M60 13 C47 13 37 27 37 44 C37 61 47 75 60 75 C73 75 83 61 83 44 C83 27 73 13 60 13 Z';

export const figures = {
  'w3-giving-an-explanation': HEX([
    `<path d="${RING}" fill="${INK}" fill-rule="evenodd"/>`, solid('M76 66 L88 58 L110 82 L96 88 Z'),
    person(56, 74, { s: 0.4, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 14], [28, 2]]] }),
    talk(70, 16, 28, 16, [68, 38])
  ].join('')),
  'w3-examples-and-non-examples': HEX([
    board(14, 2, 92, 36), ln('M60 2 V38', W),
    box(24, 20, 10, 12, INK), box(38, 10, 10, 22, INK),
    blob('M67 32 L72 18 H83 L78 32 Z'), blob('M85 32 L92 12 H100 L94 32 Z'),
    dots('M60 42 V50'),
    pupil(60, 58, { s: 0.68 }), box(26, 74, 68, 10)
  ].join('')),
  'w3-sequences-causes-and-consequences': HEX([
    person(16, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[10, 24], [10, 44]]] }),
    ln('M56 8 H112 M56 8 V78 M112 8 V78', W * 1.2), box(46, 78, 70, 8),
    ln('M68 8 V54 M80 8 V54 M92 8 V54 M104 8 V54 M56 8 L38 44', W * 0.8),
    disc(68, 60, 6), disc(80, 60, 6), disc(92, 60, 6), disc(104, 60, 6), ball(35, 50, 6.5)
  ].join('')),
  'w3-predict-and-verify': HEX([
    sitter(26, 58, { s: 0.68, arms: [[[14, 18], [26, 24]], [[14, 16], [14, -2]]] }),
    think([44, 24], [84, 32], 28, { ink: true }),
    `<circle cx="71" cy="32" r="9.5" fill="${PAPER}"/>`, ln('M71 26 V32 L76 35', 2.2),
    ln('M87 33 l5 5 l10 -12', 3.2, PAPER)
  ].join('')),
  'w3-chunking': HEX([
    sitter(20, 58, { s: 0.68, arms: [[[14, 18], [26, 24]], [[12, 0], [26, -14]]] }),
    box(50, 6, 44, 18, PAPER, 8), ln('M58 15 H86', W),
    box(62, 32, 50, 18, INK, 8), ln('M71 41 H103', W, PAPER),
    box(54, 58, 46, 18, PAPER, 8), ln('M62 67 H92', W)
  ].join('')),
  'w3-advance-organisers': HEX([
    bust(26, 22, { s: 0.92, face: 1 }), bust(94, 22, { s: 0.92, face: -1 }), ln('M6 66 H114', W * 1.2),
    solid('M60 72 Q44 64 26 70 L22 86 Q42 80 60 86 Q78 80 98 86 L94 70 Q76 64 60 72 Z'), ln('M60 72 V86', W, PAPER),
    ln('M60 16 V34 M60 34 L52 46 M60 34 L68 46', W), ball(60, 13, 6), disc(52, 50, 4), disc(68, 50, 4)
  ].join('')),
  'w3-the-creative-writing-process': HEX([
    box(5, 38, 28, 48), box(10, 44, 18, 13), ball(19, 71, 7.5),
    ln('M33 62 C46 80 54 50 80 39', W),
    person(58, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[16, 18], [32, 12]]] }),
    ln('M84 37 L95 30', W * 1.8),
    disc(102, 24, 3), disc(111, 34, 3.5), disc(106, 44, 2.6), disc(96, 14, 2.6), disc(112, 18, 2.2)
  ].join('')),
  'w3-writing-developing-academic-voices': HEX([
    blob('M8 28 Q60 -26 112 28 Q99 21 86 28 Q73 21 60 28 Q47 21 34 28 Q21 21 8 28 Z'),
    ln('M60 28 V74', W * 1.2),
    ln('M60 42 L44 34 M60 42 L76 34 M60 42 L44 54 M60 42 L76 54', W),
    disc(44, 34, 4.5), disc(76, 34, 4.5), disc(44, 54, 4.5), disc(76, 54, 4.5), ball(60, 42, 7),
    pupil(22, 50, { s: 0.8 }), pupil(98, 50, { s: 0.8 }), box(6, 74, 108, 9)
  ].join('')),
  'w3-graphic-organisers-kernel-sentences': HEX([
    person(20, 88, { s: 0.6, turn: 1, arms: [[[8, 22], [18, 42]], [[14, 24], [28, 14]]] }),
    ln('M82 42 L60 16 M82 42 L104 16 M82 42 L82 74', W),
    box(46, 6, 26, 16), box(92, 6, 22, 16), box(68, 70, 30, 16),
    box(62, 30, 40, 24, INK, 4), ln('M69 38 H95 M69 46 H87', W, PAPER)
  ].join('')),
  'w3-modelling-handover-i-do-we-do-you-do': HEX([
    ln('M16 20 L40 84 M24 12 L54 84', W * 0.8), ln('M104 20 L80 84 M96 12 L66 84', W * 0.8), ln('M54 12 L44 84 M66 12 L76 84', W * 0.8),
    blob('M10 12 L22 6 L28 16 L16 22 Z'), blob('M110 12 L98 6 L92 16 L104 22 Z'),
    solid('M52 2 H68 L66 12 H54 Z'),
    `<ellipse cx="60" cy="84" rx="30" ry="3.5" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    person(60, 84, { s: 0.48, arms: [[[-4, 30], [-3, 52]], [[16, 12], [24, -6]]] })
  ].join(''))
};
