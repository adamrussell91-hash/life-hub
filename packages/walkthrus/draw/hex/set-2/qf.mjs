// Board hexagon figures, Book 2, Questioning and feedback. 120 × 90, pen 1.9.
import { pen, person, pupil, sitter, talk, think, qmark, disc, blob, f, INK, PAPER, HEX } from '../../people.mjs';
pen(1.9);
const W = 1.9;
const ln = (d, w = W, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const box = (x, y, w, h, fill = PAPER, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`;
const dots = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-dasharray="0.8 4.9"/>`;
const spokes = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => { const a = (i * 2 * Math.PI) / n; return `M${f(cx)} ${f(cy)} L${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`; }).join(' ');
const chevron = (x, y, w, c = INK) => ln(`M${x} ${y} l${f(w * 0.3)} ${f(w * 0.3)} l${f(w * 0.7)} ${f(-w * 0.7)}`, 2.6, c);
const beam = (d) => `<path d="${d}" fill="${PAPER}" fill-opacity="0.5"/>`;
const crossMark = (x, y, r, c = INK, w = 3) => ln(`M${x - r} ${y - r} L${x + r} ${y + r} M${x + r} ${y - r} L${x - r} ${y + r}`, w, c);

export const figures = {
  'w2-no-opt-out': HEX([
    blob('M6 44 L34 20 L62 44 Z'),
    box(16, 8, 36, 44, INK), qmark(34, 24, 22, PAPER),
    blob('M6 44 L34 64 L62 44 V86 H6 Z'),
    ln('M6 86 L28 60 M62 86 L40 60', W),
    person(90, 88, { s: 0.6, turn: -1, arms: [[[-14, 22], [-28, 28]], [[4, 30], [3, 52]]] })
  ].join('')),
  'w2-hands-up-for-asking-or-ideas': HEX([
    dots('M70 18 Q60 8 44 12'), dots('M78 16 Q84 12 88 14'),
    talk(10, 6, 30, 20, [40, 34], { text: '?' }),
    pupil(54, 42, { s: 1.1, arm: 'up' }),
    box(26, 78, 60, 8),
    `<circle cx="100" cy="20" r="11" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    `<path d="M95 30 H105 V37 H95 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    ln('M100 3 V1 M114 8 L116 6 M86 8 L84 6 M117 20 H119', W),
  ].join('')),
  'w2-randomised-questioning': HEX([
    ln('M36 44 L20 84 M36 44 L52 84 M14 84 H58', W * 1.2),
    disc(36, 40, 26), ln(spokes(36, 40, 26, 6), W), disc(36, 40, 5),
    disc(50, 32, 3.4), disc(22, 32, 3.4), disc(36, 56, 3.4),
    person(92, 88, { s: 0.6, turn: -1, arms: [[[-16, 22], [-30, 26]], [[6, 26], [5, 46]]] }),
    talk(58, 0, 24, 17, [84, 22], { ink: true, text: '?' })
  ].join('')),
  'w2-normalise-error-and-uncertainty': HEX([
    person(24, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[16, 22], [-3, -8]]] }),
    think([38, 7], [85, 38], 27, { ink: true }),
    qmark(72, 36, 26, PAPER), crossMark(97, 38, 8, PAPER, 3.4)
  ].join('')),
  'w2-redrafting': HEX([
    person(60, 88, { s: 0.52, arms: [[[-12, 12], [-24, 4]], [[12, 12], [24, 4]]] }),
    box(8, 16, 30, 46), ln('M13 26 q4 -3 8 0 t8 0 M13 35 q4 -3 8 0 t8 0 M13 44 q4 -3 8 0 t8 0 M13 53 q4 -3 8 0', W * 0.8),
    box(82, 16, 30, 46, INK), ln('M88 26 H106 M88 35 H106 M88 44 H106 M88 53 H98', W, PAPER),
    ln('M24 11 Q60 -8 92 8', W), ln('M84 2 L93 8 L84 12', W)
  ].join('')),
  'w2-selective-marking': HEX([
    person(20, 88, { s: 0.6, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 24], [34, 32]]] }),
    box(52, 6, 60, 78), ln('M60 16 H104 M60 25 H104 M60 62 H104 M60 71 H94', W * 0.8),
    box(52, 33, 60, 21, INK, 1), ln('M60 40 H88 M60 47 H82', W, PAPER), ln('M93 44 l3.5 3.5 l7.5 -8', 2.6, PAPER)
  ].join('')),
  'w2-spot-your-mistakes': HEX([
    beam('M12 14 L24 54 H56 L24 12 Z'), beam('M58 12 L32 54 H66 L72 12 Z'),
    blob('M10 3 H26 L25 13 H12 Z'), blob('M56 2 H74 L72 12 H58 Z'),
    sitter(90, 58, { s: 0.7, dir: -1, arms: [[[14, 18], [26, 22]], [[12, 20], [26, 24]]] }),
    ln('M14 54 H72 M20 54 V88 M62 54 V88', W * 1.2),
    `<circle cx="44" cy="40" r="10" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`, crossMark(44, 40, 5, PAPER, 2.8)
  ].join('')),
  'w2-success-criteria': HEX([
    person(16, 88, { s: 0.58, turn: 1, arms: [[[-4, 30], [-3, 52]], [[14, 20], [28, 16]]] }),
    box(36, 12, 54, 72),
    chevron(43, 26, 9), ln('M56 26 H82', W * 0.9),
    chevron(43, 42, 9), ln('M56 42 H82', W * 0.9),
    chevron(43, 58, 9), ln('M56 58 H76', W * 0.9),
    `<path d="M92 28 L86 50 L97 43 L108 50 L102 28 Z" fill="${PAPER}` +
    `" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
    `<circle cx="97" cy="20" r="14" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`, ln('M90 20 l5 5 l9 -10', 2.8, PAPER)
  ].join(''))
};
