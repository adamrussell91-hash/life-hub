// Explaining and modelling (E&M).
import { P, circle, path, rect, dashed, thin, standing, seated, desk, bubble, tick, cross, arrow, figure, symbol } from './parts.mjs';

const r1 = (n) => Math.round(n * 10) / 10;
const cube = (x, y, s) => rect(x, y, s, s, 2) + path(`M${x} ${y}l${r1(s / 3)} ${r1(-s / 3)}h${s}l${r1(-s / 3)} ${r1(s / 3)}M${r1(x + s * 4 / 3)} ${r1(y - s / 3)}v${s}l${r1(-s / 3)} ${r1(s / 3)}`);
const star = (x, y, r, fill = false) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    return [x + rr * Math.cos(a), y + rr * Math.sin(a)];
  });
  return path(`${P(...pts)}Z`, fill ? 'fill="currentColor"' : '');
};
const wave = (x, y, n) => `M${x} ${y}q4 -6 8 0${' t8 0'.repeat(n - 1)}`;
const wideWave = (x, y, n) => `M${x} ${y}q5 -7 10 0${' t10 0'.repeat(n - 1)}`;
const sheet = (x, y, w, h, solid, faded, { gap = 12, top = 12 } = {}) =>
  rect(x, y, w, h, 3) +
  Array.from({ length: solid + faded }, (_, i) => {
    const d = `M${x + 5} ${y + top + i * gap}h${w - 10}`;
    return i < solid ? thin(d) : dashed(d);
  }).join('');

export const figures = {
  'w1-live-modelling': figure([
    standing(18, 84, { arms: [[-8, 16], [38, 0]] }),
    rect(32, 4, 82, 42, 3),
    path(wave(40, 18, 8)), path(wave(40, 33, 2)), circle(60, 31, 3.5, true),
    seated(66, 62), seated(84, 62), seated(102, 62)
  ].join('')),

  'w1-worked-examples-and-backward-fading': figure([
    standing(14, 84, { arms: [[-6, 18], [14, -10]] }),
    sheet(30, 18, 26, 58, 4, 0), sheet(60, 18, 26, 58, 2, 2), sheet(90, 18, 26, 58, 1, 3),
    rect(30, 18, 26, 8, 3, true)
  ].join('')),

  'w1-dual-coding': figure([
    standing(16, 84, { arms: [[-8, 16], [22, -6]] }),
    rect(36, 6, 78, 48, 3), path('M75 6V54'),
    thin('M42 18H68M42 27H68M42 36H68M42 45H60'),
    circle(102, 18, 5, true), path('M80 48L91 30L98 40L104 33L110 48')
  ].join('') + seated(58, 70) + seated(78, 70) + seated(98, 70)),

  'w1-deliberate-vocabulary-development': figure([
    standing(16, 84, { arms: [[-8, 16], [22, -10]] }),
    rect(36, 8, 78, 22, 4), rect(60, 8, 30, 22, 0, true), path('M60 8V30M90 8V30'),
    thin('M42 19H54M96 19H108'),
    arrow([75, 34], [75, 48]),
    rect(46, 52, 58, 22, 4), thin('M52 60H98M52 67H84')
  ].join('')),

  'w1-big-picture-small-picture': figure([
    standing(16, 84, { arms: [[-8, 16], [22, -4]] }),
    circle(64, 38, 26), circle(54, 30, 5), circle(74, 28, 5), circle(66, 49, 6, true),
    dashed('M72 52L92 62'), circle(104, 70, 12), thin('M98 67H110M98 74H106')
  ].join('')),

  'w1-abstract-models-with-concrete-examples': figure([
    standing(16, 84, { arms: [[-8, 16], [24, -14]] }),
    circle(56, 12, 5), circle(88, 12, 5), circle(72, 32, 5, true), path('M61 12H83M59 16L69 28M85 16L75 28'),
    dashed('M70 40L58 54M74 40L88 56'),
    cube(46, 62, 14), circle(92, 68, 8), path('M40 80H114')
  ].join('')),

  'w1-scaffolding': figure([
    standing(16, 84, { arms: [[-8, 16], [16, -14]] }),
    path('M34 84V8M44 84V8'), thin('M34 22H44M34 40H44M34 58H44M34 76H44'),
    rect(56, 60, 26, 24, 2), rect(56, 36, 26, 24, 2), rect(56, 12, 26, 24, 2, true),
    dashed('M96 84V8M106 84V8'), dashed('M96 22H106M96 40H106M96 58H106M96 76H106')
  ].join('')),

  'w1-metacognitive-talk': figure([
    standing(20, 84, { arms: [[-8, 18], [8, 18]] }),
    bubble(36, 4, 62, 40, [32, 48], { rx: 7 }),
    `<ellipse cx="67" cy="22" rx="16" ry="9" fill="currentColor"/>`, circle(47, 36, 2.2, true), circle(53, 31, 2.8, true),
    seated(66, 66), seated(86, 66), seated(106, 66)
  ].join('')),

  'w1-set-the-standards': figure([
    standing(18, 84, { arms: [[-8, 16], [22, -12]] }),
    rect(40, 8, 30, 40, 3), thin('M45 22H65M45 30H65M45 38H59'), star(66, 10, 9, true),
    path('M82 84V18M114 84V18'), path('M82 22H114', 'stroke-width="4.5"'),
    standing(98, 84, { s: 0.72, arms: [[-6, -26], [6, -26]] })
  ].join('')),

  'w1-head-on-misconceptions': figure([
    standing(18, 84, { arms: [[-8, 16], [22, -10]] }),
    bubble(40, 6, 30, 22, [50, 36]), cross(55, 17, 1.1),
    arrow([74, 17], [84, 17]),
    bubble(86, 6, 30, 22, [100, 36]), tick(101, 17, 1.1),
    seated(70, 56), seated(98, 56), desk(56, 114, 76)
  ].join(''))
};

