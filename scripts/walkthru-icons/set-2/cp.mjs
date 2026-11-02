// Book 2, Curriculum planning.
import { circle, path, rect, dashed, bubble, tick, cross, arrow, symbol, FILL } from '../parts.mjs';

const pinPath = (x, tip, r) => {
  const cy = tip - r * 2.2;
  return `M${x} ${tip}C${x - r * 0.5} ${tip - r} ${x - r} ${cy + r * 0.7} ${x - r} ${cy}A${r} ${r} 0 1 1 ${x + r} ${cy}C${x + r} ${cy + r * 0.7} ${x + r * 0.5} ${tip - r} ${x} ${tip}Z`;
};
const star = (cx, cy, R) => 'M' + Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? R * 0.45 : R; return `${(cx + q * Math.cos(a)).toFixed(1)} ${(cy + q * Math.sin(a)).toFixed(1)}`; }).join('L') + 'Z';

export const symbols = {
  'w2-trivium-in-practice': symbol([
    path('M50 66Q34 56 12 60V88Q34 84 50 92Q66 84 88 88V60Q66 56 50 66ZM50 66V92'),
    bubble(8, 6, 38, 26, [18, 42], { rx: 6 }),
    rect(62, 6, 18, 28, 9, true), path('M56 26Q56 44 71 44Q86 44 86 26'), path('M71 44V52')
  ].join('')),

  'w2-mode-a-mode-b': symbol(
    Array.from({ length: 9 }, (_, i) => rect(10 + (i % 3) * 29, 10 + Math.floor(i / 3) * 29, 22, 22, 3, i === 5)).join('')
  ),
  'w2-diversity-ways-into-curriculum-building': symbol([
    circle(50, 58, 34),
    path('M50 24Q26 58 50 92Q74 58 50 24ZM16 58H84'),
    path(pinPath(62, 46, 12), FILL)
  ].join('')),

  'w2-authentic-connections': symbol([
    ...[0, 60, 120, 180, 240, 300].map((a) => {
      const t = (a * Math.PI) / 180, x = 50 + 38 * Math.cos(t), y = 50 + 38 * Math.sin(t);
      return path(`M${(50 + 11 * Math.cos(t)).toFixed(1)} ${(50 + 11 * Math.sin(t)).toFixed(1)}L${(50 + 30.5 * Math.cos(t)).toFixed(1)} ${(50 + 30.5 * Math.sin(t)).toFixed(1)}`) + circle(x, y, 7.5);
    }),
    circle(50, 50, 11, true)
  ].join('')),
  'w2-themes-and-topics': symbol([
    path('M8 26H44V38A10 10 0 0 1 44 58V74H8Z'),
    path('M54 26H92V74H54V58A10 10 0 0 0 54 38Z', FILL)
  ].join('')),
  'w2-learning-objectives-vs-tasks': symbol([
    path('M50 34V90M34 90H66'),
    path('M12 50L88 18'),
    circle(20, 68, 14), circle(20, 68, 5, true),
    rect(68, 28, 26, 26, 3), tick(81, 41, 1)
  ].join('')),

  'w2-responsive-lesson-planning': symbol([
    dashed('M8 78H70'),
    cross(40, 78, 1.1),
    arrow([10, 66], [66, 34], [34, 2]),
    path(pinPath(80, 78, 13), FILL)
  ].join('')),

  'w2-teach-to-the-top': symbol([
    path('M12 92L52 22M34 92L74 22'),
    path('M20 78H42M28 64H50M36 50H58M44 36H66'),
    path(star(80, 18, 13), FILL)
  ].join('')),

  'w2-send-aim-high-plan-support': symbol([
    path('M6 90L28 54L38 64L56 30L94 90Z'),
    path('M56 30V6'), path('M56 6L82 14L56 22Z', FILL),
    path('M34 90V80H44V70H54V60')
  ].join('')),
  'w2-textbooks-and-workbooks': symbol([
    path('M6 88H94'),
    rect(12, 28, 15, 60, 2), rect(31, 16, 15, 72, 2, true), rect(50, 32, 15, 56, 2),
    path('M68 88L80 36L93 39L81 88')
  ].join(''))
};
