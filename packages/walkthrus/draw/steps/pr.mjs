// Lesson step pictures, Practice and retrieval (pr). 240 × 180 each, pen 2.6.
// Each follows the book's picture for that step: same scene, same people, same props.
import { pen, person, pupil, desk, sitter, table, board, sheet, talk, think, qmark, arrowTo, dotted, disc, stroke, bust, f, INK, PAPER, STEP } from '../people.mjs';
pen(2.6);

// ---- series helpers (exported so hex/pr.mjs can reuse them; they read the pen width W) ----
let W = 2.6;
export const setW = (w) => { W = w; };
export const T = (x, y, size, txt, c = INK) => `<text x="${f(x)}" y="${f(y)}" font-family="Arial Rounded MT Bold, Arial, sans-serif"` +
  ` font-weight="700" font-size="${f(size)}" text-anchor="middle" fill="${c}" stroke="none">${txt}` +
  `</text>`;
export const box = (x, y, w, h, { rx = 3, fill = PAPER, sw = W } = {}) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}" stroke="` +
  `${INK}" stroke-width="${f(sw)}"/>`;
const ln = (d, w = W, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
export const ell = (cx, cy, rx, ry, fill = PAPER) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" stroke="${INK}" stroke-width="${f(W)}"/>`;
export const clock = (x, y, r, { ink = false } = {}) => disc(x, y, r, ink ? INK : PAPER) + ln(`M${f(x)} ${f(y)} V${f(y - r * 0.62)} M${f(x)} ${f(y)} L${f(x + r * 0.45)} ${f(y + r * 0.25)}`, W, ink ? PAPER : INK);
const tickPath = (x, y, r) => `M${f(x - r * 0.45)} ${f(y + r * 0.02)} L${f(x - r * 0.12)} ${f(y + r * 0.35)} L${f(x + r * 0.48)} ${f(y - r * 0.32)}`;
export const tickDisc = (x, y, r, { ink = false } = {}) => disc(x, y, r, ink ? INK : PAPER) + ln(tickPath(x, y, r), W * 1.1, ink ? PAPER : INK);
export const crossDisc = (x, y, r, { ink = false } = {}) => disc(x, y, r, ink ? INK : PAPER) + ln(`M${f(x - r * 0.38)} ${f(y - r * 0.38)} L${f(x + r * 0.38)} ${f(y + r * 0.38)} M${f(x + r * 0.38)} ` +
  `${f(y - r * 0.38)} L${f(x - r * 0.38)} ${f(y + r * 0.38)}`, W * 1.1, ink ? PAPER : INK);
export const qDisc = (x, y, r, { ink = false } = {}) => disc(x, y, r, ink ? INK : PAPER) + qmark(x, y - r * 0.08, r * 1.15, ink ? PAPER : INK);
/** A criteria list: n rows of a bar with a knob on it (slider look). */
export const bars = (x, y, n, { w = 40, gap = 13, knob = 0.6 } = {}) => Array.from({ length: n }, (_, i) => box(x, y + i * gap, w, 5, { rx: 2.5 }) + disc(x + w * knob, y + i * gap + 2.5, 4.2)).join('');
/** A knowledge node: a centre disc with spokes to small discs. */
export const hub = (x, y, r, { ink = false, n = 6, len = 2.3 } = {}) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; const ex = x + Math.cos(a) * r * len, ey = y + Math.sin(a) * r * len; return ln(`M${f(x)} ${f(y)} L${f(ex)} ${f(ey)}`, W * 0.8) + disc(ex, ey, r * 0.5); }).join('') + disc(x, y, r, ink ? INK : PAPER);
/** A light bulb, base down, centred on (x, y). */
export const bulb = (x, y, s = 1, { ink = false } = {}) => { const c = ink ? PAPER : INK; return (`<path d="M${f(x - 5 * s)} ${f(y + 8 * s)} C${f(x - 5 * s)} ${f(y + 3 * s)} ${f(x - 11 * s)} ${f(y)} ` +
  `${f(x - 11 * s)} ${f(y - 6 * s)} A${f(11 * s)} ${f(11 * s)} 0 1 1 ${f(x + 11 * s)} ${f(y - 6 * s)} C` +
  `${f(x + 11 * s)} ${f(y)} ${f(x + 5 * s)} ${f(y + 3 * s)} ${f(x + 5 * s)} ${f(y + 8 * s)} Z" fill="` +
  `${ink ? INK : PAPER}" stroke="${INK}" stroke-width="${f(W)}" stroke-linejoin="round"/>`) + box(x - 5 * s, y + 8 * s, 10 * s, 6 * s, { rx: 1.5 }) + ln(`M${f(x - 3 * s)} ${f(y + 6 * s)} V${f(y - 2 * s)} M${f(x + 3 * s)} ${f(y + 6 * s)} V${f(y - 2 * s)}`, W * 0.7, c); };
/** A cube in simple oblique view, front face at (x, y), size s. */
export const cube = (x, y, s, { ink = false } = {}) => { const d = s * 0.35, fl = ink ? INK : PAPER; return (`<path d="M${f(x)} ${f(y)} l${f(d)} ${f(-d)} h${f(s)} v${f(s)} l${f(-d)} ${f(d)} Z" fill="${fl}"` +
  ` stroke="${INK}" stroke-width="${f(W)}" stroke-linejoin="round"/>`) + box(x, y, s, s, { rx: 1, fill: fl }) + ln(`M${f(x + s)} ${f(y)} l${f(d)} ${f(-d)}`, W, ink ? PAPER : INK); };
/** A gauge: disc, scale arc and needle. */
export const gauge = (x, y, r, { ink = false } = {}) => { const c = ink ? PAPER : INK; return disc(x, y, r, ink ? INK : PAPER) + ln(`M${f(x - r * 0.62)} ${f(y + r * 0.2)} A${f(r * 0.65)} ${f(r * 0.65)} 0 1 1 ${f(x + r * 0.62)} ${f(y + r * 0.2)}`, W, c) + ln(`M${f(x)} ${f(y + r * 0.1)} L${f(x + r * 0.35)} ${f(y - r * 0.38)}`, W * 1.2, c) + `<circle cx="${f(x)}" cy="${f(y + r * 0.1)}" r="${f(r * 0.12)}" fill="${c}"/>`; };
/** Speaker with k sound waves. */
export const speaker = (x, y, k, { ink = false } = {}) => (`<path d="M${f(x)} ${f(y - 5)} h7 l9 -8 v26 l-9 -8 h-7 Z" fill="${ink ? INK : PAPER}" stroke="${INK}"` +
  ` stroke-width="${f(W)}" stroke-linejoin="round"/>`) + Array.from({ length: k }, (_, i) => ln(`M${f(x + 21 + i * 6)} ${f(y - 7 - i * 3)} Q${f(x + 26 + i * 7)} ${f(y)} ${f(x + 21 + i * 6)} ${f(y + 7 + i * 3)}`)).join('');
