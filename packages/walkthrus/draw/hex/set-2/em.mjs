// Board hexagon figures, Book 2, Explaining and modelling. 120 × 90, pen 1.9.
import { pen, person, pupil, sitter, talk, board, sheet, arrowTo, blob, disc, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const ln = (d, w = W, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const solid = (d) => `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`;
const box = (x, y, w, h, fill = PAPER, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const pin = (x, tip, r) => solid(`M${x} ${tip} C${x - r * 0.7} ${tip - r * 1.1} ${x - r} ${tip - r * 1.5} ${x - r} ${tip - r * 2} A${r} ${r` +
    `} 0 1 1 ${x + r} ${tip - r * 2} C${x + r} ${tip - r * 1.5} ${x + r * 0.7} ${tip - r * 1.1} ${x} ${tip} Z`) +
  `<circle cx="${x}" cy="${f(tip - r * 2)}" r="${f(r * 0.38)}" fill="${PAPER}"/>`;
const rays = (cx, cy, r1, r2, n, a1, a2) => Array.from({ length: n }, (_, i) => {
  const a = (a1 + ((a2 - a1) * i) / (n - 1)) * Math.PI / 180;
  return ln(`M${f(cx + r1 * Math.cos(a))} ${f(cy + r1 * Math.sin(a))} L${f(cx + r2 * Math.cos(a))} ${f(cy + r2 * Math.sin(a))}`, 2.6);
}).join('');
const arcs = (cx, cy, rs, a = 0.75) => rs.map((r) => ln(`M${f(cx + r * Math.cos(-a))} ${f(cy + r * Math.sin(-a))} A${r}` +
    ` ${r} 0 0 1 ${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`, 2.4)).join('');
const octagon = (cx, cy, r) => { const k = r * 0.414; return `M${f(cx - k)} ${f(cy - r)} H${f(cx + k)} L${f(cx + r)} ${f(cy - k)} V${f(cy + k)} ` +
    `L${f(cx + k)} ${f(cy + r)} H${f(cx - k)} L${f(cx - r)} ${f(cy + k)} V${f(cy - k)} Z`; };

export const figures = {
  'w2-pre-reading-instructions-for-complex-texts': HEX([
    person(22, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[16, 22], [32, 44]]] }),
    blob('M80 54 Q64 46 46 52 L38 84 Q60 78 80 86 Q98 78 113 84 L108 52 Q94 46 80 54 Z'), ln('M80 54 V86', W * 0.8),
    ln('M50 62 Q62 58 73 63 M48 70 Q60 66 73 71', W * 0.8),
    ln('M87 63 Q97 60 106 62 M87 71 Q97 68 107 70', W * 0.8),
    pin(92, 62, 11)
  ].join('')),
  'w2-whole-class-reading-routines': HEX([
    sheet(84, 18, 28, 62, 0), ln('M90 28 H106 M90 36 H106 M90 44 H100 M90 56 H106 M90 64 H100', W * 0.8),
    person(32, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[18, 30], [38, 36]]] }),
    ln('M66 40 V88', W * 1.6),
    solid(octagon(66, 23, 16)), `<rect x="56" y="20" width="20" height="6" rx="1.5" fill="${PAPER}"/>`,
  ].join('')),
  'w2-developing-reading-fluency': HEX([
    arcs(52, 40, [20, 34, 48, 62], 0.62),
    sitter(22, 58, { s: 0.7, arms: [[[14, 16], [28, 8]], [[12, 18], [28, 10]]] }),
    solid('M42 30 L51 34 L60 30 V46 L51 50 L42 46 Z'), ln('M51 34 V50', 1.4, PAPER)
  ].join('')),
  'w2-summarising-academic-reading': HEX([
    person(16, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 22], [28, 18]]] }),
    sheet(32, 8, 32, 56, 0), ln('M38 18 H58 M38 26 H58 M38 34 H58 M38 42 H58 M38 50 H50', W * 0.8),
    ln('M68 12 L88 26 M68 60 L88 44', W), arrowTo([68, 36], [84, 36], null, { w: W }),
    box(90, 24, 24, 22, INK), ln('M95 31 H109 M95 39 H104', W, PAPER)
  ].join('')),
  'w2-giving-practical-demonstrations': HEX([
    rays(80, 36, 24, 34, 7, -165, -15),
    person(36, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[22, 34], [40, 40]]] }),
    solid('M77 22 H83 V32 L92 46 Q93 49 90 49 H70 Q67 49 68 46 L77 32 Z'), ln('M74 22 H86', W)
  ].join('')),
  'w2-dual-coding-diagrams': HEX([
    board(50, 14, 64, 62),
    ln('M60 26 H102 V60 H85 M77 60 H60 Z', W), ln('M60 26 V60', W),
    ln('M85 52 V68', W * 1.4), ln('M77 55 V65', W * 1.4),
    `<circle cx="81" cy="26" r="8" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    person(18, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 22], [30, 18]]] }),
    talk(29, 0, 18, 12, [26, 16])
  ].join('')),
  'w2-analogies': HEX([
    `<rect x="8" y="30" width="28" height="52" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    `<rect x="8" y="48" width="28" height="34" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    `<ellipse cx="22" cy="30" rx="14" ry="5" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    box(86, 34, 26, 48, PAPER, 3), box(94, 28, 10, 6, PAPER, 1),
    ln('M101 42 L93 58 H101 L95 72', W),
    person(60, 88, { s: 0.54, arms: [[[-12, 22], [-22, 36]], [[12, 22], [22, 36]]] }),
    ln('M22 20 Q60 -16 99 20', W), ln('M16 13 L22 20 L31 16', W), ln('M90 16 L99 20 L105 13', W)
  ].join('')),
  'w2-send-addressing-cognitive-difficulties': HEX([
    person(34, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[22, 28], [40, 26]]] }),
    box(68, 18, 12, 66, INK, 1), ln('M68 29 H80 M68 40 H80 M68 51 H80 M68 62 H80 M68 73 H80', W, PAPER),
    box(88, 58, 10, 28, PAPER, 1), ln('M88 72 H98', W * 0.8),
    box(102, 72, 10, 14, PAPER, 1),
    talk(44, 0, 20, 13, [41, 17])
  ].join('')),
  'w2-compare-contrast-and-categorise': HEX([
    ln('M60 32 L34 22 M60 32 L86 22 M34 22 L14 28 M34 22 L24 8 M34 22 L44 8 M86 22 L106 28 M86 22 L96 8 M86 22 L76 8', W),
    disc(34, 22, 4.5), disc(14, 28, 5), disc(24, 8, 5), disc(44, 8, 5),
    box(82, 18, 8, 8), box(102, 24, 9, 9), box(92, 4, 9, 9), box(72, 4, 9, 9),
    `<circle cx="60" cy="32" r="7" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    `<path d="M60 40 V47" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-dasharray="0.8 4.9"/>`,
    pupil(60, 58, { s: 0.74 }),
    box(30, 78, 60, 8)
  ].join('')),
  'w2-exemplars': HEX([
    person(16, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 20], [28, 28]]] }),
    talk(26, 0, 18, 13, [24, 18]),
    box(82, 6, 30, 64), box(68, 12, 30, 68),
    box(46, 18, 32, 68, INK), ln('M52 30 H72 M52 38 H72 M52 46 H66', W, PAPER), ln('M54 64 l5 5 l10 -11', 2.6, PAPER)
  ].join(''))
};
