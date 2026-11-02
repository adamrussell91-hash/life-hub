// Board hexagon figures, Book 2, Mode B teaching. 120 × 90, pen 1.9.
import { pen, person, sitter, table, talk, think, qmark, sheet, dotted, disc, stroke, blob, head, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const rr = (x, y, w, h, rx, fill = PAPER) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const laptop = (x, y, d) => stroke(`M${x} ${y} H${x + d * 15} L${x + d * 21} ${y - 13}`, 2.8);

export const figures = {
  'w2-hands-on': HEX([
    table(30, 90, 48),
    stroke('M50 48 L54 34 H66 L70 48', W),
    `<path d="M60 47 Q54 43 57 38 Q59 40 60 36 Q65 41 62 47 Z" fill=` +
    `"${PAPER}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
    blob('M55 6 H65 V14 L74 30 Q75 34 71 34 H49 Q45 34 46 30 L55 14 Z'),
    `<path d="M51 22 H69 L74 30 Q75 34 71 34 H49 Q45 34 46 30 Z" fill="${INK}"/>`,
    person(16, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[12, 8], [28, 10]]] }),
    person(104, 88, { s: 0.58, turn: -1, arms: [[[-12, 8], [-28, 10]], [[4, 30], [3, 52]]] })
  ].join('')),
  'w2-oracy-public-speaking': HEX([
    `<path d="M52 6 H68 L100 76 Q60 90 20 76 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    rr(50, 1, 20, 7, 2),
    person(60, 80, { s: 0.46, arms: [[[-14, 4], [-30, -8]], [[14, 4], [30, -8]]] }),
    talk(5, 20, 25, 16, [33, 38]),
    talk(90, 20, 25, 16, [87, 38], { ink: true })
  ].join('')),
  'w2-oracy-presentations': HEX([
    stroke('M78 58 L64 86 M78 58 L92 86 M78 58 V84', W * 1.1),
    rr(40, 8, 74, 50, 3), stroke('M37 8 H117', 3),
    disc(59, 33, 13), `<path d="M59 33 V20 A13 13 0 0 1 72 33 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    stroke('M80 24 H106 M80 34 H106 M80 44 H96', 2.4),
    person(18, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[10, -2], [26, -8]]] })
  ].join('')),
  'w2-oracy-recitation-and-performance': HEX([
    `<path d="M104 8 L110 4 V82 L104 86 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    `<path d="M56 4 L104 8 V86 L56 80 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    stroke('M64 16 L97 19 M64 26 L97 29 M64 36 L97 39 M64 46 L97 49 M64 56 L97 59 M64 66 L86 68', 2.2),
    person(38, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 2], [30, -12]]] }),
    talk(7, 3, 23, 14, [31, 22], { ink: true })
  ].join('')),
  'w2-off-piste': HEX([
    stroke('M6 42 L114 62', 2.6),
    dotted('M56 54 Q50 66 42 74', W), dotted('M56 54 Q70 58 78 74', W),
    disc(36, 78, 5),
    disc(84, 76, 9, INK), `<path d="M81 77 l3 -5 l3 5" fill="none" stroke="${PAPER}" stro` +
    `ke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    rr(80, 85, 8, 4, 1),
    stroke('M50 19 L60 50', 1.9),
    person(36, 45, { s: 0.33, turn: 1, behind: [0], legs: [[-6, 2], [6, 2]], arms: [[[10, 20], [26, 24]], [[10, 22], [26, 24]]] }),
    stroke('M20 42 L54 48 Q60 49 62 45', 2.8),
    `<path d="M96 14 L108 46 H84 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`, stroke('M96 46 V58', 2.8)
  ].join('')),
  'w2-self-directed-learning': HEX([
    stroke('M72 50 L64 86 M98 50 L106 86 M85 6 V70', W * 1.1),
    rr(60, 10, 50, 40, 2),
    `<path d="M66 44 L80 24 L90 36 L96 28 L104 44 Z" fill="${INK}"` +
    ` stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    person(22, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[12, 8], [26, 2]]] }),
    stroke('M46 30 L60 24', 2.6),
    think([34, 12], [46, 10], 8.5), qmark(46, 9, 11)
  ].join('')),
  'w2-museum-gallery-visits': HEX([
    rr(46, 52, 28, 32, 2), stroke('M40 52 H80 M40 86 H80', 3.4),
    `<path d="M54 6 H66 L63 13 Q79 20 73 34 Q69 44 64 49 H56 Q51 44 47 34 Q41 20 57 1` +
    `3 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    stroke('M47 22 Q37 18 44 9 M73 22 Q83 18 76 9', W),
    person(14, 88, { s: 0.56, turn: 1, arms: [[[6, 26], [16, 28]], [[8, 24], [20, 24]]] }),
    sheet(18, 36, 16, 20, 2),
    person(106, 88, { s: 0.56, turn: -1, arms: [[[-8, 12], [-18, 4]], [[4, 30], [3, 52]]] })
  ].join('')),
  'w2-online-class-forums': HEX([
    talk(42, 2, 36, 22, [60, 34], { ink: true }),
    dotted('M42 18 Q34 22 36 38', W), dotted('M78 18 Q86 22 84 38', W),
    sitter(18, 58, { s: 0.52, arms: [[[10, 18], [24, 16]], [[10, 20], [24, 18]]] }),
    laptop(26, 50, 1),
    sitter(102, 58, { s: 0.52, dir: -1, arms: [[[10, 18], [24, 16]], [[10, 20], [24, 18]]] }),
    laptop(94, 50, -1)
  ].join(''))
};
