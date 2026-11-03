// Board hexagon figures, Book 3, Curriculum planning. 120 × 90, pen 1.9.
import { pen, person, pupil, sitter, desk, talk, dotted, stroke, blob, disc, sheet, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const r = (x, y, w, h, fill = PAPER, rx = 1.5) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ` +
    `rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const paperLine = (d, w = 2.2) => `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${f(w)}" ` +
    'stroke-linecap="round" stroke-linejoin="round"/>';
const filled = (d) => `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`;
const flag = (x, y) => stroke(`M${x} ${y} V${y + 17}`, W) + blob(`M${x} ${y} L${x + 12} ${y + 4.5} L${x} ${y + 9} Z`);
const spines = (y, xs) => xs.map(([x, h]) => r(x, y - h, 7, h, PAPER, 1)).join('');

export const figures = {
  'w3-big-questions': HEX([
    person(50, 88, { s: 0.56, turn: 1, arms: [[[-16, 14], [-24, 28]], [[16, 8], [26, -6]]] }),
    filled('M43 20 Q41 12 50 11 Q59 12 57 20 Q50 15 43 20 Z'),
    filled('M41 15 Q39 3 51 3 Q61 4 60 14 L56 13 Q56 8 50 8 Q45 9 45 14 Z'),
    blob('M16 42 H38 V62 Q38 74 27 79 Q16 74 16 62 Z'),
    stroke('M27 42 V79 M16 57 H38', W * 0.8),
    talk(72, 8, 32, 26, [64, 32], { text: '?' })
  ].join('')),
  'w3-the-museum-curation-analogy': HEX([
    r(18, 52, 36, 36), r(13, 47, 46, 6, PAPER, 1),
    filled('M28 8 H44 L40 15 Q54 26 44 46 H28 Q18 26 32 15 Z'),
    stroke('M31 16 Q17 16 22 30 M41 16 Q55 16 50 30', W),
    sheet(58, 12, 22, 28, 3),
    person(96, 88, { s: 0.62, turn: -1, behind: [0, 1], arms: [[[-6, 26], [4, 42]], [[6, 26], [-4, 42]]] })
  ].join('')),
  'w3-interdisciplinary-units': HEX([
    stroke('M60 16 L88 16 M60 16 L74 42 M88 16 L74 42 M88 16 L104 40 M74 42 L104 40', W),
    disc(60, 16, 12, INK),
    paperLine('M53 13 Q56.5 9.5 60 13 T67 13 M53 20 Q56.5 16.5 60 20 T67 20'),
    disc(88, 15, 11.5),
    blob('M88 8.5 L95 20 H81 Z', INK).replace(/fill="[^"]*"/, 'fill="none"'),
    disc(74, 42, 10.5),
    `<circle cx="74" cy="42" r="2.4" fill="${INK}"/>`,
    `<ellipse cx="74" cy="42" rx="7.5" ry="3.2" fill="none" stroke="${INK}" stroke-width="1.4"/>`,
    disc(104, 40, 10.5),
    stroke('M99 44 V37 M104 44 V33 M109 44 V39', W),
    stroke('M46 60 H114 M54 60 V84 M106 60 V84', W * 1.2),
    sitter(28, 60, { s: 0.54, arms: [[[14, 14], [28, 12]], [[12, 16], [26, 14]]] })
  ].join('')),
  'w3-principles-of-curriculum-implementation': HEX([
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 16], [24, 6]]] }),
    talk(29, 2, 24, 21, [26, 26], { text: '?' }),
    sitter(100, 54, { s: 0.54, dir: -1, arms: [[[14, 14], [26, 12]], [[10, -2], [-2, -22]]] }),
    r(42, 52, 40, 34, PAPER, 1.5),
    stroke('M47 63 l3 3.5 l5.5 -7 M58 63 l3 3.5 l5.5 -7 M69 63 l3 3.5 l5.5 -7 M47 76 H77', W),
    r(59, 4, 8, 30, INK, 4), `<circle cx="63" cy="38" r="8" fill="${INK}"/>`,
    paperLine('M63 13 V36', 1.8)
  ].join('')),
  'w3-types-of-subject-knowledge': HEX([
    stroke('M43 28 Q60 2 77 28 M50 28 Q60 15 70 28 M43 50 Q60 76 77 50 M50 50 Q60 63 70 50', W),
    person(16, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[10, 12], [22, 18]]] }),
    person(104, 88, { s: 0.6, turn: -1, arms: [[[-10, 12], [-22, 18]], [[4, 30], [3, 52]]] }),
    r(36, 28, 18, 22, INK, 2), r(66, 28, 18, 22, PAPER, 2)
  ].join('')),
  'w3-building-a-culture-of-reading': HEX([
    stroke('M12 32 H108 M6 62 H114', W * 1.3),
    spines(32, [[18, 20], [26, 16], [34, 22], [42, 18], [70, 18], [78, 22], [86, 16], [94, 20]]),
    spines(62, [[10, 20], [18, 22], [26, 16], [34, 20], [78, 20], [86, 16], [94, 22], [102, 18]]),
    person(60, 88, { s: 0.62, arms: [[[-14, 22], [6, 24]], [[14, 22], [-6, 24]]] }),
    r(49, 36, 22, 15, INK, 1.5), paperLine('M60 38 V49', 1.6)
  ].join('')),
  'w3-assessment-test-design': HEX([
    disc(60, 45, 33, INK),
    pupil(60, 30, { s: 1 }),
    desk(38, 82, 56),
    disc(12, 21, 6.5), disc(12, 45, 6.5), disc(12, 69, 6.5),
    dotted('M21 21 L30 28 M21 45 H26 M21 69 L30 62', W),
    flag(101, 12), flag(101, 36.5), flag(101, 61),
    dotted('M90 28 L97 21 M94 45 H97 M90 62 L97 69', W)
  ].join('')),
  'w3-assessment-triangulate-the-data': HEX([
    dotted('M36 54 L48 22 M84 54 L72 22', W),
    pupil(60, 44, { s: 1.05 }),
    desk(34, 86, 66),
    r(8, 40, 24, 30), stroke('M13 49 H27 M13 56 H27 M13 63 H22', W),
    r(88, 40, 24, 30), stroke('M94 64 V56 M100 64 V48 M106 64 V52', W),
    r(46, 2, 28, 24, INK, 2),
    ...[50, 57.5, 65].flatMap((x) => [6, 15].map((y) =>
      `<rect x="${x}" y="${y}" width="5" height="6" rx="1" fill="${PAPER}"/>`))
  ].join('')),
  'w3-adaptive-online-assessment-platforms': HEX([
    r(42, 12, 66, 50, INK, 3),
    blob('M42 62 H108 L116 78 H34 Z'),
    stroke('M56 70 H94', W),
    paperLine('M52 44 H64 L78 26 H92 M64 44 L78 52 H92', 2.4),
    `<circle cx="96" cy="26" r="3.6" fill="${PAPER}"/>`,
    person(18, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[10, 2], [22, -10]]] })
  ].join('')),
  'w3-comparative-judgement': HEX([
    `<circle cx="60" cy="42" r="36" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" ` +
      `stroke-dasharray="0.8 5"/>`,
    pupil(60, 30, { s: 0.95 }),
    desk(40, 80, 56),
    r(8, 22, 24, 32), stroke('M13 31 H27 M13 38 H27 M13 45 H22', W),
    r(88, 22, 24, 32, INK, 1.5), paperLine('M94 39 l4 4.5 l9 -11', 2.6)
  ].join(''))
};
