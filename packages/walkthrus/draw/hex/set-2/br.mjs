// Board hexagon figures, Book 2, Behaviour and relationships. 120 × 90, pen 1.9.
import { pen, limb, person, pupil, desk, talk, arrowTo, dotted, stroke, blob, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const ring = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${INK}" stroke-width="${W}"/>`;
const paperLine = (d, w = 2.2) => `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const pin = (x, tip, r, fill = PAPER) => {
  const cy = tip - r * 2.3;
  return `<path d="M${f(x)} ${f(tip)} C${f(x - r * 0.5)} ${f(tip - r)} ${f(x - r)} ${f(cy + r * 0.7)} ${f(x - r)} ${f(cy)} ` +
    `A${f(r)} ${f(r)} 0 1 1 ${f(x + r)} ${f(cy)} C${f(x + r)} ${f(cy + r * 0.7)} ` +
    `${f(x + r * 0.5)} ${f(tip - r)} ${f(x)} ${f(tip)} Z" ` +
    `fill="${fill}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>` +
    `<circle cx="${f(x)}" cy="${f(cy)}" r="${f(r * 0.42)}" fill="${fill === INK ? PAPER : 'none'}" ` +
    `stroke="${fill === INK ? 'none' : INK}" stroke-width="${W}"/>`;
};

export const figures = {
  'w2-assertiveness': HEX([
    ring(44, 83, 36, 5.5), ring(44, 83, 21, 3),
    person(44, 84, { s: 0.57, arms: [[[-17, 20], [-3, 42]], [[20, 8], [46, 10]]] }),
    talk(66, 2, 38, 19, [60, 26], { ink: true })
  ].join('')),
  'w2-getting-lessons-started': HEX([
    stroke('M4 88 H116', W),
    `<rect x="48" y="20" width="24" height="68" rx="2" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    `<circle cx="53.5" cy="56" r="1.9" fill="${PAPER}"/>`,
    person(12, 88, { s: 0.27, turn: 1 }), person(25, 88, { s: 0.27, turn: 1 }), person(38, 88, { s: 0.27, turn: 1 }),
    person(100, 88, { s: 0.58, turn: -1, arms: [[[-10, 22], [-20, 8]], [[4, 30], [3, 52]]] }),
    `<rect x="76" y="18" width="13" height="18" rx="1.5" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    stroke('M79 27 l2.5 3 l4.5 -6', 1.9)
  ].join('')),
  'w2-gather-around-demonstrations-and-stories': HEX([
    person(12, 88, { s: 0.27, turn: 1 }), person(26, 88, { s: 0.27, turn: 1 }),
    person(94, 88, { s: 0.27, turn: -1 }), person(108, 88, { s: 0.27, turn: -1 }),
    person(60, 88, { s: 0.42, arms: [[[-20, 4], [-44, -2]], [[20, 4], [44, -2]]] }),
    talk(34, 2, 52, 17, [56, 25], { ink: true, text: '' }).replace(/<text[^>]*><\/text>/, ''),
    paperLine('M41 10.5 H52 M48 6.5 L52 10.5 L48 14.5 M79 10.5 H68 M72 6.5 L68 10.5 L72 14.5'),
    `<circle cx="60" cy="10.5" r="2.3" fill="${PAPER}"/>`
  ].join('')),
  'w2-keeping-on-task': HEX([
    pupil(18, 34, { s: 0.68 }), pupil(46, 34, { s: 0.68 }),
    desk(4, 62, 57),
    `<circle cx="68" cy="16" r="11" fill="${INK}"/>`, paperLine('M68 9 V16 L73 19'),
    dotted('M8 87 Q40 92 72 85', W),
    person(92, 88, { s: 0.6, turn: -1, arms: [[[-12, 20], [-34, 26]], [[4, 30], [3, 52]]] })
  ].join('')),
  'w2-silence-is-golden': HEX([
    limb([[36, 66], [36, 34]], 9, INK),
    blob('M29 64 Q29 57 36 57 H52 Q60 57 60 65 V78 Q60 88 50 88 H39 Q29 88 29 78 Z', INK),
    paperLine('M42 63 H54 M42 71 H54 M42 79 H54', 2),
    ...[[180], [225], [270], [315], [0]].map(([a]) => {
      const r = (a * Math.PI) / 180, c = [36, 30];
      return arrowTo([c[0] + 13 * Math.cos(r), c[1] + 13 * Math.sin(r)], [c[0] + 25 * Math.cos(r), c[1] + 25 * Math.sin(r)], null, { w: W });
    }).join(''),
    person(94, 88, { s: 0.58, turn: -1, arms: [[[-14, 8], [-32, -4]], [[4, 30], [3, 52]]] })
  ].join('')),
  'w2-transitions-between-activities': HEX([
    stroke('M4 74 H76', W),
    pin(14, 74, 8),
    dotted('M18 36 Q28 14 36 22', W),
    pin(50, 74, 20, INK),
    person(92, 88, { s: 0.58, turn: -1, arms: [[[-12, 18], [-30, 10]], [[4, 30], [3, 52]]] })
  ].join('')),
  'w2-lesson-disruption': HEX([
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-16, 20], [-3, 42]], [[18, 4], [26, -22]]] }),
    pupil(62, 46, { s: 0.66 }), pupil(84, 46, { s: 0.66 }), pupil(106, 46, { s: 0.66 }),
    desk(50, 118, 66),
    talk(72, 4, 24, 22, [84, 34], { ink: true, text: '!' })
  ].join('')),
  'w2-perspective-the-dot-in-the-empty-square': HEX([
    `<rect x="44" y="4" width="70" height="70" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    `<circle cx="98" cy="19" r="5.5" fill="${INK}"/>`,
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[20, 4], [44, 6]]] })
  ].join(''))
};
