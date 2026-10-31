// Board hexagon figures, series mb. 120 × 90, pen 1.9.
import { pen, person, pupil, desk, talk, sheet, arrowTo, disc, stroke, blob, INK, PAPER, HEX, f } from '../people.mjs';
pen(1.9);
const W = 1.9;
const ln = (d, w = W, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const T = (x, y, size, s, c = INK) => `<text x="${f(x)}" y="${f(y)}" font-family="Arial Rounded MT Bold, Arial, sans-serif"` +
  ` font-weight="700" font-size="${f(size)}" text-anchor="middle" fill="${c}" stroke="none">${s}</text>`;
const openBook = (x, y, w) => blob(`M${f(x)} ${f(y)} Q${f(x - w * 0.25)} ${f(y - w * 0.18)} ${f(x - w / 2)} ${f(y - w * 0.06)} L` +
  `${f(x - w / 2)} ${f(y + w * 0.3)} Q${f(x - w * 0.25)} ${f(y + w * 0.2)} ${f(x)} ${f(y + w * 0.36)} Q` +
  `${f(x + w * 0.25)} ${f(y + w * 0.2)} ${f(x + w / 2)} ${f(y + w * 0.3)} L${f(x + w / 2)} ` +
  `${f(y - w * 0.06)} Q${f(x + w * 0.25)} ${f(y - w * 0.18)} ${f(x)} ${f(y)} Z`) + ln(`M${f(x)} ${f(y)} V${f(y + w * 0.36)}`, W * 0.7);
const arcs = (cx, cy, rs) => rs.map((r) => ln(`M${f(cx + r * Math.cos(-0.6))} ${f(cy + r * Math.sin(-0.6))} A${r} ${r} 0 0 1 ` +
  `${f(cx + r * Math.cos(0.6))} ${f(cy + r * Math.sin(0.6))}`, 2.4)).join('');

export const figures = {
  'w1-collaborative-learning': HEX([
    pupil(28, 30, { s: 0.74 }), pupil(60, 22, { s: 0.74 }), pupil(92, 30, { s: 0.74 }),
    ln('M24 74 V88 M96 74 V88', W * 1.2),
    `<ellipse cx="60" cy="64" rx="52" ry="14" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    `<rect x="47" y="57" width="26" height="13" rx="2" fill="${INK}"/>`
  ].join('')),
  'w1-oracy-debating': HEX([
    person(16, 88, { s: 0.58, arms: [[[-4, 30], [-3, 52]], [[16, 4], [30, -6]]] }),
    person(104, 88, { s: 0.58, turn: -1, arms: [[[-16, 4], [-30, -6]], [[4, 30], [3, 52]]] }),
    talk(30, 26, 28, 18, [26, 22]),
    talk(62, 4, 28, 18, [94, 16], { ink: true })
  ].join('')),
  'w1-homework-as-guided-study': HEX([
    person(14, 88, { s: 0.56, arms: [[[-4, 30], [-3, 52]], [[16, 4], [24, -6]]] }),
    `<rect x="26" y="22" width="14" height="18" rx="1.5" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`, ln('M29 28 h8 M29 33 h5', 1.4, PAPER),
    arrowTo([44, 44], [56, 52], null, { w: W }),
    blob('M62 42 L89 16 L116 42 V88 H62 Z'),
    pupil(89, 48, { s: 0.6 }), desk(72, 106, 68)
  ].join('')),
  'w1-enquiry-projects': HEX([
    person(20, 88, { s: 0.58, arms: [[[-4, 30], [-3, 52]], [[16, 0], [28, -14]]] }),
    ln('M37 38 L46 30', 4.5),
    disc(56, 22, 12), T(56, 28, 15, '?'),
    `<rect x="80" y="40" width="32" height="46" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    ln('M86 54H106M86 64H106M86 74H98', W * 0.8),
    ln('M96 40V14', W), `<path d="M96 14L111 19.5L96 25Z" fill="${INK}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`
  ].join('')),
  'w1-open-response-tasks': HEX([
    `<rect x="38" y="6" width="78" height="78" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    disc(51, 24, 9, INK), T(51, 30, 16, '?', PAPER),
    arrowTo([62, 24], [102, 12], null, { w: W }), arrowTo([62, 28], [104, 30], null, { w: W }), arrowTo([62, 32], [100, 48], null, { w: W }),
    ln('M46 62H106M46 72H90', W * 0.9),
    pupil(18, 50, { s: 0.6 }), desk(2, 34, 68)
  ].join('')),
  'w1-oracy-talk-for-writing': HEX([
    person(16, 88, { s: 0.56, arms: [[[-4, 30], [-3, 52]], [[16, 6], [28, 0]]] }),
    talk(28, 2, 30, 18, [26, 22]),
    arrowTo([62, 16], [76, 28], null, { w: W }),
    sheet(78, 28, 34, 48, 3),
    `<path d="M96 76L108.6 63.4L112.8 67.6L100.2 80.2Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"` +
      ` stroke-linejoin="round"/>`, ln('M96 76 L93.9 82.3 L100.2 80.2', W)
  ].join('')),
  'w1-oracy-instructional-inputs': HEX([
    person(18, 88, { s: 0.58, arms: [[[-4, 30], [-3, 52]], [[16, 2], [28, -6]]] }),
    talk(30, 2, 30, 18, [26, 22], { ink: true }),
    arcs(48, 40, [12, 19]),
    pupil(78, 52, { s: 0.56 }), pupil(96, 52, { s: 0.56 }), pupil(114, 52, { s: 0.56 }),
    desk(66, 122, 70)
  ].join('')),
  'w1-independent-learning-pre-reading': HEX([
    pupil(27, 30, { s: 0.72 }), desk(4, 50, 54), openBook(27, 46, 26),
    arrowTo([56, 48], [70, 48], null, { w: W }),
    `<rect x="74" y="28" width="42" height="38" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
    `<path d="M74 37 V31 a3 3 0 0 1 3 -3 H113 a3 3 0 0 1 3 3 V37 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"/>`,
    ln('M80 48H108M80 57H100', W * 0.9)
  ].join(''))
};