export const symbols = {
  'w1-live-modelling': symbol([
    rect(10, 14, 80, 56, 5), path(wideWave(20, 32, 6)), path(wideWave(20, 52, 2)),
    path('M50 56L58 52L80 84L72 88Z', 'fill="currentColor"')
  ].join('')),

  'w1-worked-examples-and-backward-fading': symbol([
    sheet(8, 20, 24, 60, 4, 0, { top: 14, gap: 12 }),
    sheet(38, 20, 24, 60, 2, 2, { top: 14, gap: 12 }),
    sheet(68, 20, 24, 60, 1, 3, { top: 14, gap: 12 })
  ].join('')),

  'w1-dual-coding': symbol([
    rect(8, 18, 84, 64, 5), path('M50 18V82'),
    path('M16 34H42M16 46H42M16 58H42M16 70H34'),
    circle(76, 34, 6, true), path('M56 74L68 52L76 64L82 56L88 74')
  ].join('')),

  'w1-deliberate-vocabulary-development': symbol([
    rect(8, 18, 84, 28, 5), rect(34, 18, 32, 28, 0, true), path('M34 18V46M66 18V46'),
    path('M15 32H27M73 32H85'),
    arrow([50, 52], [50, 66]),
    rect(20, 70, 60, 18, 4), path('M30 79H70')
  ].join('')),

  'w1-big-picture-small-picture': symbol([
    circle(40, 40, 28), circle(30, 32, 6), circle(50, 30, 6), circle(44, 52, 7, true),
    dashed('M52 60L66 70'), circle(76, 78, 15), path('M68 76H84M68 83H80')
  ].join('')),

  'w1-abstract-models-with-concrete-examples': symbol([
    circle(28, 16, 7), circle(72, 16, 7), circle(50, 40, 7, true), path('M35 16H65M33 22L45 34M67 22L55 34'),
    dashed('M46 50L32 62M54 50L68 64'),
    cube(12, 70, 18), circle(74, 78, 11)
  ].join('')),

  'w1-scaffolding': symbol([
    path('M12 88V10M22 88V10'), path('M12 28H22M12 48H22M12 68H22'),
    rect(36, 64, 28, 24, 2), rect(36, 40, 28, 24, 2), rect(36, 16, 28, 24, 2, true),
    dashed('M78 88V10M88 88V10'), dashed('M78 28H88M78 48H88M78 68H88')
  ].join('')),

  'w1-metacognitive-talk': symbol([
    rect(8, 12, 84, 58, 9), path('M24 70L16 90L42 70'),
    `<ellipse cx="54" cy="38" rx="22" ry="13" fill="currentColor"/>`, circle(24, 52, 3.5, true), circle(30, 44, 4.5, true)
  ].join('')),

  'w1-set-the-standards': symbol([
    rect(14, 26, 46, 62, 5), path('M24 46H50M24 58H50M24 70H42'),
    star(68, 28, 20, true)
  ].join('')),

  'w1-head-on-misconceptions': symbol([
    bubble(6, 10, 42, 32, [16, 50]), cross(27, 26, 1.5),
    arrow([30, 54], [50, 66], [30, 66]),
    bubble(52, 50, 42, 32, [82, 92]), tick(73, 66, 1.5)
  ].join(''))
};