/** A square maze, simple or complex. */
export const maze = (x, y, s, { complex = false, ink = false } = {}) => { const c = ink ? PAPER : INK, u = s / 6; const walls = complex
  ? `M${x + u} ${y + u}h${4 * u}M${x + u} ${y + u}v${2 * u}h${2 * u}M${x + 4 * u} ${y + 2 * u}v${2 * u}h` +
    `${-2 * u}v${u}M${x + u} ${y + 4 * u}v${u}h${4 * u}M${x + 5 * u} ${y + 3 * u}v${u}`
  : `M${x + u} ${y + 2 * u}h${3 * u}M${x + 2 * u} ${y + 4 * u}h${3 * u}M${x + u} ${y + 2 * u}v${2 * u}`;
  return box(x, y, s, s, { rx: 2, fill: ink ? INK : PAPER }) + ln(walls, W * 0.9, c); };
/** A map pin. */
export const pin = (x, y, r = 9) => (`<path d="M${f(x)} ${f(y + r * 1.7)} L${f(x - r * 0.8)} ${f(y + r * 0.55)} A${f(r)} ${f(r)} 0 1 1 ` +
  `${f(x + r * 0.8)} ${f(y + r * 0.55)} Z" fill="${PAPER}" stroke="${INK}" stroke-width="${f(W)}"` +
  ` stroke-linejoin="round"/>`) + disc(x, y, r * 0.35);
/** A tag label: rounded box with one line of "text". */
const tag = (x, y, w = 34, h = 15, ink = false) => box(x, y, w, h, { rx: 4, fill: ink ? INK : PAPER }) + ln(`M${f(x + 7)} ${f(y + h / 2)} h${f(w - 14)}`, W * 0.8, ink ? PAPER : INK);
/** An inked sheet with paper lines. */
const inkSheet = (x, y, w, h, n = 4) => box(x, y, w, h, { rx: 2, fill: INK }) + Array.from({ length: n }, (_, i) => ln(`M${f(x + w * 0.2)} ${f(y + (h / (n + 1)) * (i + 1))} h${f(w * (i === n - 1 ? 0.35 : 0.6))}`, W * 0.7, PAPER)).join('');
/** A grid sheet (table). */
const gridSheet = (x, y, w, h, cols = 3, rows = 5) => box(x, y, w, h, { rx: 2 }) + ln(Array.from({ length: cols - 1 }, (_, i) => `M${f(x + (w / cols) * (i + 1))} ${f(y)}v${f(h)}`).join('') + Array.from({ length: rows - 1 }, (_, i) => `M${f(x)} ${f(y + (h / rows) * (i + 1))}h${f(w)}`).join(''), W * 0.7);
/** A small open laptop seen side-on, hinge at (x, y), screen towards dir. */
const laptop = (x, y, dir = 1, s = 1) => ln(`M${f(x)} ${f(y)} h${f(-dir * 22 * s)}`, W * 1.3) + ln(`M${f(x)} ${f(y)} l${f(dir * 5 * s)} ${f(-17 * s)}`, W * 1.3);
/** Disc with an italic i (information). */
const iDisc = (x, y, r) => disc(x, y, r) + (`<text x="${f(x)}" y="${f(y + r * 0.42)}" font-family="Georgia, serif" font-style="italic"` +
  ` font-weight="700" font-size="${f(r * 1.3)}" text-anchor="middle" fill="${INK}">i</text>`);
/** A portrait in a circle (clipped bust). */
let clipN = 0;
const portrait = (x, y, r, { bg = false, s = 1 } = {}) => { const id = `prc${clipN++}`; return `<clipPath id="${id}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/></clipPath>` + disc(x, y, r, bg ? INK : PAPER) + `<g clip-path="url(#${id})">${bust(x, y - r * 0.1, { s })}</g>` + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${INK}" stroke-width="${f(W)}"/>`; };
/** A person sitting on a block (no chair). */
const onBlock = (x, seat, o = {}) => { const s = o.s ?? 1, d = o.dir ?? 1; const bx = d === 1 ? x - 22 * s : x - 18 * s; return box(bx, seat + 1, 40 * s, 32 * s, { rx: 2 }) + sitter(x, seat, { ...o, chair: false }); };
/** A small cog-free target. */
const target = (x, y, r, { ink = false } = {}) => disc(x, y, r, ink ? INK : PAPER) + (`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.6)}" fill="none" stroke="${ink ? PAPER : INK}"` +
  ` stroke-width="${f(W * 0.8)}"/>`) + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.22)}" fill="${ink ? PAPER : INK}"/>`;
const arcPts = (cx, cy, r, angs) => angs.map((a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)]);
const ghost = (svg) => `<g opacity="0.3">${svg}</g>`;

// ---- poses (arm offsets from each shoulder, left then right) ----
const DOWN_L = [[-4, 30], [-3, 52]], DOWN_R = [[4, 30], [3, 52]];
const HIP_L = [[-15, 20], [-2, 38]], HIP_R = [[15, 20], [2, 38]];
const POINT_R = [[30, -2], [62, -4]], POINT_L = [[-30, -2], [-62, -4]];
const chin = [[[-3, 28], [25, 22]], [[6, 26], [-9, -4]]];
const folded = [[[-3, 28], [25, 20]], [[3, 28], [-25, 24]]];
const behind = [[[-3, 30], [11, 46]], [[3, 30], [-11, 46]]];
const palmsUp = [[[-22, 10], [-46, 0]], [[22, 10], [46, 0]]];

