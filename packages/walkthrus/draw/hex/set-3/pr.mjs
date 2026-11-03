// Board hexagon figures, Book 3, Practice and retrieval. 120 × 90, pen 1.9.
import { pen, person, sitter, pupil, desk, talk, think, arrowTo, dotted, disc, stroke, blob, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const rr = (x, y, w, h, rx, fill = PAPER) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const ring = (x, y) => [0, 60, 120, 180, 240, 300].map((a) => [x + 13 * Math.cos(a * Math.PI / 180), y + 13 * Math.sin(a * Math.PI / 180)]);
const writing = [[[14, 16], [34, 30]], [[12, 20], [38, 30]]];
const ssddCard = (x, inked, mark) => {
  const c = inked ? PAPER : INK;
  return rr(x, 8, 18, 40, 2, inked ? INK : PAPER) +
    `<path d="M${x + 9} 12 L${x + 15} 23 H${x + 3} Z" fill="${c}"/>` + mark(x + 9, 36, c);
};

export const figures = {
  'w3-ssdd-synoptic-practice-questions': HEX([
    stroke('M38 58 H114 M50 58 V86 M108 58 V86', W * 1.2),
    sitter(22, 58, { s: 0.6, arms: writing }),
    ssddCard(53, false, (x, y, c) => `<circle cx="${x}" cy="${y}" r="5" fill="${c}"/>`),
    ssddCard(74, true, (x, y, c) => `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="${c}"/>`),
    ssddCard(95, false, (x, y, c) => `<path d="M${x} ${y - 6.5} L${x + 6.5} ${y} L${x} ${y + 6.5} L${x - 6.5} ${y} Z" fill="${c}"/>`)
  ].join('')),
  'w3-a-repertoire-of-retrieval-routines': HEX([
    stroke('M44 62 H72 M66 62 V86', W * 1.2),
    sitter(24, 62, { s: 0.58, arms: writing }),
    think([40, 19], [82, 31], 24),
    ...ring(82, 31).map(([x, y]) => stroke(`M82 31 L${x} ${y}`, W)),
    ...ring(82, 31).map(([x, y]) => disc(x, y, 3.2)),
    disc(82, 31, 5.5, INK)
  ].join('')),
  'w3-consolidation': HEX([
    rr(16, 76, 88, 11, 2), rr(25, 64, 70, 12, 2), rr(33, 52, 54, 12, 2), rr(40, 40, 40, 12, 2),
    sitter(50, 40, { s: 0.52, chair: false, arms: [[[14, 16], [30, 12]], [[12, 18], [28, 14]]] }),
    `<g transform="rotate(14 72 24)">${rr(66, 13, 13, 19, 1.5, INK)}</g>`
  ].join('')),
  'w3-accountable-independent-reading-air': HEX([
    dotted('M42 12 L20 82', W), dotted('M78 12 L100 82', W),
    `<path d="M50 3 H70 L78 12 H42 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    stroke('M16 82 H104', W),
    sitter(50, 54, { s: 0.52, arms: [[[12, 16], [30, 12]], [[10, 18], [28, 14]]] }),
    blob('M62 33 L70 37 L78 33 V45 L70 49 L62 45 Z M70 37 V49'),
    talk(90, 16, 22, 15, [88, 36], { text: '?' })
  ].join('')),
  'w3-close-reading': HEX([
    rr(60, 8, 50, 52, 2),
    stroke('M67 18 H103 M67 28 H103 M67 50 H90', 2.2),
    rr(66, 34, 38, 9, 1.5, INK),
    stroke('M38 60 H114 M48 60 V86 M106 60 V86', W * 1.2),
    sitter(22, 60, { s: 0.62, lean: 12, arms: [[[12, 26], [26, 30]], [[22, 12], [42, 8]]] })
  ].join('')),
  'w3-i-say-you-say-my-turn-your-turn': HEX([
    person(26, 88, { s: 0.46, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 8], [28, -2]]] }),
    person(94, 88, { s: 0.46, turn: -1, arms: [[[-14, 8], [-28, -2]], [[4, 30], [3, 52]]] }),
    talk(10, 3, 30, 16, [24, 24], { ink: true }),
    talk(80, 3, 30, 16, [94, 24]),
    arrowTo([44, 9], [75, 9], [60, -1], { w: W }),
    arrowTo([75, 20], [44, 20], [60, 30], { w: W })
  ].join('')),
  'w3-sustained-independent-practice': HEX([
    stroke('M38 60 H112 M48 60 V86 M106 60 V86', W * 1.2),
    sitter(22, 60, { s: 0.6, arms: writing }),
    stroke('M46 56 H68', 2.6),
    stroke('M80 12 H104 M80 60 H104', 3),
    `<path d="M83 13 H101 L95 36 L101 59 H83 L89 36 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`
  ].join('')),
  'w3-teaching-assistants-working-in-tandem': HEX([
    pupil(60, 50, { s: 0.68 }), desk(42, 78, 67),
    person(20, 88, { s: 0.52, turn: 1, arms: [[[-4, 30], [-3, 52]], [[10, 10], [24, 20]]] }),
    person(100, 88, { s: 0.52, turn: -1, arms: [[[-10, 10], [-24, 20]], [[4, 30], [3, 52]]] }),
    arrowTo([45, 19], [75, 19], [60, -3], { w: W }),
    arrowTo([75, 24], [45, 24], [60, 44], { w: W }),
    disc(60, 21.5, 6, INK)
  ].join(''))
};
