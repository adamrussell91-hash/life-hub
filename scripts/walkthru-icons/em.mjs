// Explaining and modelling (E&M).
import { P, circle, path, rect, dashed, thin, bubble, tick, cross, arrow, symbol } from './parts.mjs';

const r1 = (n) => Math.round(n * 10) / 10;
const cube = (x, y, s) => rect(x, y, s, s, 2) + path(`M${x} ${y}l${r1(s / 3)} ${r1(-s / 3)}h${s}l${r1(-s / 3)} ${r1(s / 3)}M${r1(x + s * 4 / 3)} ${r1(y - s / 3)}v${s}l${r1(-s / 3)} ${r1(s / 3)}`);
const star = (x, y, r, fill = false) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    return [x + rr * Math.cos(a), y + rr * Math.sin(a)];
  });
  return path(`${P(...pts)}Z`, fill ? 'fill="currentColor"' : '');
};
const wideWave = (x, y, n) => `M${x} ${y}q5 -7 10 0${' t10 0'.repeat(n - 1)}`;
const sheet = (x, y, w, h, solid, faded, { gap = 12, top = 12 } = {}) =>
  rect(x, y, w, h, 3) +
  Array.from({ length: solid + faded }, (_, i) => {
    const d = `M${x + 5} ${y + top + i * gap}h${w - 10}`;
    return i < solid ? thin(d) : dashed(d);
  }).join('');

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
