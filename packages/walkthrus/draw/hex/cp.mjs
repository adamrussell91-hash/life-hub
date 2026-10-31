// Board hexagon figures, Curriculum planning. 120 × 90, pen 1.9.
import { pen, person, pupil, desk, talk, qmark, dotted, disc, stroke, blob, bust, arrowTo, INK, PAPER, HEX } from '../people.mjs';
pen(1.9);
const r1 = (n) => Math.round(n * 10) / 10;
const node = (cx, cy, r, { ink: k = false, n = 6, a0 = -90 } = {}) => {
  let s = '';
  for (let i = 0; i < n; i++) { const a = (a0 + (360 / n) * i) * Math.PI / 180, x = cx + 2.1 * r * Math.cos(a), y = cy + 2.1 * r * Math.sin(a); s += stroke(`M${r1(cx)} ${r1(cy)} L${r1(x)} ${r1(y)}`, 1.9) + disc(x, y, r * 0.5); }
  return s + disc(cx, cy, r, k ? INK : PAPER);
};
const pointUpR = [[[-4, 30], [-3, 52]], [[16, 10], [30, -8]]];
const pointR = [[[-4, 30], [-3, 52]], [[24, 2], [48, -4]]];

export const figures = {
  'w1-sequence-concepts-in-small-steps': HEX([
    blob('M36 86 V76 H50 V66 H64 V56 H78 V46 H92 V36 H106 V26 H118 V86 Z'),
    `<rect x="104" y="12" width="12" height="12" rx="2" fill="${INK}"/>`,
    person(18, 88, { s: 0.62, arms: pointUpR, turn: 1 })
  ].join('')),
  'w1-designing-a-knowledge-rich-curriculum': HEX([
    [[44, 72, 66], [50, 58, 58], [46, 44, 62]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="13" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="1.9"/>`).join(''),
    stroke('M60 72v13 M94 72v13 M64 58v13 M90 44v13', 1.9),
    `<rect x="56" y="30" width="44" height="13" rx="2" fill="${INK}" stroke="${INK}" stroke-width="1.9"/>`,
    person(18, 88, { s: 0.62, arms: pointUpR, turn: 1 })
  ].join('')),
  'w1-coherent-mapping': HEX([
    stroke('M76 44L52 20M76 44L86 12M76 44L108 32M76 44L54 70M76 44L100 72M52 20L86 12M108 32L100 72', 1.9),
    [[52, 20], [86, 12], [108, 32], [54, 70], [100, 72]].map(([x, y]) => disc(x, y, 6)).join(''), disc(76, 44, 9, INK),
    person(18, 88, { s: 0.62, arms: pointR, turn: 1 })
  ].join('')),
  'w1-blend-knowledge-and-experience': HEX([
    `<circle cx="42" cy="45" r="32" fill="${PAPER}" stroke="${INK}" stroke-width="1.9"/><circle cx="78"` +
      ` cy="45" r="32" fill="none" stroke="${INK}" stroke-width="1.9"/>`,
    blob('M30 36 Q24 32 16 36 V56 Q24 52 30 56 Z'), blob('M30 36 Q36 32 44 36 V56 Q36 52 30 56 Z'),
    person(90, 70, { s: 0.3, arms: [[[-10, -20], [-16, -40]], [[10, -20], [16, -40]]] }),
    disc(60, 45, 6, INK)
  ].join('')),
  'w1-pitch-it-up': HEX([
    stroke('M54 86 V8 M112 86 V8', 1.9), dotted('M54 62 H112', 1.9),
    `<rect x="54" y="16" width="58" height="7" rx="2" fill="${INK}"/>`, arrowTo([83, 54], [83, 32]),
    person(22, 88, { s: 0.62, turn: 1, arms: [[[-4, 30], [-3, 52]], [[12, -20], [30, -52]]] })
  ].join('')),
  'w1-plan-for-reading': HEX([
    blob('M72 16 Q56 10 38 16 V48 Q56 42 72 48 Z'), blob('M72 16 Q88 10 106 16 V48 Q88 42 72 48 Z'),
    stroke('M46 26 H64 M46 34 H64 M80 26 H98 M80 34 H94', 1.6),
    `<path d="M90 12 V30 L94 26 L98 30 V12 Z" fill="${INK}"/>`,
    pupil(52, 62, { s: 0.6 }), pupil(74, 62, { s: 0.6 }), pupil(96, 62, { s: 0.6 }),
    person(16, 88, { s: 0.62, turn: 1, arms: pointUpR })
  ].join('')),
  'w1-tiered-questions-and-problems': HEX([
    `<rect x="40" y="64" width="22" height="22" rx="2" fill="${PAPER}" stroke="${INK}"` +
      ` stroke-width="1.9"/><rect x="66" y="48" width="22" height="38" rx="2" fill="${PAPER}" stroke="` +
      `${INK}" stroke-width="1.9"/><rect x="92" y="30" width="22" height="56" rx="2" fill="${INK}"/>`,
    qmark(51, 52, 14), qmark(77, 36, 14), qmark(103, 18, 14),
    person(18, 88, { s: 0.62, turn: 1, arms: pointUpR })
  ].join('')),
  'w1-deliver-core-signpost-hinterland': HEX([
    `<circle cx="80" cy="46" r="32" fill="none" stroke="${INK}" stroke-width="1.9" stroke-dasharray="2 5"/>`, disc(80, 46, 13, INK),
    arrowTo([94, 32], [112, 12]), arrowTo([64, 60], [50, 76]), arrowTo([96, 60], [112, 78]),
    person(18, 88, { s: 0.62, turn: 1, arms: pointR })
  ].join(''))
};