export const steps = {
  'w1-quizzing': [
    // 1 Specify the material in advance: teacher (back) watches a student at a desk ringed by labelled tags
    STEP([
      box(116, 140, 84, 28, { rx: 2 }),
      ...[[70, 46], [98, 14], [160, 12], [196, 42]].map(([x, y]) => dotted(`M${x + 17} ${y + 15} L158 82`, 2.2)),
      tag(70, 46), tag(98, 14), tag(160, 12), tag(196, 42, 34, 15, true),
      pupil(158, 92), desk(122, 194, 118),
      person(52, 178, { back: true, s: 0.95, arms: [DOWN_L, [[12, 26], [20, 46]]] })
    ].join('')),
    // 2 Ask a set of short recall questions: arms out, questions arc over the teacher's head
    STEP([
      ln(`M28 120 A92 92 0 0 1 212 120`, W),
      ...arcPts(120, 120, 92, [195, 232, 270, 308, 345]).map(([x, y], i) => qDisc(x, y, 12, { ink: i === 2 })),
      person(120, 178, { s: 0.92, arms: palmsUp }),
      talk(134, 42, 26, 18, [128, 58])
    ].join('')),
    // 3 Give all students time: teacher with clipboard, student writing hard, clock running
    STEP([
      clock(186, 42, 24, { ink: true }),
      person(60, 178, { s: 1, turn: 1, arms: [[[10, 28], [30, 22]], [[4, 30], [22, 26]]] }),
      `<g transform="rotate(-12 86 98)">${sheet(72, 88, 30, 22, 2)}</g>`,
      onBlock(178, 132, { s: 0.9, dir: -1, lean: 14, arms: [[[12, 22], [22, 32]], [[12, 24], [24, 32]]] }),
      `<g transform="rotate(14 140 122)">${sheet(128, 116, 22, 12, 2)}</g>`
    ].join('')),
    // 4 Provide the answers: teacher on a spot, pointing at the answers on the board
    STEP([
      board(10, 12, 112, 96),
      ...[0, 1, 2, 3, 4].map((i) => box(20, 24 + i * 16, 6, 6, { rx: 1 }) + ln(`M34 ${27 + i * 16} h${i === 4 ? 40 : 66}`, W * 0.9)),
      box(32, 54, 70, 8, { rx: 3, fill: INK }),
      ell(170, 168, 48, 9),
      person(170, 168, { s: 0.92, turn: -1, arms: [[[-28, -2], [-58, -6]], HIP_R] }),
      talk(184, 18, 30, 20, [176, 42])
    ].join('')),
    // 5 Affirm good performance and seek out wrong answers: one celebrates, one points off to find gaps
    STEP([
      box(34, 150, 172, 26, { rx: 2 }),
      person(84, 150, { s: 0.8, arms: [[[-14, -8], [-8, -36]], DOWN_R] }),
      person(150, 150, { s: 0.8, turn: 1, arms: [DOWN_L, POINT_R] }),
      talk(36, 10, 30, 24, [66, 38], { ink: true, text: '✓' }),
      talk(148, 6, 30, 24, [150, 36], { text: '?' }),
      dotted('M206 60 H236', 2.4)
    ].join(''))
  ],

  'w1-weekly-and-monthly-review': [
    // 1 Generate study resources: tables and notes beam into the screen the students study at
    STEP([
      dotted('M38 62 L212 110', 2), dotted('M114 62 L212 110', 2), dotted('M188 64 L214 104', 2),
      gridSheet(18, 10, 40, 50, 3, 5), inkSheet(96, 8, 36, 54, 5), sheet(172, 16, 32, 48, 4),
      table(24, 236, 140),
      box(212, 98, 12, 40, { rx: 2 }),
      sitter(48, 154, { dir: 1, s: 0.72, chair: false }), sitter(98, 154, { dir: 1, s: 0.72, chair: false }), sitter(150, 154, { dir: 1, s: 0.72, chair: false })
    ].join('')),
    // 2 Plan for spaced practice: the route winds on, looping back past earlier stations; teacher watches from a tower
    STEP([
      dotted('M4 56 H150 Q184 56 184 84 Q184 112 150 112 H54 Q24 112 24 140 Q24 168 54 168 H236', 2.6),
      disc(150, 56, 5), disc(54, 112, 5), disc(150, 168, 5),
      hub(34, 30, 5), hub(108, 90, 5), hub(110, 146, 5, { ink: true }),
      ...[60, 80, 100].map((x) => person(x, 56, { s: 0.17 })), ...[130, 150].map((x) => person(x, 112, { s: 0.17 })), ...[180, 200].map((x) => person(x, 168, { s: 0.17 })),
      ln('M198 60 L192 100 M222 60 L228 100 M195 80 H225 M196 76 L224 96', W),
      box(190, 54, 40, 8, { rx: 1 }),
      person(210, 54, { s: 0.36, arms: folded })
    ].join('')),
    // 3 Set a retrieval practice activity: one thinks hard, the other retrieves onto paper
    STEP([
      think([62, 74], [66, 36], 24), ln('M52 34 q6 -10 12 -2 q6 8 12 -2 M50 44 q8 6 14 -2 q6 -6 14 2', W * 0.8),
      think([182, 74], [184, 36], 24, { ink: true }), ...[[176, 28], [190, 32], [180, 42], [194, 44], [170, 38]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${PAPER}"/>`),
      arrowTo([96, 36], [154, 36], null, { dash: true, w: 2.6 }),
      arrowTo([210, 44], [214, 100], [226, 70], { dash: true, w: 2.4 }),
      onBlock(54, 128, { s: 0.85, dir: 1, arms: [[[12, 20], [24, 22]], [[10, 22], [16, -4]]] }),
      onBlock(170, 128, { s: 0.85, dir: 1, lean: 10, arms: [[[12, 22], [24, 26]], [[12, 24], [26, 28]]] }),
      sheet(190, 112, 22, 8, 1)
    ].join('')),
    // 4 Explore gaps and errors: a light hangs over the student; questions rise up
    STEP([
      ...[[78, 16], [120, 10], [162, 16]].map(([x, y]) => dotted(`M120 50 L${x} ${y + 10}`, 2.2) + qDisc(x, y, 10)),
      ell(120, 50, 42, 8, INK), disc(120, 68, 5), ln('M120 58 v5', W),
      onBlock(112, 140, { s: 0.92, dir: 1, lean: 8, arms: [[[12, 18], [26, 12]], [[12, 20], [28, 14]]] }),
      `<g transform="rotate(-20 146 118)">${sheet(132, 104, 28, 20, 3)}</g>`
    ].join('')),
    // 5 Make connections: people hold up ideas, all linked to each other
    STEP([
      dotted('M38 38 L120 50 L200 40 M38 38 L76 100 L120 50 L160 104 L200 40 M76 100 L160 104 M120 50 L120 96', 2.2),
      person(46, 178, { s: 0.72, arms: [DOWN_L, [[8, -24], [-4, -48]]] }),
      person(120, 178, { s: 0.72, arms: [[[-12, -20], [-4, -46]], [[12, -20], [4, -46]]] }),
      person(194, 178, { s: 0.72, turn: -1, arms: [[[-8, -24], [4, -48]], DOWN_R] }),
      disc(38, 38, 9), disc(200, 40, 9), disc(120, 96, 7), disc(76, 100, 7), disc(160, 104, 7),
      disc(120, 50, 11, INK),
      talk(10, 4, 26, 18, [30, 30]), talk(208, 6, 26, 18, [208, 32])
    ].join(''))
  ],

  'w1-elaborative-interrogation': [
    // 1 Model how, why and what next questions: three on a block, each voicing a different question
    STEP([
      box(44, 152, 152, 24, { rx: 2 }),
      person(78, 152, { s: 0.8, back: true, arms: [[[-12, -18], [-14, -44]], DOWN_R] }),
      person(120, 152, { s: 0.8, back: true, arms: behind }),
      person(162, 152, { s: 0.8, back: true, arms: [DOWN_L, HIP_R] }),
      talk(42, 8, 36, 26, [72, 38], { text: '?' }), talk(102, 4, 36, 26, [120, 36], { text: '?', ink: true }), talk(162, 8, 36, 26, [166, 38], { text: '?' })
    ].join('')),
    // 2 Paired elaborative interrogation: teacher thinks while a pair quiz each other
    STEP([
      person(50, 178, { s: 1, turn: 1, arms: chin }),
      talk(136, 8, 26, 20, [150, 34], { text: '?', ink: true }), talk(172, 8, 26, 20, [182, 34]),
      talk(136, 40, 26, 20, [150, 66]), talk(172, 40, 26, 20, [182, 66], { text: '?' }),
      table(136, 192, 136),
      sitter(124, 152, { dir: 1, s: 0.7 }), sitter(206, 152, { dir: -1, s: 0.7 })
    ].join('')),
    // 3 Individual elaborative interrogation: one student, questions and self-checks overhead
    STEP([
      crossDisc(140, 24, 10), tickDisc(170, 14, 10), tickDisc(200, 24, 10),
      talk(128, 44, 24, 22, [150, 84], { text: '?' }), talk(158, 38, 24, 22, [166, 84], { text: '?', ink: true }), talk(188, 44, 24, 22, [182, 84], { text: '?' }),
      pupil(166, 102), desk(134, 200, 128),
      person(58, 178, { s: 1.05, back: true })
    ].join('')),
    // 4 Check for accuracy: a pair check their sheet; the tick comes from the resource
    STEP([
      talk(44, 30, 26, 22, [70, 70], { text: '?' }), talk(90, 26, 26, 22, [104, 70]),
      arrowTo([114, 128], [136, 40], [168, 92], { dash: true, w: 2.4 }),
      tickDisc(136, 26, 13, { ink: true }),
      pupil(72, 90), pupil(110, 90), desk(46, 136, 116),
      sheet(70, 122, 36, 14, 2),
      person(196, 178, { s: 1, back: true })
    ].join('')),
    // 5 Forms of assessment: six students, each with their own question
    STEP([
      ...[[40, 68], [120, 68], [200, 68], [40, 158], [120, 158], [200, 158]].map(([x, y], i) =>
        think([x + 4, y - 40], [x + 8, y - 56], 9) + qmark(x + 8, y - 57, 12) +
        sitter(x - 6, y, { dir: 1, s: 0.5, ink: i === 4, arms: i % 2 ? [[[12, 18], [24, 16]], [[10, 20], [22, 18]]] : [[[12, 18], [22, 22]], [[10, 20], [14, -2]]] }))
    ].join(''))
  ],

  'w1-using-a-knowledge-organiser': [
    // 1 Design knowledge organisers to be quizzable: a table with questions; a linked row of facts
    STEP([
      board(60, 6, 140, 64), ln('M108 6 V70 M154 6 V70', W), ...[0, 1, 2].map((i) => ln(`M68 ${24 + i * 16} h32`, W * 0.8)),
      qDisc(130, 14, 7), qDisc(176, 14, 7),
      person(42, 98, { s: 0.52, turn: 1, arms: [DOWN_L, POINT_R] }),
      board(14, 100, 172, 70),
      ln('M34 135 H166', W),
      ...[34, 78, 122, 166].map((x, i) => ln(`M${x} 135 L${x - 8} 115 M${x} 135 L${x + 8} 115 M${x} 135 L${x - 8} 155 M${x} 135 L${x + 8} 155`, W * 0.7) + [[-8, 115], [8, 115], [-8, 155], [8, 155]].map(([dx, y]) => disc(x + dx, y, 4)).join('') + disc(x, 135, 9, i === 2 ? INK : PAPER)),
      person(212, 178, { s: 0.6, turn: -1, arms: [[[-14, -16], [-28, -36]], DOWN_R] })
    ].join('')),
    // 2 Focus on specific elements: teacher points at one part; students take that element away
    STEP([
      person(34, 92, { s: 0.5, turn: 1, arms: [DOWN_L, POINT_R] }), talk(44, 4, 24, 16, [38, 30]),
      board(70, 40, 66, 42), ln('M104 40 V82', W * 0.8), box(76, 46, 22, 7, { rx: 1, fill: INK }), ...[0, 1, 2].map((i) => ln(`M78 ${60 + i * 7} h16 M110 ${50 + i * 9} h18`, W * 0.6)),
      dotted('M74 56 Q120 0 170 22', 2.2), hub(186, 30, 5, { n: 8 }),
      dotted('M192 52 Q214 100 186 120', 2.2), hub(50, 116, 5, { n: 8 }), dotted('M50 128 V134', 2.2),
      clock(122, 112, 12),
      pupil(50, 140), desk(28, 72, 166), pupil(186, 140), desk(164, 208, 166),
      arrowTo([168, 152], [72, 152], null, { w: 2.2 })
    ].join('')),
    // 3 Read and rehearse: a student watches a pair reading their organiser; information loops round
    STEP([
      ln('M96 82 Q110 22 160 20 Q210 18 220 70', W * 0.8),
      iDisc(96, 82, 10), iDisc(126, 32, 10), iDisc(184, 22, 10), iDisc(218, 66, 10),
      talk(112, 62, 22, 20, [130, 96], { text: '?', ink: true }), hub(184, 76, 4, { n: 8 }),
      pupil(134, 112), pupil(176, 112), desk(110, 204, 140),
      person(46, 178, { s: 1.1, back: true, arms: [DOWN_L, [[6, 26], [-6, -6]]] })
    ].join('')),
    // 4 Close or cover for generative recall: the teacher prompts; a question pulls the hidden element back out
    STEP([
      talk(30, 10, 34, 30, [56, 48], { text: '?' }),
      dotted('M48 50 V78', 2.4),
      hub(48, 102, 8, { ink: true, n: 8 }),
      box(118, 148, 112, 28, { rx: 2 }),
      person(174, 148, { s: 0.85, turn: -1, arms: [[[-14, -18], [-22, -44]], HIP_R] }),
      talk(200, 2, 34, 22, [188, 30]), talk(204, 36, 32, 22, [190, 50])
    ].join('')),
    // 5 Check for accuracy: recall, then check, round and round
    STEP([
      `<circle cx="120" cy="92" r="70" fill="none" stroke="${INK}" stroke-width="5" stroke-dasharray="12 9"/>`,
      arrowTo([96, 24], [118, 22], null, { w: 3 }), arrowTo([144, 160], [122, 162], null, { w: 3 }),
      portrait(52, 92, 30, { bg: true, s: 1.05 }), portrait(188, 92, 30, { s: 1.05 }),
      person(120, 150, { s: 0.62, arms: folded })
    ].join(''))
  ],

  'w1-rehearsal-and-performance': [
    // 1 Establish the criteria for excellence: an idea held up between the criteria
    STEP([
      bars(14, 18, 3, { w: 46 }), bars(178, 18, 3, { w: 46 }),
      ln('M120 12 q-8 -8 -14 -2 q6 6 14 2 q8 -8 14 -2 q-6 6 -14 2', W * 0.9),
      ln('M120 18 V24', W), bulb(120, 40, 1.2, { ink: true }),
      person(76, 178, { s: 1.0, turn: 1, arms: [[[14, 22], [24, 6]], [[16, -2], [30, -12]]] })
    ].join('')),
    // 2 Initiate low-stakes rehearsal: a student practises safely in the palm of a hand
    STEP([
      `<path d="M0 178 V150 Q50 128 110 130 L168 66 Q176 56 186 62 Q196 58 200 70 Q210 70 212 82 Q220 86` +
        ` 216 98 L156 152 Q130 172 90 178 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"` +
        ` stroke-linejoin="round"/>`,
      ln('M186 64 L150 104 M200 72 L162 112 M212 84 L172 120', W * 0.9),
      person(58, 134, { s: 0.5, arms: [DOWN_L, [[12, -16], [16, -42]]] }), talk(76, 48, 28, 20, [68, 66], { ink: true }),
      person(214, 178, { s: 0.5, turn: -1, arms: [[[-16, 14], [-34, 22]], HIP_R] })
    ].join('')),
    // 3 Generate feedback: two talk over what went well and what to improve
    STEP([
      talk(68, 4, 104, 64, [100, 80], { ink: true, text: '' }),
      ln('M130 16 h18 m-6 -5 l6 5 l-6 5', W, PAPER),
      ...[0, 1, 2].map((i) => ln(`M90 ${32 + i * 11} h${16 - i * 4}`, W * 1.2, PAPER) + `<circle cx="${112 - i * 2}" cy="${32 + i * 11}" r="3" fill="${PAPER}"/>` + ln(`M${120 - i * 2} ${32 + i * 11} h14`, W * 0.8, PAPER) + T(150, 36 + i * 11, 11, '?', PAPER)),
      sitter(56, 128, { dir: 1, s: 0.95, legs: 'crossed', arms: [[[10, 22], [26, 22]], [[12, 22], [28, 18]]] }),
      sitter(188, 128, { dir: -1, s: 0.95, arms: [[[10, 20], [24, 18]], [[6, 26], [-6, -2]]] })
    ].join('')),
    // 4 Deliver the performance: on stage under the lights, the criteria overhead
    STEP([
      `<g transform="translate(30 26) rotate(-35)"><path d="M-7 -12 h14 l6 20 h-26 Z" fill="${INK}"` +
        ` stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/></g>`, dotted('M42 40 L84 110', 2),
      `<g transform="translate(210 26) rotate(35)"><path d="M-7 -12 h14 l6 20 h-26 Z" fill="${PAPER}"` +
        ` stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/></g>`, dotted('M198 40 L158 110', 2),
      bars(98, 18, 3, { w: 44 }),
      ell(120, 160, 82, 14),
      person(84, 160, { s: 0.62, turn: -1, arms: [[[-22, -4], [-48, -6]], [[16, 14], [30, 30]]], legs: [[-16, -4], [12, 6]] }),
      person(158, 160, { s: 0.62, turn: 1, arms: [[[-14, 18], [-30, 6]], [[10, -16], [8, -42]]], legs: [[-10, -6], [14, 8]] })
    ].join('')),
    // 5 Evaluate and repeat: two compare the performance against each criterion
    STEP([
      talk(90, 4, 60, 40, [120, 56], { ink: true, text: '+ −' }),
      ...[0, 1, 2].map((i) => box(66, 76 + i * 26, 92, 10, { rx: 5 }) + disc(158, 81 + i * 26, 10)),
      person(36, 178, { s: 0.9, turn: 1 }),
      person(204, 178, { s: 0.9, turn: -1, arms: [[[-20, 12], [-40, 8]], DOWN_R] })
    ].join(''))
  ],

  'w1-peer-supported-retrieval': [
    // 1 Provide question and answer prompts: the teacher models; questions and answers circle her
    STEP([
      ln('M44 170 Q30 70 120 50 Q210 70 196 170', W),
      talk(10, 8, 30, 20, [28, 36]), talk(200, 8, 30, 20, [214, 36]),
      talk(28, 58, 28, 24, [40, 90], { text: '?' }), talk(104, 6, 30, 26, [116, 40], { text: '?', ink: true }), talk(184, 58, 28, 24, [196, 90], { text: '?' }),
      talk(16, 112, 30, 22, [40, 104]),
      person(120, 178, { s: 0.85, arms: [[[-18, 14], [-34, 4]], HIP_R] })
    ].join('')),
    // 2 Allocate checking partners: the teacher points; roles and pairs are set out
    STEP([
      disc(190, 130, 40), `<clipPath id="psr2"><circle cx="190" cy="130" r="40"/></clipPath><g clip-path="url(#psr2)">` +
        `${bust(174, 128, { s: 0.85, face: 1 })}${bust(206, 132, { s: 0.85, face: -1 })}</g><circle cx="190"` +
        ` cy="130" r="40" fill="none" stroke="${INK}" stroke-width="${W}"/>`,
      ln('M190 90 V60 M166 60 H214 M190 60 V36', W),
      box(156, 50, 16, 22, { rx: 6 }), box(208, 50, 16, 22, { rx: 6 }), box(182, 22, 16, 22, { rx: 6 }),
      disc(190, 60, 7, INK),
      person(50, 178, { s: 1.0, turn: 1, arms: [[[10, 28], [26, 22]], POINT_R] }),
      talk(84, 26, 30, 20, [72, 46])
    ].join('')),
    // 3 Student 1 assesses student 2: the teacher looks in on a pair, one quizzing the other
    STEP([
      ...arcPts(160, 120, 58, [200, 225, 250, 275, 300, 325]).map(([x, y]) => disc(x, y, 5)),
      disc(160, 120, 50, INK),
      pupil(140, 108, { s: 0.95 }), pupil(180, 108, { s: 0.95 }), desk(118, 202, 136),
      talk(140, 74, 22, 16, [144, 92], { text: '?' }),
      person(44, 178, { s: 0.95, turn: 1, arms: [[[14, 24], [34, 30]], [[14, 26], [32, 32]]] })
    ].join('')),
    // 4 Student 2 tests student 1: swap roles; the teacher reaches in to set it going
    STEP([
      ...arcPts(80, 120, 58, [215, 240, 265, 290, 315, 340]).map(([x, y]) => disc(x, y, 5)),
      disc(80, 120, 50, INK),
      pupil(60, 108, { s: 0.95 }), pupil(100, 108, { s: 0.95 }), desk(38, 122, 136),
      talk(96, 74, 22, 16, [100, 92], { text: '?' }),
      person(198, 178, { s: 0.95, turn: -1, arms: [[[-28, 6], [-58, 14]], DOWN_R] })
    ].join('')),
    // 5 Discuss common difficulties: a huddle over how hard it was, ideas linked all round
    STEP([
      dotted('M40 50 L98 36 M200 50 L142 36 M40 112 L92 96 M200 112 L148 96', 2),
      talk(10, 40, 30, 20, [26, 70]), talk(200, 40, 30, 20, [214, 70]), talk(10, 102, 30, 20, [26, 132]), talk(200, 102, 30, 20, [214, 132]),
      gauge(120, 32, 22, { ink: true }),
      box(70, 152, 100, 24, { rx: 2 }),
      person(98, 152, { s: 0.62, arms: [DOWN_L, [[6, 26], [20, 18]]] }),
      person(142, 152, { s: 0.62, arms: [[[-6, 26], [-20, 18]], DOWN_R] }),
      person(120, 152, { s: 0.64, arms: folded })
    ].join(''))
  ],

  'w1-concrete-examples': [
    // 1 Make abstract-concrete connections explicit: many concrete things feed into one mixer
    STEP([
      ...[[22, 46], [70, 30], [104, 14], [140, 30], [176, 24], [26, 92]].map(([x, y]) => dotted(`M${x} ${y} L190 112`, 2)),
      cube(64, 24, 12), `<path d="M10 40 h20 v12 h-20 z M14 44 h12" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
      ln('M104 14 m-6 0 a6 6 0 1 1 6 6 a3 3 0 1 1 -3 -3', W), disc(140, 30, 7), `<path d="M176 14 l9 10 l-9 10 l-9 -10 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}"/>`,
      ln('M6 86 h18 M6 93 h18 M6 100 h18', W),
      person(48, 178, { s: 0.85, turn: 1, arms: [[[14, 24], [30, 22]], [[12, 26], [28, 24]]] }),
      cube(78, 92, 14),
      box(176, 134, 52, 22, { rx: 3 }), box(206, 108, 26, 26, { rx: 3 }),
      `<g transform="rotate(-35 184 116)">${ell(184, 116, 24, 15, INK)}</g>`,
      disc(186, 160, 10), disc(218, 160, 10)
    ].join('')),
    // 2 Highlight a range of useful concrete examples: around the abstract idea sit its real cases
    STEP([
      dotted('M96 66 L114 76', 2.2),
      `<path d="M128 46 l12 7 v14 l-12 7 l-12 -7 v-14 Z M128 74 l12 7 v14 l-12 7 l-12 -7 v-14 Z M152 60 l12` +
        ` 7 v14 l-12 7 l-12 -7 v-14 Z" fill="${INK}" stroke="${INK}" stroke-width="${W}"` +
        ` stroke-linejoin="round"/>`,
      ln('M128 74 v-7 M140 67 v14', W * 0.8, PAPER),
      `<path d="M84 46 c-10 -6 -8 -20 2 -28 c0 8 6 8 6 14 c4 -4 4 -8 2 -12 c10 8 10 26 -10 26 Z" fill="` +
        `${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
      ln('M126 34 V10 Q126 4 142 4 Q158 4 158 14', W), box(150, 14, 16, 8, { rx: 3 }),
      box(200, 50, 8, 34, { rx: 4 }), disc(204, 90, 8),
      box(76, 122, 44, 22, { rx: 11 }), T(98, 138, 13, 'CH₄'),
      ln('M170 130 L184 140 M184 140 L198 132 M184 140 L184 156 M184 140 L172 150', W), disc(184, 140, 6, PAPER), disc(170, 130, 4), disc(198, 132, 4), disc(184, 156, 4), disc(172, 150, 4),
      person(42, 178, { s: 0.88, turn: 1, arms: [DOWN_L, [[22, -10], [46, -22]]] })
    ].join('')),
    // 3 Quiz on concrete examples for a given abstract idea: idea → which example?
    STEP([
      bulb(46, 26, 0.9), arrowTo([66, 24], [168, 24], null, { dash: true, w: 2.6 }),
      box(176, 12, 40, 26, { rx: 3 }), ln('M176 20 h40 M186 12 v-6 M196 12 v-6 M206 12 v-6', W * 0.8),
      talk(60, 46, 32, 30, [100, 62], { text: '?', ink: true }),
      person(124, 178, { s: 1.0, arms: [[[12, 28], [34, 14]], [[18, 8], [20, -22]]] })
    ].join('')),
    // 4 Quiz on abstract ideas for given concrete examples: example → which idea?
    STEP([
      box(20, 12, 40, 26, { rx: 3 }), ln('M20 20 h40 M30 12 v-6 M40 12 v-6 M50 12 v-6', W * 0.8),
      arrowTo([66, 26], [176, 30], null, { dash: true, w: 2.6 }),
      disc(200, 32, 22, INK), bulb(200, 34, 0.75),
      talk(60, 50, 32, 30, [100, 66], { text: '?' }),
      person(122, 178, { s: 1.0, arms: [[[-14, -6], [-20, -34]], [[14, -6], [20, -34]]] })
    ].join('')),
    // 5 Extend the range of examples: more and more cases join the arc
    STEP([
      dotted('M102 50 Q116 10 170 18 Q222 34 214 132', 2.2),
      ...[[102, 48], [120, 24], [150, 14], [182, 22], [204, 46], [214, 78], [214, 114]].map(([x, y], i) => cube(x - 8, y - 6, 15, { ink: i === 6 })),
      talk(26, 34, 28, 20, [54, 60]),
      person(64, 178, { s: 0.85, turn: 1, arms: [[[10, 26], [26, 18]], [[16, -12], [30, -34]]] })
    ].join(''))
  ],

  'w1-guided-practice': [
    // 1 Explain and model the new learning: the teacher talks through the steps on the board
    STEP([
      board(108, 22, 126, 128),
      ln('M150 44 h50', W * 1.1), ...['1', '2', '3'].map((n, i) => T(156, 79 + i * 26, 15, n) + ln(`M170 ${74 + i * 26} h${50 - i * 8}`, W)),
      hub(62, 26, 7, { ink: true, n: 8 }),
      person(66, 178, { s: 0.92, turn: 1, arms: [HIP_L, POINT_R] }),
      talk(88, 30, 26, 18, [78, 52])
    ].join('')),
    // 2 Set a short task using the modelled skill: steps 1-2-3 lead to the goal; teacher hands out the task
    STEP([
      ...['1', '2', '3'].map((n, i) => box(12 + i * 44, 10, 26, 24, { rx: 4 }) + T(25 + i * 44, 28, 15, n) + (i < 2 ? arrowTo([40 + i * 44, 22], [54 + i * 44, 22], null, { w: 2.4 }) : "")),
      arrowTo([128, 22], [146, 22], null, { w: 2.4 }), target(166, 22, 15, { ink: true }),
      ln('M25 34 V52', W), talk(12, 52, 28, 20, [25, 52]),
      person(70, 178, { s: 0.95, turn: 1, arms: [[[10, 28], [24, 22]], [[24, -4], [50, -22]]] }),
      sheet(122, 58, 40, 50, 4), ln('M168 66 l8 34 l-4 4 l-4 -4 Z', W)
    ].join('')),
    // 3 Circulate, actively checking for success: the teacher's loop round the room
    STEP([
      dotted('M40 160 Q10 90 60 70 Q120 40 130 20 Q150 2 190 40 Q236 90 200 160 Q120 190 40 160', 2.2),
      ell(130, 120, 24, 6), person(130, 120, { s: 0.6, arms: [[[-12, 20], [-6, 40]], [[12, 22], [26, 30]]] }),
      tickDisc(150, 20, 9, { ink: true }),
      ell(60, 166, 22, 5), person(60, 166, { s: 0.52, turn: 1, arms: [DOWN_L, [[18, 6], [36, 4]]] }), talk(76, 82, 24, 16, [70, 96]), tickDisc(46, 82, 8),
      ell(190, 170, 22, 5), person(190, 170, { s: 0.52, turn: 1, arms: [DOWN_L, [[18, 6], [36, 4]]] }), talk(206, 88, 24, 16, [200, 102]), tickDisc(176, 88, 8)
    ].join('')),
    // 4 Check for error; affirm success: one hand holds a tick, the other a cross
    STEP([
      think([82, 32], [44, 26], 18), `<path d="M44 14 l5 12 l-5 12 l-5 -12 Z" fill="${INK}"/>`,
      qDisc(108, 16, 10), qDisc(132, 36, 10),
      person(86, 178, { s: 1.0, turn: 1, arms: [[[-4, 30], [24, 46]], [[22, 12], [46, -8]]] }),
      tickDisc(160, 62, 20, { ink: true }),
      crossDisc(130, 132, 16)
    ].join('')),
    // 5 Re-teach or extend the practice: the teacher steps up and directs the next move
    STEP([
      talk(8, 8, 26, 16, [20, 30]), talk(70, 4, 26, 16, [80, 26]), talk(144, 4, 26, 16, [154, 26], { ink: true }), talk(206, 8, 26, 16, [214, 30]),
      pupil(50, 128, { s: 0.75 }), pupil(190, 128, { s: 0.75 }),
      box(24, 144, 192, 32, { rx: 2 }),
      person(116, 144, { s: 0.74, turn: 1, arms: [[[-10, 24], [-4, 44]], [[22, -12], [48, -28]]], legs: [[-10, -4], [8, 4]] })
    ].join(''))
  ],

  'w1-independent-practice': [
    // 1 Secure guided success: confidence builds, tick by tick
    STEP([
      ...arcPts(120, 60, 58, [192, 225, 315, 348]).map(([x, y]) => tickDisc(x, y, 10)),
      gauge(120, 34, 19, { ink: true }),
      person(120, 178, { s: 0.84, arms: chin })
    ].join('')),
    // 2 Remove scaffolds and initiate practice: each lift lower, until working from the ground
    STEP([
      ...[[12, 62, false], [88, 96, false], [164, 130, true]].map(([x, top, ink]) => {
        const base = 160, w = 64, n = Math.max(1, Math.round((base - top - 14) / 16));
        const sc = Array.from({ length: n }, (_, i) => { const y0 = top + 14 + ((base - top - 14) / n) * i, y1 = top + 14 + ((base - top - 14) / n) * (i + 1); return `M${x + 6} ${y0} L${x + w - 6} ${y1} M${x + w - 6} ${y0} L${x + 6} ${y1}`; }).join('');
        return ln(sc, W * 0.9) + box(x, top, w, 14, { rx: 2 }) + box(x, base, w, 10, { rx: 2 }) + disc(x + 10, base + 13, 4) + disc(x + w - 10, base + 13, 4)
          + sitter(x + 20, top - 14, { dir: 1, s: 0.32, ink, chair: false, arms: [[[12, 18], [26, 14]], [[12, 20], [28, 16]]] }) + sheet(x + 38, top - 30, 18, 24, 3);
      })
    ].join('')),
    // 3 Check and feedback: the teacher leans in over the student's work
    STEP([
      bars(14, 14, 3, { w: 46 }),
      talk(190, 20, 26, 22, [190, 60], { text: '?' }), talk(150, 30, 26, 20, [166, 62]),
      table(110, 160, 116),
      sitter(178, 132, { dir: -1, s: 0.9, lean: 8, arms: [[[12, 22], [30, 22]], [[12, 24], [32, 24]]] }),
      inkSheet(112, 106, 30, 10, 1),
      person(72, 178, { s: 0.95, turn: 1, arms: [[[14, 26], [36, 36]], [[12, 28], [34, 40]]] })
    ].join('')),
    // 4 Reduce guidance over time: the voice fades as the belt moves on
    STEP([
      speaker(18, 30, 3, { ink: true }), speaker(96, 30, 2), speaker(170, 30, 1),
      box(8, 146, 224, 28, { rx: 14 }), clock(24, 160, 10), clock(216, 160, 10),
      ghost(person(140, 146, { s: 0.72 })),
      person(86, 146, { s: 0.72, turn: 1, arms: [[[-14, -6], [-24, -24]], HIP_R], legs: [[-10, -4], [8, 4]] })
    ].join('')),
    // 5 Increase challenge over time: from the simple maze to the hard one
    STEP([
      arrowTo([66, 30], [174, 30], [120, -14], { dash: true, w: 2.6 }),
      box(8, 146, 224, 28, { rx: 14 }), clock(24, 160, 10), clock(216, 160, 10),
      maze(50, 36, 34), maze(156, 36, 34, { complex: true, ink: true }),
      person(120, 146, { s: 0.74, arms: [[[-22, 6], [-46, -4]], [[22, 6], [46, -4]]] })
    ].join(''))
  ],

  'w1-building-fluency': [
    // 1 Design drillable elements: the big task, broken into pieces in the planner's head
    STEP([
      think([96, 96], [120, 58], 4),
      box(30, 12, 180, 44, { rx: 22 }),
      ...[64, 92, 120, 148, 176].map((x, i) => disc(x, 34, 10, i === 2 ? INK : PAPER)),
      ln('M74 34 h8 M102 34 h8 M130 34 h8 M158 34 h8', W),
      target(18, 104, 11), target(222, 104, 11),
      table(122, 196, 130), laptop(146, 130, 1, 1.1),
      sitter(98, 146, { dir: 1, s: 0.82, arms: [[[12, 20], [28, 22]], [[12, 22], [30, 24]]] })
    ].join('')),
    // 2 Engage students in repeated low-stakes practice: rows of students, the same drill again and again
    STEP([
      ...[[34, 18], [104, 18], [34, 74], [104, 74], [34, 128], [104, 128]].map(([x, y], i) =>
        pupil(x, y + 12, { s: 0.62, ink: i === 3 }) + desk(x - 22, x + 22, y + 32) + talk(x + 12, y - 12, 18, 14, [x + 10, y + 6], { text: i % 2 ? '…' : '?' })),
      person(196, 178, { s: 1.0, turn: -1, arms: chin })
    ].join('')),
    // 3 Check for accuracy and precision: the teacher checks the work as it rides the line
    STEP([
      `<path d="M78 66 H226 V86 H118 L226 140 V160 H78 V140 H186 L78 86 Z" fill="${PAPER}" stroke="${INK}"` +
        ` stroke-width="${W}" stroke-linejoin="round"/>`,
      disc(214, 76, 6), disc(90, 150, 6), ln('M96 76 h14 M150 150 h14 M174 150 h14', W * 0.8),
      sitter(144, 60, { dir: 1, s: 0.42, chair: false }), sitter(184, 60, { dir: 1, s: 0.42, chair: false }),
      person(36, 178, { s: 0.88, turn: 1, arms: [DOWN_L, [[28, -6], [56, -10]]] }),
      think([40, 46], [34, 20], 15, { ink: true }), `<path d="M27 16 v-3 h3 M38 13 h3 v3 M41 24 v3 h-3 M30 27 h-3 v-3" fill="none" stroke="${PAPER}" stroke-width="2.2"/>`
    ].join('')),
    // 4 Increase the range, pace and variety: new places, new shapes, faster
    STEP([
      pin(34, 22), pin(206, 22), dotted('M48 32 H192', 2.6),
      `<path d="M96 120 L112 92 L128 120 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
      disc(176, 66, 10), box(192, 56, 20, 20, { rx: 2 }), `<path d="M176 82 l10 18 h-20 Z M202 82 l10 7 l-4 11 h-12 l-4 -11 Z" fill="${PAPER}" stroke="${INK}"` +
        ` stroke-width="${W}" stroke-linejoin="round"/>`,
      `<path d="M112 170 L196 112 L186 102 L226 96 L216 134 L208 124 L124 182 Z" fill="${INK}" stroke="` +
        `${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
      talk(8, 40, 28, 22, [44, 64]),
      person(56, 178, { s: 0.85, turn: 1, arms: [DOWN_L, [[14, -14], [22, -40]]] })
    ].join('')),
    // 5 Integrate the elements back into more complex tasks: the parts fit back into the whole
    STEP([
      ell(120, 64, 26, 6), person(120, 64, { s: 0.38, arms: [[[6, 26], [20, 20]], [[-6, 26], [6, 22]]] }), box(124, 38, 14, 10, { rx: 1 }),
      talk(80, 4, 24, 16, [104, 18]), talk(140, 4, 24, 16, [136, 18]),
      `<path d="M120 86 L156 106 V146 L120 166 L84 146 V106 Z M120 126 L156 106 M120 126 L84 106 M120 126` +
        ` V166" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`,
      `<path d="M120 112 L134 120 V136 L120 144 L106 136 V120 Z" fill="${INK}" stroke="${INK}"` +
        ` stroke-width="${W}" stroke-linejoin="round"/>`,
      ...[[44, 100], [180, 100], [44, 140], [180, 140]].map(([x, y]) => `<path d="M${x} ${y} l16 -8 v20 l-16 8 Z" fill="${PAPER}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`)
    ].join(''))
  ]
};
