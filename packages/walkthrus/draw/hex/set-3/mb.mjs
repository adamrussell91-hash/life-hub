// Board hexagon figures, Book 3, Mode B teaching. 120 × 90, pen 1.9.
import { pen, person, sitter, pupil, desk, sheet, talk, think, arrowTo, dotted, disc, stroke, blob, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const rr = (x, y, w, h, rx, fill = PAPER) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const solid = (d, fill = INK) => `<path d="${d}" fill="${fill}" stroke="none"/>`;
const circleD = (x, y, r) => `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
const typing = [[[18, 18], [44, 30]], [[14, 20], [40, 30]]];
// A checkerboard in perspective: alternate cells inked.
const TL = [50, 24], TR = [98, 24], BR = [114, 70], BL = [36, 70];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const at = (u, v) => mix(mix(TL, TR, u), mix(BL, BR, u), v);
const cell = (i, j) => {
  const c = [at(i / 4, j / 4), at((i + 1) / 4, j / 4), at((i + 1) / 4, (j + 1) / 4), at(i / 4, (j + 1) / 4)];
  return solid(`M${c.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`);
};
const checks = [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].filter((j) => (i + j) % 2 === 0).map((j) => cell(i, j)));

export const figures = {
  'w3-play-detective': HEX([
    stroke('M44 68 H114 M52 68 V88 M106 68 V88', W * 1.2),
    rr(56, 56, 40, 12, 2),
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 6], [30, 16]]] }),
    solid('M12.6 11 Q13 2.6 20 2.6 Q27 2.6 27.4 9.5 L33.5 11 Q35 13 31 13 L12.6 13 Z'),
    stroke('M48 36 L60 31', 4.4),
    disc(74, 25, 17),
    stroke('M74 15 V27', 4.2),
    `<circle cx="74" cy="34" r="2.6" fill="${INK}"/>`
  ].join('')),
  'w3-ambiguity-and-uncertainty': HEX([
    solid('M20 32 Q20 28 26 28 L52 28 Q59 28 62 32 Q59 36 52 36 L26 36 Q20 36 20 32 Z'),
    solid('M24 29 L19 18 L26 18 L33 29 Z'),
    solid('M38 33 L31 47 L38 47 L49 33 Z'),
    arrowTo([40, 22], [40, 6], null, { w: W }),
    arrowTo([40, 50], [40, 66], null, { w: W }),
    arrowTo([17, 32], [5, 32], null, { w: W }),
    arrowTo([66, 32], [80, 32], null, { w: W }),
    person(100, 88, { s: 0.5, turn: -1, arms: [[[-8, 22], [-24, 26]], [[4, 30], [3, 52]]] }),
    sheet(66, 44, 16, 20, 3),
    talk(84, 3, 24, 14, [98, 20], { text: '?' })
  ].join('')),
  'w3-independent-learning-video-tutorials': HEX([
    stroke('M46 60 H106 M100 60 V86', W * 1.2),
    sitter(26, 60, { s: 0.58, arms: typing }),
    stroke('M54 57 H82 L92 36', 3),
    disc(62, 18, 12, INK),
    solid('M57 12 h3.5 v12 h-3.5 Z M63.5 12 h3.5 v12 h-3.5 Z', PAPER),
    disc(92, 18, 12),
    solid('M91 12 L83 18 L91 24 Z M100 12 L92 18 L100 24 Z')
  ].join('')),
  'w3-activity-rotations': HEX([
    arrowTo([85, 20], [102, 36], [102, 20], { w: W }),
    arrowTo([102, 53], [85, 68], [102, 68], { w: W }),
    arrowTo([70, 68], [54, 53], [54, 68], { w: W }),
    arrowTo([54, 36], [70, 20], [54, 20], { w: W }),
    disc(78, 18, 8, INK), disc(104, 44, 8), disc(78, 70, 8), disc(52, 44, 8),
    person(20, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 8], [24, 32]]] })
  ].join('')),
  'w3-creativity-opportunities-for-choices': HEX([
    dotted('M49 44 L30 30 M60 36 V30 M71 44 L90 30', W),
    disc(18, 20, 12),
    rr(47, 3, 26, 26, 2.5, INK),
    `<path d="M102 6 L116 31 H88 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    pupil(60, 48, { s: 0.8 }),
    desk(36, 84, 66)
  ].join('')),
  'w3-creativity-opportunities-to-experiment': HEX([
    stroke('M46 62 H112 M52 62 V86 M106 62 V86', W * 1.2),
    rr(50, 55, 32, 7, 1.5),
    stroke('M57 55 V62 M63 55 V62 M69 55 V62 M75 55 V62', 1.4),
    sitter(24, 62, { s: 0.58, arms: typing }),
    rr(88, 30, 22, 24, 2, INK), stroke('M99 54 V62', 3),
    think([38, 22], [62, 19], 15),
    stroke('M62 19 C57 12 51 14 51 19 C51 24 57 26 62 19 C67 12 73 14 73 19 C73 24 67 26 62 19', 2.4)
  ].join('')),
  'w3-play-in-practice': HEX([
    stroke('M12 87 H108', W),
    rr(44, 71, 16, 16, 2), rr(60, 71, 16, 16, 2), rr(52, 55, 16, 16, 2),
    disc(60, 47, 7.5, INK),
    person(20, 87, { s: 0.48, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 12], [38, 26]]] }),
    person(100, 87, { s: 0.48, turn: -1, arms: [[[-14, 12], [-38, 26]], [[4, 30], [3, 52]]] }),
    talk(30, 3, 28, 15, [24, 23])
  ].join('')),
  'w3-role-plays-and-simulations': HEX([
    dotted('M42 3 L10 84', W), dotted('M42 3 L58 84', W), dotted('M78 3 L62 84', W), dotted('M78 3 L110 84', W),
    stroke('M12 86 H108', W),
    person(23, 85, { s: 0.46, turn: 1, arms: [[[-10, -4], [-12, -28]], [[8, 18], [12, 38]]] }),
    person(97, 85, { s: 0.46, turn: -1, arms: [[[-8, 18], [-12, 38]], [[10, -4], [12, -28]]] }),
    person(60, 85, { s: 0.46, arms: [[[-8, 22], [-10, 44]], [[8, 22], [10, 44]]] }),
    rr(54, 9, 12, 10, 1, INK),
    stroke('M49 19.5 H71', 3)
  ].join('')),
  'w3-deep-end': HEX([
    stroke('M46 70 V88 M106 70 V88', W * 1.2),
    blob(`M${TL.join(' ')} L${TR.join(' ')} L${BR.join(' ')} L${BL.join(' ')} Z`),
    ...checks,
    blob('M68 38 L72 24 H78 L82 38 Z'), disc(75, 19, 5),
    person(17, 88, { s: 0.52, turn: 1, arms: [[[-4, 30], [-3, 52]], [[10, 12], [24, 22]]] })
  ].join('')),
  'w3-keep-it-real-authentic-products': HEX([
    stroke('M38 60 H114 M48 60 V86 M108 60 V86', W * 1.2),
    sitter(22, 60, { s: 0.6, arms: [[[14, 16], [34, 30]], [[12, 20], [38, 30]]] }),
    stroke('M46 56 H68', 2.6),
    arrowTo([52, 30], [78, 34], [64, 16], { w: W }),
    rr(84, 22, 26, 36, 3, INK),
    `<path d="M90 41 l5 6 l10 -13" fill="none" stroke="${PAPER}" stroke-width="3.2"` +
    ' stroke-linecap="round" stroke-linejoin="round"/>'
  ].join(''))
};
